<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\TalaAssessmentProposal;
use App\Models\TalaConversation;
use App\Models\TalaMessage;
use App\Services\Ai\Chat\ChatProvider;
use App\Services\Ai\Chat\ChatResult;
use App\Services\Tala\Attachments\LessonAttachment;
use App\Services\Tala\CredentialResolver;
use App\Services\Tala\ResolvedCredential;
use App\Services\Tala\TalaContext;
use App\Services\Tala\Tools\ToolContext;
use App\Services\Tala\Tools\ToolRegistry;
use App\Services\Tala\UsageGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Sending a message to Tala.
 *
 * The reply is streamed as Server-Sent Events. Everything that can fail before
 * the model is reached — no key, allowance spent, message too long — answers
 * with ordinary JSON and a status code instead, so the client can tell a
 * refusal to start from a stream that died halfway by looking at the
 * content type.
 */
class TalaChatController extends Controller
{
    use AuthorizesModuleAccess;

    /**
     * How many times a single turn may go back to the model.
     *
     * One round is a plain answer; two is the normal shape when a tool is
     * involved (call, then answer). The rest is headroom for a model that
     * genuinely needs a second lookup, and a stop for one that has got stuck
     * asking for the same thing.
     *
     * Raised from four when the lesson tools landed: surveying with
     * `list_lessons` and then opening two lessons with `get_lesson` is an
     * ordinary request ("compare my two lessons on matter") and already spends
     * four rounds before the answer is written.
     */
    private const MAX_TOOL_ROUNDS = 6;

    public function __construct(
        private readonly CredentialResolver $resolver,
        private readonly UsageGuard $usage,
        private readonly TalaContext $context,
        private readonly ToolRegistry $tools,
    ) {}

