<?php

namespace App\Services\Tala\Tools;

use App\Models\Topic;
use App\Services\Tala\Attachments\AttachmentReader;
use Illuminate\Database\Eloquent\Collection;

/**
 * Read the files a teacher uploaded to a lesson — a scanned worksheet, a
 * diagram, a handout — so Tala can work from the material instead of its
 * filename.
 *
 * Separate from `get_lesson` on purpose, and this is the important design point.
 * `get_lesson` lists a lesson's attachments by name; loading them is a distinct,
 * deliberate call, because an attachment is the most expensive thing a turn can
 * contain. A 20-page PDF costs roughly a page of text *plus* an image of the page
 * for every page, on the school's own key. Folding it into `get_lesson` would
 * mean every "what's in my lesson" question silently paying for every file in it.
 *
 * The cost is bounded in a way worth knowing: attachments are never replayed on
 * later turns, because TalaConversation::historyForModel() replays only user and
 * assistant text. A file is paid for once, on the turn that asked for it. Within
 * that turn it stays in the message list across tool rounds, which is necessary
 * and capped by MAX_TOOL_ROUNDS.
 *
 * What actually reaches the provider is the bytes and the filename. The R2 object
 * key and the signed URL never leave the server — see AttachmentReader.
 */
class ReadLessonMaterialTool implements TalaTool
{
    public function __construct(private readonly AttachmentReader $reader = new AttachmentReader) {}

    public function name(): string
    {
        return 'read_lesson_material';
    }

