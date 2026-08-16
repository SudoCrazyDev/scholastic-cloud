<?php

namespace App\Observers;

use App\Models\ChatConversation;
use App\Models\ClassSection;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use App\Services\Chat\ChatSyncQueue;

/**
 * Keeps group chats in step with enrolment.
 *
 * Registered against every model that can change who belongs with whom. This is
 * an observer rather than calls sprinkled through the controllers because the
 * paths are many — create a section, reassign an adviser, transfer a student,
 * dissolve a section, toggle a subject's limited roster — and one that got
 * missed would quietly leave a student out of their class group with nothing to
 * show for it. Every one of those writes goes through Eloquent, so this catches
 * them all.
 *
 * The work is deferred to ChatSyncQueue and runs after the response.
 */
class ChatMembershipObserver
{
    public function __construct(private readonly ChatSyncQueue $queue) {}

    public function savedClassSection(ClassSection $section): void
    {
        // Covers dissolve too: that sets deleted_at through an update, and
        // syncSection reads it to empty the roster.
        $this->queue->section($section->id);
    }

    public function deletedClassSection(ClassSection $section): void
    {
        $this->queue->closeScope(ChatConversation::SCOPE_CLASS_SECTION, $section->id);
    }

    public function savedSubject(Subject $subject): void
    {
        $this->queue->subject($subject->id);

        // A subject gaining or losing children changes whether the parent is a
        // container, and so whether the parent should have a group at all.
        if ($subject->parent_subject_id) {
            $this->queue->subject($subject->parent_subject_id);
        }
    }

    public function deletedSubject(Subject $subject): void
    {
        $this->queue->closeScope(ChatConversation::SCOPE_SUBJECT, $subject->id);

        if ($subject->parent_subject_id) {
            $this->queue->subject($subject->parent_subject_id);
        }
    }

    public function savedStudentSection(StudentSection $enrolment): void
    {
        $this->queue->section($enrolment->section_id);
        $this->queue->student($enrolment->student_id);
    }

    public function deletedStudentSection(StudentSection $enrolment): void
    {
        $this->queue->section($enrolment->section_id);
        $this->queue->student($enrolment->student_id);
    }

    public function savedStudentSubject(StudentSubject $assignment): void
    {
        $this->queue->subject($assignment->subject_id);
        $this->queue->student($assignment->student_id);
    }

    public function deletedStudentSubject(StudentSubject $assignment): void
    {
        $this->queue->subject($assignment->subject_id);
        $this->queue->student($assignment->student_id);
    }
}
