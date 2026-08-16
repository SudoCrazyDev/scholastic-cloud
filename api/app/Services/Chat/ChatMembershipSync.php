<?php

namespace App\Services\Chat;

use App\Models\ChatConversation;
use App\Models\ChatParticipant;
use App\Models\ClassSection;
use App\Models\Student;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use Illuminate\Support\Collection;

/**
 * The only writer of chat_conversations and chat_participants.
 *
 * Group chats are not created; they are derived. An advisory group is whatever
 * a class section already says — its adviser plus its enrolled students — and a
 * subject group is whatever a subject already says. Nobody adds or removes a
 * member by hand, because the moment they could, the roster would start drifting
 * from the enrolment it is supposed to mirror.
 *
 * Every method here is idempotent. That is the whole design: the write paths
 * (enrol a student, reassign a teacher, dissolve a section) call the matching
 * sync, and a periodic reconcile re-runs the same code over everything to repair
 * any path that forgot to. Running it twice changes nothing.
 */
class ChatMembershipSync
{
    /**
     * Groups whose roster this run has rebuilt, keyed by id.
     *
     * Collected so the caller can push them onward to the chat service without
     * having to work out for itself what a section sync touched — one enrolment
     * change can rebuild an advisory and every subject taught to that section.
     *
     * @var array<string,ChatConversation>
     */
    private array $touched = [];

    /** @return array<int,ChatConversation> and empties the list */
    public function takeTouched(): array
    {
        $touched = array_values($this->touched);
        $this->touched = [];

        return $touched;
    }

    private function remember(?ChatConversation $conversation): ?ChatConversation
    {
        if ($conversation) {
            $this->touched[$conversation->id] = $conversation;
        }

        return $conversation;
    }

    /**
     * Advisory group for a class section: its adviser and its active students.
     */
    public function syncSection(ClassSection $section): ?ChatConversation
    {
        // A dissolved section keeps its transcript but empties out — see the
        // roster rules in apply().
        $dissolved = $section->deleted_at !== null;

        return $this->apply(
            institutionId: $section->institution_id,
            type: ChatConversation::TYPE_ADVISORY,
            scopeType: ChatConversation::SCOPE_CLASS_SECTION,
            scopeId: $section->id,
            academicYear: (string) ($section->academic_year ?? ''),
            title: $section->title,
            subtitle: 'Advisory',
            teacherUserId: $dissolved ? null : $section->adviser,
            studentIds: $dissolved ? [] : $this->sectionStudentIds($section->id),
        );
    }

    /**
     * Subject group: the subject's teacher and whoever takes that subject.
     */
    public function syncSubject(Subject $subject): ?ChatConversation
    {
        // A parent subject is a container, not a class — MAPEH holds Music,
        // Arts, PE and Health, and the teaching happens in the children. Giving
        // the parent a group too would put every student in two rooms for what
        // they experience as one subject.
        if ($subject->hasChildSubjects()) {
            return null;
        }

        // Without a section there is no roster to derive, and the group would
        // have no one in it.
        if (! $subject->class_section_id) {
            return null;
        }

        $section = $subject->classSection;
        if (! $section) {
            return null;
        }

        $dissolved = $section->deleted_at !== null;

        return $this->apply(
            institutionId: $subject->institution_id,
            type: ChatConversation::TYPE_SUBJECT,
            scopeType: ChatConversation::SCOPE_SUBJECT,
            scopeId: $subject->id,
            academicYear: (string) ($section->academic_year ?? ''),
            title: $this->subjectTitle($subject),
            subtitle: $section->title,
            teacherUserId: $dissolved ? null : $subject->adviser,
            studentIds: $dissolved ? [] : $this->subjectStudentIds($subject, $section),
        );
    }

    /**
     * Re-derive every group this student touches.
     *
     * Includes the groups they are *currently* a participant of, not just the
     * ones their enrolment now points at — otherwise a transfer that deletes the
     * old student_sections row outright would leave them sitting in their former
     * section's chat with nothing to notice it.
     */
    public function syncStudent(Student $student): void
    {
        $sectionIds = StudentSection::where('student_id', $student->id)
            ->pluck('section_id')
            ->all();

        $subjectIds = StudentSubject::where('student_id', $student->id)
            ->pluck('subject_id')
            ->all();

        $stale = ChatParticipant::query()
            ->forPerson(ChatParticipant::TYPE_STUDENT, $student->id)
            ->pluck('conversation_id');

        foreach (ChatConversation::whereIn('id', $stale)->get() as $conversation) {
            if ($conversation->scope_type === ChatConversation::SCOPE_CLASS_SECTION) {
                $sectionIds[] = $conversation->scope_id;
            } else {
                $subjectIds[] = $conversation->scope_id;
            }
        }

        $sectionIds = array_values(array_unique($sectionIds));

        foreach (ClassSection::whereIn('id', $sectionIds)->get() as $section) {
            $this->syncSection($section);
        }

        // Every subject taught to those sections, plus any the student is
        // individually assigned to on a limited-roster subject.
        $subjects = Subject::query()
            ->where(fn ($q) => $q->whereIn('class_section_id', $sectionIds)
                ->orWhereIn('id', array_values(array_unique($subjectIds))))
            ->get();

        foreach ($subjects as $subject) {
            $this->syncSubject($subject);
        }
    }

    /**
     * Re-run every derivation for one institution and report what moved. This is
     * the repair pass: no deployment runs a scheduler today (see
     * routes/console.php), so it is driven from an endpoint rather than cron.
     *
     * @return array{sections:int,subjects:int,closed:int}
     */
    public function reconcileInstitution(string $institutionId): array
    {
        $sections = ClassSection::where('institution_id', $institutionId)->get();
        foreach ($sections as $section) {
            $this->syncSection($section);
        }

        $subjects = Subject::where('institution_id', $institutionId)->get();
        foreach ($subjects as $subject) {
            $this->syncSubject($subject);
        }

        return [
            'sections' => $sections->count(),
            'subjects' => $subjects->count(),
            'closed' => $this->closeOrphaned($institutionId, $sections, $subjects),
        ];
    }

