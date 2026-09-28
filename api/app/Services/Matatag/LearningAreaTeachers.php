<?php

namespace App\Services\Matatag;

use App\Models\ClassSection;
use App\Models\MatatagLearningArea;
use App\Models\MatatagSectionCurriculum;
use App\Models\MatatagSubjectLearningArea;
use App\Models\Subject;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Who, besides the adviser, may mark a learning area of a MATATAG section.
 *
 * A learning area is linked to one of the section's own `subjects` rows, and
 * whoever teaches that subject (`subjects.adviser`) may mark that area's
 * competencies — nothing else in the section. The adviser keeps the whole grid,
 * the narratives and the report card: DepEd names the adviser as the record's
 * owner, and a subject teacher marking one area does not change that.
 *
 * Titles only ever *suggest* a link. The link itself is stored, so renaming a
 * subject mid-year cannot quietly take an area away from its teacher.
 */
class LearningAreaTeachers
{
    /**
     * The pinned catalog's areas, in the order the PACE form prints them.
     *
     * @return Collection<int, MatatagLearningArea>
     */
    public function areas(MatatagSectionCurriculum $pin): Collection
    {
        return MatatagLearningArea::where('curriculum_version_id', $pin->curriculum_version_id)
            ->orderBy('sort_order')
            ->get();
    }

    /**
     * The section's subjects, with their teachers.
     *
     * @return Collection<int, Subject>
     */
    public function subjects(ClassSection $section): Collection
    {
        return Subject::with('adviserUser')
            ->where('class_section_id', $section->id)
            ->orderBy('order')
            ->orderBy('title')
            ->get();
    }

    /**
     * The stored links for a section-year, keyed by learning area id.
     *
     * @return Collection<string, MatatagSubjectLearningArea>
     */
    public function links(ClassSection $section, string $academicYear): Collection
    {
        return MatatagSubjectLearningArea::with('subject.adviserUser')
            ->where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->get()
            ->keyBy('learning_area_id');
    }

    /**
     * The learning areas a person may mark in a section as a subject teacher.
     *
     * An empty array means none — not "all". Whether someone reaches the whole
     * section as its adviser is decided elsewhere, and this deliberately does
     * not answer it.
     *
     * @return array<int, string>
     */
    public function areaIdsTaughtBy(string $userId, ClassSection $section, string $academicYear): array
    {
        return MatatagSubjectLearningArea::query()
            ->join('subjects', 'subjects.id', '=', 'matatag_subject_learning_areas.subject_id')
            ->where('matatag_subject_learning_areas.class_section_id', $section->id)
            ->where('matatag_subject_learning_areas.academic_year', $academicYear)
            // The subject must still be this section's. A subject cannot move
            // sections today, but the link would otherwise outlive it silently.
            ->where('subjects.class_section_id', $section->id)
            ->where('subjects.adviser', $userId)
            ->pluck('matatag_subject_learning_areas.learning_area_id')
            ->all();
    }

    /** Whether a person teaches any linked subject in a section, in any year. */
    public function teachesAnyAreaOf(string $userId, ClassSection $section): bool
    {
        return MatatagSubjectLearningArea::query()
            ->join('subjects', 'subjects.id', '=', 'matatag_subject_learning_areas.subject_id')
            ->where('matatag_subject_learning_areas.class_section_id', $section->id)
            ->where('subjects.class_section_id', $section->id)
            ->where('subjects.adviser', $userId)
            ->exists();
    }

    /**
     * Which subject each area would be linked to by name, keyed by area id.
     *
     * An area gets a suggestion only when exactly one subject matches it. Two
     * subjects both called "Math" is a question for the adviser, not a guess.
     *
     * @param  Collection<int, MatatagLearningArea>  $areas
     * @param  Collection<int, Subject>  $subjects
     * @return array<string, string> area id => subject id
     */
    public function suggest(Collection $areas, Collection $subjects): array
    {
        $suggestions = [];

        foreach ($areas as $area) {
            $names = $this->namesFor($area);

            $matches = $subjects->filter(
                fn (Subject $subject) => in_array(self::normalise($subject->title), $names, true)
            );

            if ($matches->count() === 1) {
                $suggestions[$area->id] = $matches->first()->id;
            }
        }

        return $suggestions;
    }

    /**
     * Link every still-unlinked area whose subject is unambiguous by name.
     *
     * Never overwrites a link: once an adviser has chosen, a later rename or a
     * new subject does not change their choice.
     *
     * @return int how many links were created
     */
    public function autoLink(ClassSection $section, MatatagSectionCurriculum $pin, ?string $userId): int
    {
        $areas = $this->areas($pin);
        $linked = $this->links($section, $pin->academic_year);
        $unlinked = $areas->reject(fn (MatatagLearningArea $area) => $linked->has($area->id));

        if ($unlinked->isEmpty()) {
            return 0;
        }

        $created = 0;

        foreach ($this->suggest($unlinked, $this->subjects($section)) as $areaId => $subjectId) {
            MatatagSubjectLearningArea::firstOrCreate(
                [
                    'class_section_id' => $section->id,
                    'academic_year' => $pin->academic_year,
                    'learning_area_id' => $areaId,
                ],
                [
                    'institution_id' => $section->institution_id,
                    'subject_id' => $subjectId,
                    'linked_by' => $userId,
                ],
            );

            $created++;
        }

        return $created;
    }

    /**
     * The spellings of an area a subject title is compared against.
     *
     * @return array<int, string>
     */
    private function namesFor(MatatagLearningArea $area): array
    {
        $title = (string) $area->title;

        $names = [
            $title,
            // "Good Manners and Right Conduct (GMRC)" -> the words, and "GMRC".
            preg_replace('/\s*\(.*?\)\s*/', ' ', $title),
            str_replace('-', ' ', (string) $area->key),
        ];

        if (preg_match_all('/\((.*?)\)/', $title, $bracketed)) {
            array_push($names, ...$bracketed[1]);
        }

        array_push($names, ...(array) config('matatag.subject_aliases.'.$area->key, []));

        return array_values(array_unique(array_filter(array_map(
            fn ($name) => self::normalise((string) $name),
            $names,
        ))));
    }

    /** Lower-case, '&' as 'and', punctuation dropped, whitespace collapsed. */
    public static function normalise(string $value): string
    {
        $value = Str::lower(str_replace('&', ' and ', $value));
        $value = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $value);

        return trim(preg_replace('/\s+/', ' ', $value));
    }
}
