<?php

namespace App\Services\Tala\Tools;

/**
 * Something Tala can look up, or propose, on the teacher's behalf.
 *
 * Every tool is read-only against the records it touches. One of them —
 * ProposeAssessmentTool — writes a row, but it writes a *proposal*: a description
 * of a change to an assessment that only takes effect when the teacher approves
 * it through TalaProposalController. No tool mutates a subject, a lesson, an
 * assessment, a grade or an attendance record.
 *
 * That is the line to keep. A tool that changes school data directly, without a
 * teacher's click between the model's decision and the write, does not belong
 * here — see the Guardrails section of docs/modules/Tala/TALA.md before adding
 * one.
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
