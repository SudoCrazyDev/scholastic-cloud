<?php

namespace App\Services\Tala\Tools;

/**
 * Something Tala can look up on the teacher's behalf.
 *
 * Read-only by design. There is no write path in the tool layer and none is
 * planned for it — an assistant that can change grades or attendance is a
 * different product with a different approval story, and nothing about
 * answering questions needs it.
 */
interface TalaTool
{
    /**
     * Wire name the model calls. Stable — it appears in stored audit rows.
     */
    public function name(): string;

    /**
     * What the tool does and when to reach for it, written for the model.
     *
     * Say the scope out loud ("the subjects assigned to you"), so the model
     * does not try to ask for another teacher's data and then explain the
     * refusal to the user as though something had gone wrong.
     */
    public function description(): string;

    /**
     * JSON Schema for the arguments. Filters only — never an identity.
     *
     * @return array<string, mixed>
     */
    public function inputSchema(): array;

    /**
     * Run it. `$input` is model-supplied and untrusted; `$context` is not.
     *
     * @param  array<string, mixed>  $input
     */
    public function run(array $input, ToolContext $context): ToolOutcome;
}