    public function description(): string
    {
        return <<<'TEXT'
            Open and read the images and PDFs attached to one of the teacher's own lessons.

            Use this when the answer depends on what is actually *in* the uploaded material —
            "make a quiz from my lesson handout", "what does the diagram in lesson 3 show",
            "write questions on the worksheet I uploaded". Call `get_lesson` first to see what
            files a lesson has, then name the one you want.

            Only images (PNG, JPEG, GIF, WebP) and PDFs can be read. PowerPoint, Word, Excel,
            audio and video cannot: if the material is in one of those, say so plainly and ask
            the teacher to tell you the content or upload a PDF version. Do not guess what is
            in a file you could not read, and do not describe a file's contents from its name.

            Reading files is expensive, so it is deliberate: load only what you need, and
            prefer one file over all of them. If the result reports skipped files, tell the
            teacher which ones and why — a handout that was too large to read is something they
            need to hear about, not something to quietly work around.

            Scope: only lessons belonging to this teacher's own assigned subjects.
            TEXT;
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'title' => [
                    'type' => 'string',
                    'description' => 'Required. The lesson title, or enough of it to identify the lesson.',
                ],
                'file' => [
                    'type' => 'string',
                    'description' => 'Optional but preferred. The filename, or part of it, to read. Omit to read every readable file in the lesson, up to the per-message limit.',
                ],
                'subject' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to subjects whose title contains this text.',
                ],
                'grading_period' => [
                    'type' => 'string',
                    'description' => 'Optional. The grading period as a plain number: "1", "2", "3" or "4".',
                ],
            ],
            'required' => ['title'],
            'additionalProperties' => false,
        ];
    }

    public function run(array $input, ToolContext $context): ToolOutcome
    {
        $title = ToolInput::text($input, 'title');

        if ($title === null) {
            return ToolOutcome::error('A lesson title is required. Use list_lessons to find one.');
        }

        $lesson = $this->resolve($input, $context, $title);

        if ($lesson instanceof ToolOutcome) {
            return $lesson;
        }

        $inventory = $this->reader->inventory($lesson);

        if ($inventory === []) {
            return ToolOutcome::ok(
                [
                    'lesson' => $lesson->title,
                    'files_read' => [],
                    'note' => 'This lesson has no uploaded files at all — its content is whatever is '
                        .'written in it, which get_lesson returns. Do not describe material that is '
                        .'not there.',
                ],
                'No files attached',
            );
        }

        if ($context->attachmentTypes() === []) {
            return ToolOutcome::ok(
                [
                    'lesson' => $lesson->title,
                    'files_read' => [],
                    'files_present' => $inventory,
                    'note' => 'The AI model this school has configured cannot read files at all. Tell '
                        .'the teacher you can see the filenames but not open them, and ask them to '
                        .'describe the content.',
                ],
                'Files cannot be read on this model',
            );
        }

        $batch = $this->reader->forLesson(
            $lesson,
            ToolInput::text($input, 'file'),
            $context->attachmentTypes(),
        );

        if ($batch->isEmpty()) {
            return ToolOutcome::ok(
                array_filter([
                    'lesson' => $lesson->title,
                    'files_read' => [],
                    'files_present' => $inventory,
                    'skipped' => $batch->skipped ?: null,
                    'note' => 'Nothing could be read. Tell the teacher which files were skipped and '
                        .'the reason given for each — do not describe what might be in them.',
                ], fn ($value) => $value !== null),
                'Nothing readable',
            );
        }

        // Recorded so propose_assessment can require that this ran before
        // accepting an assessment said to be based on this lesson.
        $context->memory->rememberLessonMaterial($lesson->id, $batch->names());

        return ToolOutcome::ok(
            array_filter([
                'lesson' => $lesson->title,
                'subject' => $lesson->subject?->title,
                'files_read' => $batch->describe(),
                'skipped' => $batch->skipped ?: null,
                'note' => 'The files are attached to this message — read them directly. '
                    .($batch->skipped !== []
                        ? 'Some files were skipped; tell the teacher which and why. '
                        : '')
                    .'Anything you say about this material must come from what you can see in it.',
            ], fn ($value) => $value !== null),
            $this->summary($batch->count(), $batch->skipped),
            // For the controller: the bytes to inline alongside this tool
            // result. Never sent as part of the JSON the model reads.
            ['attachments' => $batch->attachments],
        );
    }

    /**
     * @param  array<int, array{name: string, reason: string}>  $skipped
     */
    private function summary(int $read, array $skipped): string
    {
        $summary = $read.' '.($read === 1 ? 'file' : 'files').' read';

        return $skipped === [] ? $summary : $summary.', '.count($skipped).' skipped';
    }

    /**
     * The lesson, through the teacher's own scope.
     *
     * Resolved the same way GetLessonTool does — single match wins, several are
     * resolved only by an exact title, anything else is reported — so reading a
     * lesson's files and reading its text cannot land on different lessons.
     *
     * @param  array<string, mixed>  $input
     * @return Topic|ToolOutcome
     */
    private function resolve(array $input, ToolContext $context, string $title)
    {
        $query = AssignedLessonScope::query($context)
            ->with(['subject:id,title'])
            ->where('title', 'like', '%'.$title.'%');

        AssignedLessonScope::applyFilters($query, array_diff_key($input, ['search' => null]));

        /** @var Collection<int, Topic> $matches */
        $matches = $query->orderBy('quarter')->orderBy('order')->limit(13)->get();

        if ($matches->isEmpty()) {
            return ToolOutcome::ok(
                [
                    'found' => false,
                    'searched_for' => $title,
                    'note' => 'No lesson with that title exists in this teacher\'s subjects, so there '
                        .'is nothing to read. Use list_lessons to see what they have.',
                ],
                'No lesson matched "'.$title.'"',
            );
        }

        if ($matches->count() > 1) {
            $exact = $matches->filter(
                fn (Topic $match) => mb_strtolower(trim((string) $match->title)) === mb_strtolower($title)
            );

            if ($exact->count() !== 1) {
                return ToolOutcome::ok(
                    [
                        'found' => false,
                        'ambiguous' => true,
                        'searched_for' => $title,
                        'candidates' => $matches->map(fn (Topic $m) => [
                            'title' => $m->title,
                            'subject' => $m->subject?->title,
                        ])->values()->all(),
                        'note' => 'More than one lesson matches. Ask the teacher which one.',
                    ],
                    $matches->count().' lessons matched "'.$title.'"',
                );
            }

            return $exact->first();
        }

        return $matches->first();
    }
}
