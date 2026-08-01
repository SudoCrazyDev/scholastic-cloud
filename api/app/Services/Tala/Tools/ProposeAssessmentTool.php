<?php

namespace App\Services\Tala\Tools;

use App\Models\StudentAssessmentAttempt;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\TalaAssessmentProposal;
use App\Services\Tala\Assessments\AssessmentPresenter;
use App\Services\Tala\Assessments\AssessmentSpec;
use App\Services\Tala\Assessments\AssessmentTypes;
use App\Services\Tala\SectionLabel;
use App\Support\AcademicYear;
use App\Support\GradingPeriods;

/**
 * Tala's only write-adjacent tool — and it does not write.
 *
 * It records a **proposal**: a validated description of a change to an
 * assessment, which the chat renders as a card and the teacher applies by
 * clicking. The mutation itself happens in ProposalApplier, reached only from an
 * authenticated HTTP endpoint gated on `subjects.manage`. There is deliberately
 * no path from a model turn to `subject_ecr_items`.
 *
 * That separation is what makes full create/update/delete/publish access
 * defensible. The model's judgement decides what to *suggest*; a teacher's click
 * decides what happens. A model that misreads "no, not that one" as approval can
 * at worst leave an unapplied card on screen.
 *
 * Two things this tool enforces at the boundary rather than trusting the prompt
 * to secure:
 *
 *   - **The type must be named.** A create without `assessment_type` is an
 *     error telling the model to ask the teacher, because "make me a quiz" and
 *     "make me an exam" weigh differently in a running grade and guessing is not
 *     the model's call.
 *   - **A new assessment is always a draft.** `status` is not in the schema at
 *     all; nothing the model says can publish something on creation.
 */
class ProposeAssessmentTool implements TalaTool
{
    public function name(): string
    {
        return 'propose_assessment';
    }