    public function send(Request $request, string $conversationId): StreamedResponse|JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }

        $conversation = TalaConversation::query()->ownedBy($user->id)->find($conversationId);

        if (! $conversation || $conversation->institution_id !== $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'Conversation not found',
            ], 404);
        }

        $validated = $request->validate([
            'message' => [
                'required', 'string',
                'max:'.(int) config('tala.max_message_length', 16000),
            ],
        ]);

        $credential = $this->resolver->resolve($user, $institutionId);

        if ($credential === null) {
            return response()->json([
                'success' => false,
                'message' => 'Tala has no API key to use yet. Ask your administrator to set one for the school, or add your own under Tala settings.',
                'error' => 'no_credential',
            ], 422);
        }

        if ($this->usage->exceeded($credential, $institutionId, $user->id)) {
            return response()->json([
                'success' => false,
                'message' => "You've used up this month's Tala allowance on the school's key. It resets at the start of next month, or your administrator can raise the limit.",
                'error' => 'quota_exceeded',
                'usage' => $this->usage->status($institutionId, $user->id, $credential->monthlyMessageLimit),
            ], 429);
        }

        /*
         * The teacher's turn is saved before a single token is requested. If
         * the provider times out or the browser is closed, the question is
         * still in the thread when they come back — losing what they typed is
         * a worse failure than losing the answer.
         */
        $userMessage = $this->record($conversation, $credential, TalaMessage::ROLE_USER, [
            'content' => $validated['message'],
        ]);

        $conversation->titleFrom($validated['message']);
        $conversation->provider = $credential->provider;
        $conversation->model = $credential->model;
        $conversation->last_message_at = now();
        $conversation->save();

        return $this->streamReply($conversation, $credential, $userMessage->id);
    }

    private function streamReply(
        TalaConversation $conversation,
        ResolvedCredential $credential,
        string $userMessageId,
    ): StreamedResponse {
        $system = $this->context->build($conversation->user, $conversation->institution_id);
        $history = $conversation->historyForModel();

        /*
         * Which file types the answering model can read, asked once here rather
         * than per tool call. A school on a model that cannot read PDFs should
         * get "I can see the filename but not open it", not a request that fails
         * halfway through an answer.
         */
        $attachmentTypes = array_values(array_filter([
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
        ], fn (string $type) => $credential->provider()->supportsAttachment($type)));

        $toolContext = new ToolContext(
            $conversation->user,
            $conversation->institution_id,
            // Lets propose_assessment anchor an approval card to this thread.
            $conversation->id,
            $attachmentTypes,
        );

        /*
         * Assessment proposals raised during this turn.
         *
         * Collected so they can be pointed at the assistant message once it
         * exists: a proposal is written mid-stream, before there is a message
         * row for the card to hang under, and without the backfill a reopened
         * thread would not know where to draw it.
         *
         * @var array<int, string> $proposalIds
         */
        $proposalIds = [];

        $response = new StreamedResponse(function () use ($conversation, $credential, $system, $history, $userMessageId, $toolContext, &$proposalIds) {
            /*
             * A long reply outlives PHP's default execution limit, and
             * ignore_user_abort keeps the script alive after the teacher closes
             * the tab so the partial answer still gets written to the thread.
             */
            @set_time_limit(0);
            ignore_user_abort(true);

            // Anything Apache or PHP is still buffering has to go now, or the
            // whole "stream" arrives in one lump at the end.
            while (ob_get_level() > 0) {
                ob_end_flush();
            }

            $this->emit('start', ['user_message_id' => $userMessageId]);

            $provider = $credential->provider();
            $tools = $this->tools->definitions();

            $messages = $history;
            $emitted = '';
            $aborted = false;
            $result = null;
            $tokensIn = 0;
            $tokensOut = 0;

            /*
             * A turn can take more than one round trip: the model asks for a
             * lookup, reads the answer, then writes its reply. Each round is a
             * fresh billed request, hence the accumulated token counts.
             *
             * The cap is what stops a model that keeps re-asking for the same
             * tool from spending a school's budget in a loop. Hitting it is not
             * an error — whatever text has been produced still stands.
             */
            for ($round = 1; $round <= self::MAX_TOOL_ROUNDS; $round++) {
                $stream = $provider->stream($system, $messages, $tools);

                foreach ($stream as $fragment) {
                    $emitted .= $fragment;
                    $this->emit('delta', ['text' => $fragment]);

                    if (connection_aborted()) {
                        $aborted = true;
                        break 2;
                    }
                }

                $result = $stream->getReturn();
                $tokensIn += (int) $result->tokensIn;
                $tokensOut += (int) $result->tokensOut;

                if (! $result->wantsTools()) {
                    break;
                }

                $messages = $this->runTools($conversation, $credential, $provider, $result, $messages, $toolContext, $proposalIds);
            }

            /*
             * getReturn() throws on a generator that was broken out of, so an
             * aborted stream builds its own result. It is recorded as failed:
             * a half-finished answer nobody read should not be replayed to the
             * model as though it were the assistant's position.
             */
            if ($aborted || $result === null) {
                $result = ChatResult::error('The reply was interrupted before it finished.', $emitted, 'aborted');
            }

            $message = $this->record($conversation, $credential, TalaMessage::ROLE_ASSISTANT, [
                // `$emitted` rather than `$result->text`: the latter is only
                // the final round, and a turn that spoke before calling a tool
                // said something in an earlier one.
                'content' => $result->failed() ? $result->text : $emitted,
                'tokens_in' => $tokensIn ?: null,
                'tokens_out' => $tokensOut ?: null,
                'stop_reason' => $result->stopReason,
                'error_message' => $result->errorMessage,
            ]);

            $conversation->forceFill(['last_message_at' => now()])->save();

            // Now that the assistant message exists, tie this turn's approval
            // cards to it so they reappear in the right place on reload.
            if ($proposalIds !== []) {
                TalaAssessmentProposal::whereIn('id', $proposalIds)
                    ->whereNull('message_id')
                    ->update(['message_id' => $message->id]);
            }

            if ($result->ok()) {
                $this->touchCredential($credential);
            }

            if ($aborted) {
                return;
            }

            $result->failed()
                ? $this->emit('error', [
                    'message_id' => $message->id,
                    'message' => $result->errorMessage,
                ])
                : $this->emit('done', [
                    'message_id' => $message->id,
                    'tokens_in' => $tokensIn ?: null,
                    'tokens_out' => $tokensOut ?: null,
                ]);
        });

        $response->headers->add([
            'Content-Type' => 'text/event-stream',
            // `no-transform` matters as much as `no-cache`: a proxy that
            // gzips the response will buffer it, and a buffered stream is
            // just a slow request.
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            // Nginx honours this; Apache ignores it harmlessly.
            'X-Accel-Buffering' => 'no',
        ]);

        return $response;
    }

    /**
     * Execute the tools the model asked for and fold the results back into the
     * transcript.
     *
     * Each call is announced to the client as it runs, so the chat can show
     * "Checking your assigned subjects…" instead of an unexplained pause, and
     * each is written to the thread as a `tool` row — an audit trail of what
     * Tala actually read on a teacher's behalf. Those rows are excluded from
     * the replay window, so they cost nothing on later turns.
     *
     * @param  array<int, mixed>  $messages
     * @param  array<int, string>  $proposalIds  Collected by reference; see send().
     * @return array<int, mixed>
     */
    private function runTools(
        TalaConversation $conversation,
        ResolvedCredential $credential,
        ChatProvider $provider,
        ChatResult $result,
        array $messages,
        ToolContext $toolContext,
        array &$proposalIds,
    ): array {
        $payloads = [];
        $errors = [];
        /** @var array<int, LessonAttachment> $attachments */
        $attachments = [];

        foreach ($result->toolCalls as $call) {
            $this->emit('tool', ['name' => $call->name, 'status' => 'running']);

            $outcome = $this->tools->run($call, $toolContext);

            $payloads[$call->id] = $outcome->toJson();
            $errors[$call->id] = $outcome->isError;

            $this->emit('tool', [
                'name' => $call->name,
                'status' => $outcome->isError ? 'failed' : 'done',
                'summary' => $outcome->summary,
            ]);

            /*
             * A tool that drafted a change to an assessment produced something
             * the teacher has to act on. The card is pushed now rather than
             * after the turn so it is on screen while the model is still
             * explaining what it suggested.
             *
             * `meta` is not part of the tool result the provider sees — only the
             * client gets this.
             */
            $proposalId = $outcome->meta['proposal_id'] ?? null;

            if (is_string($proposalId)) {
                $proposalIds[] = $proposalId;
                $proposal = TalaAssessmentProposal::find($proposalId);

                if ($proposal) {
                    $this->emit('proposal', $proposal->toCard());
                }
            }

            /*
             * Files a tool loaded from a lesson. They are collected across every
             * call in this round and handed to withToolResults(), which inlines
             * them in whatever the provider's wire format calls an image or a
             * document — a tool result is JSON text and a picture is not.
             *
             * They arrive via `meta` rather than in the result the model reads,
             * so megabytes of base64 never pass through the audit row either.
             */
            foreach ($outcome->meta['attachments'] ?? [] as $attachment) {
                if ($attachment instanceof LessonAttachment) {
                    $attachments[] = $attachment;
                }
            }

            $this->record($conversation, $credential, TalaMessage::ROLE_TOOL, [
                'content' => json_encode([
                    'tool' => $call->name,
                    'input' => $call->input,
                    'summary' => $outcome->summary,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'error_message' => $outcome->isError ? $outcome->summary : null,
            ]);
        }

        return $provider->withToolResults($messages, $result, $payloads, $errors, $attachments);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function record(
        TalaConversation $conversation,
        ResolvedCredential $credential,
        string $role,
        array $attributes,
    ): TalaMessage {
        return TalaMessage::create(array_merge([
            'conversation_id' => $conversation->id,
            'institution_id' => $conversation->institution_id,
            'user_id' => $conversation->user_id,
            'role' => $role,
            'provider' => $credential->provider,
            'model' => $credential->model,
            'credential_source' => $credential->source,
        ], $attributes));
    }

    private function touchCredential(ResolvedCredential $credential): void
    {
        \App\Models\TalaCredential::query()
            ->whereKey($credential->credentialId)
            ->update(['last_used_at' => now()]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function emit(string $event, array $data): void
    {
        // JSON-encoding the payload is what keeps a reply containing newlines
        // from breaking SSE framing — a raw "\n" in the text would end the
        // event early and the rest would arrive as garbage.
        echo "event: {$event}\n";
        echo 'data: '.json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n\n";

        flush();
    }
}
