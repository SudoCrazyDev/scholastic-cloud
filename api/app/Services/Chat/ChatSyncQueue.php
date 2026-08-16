<?php

namespace App\Services\Chat;

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
