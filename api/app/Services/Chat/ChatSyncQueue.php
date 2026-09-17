<?php

namespace App\Services\Chat;

use App\Models\ChatConversation;
use App\Models\ClassSection;
use App\Models\Student;
use App\Models\Subject;
use Illuminate\Support\Facades\Log;

/**
 * Collects what changed during a request and re-derives it once, after the
 * response has been sent.
 *
 * The observers that feed this fire per row, so assigning a class of forty
 * students would otherwise re-derive the same section forty times while the
 * teacher waits. Marking is cheap and deduplicated; the work happens on
 * terminate.
 *
 * A failure here is logged and swallowed. Chat membership drifting is a
 * nuisance that the reconcile pass repairs; a chat bug refusing to let a school
 * enrol a student is not acceptable, and this code runs on the enrolment path.
 */
class ChatSyncQueue
{
    /** @var array<string,true> */
    private array $sections = [];

    /** @var array<string,true> */
    private array $subjects = [];

    /** @var array<string,true> */
    private array $students = [];

    /**
     * Subjects that are about to disappear along with their section.
     *
     * @var array<string,true>
     */
    private array $cascading = [];

    private bool $registered = false;

    public function __construct(
        private readonly ChatMembershipSync $sync,
        private readonly ChatRosterPublisher $rosters,
    ) {}

    public function section(?string $id): void
    {
        $this->mark($this->sections, $id);
    }

    public function subject(?string $id): void
    {
        $this->mark($this->subjects, $id);
    }

    /**
     * Only needed when someone *leaves*: their enrolment rows no longer point at
     * the group they must be removed from, so the sync has to start from them.
     */
    public function student(?string $id): void
    {
        $this->mark($this->students, $id);
    }

    public function closeScope(string $scopeType, string $scopeId): void
    {
        $this->guard(fn () => $this->sync->closeScope($scopeType, $scopeId));
    }

    /**
     * Note the subjects that a section is about to take down with it.
     *
     * A dissolve sets deleted_at and every observer sees it. A hard delete does
     * not: subjects.class_section_id is ON DELETE CASCADE, so MySQL removes the
     * subject rows itself and Eloquent never hears about them — no `deleted`
     * event, no closeScope, and a group left open around a section that no
     * longer exists, still accepting messages from everyone who was in it.
     *
     * So the ids are read here, on the way out, while the rows are still there
     * to be read. Closing them has to wait for the delete to actually land, or a
     * rolled-back transaction would leave a live section full of closed groups.
     */
    public function noteCascadingSubjects(string $sectionId): void
    {
        $this->guard(function () use ($sectionId) {
            foreach (Subject::where('class_section_id', $sectionId)->pluck('id') as $id) {
                $this->cascading[(string) $id] = true;
            }
        });
    }

    /** Close what noteCascadingSubjects saw, now that the section has gone. */
    public function closeCascadedSubjects(): void
    {
        $subjects = array_keys($this->cascading);
        $this->cascading = [];

        foreach ($subjects as $subjectId) {
            $this->closeScope(ChatConversation::SCOPE_SUBJECT, $subjectId);
        }
    }

    public function flush(): void
    {
        $sections = array_keys($this->sections);
        $subjects = array_keys($this->subjects);
        $students = array_keys($this->students);

        $this->sections = $this->subjects = $this->students = [];

        if (! $sections && ! $subjects && ! $students) {
            return;
        }

        $this->guard(function () use ($sections, $subjects, $students) {
            foreach (ClassSection::whereIn('id', $sections)->get() as $section) {
                $this->sync->syncSection($section);
            }

            foreach (Subject::whereIn('id', $subjects)->get() as $subject) {
                $this->sync->syncSubject($subject);
            }

            foreach (Student::whereIn('id', $students)->get() as $student) {
                $this->sync->syncStudent($student);
            }

            /*
             * Hand the rebuilt rosters to the chat service, which cannot work
             * them out for itself — enrolment lives here. One push per group,
             * after the response has already gone out, so a slow or missing
             * service never shows up as a slow enrolment save.
             */
            foreach ($this->sync->takeTouched() as $conversation) {
                $this->rosters->push($conversation);
            }
        });
    }

    /**
     * @param  array<string,true>  $bucket
     */
    private function mark(array &$bucket, ?string $id): void
    {
        if (! $id) {
            return;
        }

        $bucket[$id] = true;
        $this->register();
    }

    private function register(): void
    {
        if ($this->registered) {
            return;
        }

        $this->registered = true;
        app()->terminating(fn () => $this->flush());
    }

    private function guard(callable $work): void
    {
        try {
            $work();
        } catch (\Throwable $e) {
            Log::error('Chat membership sync failed', ['exception' => $e]);
        }
    }
}
