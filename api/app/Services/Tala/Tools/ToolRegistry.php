<?php

namespace App\Services\Tala\Tools;

use App\Services\Ai\Chat\ToolCall;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Every tool Tala can reach, and the one place they are run from.
 *
 * Registration is explicit rather than discovered from the filesystem: a tool
 * appearing in Tala's hands should be a line someone wrote on purpose.
 */
class ToolRegistry
{
    /** @var array<string, TalaTool> */
    private array $tools = [];

    public function __construct()
    {
        $this->register(new ListAssignedSubjectsTool);
        $this->register(new ListLessonsTool);
        $this->register(new GetLessonTool);
        $this->register(new ListAssessmentsTool);
        $this->register(new GetAssessmentTool);
        // Writes a proposal, never an assessment. See the class docblock.
        $this->register(new ProposeAssessmentTool);
    }

    public function register(TalaTool $tool): void
    {
        $this->tools[$tool->name()] = $tool;
    }

    /**
     * Definitions in the neutral shape the providers translate from.
     *
     * @return array<int, array{name: string, description: string, input_schema: array}>
     */
    public function definitions(): array
    {
        return array_values(array_map(fn (TalaTool $tool) => [
            'name' => $tool->name(),
            'description' => $tool->description(),
            'input_schema' => $tool->inputSchema(),
        ], $this->tools));
    }

    /**
     * Run one call.
     *
     * Never throws. A tool that blows up returns an error outcome, because the
     * alternative is killing a turn the teacher is mid-way through reading —
     * and the model can say "I could not look that up" perfectly well on its
     * own if you let it.
     */
    public function run(ToolCall $call, ToolContext $context): ToolOutcome
    {
        $tool = $this->tools[$call->name] ?? null;

        if (! $tool) {
            // Reachable if a model hallucinates a name, which they do.
            Log::warning('Tala: model called an unknown tool', ['tool' => $call->name]);

            return ToolOutcome::error("There is no tool named {$call->name}.");
        }

        try {
            return $tool->run($call->input, $context);
        } catch (Throwable $e) {
            Log::error('Tala: tool failed', [
                'tool' => $call->name,
                'user_id' => $context->userId(),
                'error' => $e->getMessage(),
            ]);

            return ToolOutcome::error('That lookup failed. Try again in a moment.');
        }
    }
}