    /**
     * Empty the roster of every conversation derived from a scope row that has
     * gone. Used when a section or subject is deleted outright: the transcript
     * survives for the record, but nobody is left able to post to it.
     */
    public function closeScope(string $scopeType, string $scopeId): void
    {
        $conversations = ChatConversation::where('scope_type', $scopeType)
            ->where('scope_id', $scopeId)
            ->get();

        foreach ($conversations as $conversation) {
            $this->applyRoster($conversation, []);
            $this->remember($conversation);
        }
    }

    /**
     * Create or refresh one conversation and reconcile its roster.
     *
     * A null teacher closes the group: everyone is marked removed and the
     * transcript goes read-only. That covers a dissolved section, a subject
     * whose teacher was unassigned, and an adviser slot left empty — all three
     * would otherwise leave students in a room with no adult in it, which is the
     * one shape of student chat this feature is built to avoid.
     */
    private function apply(
        ?string $institutionId,
        string $type,
        string $scopeType,
        string $scopeId,
        string $academicYear,
        string $title,
        ?string $subtitle,
        ?string $teacherUserId,
        array $studentIds,
    ): ?ChatConversation {
        if (! $institutionId) {
            return null;
        }

        $roster = [];
        if ($teacherUserId) {
            $roster[ChatParticipant::TYPE_USER.':'.$teacherUserId] = ChatParticipant::ROLE_TEACHER;

            foreach ($studentIds as $studentId) {
                $roster[ChatParticipant::TYPE_STUDENT.':'.$studentId] = ChatParticipant::ROLE_STUDENT;
            }
        }

        $conversation = ChatConversation::query()
            ->where('scope_type', $scopeType)
            ->where('scope_id', $scopeId)
            ->where('academic_year', $academicYear)
            ->first();

        if (! $conversation) {
            // Nothing to open yet. Notably this is also the unsupervised case,
            // so a group is never brought into existence without a teacher.
            if ($roster === []) {
                return null;
            }

            $conversation = ChatConversation::create([
                'institution_id' => $institutionId,
                'type' => $type,
                'scope_type' => $scopeType,
                'scope_id' => $scopeId,
                'academic_year' => $academicYear,
                'title' => $title,
                'subtitle' => $subtitle,
            ]);
        } elseif ($conversation->title !== $title || $conversation->subtitle !== $subtitle) {
            // The denormalized display text follows a rename of the section or
            // subject it was copied from.
            $conversation->update(['title' => $title, 'subtitle' => $subtitle]);
        }

        $this->applyRoster($conversation, $roster);

        return $this->remember($conversation);
    }

    /**
     * @param  array<string,string>  $roster  "type:id" => role
     */
    private function applyRoster(ChatConversation $conversation, array $roster): void
    {
        $existing = ChatParticipant::where('conversation_id', $conversation->id)
            ->get()
            ->keyBy(fn (ChatParticipant $p) => $p->participant_type.':'.$p->participant_id);

        foreach ($roster as $key => $role) {
            [$participantType, $participantId] = explode(':', $key, 2);
            $participant = $existing->get($key);

            if (! $participant) {
                ChatParticipant::create([
                    'conversation_id' => $conversation->id,
                    'participant_type' => $participantType,
                    'participant_id' => $participantId,
                    'role' => $role,
                ]);

                continue;
            }

            // Someone who left and came back keeps their read position; only the
            // removal is undone. A student promoted into the section they used to
            // be in should not be handed 400 unread messages.
            if ($participant->removed_at !== null || $participant->role !== $role) {
                $participant->update(['removed_at' => null, 'role' => $role]);
            }
        }

        foreach ($existing as $key => $participant) {
            if (isset($roster[$key]) || $participant->removed_at !== null) {
                continue;
            }

            $participant->update(['removed_at' => now()]);
        }
    }

    /**
     * Close conversations whose section or subject no longer exists at all —
     * a hard delete rather than a dissolve. The transcript is kept; only the
     * roster is emptied.
     */
    private function closeOrphaned(string $institutionId, Collection $sections, Collection $subjects): int
    {
        $liveSectionIds = $sections->pluck('id')->all();
        $liveSubjectIds = $subjects->pluck('id')->all();

        $orphans = ChatConversation::where('institution_id', $institutionId)
            ->get()
            ->filter(fn (ChatConversation $c) => $c->scope_type === ChatConversation::SCOPE_CLASS_SECTION
                ? ! in_array($c->scope_id, $liveSectionIds, true)
                : ! in_array($c->scope_id, $liveSubjectIds, true));

        foreach ($orphans as $conversation) {
            $this->applyRoster($conversation, []);
        }

        return $orphans->count();
    }

    /** @return array<int,string> */
    private function sectionStudentIds(string $sectionId): array
    {
        return StudentSection::where('section_id', $sectionId)
            ->where('is_active', true)
            ->pluck('student_id')
            ->unique()
            ->values()
            ->all();
    }

    /** @return array<int,string> */
    private function subjectStudentIds(Subject $subject, ClassSection $section): array
    {
        if ($subject->is_limited_student) {
            return StudentSubject::where('subject_id', $subject->id)
                ->where('is_active', true)
                ->pluck('student_id')
                ->unique()
                ->values()
                ->all();
        }

        return $this->sectionStudentIds($section->id);
    }

    private function subjectTitle(Subject $subject): string
    {
        return trim($subject->title.' '.($subject->variant ?? ''));
    }
}