    public function description(): string
    {
        $types = implode(', ', AssessmentTypes::typeKeys());
        $questionTypes = AssessmentTypes::questionTypeGuide();

        return <<<TEXT
            Draft a change to one of the teacher's assessments and show it to them for
            approval. **This does not change anything.** It puts a card in the chat with a
            preview; the teacher clicks to apply it, or discards it. Say so when you use it —
            tell them it is waiting for their approval, and do not claim the assessment has
            been created, changed or deleted.

            Actions:
            - `create` — a new assessment. **Always saved as a draft**, never visible to
              students until the teacher publishes it. Needs `assessment_type`, `title`,
              `subject`, `grading_period` and `questions`.
            - `update` — replace the content of an existing one. Call `get_assessment` first:
              the question list you send **replaces** the current one, so any question you
              leave out is removed.
            - `delete` — remove an existing one.
            - `publish` — make a draft visible to students.
            - `unpublish` — take a published one back to draft.

            Before you call this with `create`, make sure you know **which kind of assessment
            the teacher wants** ({$types}) and which subject and grading period it belongs
            to. Ask them; do not pick for them. Show them the questions in your reply as well
            as on the card, so they can read them without opening anything.

            Question types you may write:
            {$questionTypes}

            Give each answer as the **exact text of the correct choice**, not a letter — it is
            checked against the choices you supplied, so a wrong or invented answer is
            rejected rather than stored.

            Scope: only the teacher's own assigned subjects. Time limits, attempt caps,
            due dates and scheduling are not set here — the teacher sets those on the
            assessment itself.
            TEXT;
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'action' => [
                    'type' => 'string',
                    'enum' => TalaAssessmentProposal::ACTIONS,
                    'description' => 'What to propose.',
                ],
                'assessment_type' => [
                    'type' => 'string',
                    'enum' => AssessmentTypes::typeKeys(),
                    'description' => 'Required for create. Ask the teacher which kind they want rather than choosing.',
                ],
                'title' => [
                    'type' => 'string',
                    'description' => 'For create, the new title. For every other action, the title of the existing assessment to change.',
                ],
                'new_title' => [
                    'type' => 'string',
                    'description' => 'Optional, update only. Rename the assessment.',
                ],
                'description' => [
                    'type' => 'string',
                    'description' => 'Optional. Instructions shown to students above the questions.',
                ],
                'subject' => [
                    'type' => 'string',
                    'description' => 'The subject title, e.g. "Science 7". Required for create; use it elsewhere to disambiguate.',
                ],
                'class_section' => [
                    'type' => 'string',
                    'description' => 'Optional. The class section, when the same subject title is taught to more than one.',
                ],
                'grading_period' => [
                    'type' => 'string',
                    'description' => 'The grading period as a plain number: "1", "2", "3" or "4". Required for create.',
                ],
                'component' => [
                    'type' => 'string',
                    'description' => 'Optional. The grading component to file it under, e.g. "Written Works". Only needed when the subject has more than one.',
                ],
                'questions' => [
                    'type' => 'array',
                    'description' => 'The questions. Required for create; for update, this replaces the existing set entirely.',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'type' => [
                                'type' => 'string',
                                'enum' => AssessmentTypes::questionTypeKeys(),
                            ],
                            'question' => [
                                'type' => 'string',
                                'description' => 'The question as the student will read it.',
                            ],
                            'choices' => [
                                'type' => 'array',
                                'items' => ['type' => 'string'],
                                'description' => 'For single_choice and multiple_choice. Two to eight options, without "A." labels — those are added when it is shown.',
                            ],
                            'answer' => [
                                'description' => 'The exact text of the correct choice. An array of them for multiple_choice. "True" or "False" for true_false. The accepted wording for short_answer, with alternatives separated by "|". Omit for essay.',
                            ],
                            'points' => [
                                'type' => 'number',
                                'description' => 'Defaults to 1.',
                            ],
                        ],
                        'required' => ['type', 'question'],
                        'additionalProperties' => false,
                    ],
                ],
            ],
            'required' => ['action'],
            'additionalProperties' => false,
        ];
    }

    public function run(array $input, ToolContext $context): ToolOutcome
    {
        $action = ToolInput::text($input, 'action');

        if (! in_array($action, TalaAssessmentProposal::ACTIONS, true)) {
            return ToolOutcome::error(
                'action must be one of: '.implode(', ', TalaAssessmentProposal::ACTIONS).'.'
            );
        }

        if ($context->conversationId === null) {
            // Nothing to anchor a card to. Should not happen from the chat.
            return ToolOutcome::error('Proposals can only be made inside a conversation.');
        }

        return $action === TalaAssessmentProposal::ACTION_CREATE
            ? $this->proposeCreate($input, $context)
            : $this->proposeChange($action, $input, $context);
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function proposeCreate(array $input, ToolContext $context): ToolOutcome
    {
        $type = ToolInput::text($input, 'assessment_type');

        if ($type === null) {
            return ToolOutcome::error(
                'assessment_type is required for create. Ask the teacher which kind of assessment '
                .'they want — '.implode(', ', AssessmentTypes::typeKeys())
                .' — rather than choosing for them.'
            );
        }

        if (! AssessmentTypes::isType($type)) {
            return ToolOutcome::error(
                '"'.$type.'" is not an assessment type Tala can create. Use one of: '
                .implode(', ', AssessmentTypes::typeKeys())
                .'. If the teacher wants something else, they can create it themselves under the '
                .'subject\'s class record.'
            );
        }

        $title = ToolInput::text($input, 'title');

        if ($title === null) {
            return ToolOutcome::error('title is required for create.');
        }

        $subject = $this->resolveSubject($input, $context);

        if ($subject instanceof ToolOutcome) {
            return $subject;
        }

        $period = ToolInput::period($input, 'grading_period');
        $periodType = GradingPeriods::forInstitution($context->institutionId);

        if ($period === null) {
            return ToolOutcome::error(
                'grading_period is required for create — a plain "1" to "'
                .GradingPeriods::count($periodType).'". Ask the teacher which '
                .strtolower(GradingPeriods::noun($periodType)).' it is for.'
            );
        }

        if (! GradingPeriods::isValidPeriod($periodType, $period)) {
            return ToolOutcome::error(
                'This academic year has '.GradingPeriods::count($periodType).' '
                .strtolower(GradingPeriods::pluralNoun($periodType)).', so '
                .strtolower(GradingPeriods::noun($periodType)).' '.$period.' does not exist.'
            );
        }

        $component = $this->resolveComponent($input, $context, $subject);

        if ($component instanceof ToolOutcome) {
            return $component;
        }

        $spec = new AssessmentSpec($input);

        if (! $spec->parseQuestions(true)) {
            return $this->specErrors($spec);
        }

        // An item with no academic year is skipped by every year-scoped query,
        // including the running-grade calculation.
        $academicYear = AcademicYear::forSubject($subject->id);

        $existing = AssignedAssessmentScope::query($context)
            ->where('subject_ecr_id', $component->id)
            ->where('title', $title)
            ->exists();

        $warnings = [];

        if ($existing) {
            $warnings[] = [
                'level' => 'notice',
                'message' => 'An assessment with this exact title already exists in '
                    .$component->title.'. Applying this will create a second one.',
            ];
        }

        $preview = [
            'action' => 'create',
            'assessment' => array_filter([
                'title' => $title,
                'type' => $type,
                'status' => 'draft',
                'subject' => $subject->title,
                'section' => SectionLabel::for($subject->classSection),
                'grading_period' => GradingPeriods::noun($periodType).' '.$period,
                'component' => $component->title.' ('.rtrim(rtrim((string) $component->percentage, '0'), '.').'%)',
                'academic_year' => $academicYear,
                'questions' => count($spec->questions()),
                'total_points' => $spec->totalPoints(),
                'description' => ToolInput::text($input, 'description'),
            ], fn ($value) => $value !== null),
            'questions' => $spec->previewQuestions(),
        ];

        $proposal = $this->store($context, [
            'action' => TalaAssessmentProposal::ACTION_CREATE,
            'subject_id' => $subject->id,
            'subject_ecr_id' => $component->id,
            'subject_ecr_item_id' => null,
            'title' => $title,
            'assessment_type' => $type,
            'quarter' => $period,
            'payload' => [
                'subject_ecr_id' => $component->id,
                'type' => $type,
                // Not negotiable, and not in the tool schema: a proposal cannot
                // create something students can already see.
                'status' => AssessmentTypes::STATUS_DRAFT,
                'title' => $title,
                'description' => ToolInput::text($input, 'description'),
                'content_version' => AssessmentTypes::CONTENT_VERSION,
                'quarter' => $period,
                'academic_year' => $academicYear,
                'questions' => $spec->questions(),
            ],
            'preview' => $preview,
            'warnings' => $warnings,
            'summary' => 'New '.$type.' — '.$title.' ('.count($spec->questions()).' questions, '
                .$this->points($spec->totalPoints()).' points)',
        ]);

        return $this->outcome($proposal, [
            'proposed' => 'create',
            'status' => 'awaiting the teacher\'s approval',
            'will_create' => $preview['assessment'],
            'question_count' => count($spec->questions()),
            'total_points' => $spec->totalPoints(),
            'warnings' => $warnings,
            'note' => 'Nothing has been created. A card is now in the chat for the teacher to '
                .'approve or discard. Tell them it is waiting, and that it will be saved as a '
                .'draft that students cannot see until they publish it.',
        ]);
    }

    /**
     * update / delete / publish / unpublish — all of which target something
     * that already exists.
     *
     * @param  array<string, mixed>  $input
     */
    private function proposeChange(string $action, array $input, ToolContext $context): ToolOutcome
    {
        $title = ToolInput::text($input, 'title');

        if ($title === null) {
            return ToolOutcome::error(
                'title is required for '.$action.' — the title of the existing assessment. '
                .'Use list_assessments to find it.'
            );
        }

        $matches = GetAssessmentTool::resolve($input, $context, $title);

        if ($matches->isEmpty()) {
            return ToolOutcome::ok(
                [
                    'proposed' => null,
                    'found' => false,
                    'searched_for' => $title,
                    'note' => 'No assessment with that title exists in this teacher\'s subjects, so '
                        .'there is nothing to '.$action.'. Use list_assessments to see what they have.',
                ],
                'No assessment matched "'.$title.'"',
            );
        }

        $item = GetAssessmentTool::pick($matches, $title);

        if ($item === null) {
            return ToolOutcome::ok(
                [
                    'proposed' => null,
                    'ambiguous' => true,
                    'searched_for' => $title,
                    'candidates' => $matches->map(fn (SubjectEcrItem $match) => [
                        'title' => $match->title,
                        'type' => $match->type,
                        'status' => $match->status,
                        'subject' => $match->subject?->title,
                    ])->values()->all(),
                    'note' => 'More than one assessment matches, and changing the wrong one is not '
                        .'recoverable from here. Ask the teacher which they mean.',
                ],
                $matches->count().' assessments matched "'.$title.'"',
            );
        }

        $periodType = GradingPeriods::forInstitution($context->institutionId);
        $attempts = StudentAssessmentAttempt::where('subject_ecr_item_id', $item->id)->count();
        $current = AssessmentPresenter::questions($item);

        if ($action === TalaAssessmentProposal::ACTION_PUBLISH && $item->status === AssessmentTypes::STATUS_PUBLISHED) {
            return ToolOutcome::ok(
                ['proposed' => null, 'note' => '"'.$item->title.'" is already published. Nothing to do.'],
                'Already published',
            );
        }

        if ($action === TalaAssessmentProposal::ACTION_UNPUBLISH && $item->status !== AssessmentTypes::STATUS_PUBLISHED) {
            return ToolOutcome::ok(
                ['proposed' => null, 'note' => '"'.$item->title.'" is already a draft. Nothing to do.'],
                'Already a draft',
            );
        }

        $payload = [
            'guard' => $this->guard($item, $attempts),
        ];

        $preview = [
            'action' => $action,
            'assessment' => AssessmentPresenter::summary($item, $periodType, $attempts),
        ];

        $spec = null;

        if ($action === TalaAssessmentProposal::ACTION_UPDATE) {
            $spec = new AssessmentSpec($input);
            $newTitle = ToolInput::text($input, 'new_title');
            $description = ToolInput::text($input, 'description');
            $newType = ToolInput::text($input, 'assessment_type');
            $hasQuestions = ($input['questions'] ?? null) !== null && $input['questions'] !== [];

            if ($hasQuestions && ! $spec->parseQuestions(true)) {
                return $this->specErrors($spec);
            }

            if (! $hasQuestions && $newTitle === null && $description === null && $newType === null) {
                return ToolOutcome::error(
                    'An update needs something to change: questions, new_title, description or '
                    .'assessment_type.'
                );
            }

            if ($newType !== null && ! AssessmentTypes::isType($newType)) {
                return ToolOutcome::error(
                    'assessment_type must be one of: '.implode(', ', AssessmentTypes::typeKeys()).'.'
                );
            }

            $changes = [];

            if ($newTitle !== null && $newTitle !== $item->title) {
                $payload['title'] = $newTitle;
                $changes['title'] = ['from' => $item->title, 'to' => $newTitle];
            }

            if ($newType !== null && $newType !== $item->type) {
                $payload['type'] = $newType;
                $changes['type'] = ['from' => $item->type, 'to' => $newType];
            }

            if ($description !== null) {
                $payload['description'] = $description;
                $changes['description'] = ['to' => $description];
            }

            if ($hasQuestions) {
                $carried = $this->carryIds($item, $spec->questions());
                $payload['questions'] = $carried;
                $payload['content_version'] = AssessmentTypes::CONTENT_VERSION;

                $kept = count(array_filter($carried, fn (array $q) => isset($q['id'])));

                $changes['questions'] = [
                    'from' => count($current),
                    'to' => count($spec->questions()),
                ];
                $changes['questions_kept'] = ['to' => $kept.' of '.count($current).' unchanged'];
                $changes['total_points'] = [
                    'from' => $item->score !== null ? (float) $item->score : null,
                    'to' => $spec->totalPoints(),
                ];

                $preview['questions'] = $spec->previewQuestions();
                $preview['replaces'] = $current;
            }

            $preview['changes'] = $changes;
        }

        $warnings = $this->warnings(
            $action,
            $item,
            $attempts,
            $current,
            $spec,
            is_array($payload['questions'] ?? null) ? $payload['questions'] : null,
        );

        $proposal = $this->store($context, [
            'action' => $action,
            'subject_id' => $item->subjectEcr?->subject_id,
            'subject_ecr_id' => $item->subject_ecr_id,
            'subject_ecr_item_id' => $item->id,
            'title' => $item->title,
            'assessment_type' => $item->type,
            'quarter' => $item->quarter,
            'payload' => $payload,
            'preview' => $preview,
            'warnings' => $warnings,
            'summary' => ucfirst($action).' "'.$item->title.'"',
        ]);

        return $this->outcome($proposal, array_filter([
            'proposed' => $action,
            'status' => 'awaiting the teacher\'s approval',
            'assessment' => $preview['assessment'],
            'changes' => $preview['changes'] ?? null,
            'warnings' => $warnings,
            'note' => 'Nothing has changed yet. A card is in the chat for the teacher to approve '
                .'or discard. Tell them what it will do — especially anything in `warnings` — and '
                .'do not describe the change as done.',
        ], fn ($value) => $value !== null));
    }

    /**
     * Consequences the teacher should see before clicking.
     *
     * @param  array<int, array<string, mixed>>  $current
     * @param  array<int, array<string, mixed>>|null  $carried  The payload's questions, with
     *                                                          ids on the ones being kept.
     * @return array<int, array<string, string>>
     */
    private function warnings(
        string $action,
        SubjectEcrItem $item,
        int $attempts,
        array $current,
        ?AssessmentSpec $spec,
        ?array $carried = null,
    ): array {
        $warnings = [];
        $published = $item->status === AssessmentTypes::STATUS_PUBLISHED;

        if ($action === TalaAssessmentProposal::ACTION_DELETE) {
            $warnings[] = [
                'level' => $attempts > 0 ? 'danger' : 'warning',
                'message' => $attempts > 0
                    ? 'This will delete an assessment that '.$attempts.' student submission(s) belong to. '
                        .'Their scores for it go with it and this cannot be undone.'
                    : 'This deletes the assessment and its questions. It cannot be undone.',
            ];
        }

        if ($action === TalaAssessmentProposal::ACTION_PUBLISH) {
            $warnings[] = [
                'level' => 'warning',
                'message' => 'Publishing makes this visible to students straight away.',
            ];

            if ($current === []) {
                $warnings[] = [
                    'level' => 'danger',
                    'message' => 'This assessment has no questions yet.',
                ];
            }
        }

        if ($action === TalaAssessmentProposal::ACTION_UNPUBLISH && $attempts > 0) {
            $warnings[] = [
                'level' => 'warning',
                'message' => $attempts.' student(s) have already submitted. Taking it back to draft '
                    .'hides it from them; their submissions are kept.',
            ];
        }

        if ($action === TalaAssessmentProposal::ACTION_UPDATE) {
            if ($published) {
                $warnings[] = [
                    'level' => 'warning',
                    'message' => 'This assessment is published, so students may be part-way through it.',
                ];
            }

            if ($spec !== null && $spec->questions() !== []) {
                $proposed = count($spec->questions());
                $kept = $carried === null
                    ? 0
                    : count(array_filter($carried, fn (array $question) => isset($question['id'])));
                $replaced = count($current) - $kept;

                if ($attempts > 0) {
                    $warnings[] = [
                        'level' => 'danger',
                        'message' => 'Replacing the questions on an assessment with '.$attempts
                            .' submission(s) re-marks work that has already been scored.',
                    ];
                }

                if ($replaced > 0) {
                    // Spelled out per question rather than as a net count: a
                    // "one question shorter" edit that rewords four others
                    // discards the answers to all five, and a net count hides
                    // that completely.
                    $warnings[] = [
                        'level' => $attempts > 0 ? 'danger' : 'warning',
                        'message' => 'Of the '.count($current).' current question(s), '.$kept
                            .' stay as they are and '.$replaced.' are replaced or removed. The new '
                            .'set has '.$proposed.'.'
                            .($attempts > 0
                                ? ' Answers students already gave to the '.$replaced
                                    .' replaced question(s) stop counting towards their score.'
                                : ''),
                    ];
                }

                // v1 keys a student's answers by array index, so a changed
                // question order silently re-points existing answers. v2 keys by
                // question id and does not have the problem; an update writes v2,
                // which is a one-way improvement worth naming.
                if ((int) $item->content_version === 1 && $attempts > 0) {
                    $warnings[] = [
                        'level' => 'danger',
                        'message' => 'This assessment stores answers by question position, not by '
                            .'question. Existing submissions may be re-scored against the wrong '
                            .'questions. Consider making a new assessment instead of editing this one.',
                    ];
                }
            }
        }

        return $warnings;
    }

    /**
     * Keep the row id of any question the update leaves untouched.
     *
     * AssessmentV2Service::syncQuestions() reuses a row when the payload carries
     * its id and creates a new one otherwise, then soft-deletes whatever is left
     * over. Since the model never sees or sends ids, every question in an update
     * would look new — so a two-question edit to a ten-question quiz would
     * replace all ten rows, and every student answer, keyed by question id,
     * would stop matching anything live. Answers to questions nobody touched
     * would be lost along with the rest.
     *
     * Matching is done here, by question text, and never through the tool
     * schema: ids stay out of the model's reach for the same reason they always
     * have. Text is a good enough key because an identical prompt is the same
     * question — and when it is not, the worst case is the pre-existing one.
     *
     * @param  array<int, array<string, mixed>>  $questions
     * @return array<int, array<string, mixed>>
     */
    private function carryIds(SubjectEcrItem $item, array $questions): array
    {
        if (! $item->isV2()) {
            // v1 has no question rows to carry forward; the whole set is
            // rewritten as v2 on apply.
            return $questions;
        }

        $byPrompt = [];

        foreach ($item->resolvedQuestions() as $existing) {
            $prompt = $this->promptKey($existing['question'] ?? '');
            $id = $existing['id'] ?? null;

            // First occurrence wins, so a quiz that repeats a prompt does not
            // hand the same id to two questions.
            if ($prompt !== '' && is_string($id) && ! isset($byPrompt[$prompt])) {
                $byPrompt[$prompt] = $id;
            }
        }

        $used = [];

        foreach ($questions as $index => $question) {
            $prompt = $this->promptKey($question['question'] ?? '');
            $id = $byPrompt[$prompt] ?? null;

            if ($id !== null && ! isset($used[$id])) {
                $questions[$index]['id'] = $id;
                $used[$id] = true;
            }
        }

        return $questions;
    }

    /**
     * Question prompts are compared with markup and spacing ignored: the stored
     * copy may carry editor HTML the model's plain text will not reproduce.
     */
    private function promptKey(string $prompt): string
    {
        $plain = LessonText::plain($prompt) ?? '';

        return mb_strtolower(trim(preg_replace('/\s+/', ' ', $plain) ?? $plain));
    }

    /**
     * The state the proposal was built against.
     *
     * ProposalApplier compares this with the live row at approval time and
     * refuses if it has moved — a submission arriving between the draft and the
     * click changes what the teacher was agreeing to.
     *
     * @return array<string, mixed>
     */
    private function guard(SubjectEcrItem $item, int $attempts): array
    {
        return [
            'status' => $item->status,
            'attempts' => $attempts,
            'questions' => count($item->resolvedQuestions()),
            'updated_at' => $item->updated_at?->toIso8601String(),
        ];
    }

    /**
     * The teacher's subject, resolved through their own scope.
     *
     * @param  array<string, mixed>  $input
     * @return Subject|ToolOutcome
     */
    private function resolveSubject(array $input, ToolContext $context)
    {
        $title = ToolInput::text($input, 'subject');

        if ($title === null) {
            return ToolOutcome::error(
                'subject is required for create — the title of the subject this assessment is for. '
                .'Use list_assigned_subjects to see them.'
            );
        }

        $query = AssignedSubjectScope::query($context)
            ->with('classSection:id,title,grade_level')
            ->where('title', 'like', '%'.$title.'%');

        if ($section = ToolInput::text($input, 'class_section')) {
            $query->whereHas(
                'classSection',
                fn ($q) => $q->where('title', 'like', '%'.$section.'%')
                    ->orWhere('grade_level', 'like', '%'.$section.'%')
            );
        }

        $matches = $query->orderBy('title')->limit(12)->get();

        if ($matches->isEmpty()) {
            return ToolOutcome::error(
                'No subject of the teacher\'s matches "'.$title.'". Use list_assigned_subjects to '
                .'see what they teach. You cannot create an assessment for a subject they are not '
                .'assigned to.'
            );
        }

        if ($matches->count() > 1) {
            $exact = $matches->filter(
                fn (Subject $subject) => mb_strtolower((string) $subject->title) === mb_strtolower($title)
            );

            if ($exact->count() !== 1) {
                return ToolOutcome::error(
                    'More than one of the teacher\'s subjects matches "'.$title.'": '
                    .$matches->map(fn (Subject $s) => $s->title.' ('.(SectionLabel::for($s->classSection) ?? 'no section').')')
                        ->implode('; ')
                    .'. Ask which one, or pass class_section.'
                );
            }

            return $exact->first();
        }

        return $matches->first();
    }

    /**
     * The grading component to file a new assessment under.
     *
     * Which one it goes in changes how it weighs in the running grade, so a
     * subject with more than one is a question for the teacher rather than a
     * coin toss.
     *
     * @param  array<string, mixed>  $input
     * @return SubjectEcr|ToolOutcome
     */
    private function resolveComponent(array $input, ToolContext $context, Subject $subject)
    {
        $components = AssignedAssessmentScope::componentQuery($context)
            ->where('subject_id', $subject->id)
            ->orderBy('title')
            ->get();

        if ($components->isEmpty()) {
            return ToolOutcome::error(
                $subject->title.' has no grading components set up yet, so there is nowhere to file '
                .'an assessment. The teacher sets those up on the subject\'s class record first.'
            );
        }

        $wanted = ToolInput::text($input, 'component');

        if ($wanted !== null) {
            $match = $components->first(
                fn (SubjectEcr $component) => str_contains(
                    mb_strtolower((string) $component->title),
                    mb_strtolower($wanted)
                )
            );

            if ($match === null) {
                return ToolOutcome::error(
                    'No grading component of '.$subject->title.' matches "'.$wanted.'". It has: '
                    .$components->map(fn (SubjectEcr $c) => $c->title)->implode(', ').'.'
                );
            }

            return $match;
        }

        if ($components->count() > 1) {
            return ToolOutcome::error(
                $subject->title.' has more than one grading component: '
                .$components->map(fn (SubjectEcr $c) => $c->title.' ('.rtrim(rtrim((string) $c->percentage, '0'), '.').'%)')
                    ->implode(', ')
                .'. Ask the teacher which one this should go under, then pass it as `component`.'
            );
        }

        return $components->first();
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function store(ToolContext $context, array $attributes): TalaAssessmentProposal
    {
        return TalaAssessmentProposal::create(array_merge([
            'institution_id' => $context->institutionId,
            'user_id' => $context->userId(),
            'conversation_id' => $context->conversationId,
            'status' => TalaAssessmentProposal::STATUS_PENDING,
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function outcome(TalaAssessmentProposal $proposal, array $data): ToolOutcome
    {
        return ToolOutcome::ok(
            $data,
            $proposal->summary ?? 'Proposal ready for approval',
            // For the controller: the SSE event that puts the card on screen.
            // Not sent to the provider.
            ['proposal_id' => $proposal->id],
        );
    }

    private function specErrors(AssessmentSpec $spec): ToolOutcome
    {
        return ToolOutcome::error(
            'The questions could not be used: '.implode(' ', $spec->errors())
            .' Fix them and call propose_assessment again. Nothing was saved.'
        );
    }

    private function points(float $points): string
    {
        return rtrim(rtrim(number_format($points, 2, '.', ''), '0'), '.');
    }
}
