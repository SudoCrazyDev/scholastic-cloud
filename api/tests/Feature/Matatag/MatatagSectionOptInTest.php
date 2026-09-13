<?php

namespace Tests\Feature\Matatag;

use App\Models\MatatagCompetencyRating;
use App\Models\MatatagCurriculumVersion;
use App\Models\MatatagGradeLevelCurriculum;
use App\Models\MatatagSectionCurriculum;
use App\Models\MatatagTermNarrative;
use App\Services\Matatag\CatalogLoader;

/**
 * Opting a section in is where the module decides what a year of a learner's
 * record will be measured against, and it is the only chance to catch a
 * mismatch.
 *
 * DepEd's own workbook is why. `INPUT DATA!F27` is a dropdown offering Grades
 * 1, 2 and 3 while every content sheet carries Grade 1's competencies, so a
 * school can set the file to Grade 2 and print Grade 1 competencies under a
 * Grade 2 heading with nothing in the file to stop it. Opt-in is where that is
 * stopped here.
 */
class MatatagSectionOptInTest extends MatatagTestCase
{
    public function test_a_grade_1_section_opts_in_and_gets_the_published_catalog(): void
    {
        $response = $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in", [
                'academic_year' => self::YEAR,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.grade_level', 'Grade 1')
            ->assertJsonPath('data.curriculum_version.code', self::CATALOG_CODE);

        $this->assertDatabaseHas('matatag_section_curricula', [
            'class_section_id' => $this->sectionA1->id,
            'academic_year' => self::YEAR,
            'curriculum_version_id' => $this->catalog()->id,
            'institution_id' => $this->schoolA->id,
            'enabled' => true,
        ]);
    }

    public function test_a_grade_10_section_is_refused_by_name(): void
    {
        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA10->id}/opt-in")
            ->assertStatus(422)
            ->assertJsonPath('code', 'not_key_stage_one')
            ->assertJsonFragment(['message' => "'Grade 10' is not a Key Stage 1 grade level. MATATAG "
                .'progress reporting covers Grade 1, Grade 2, Grade 3; every other grade level keeps '
                .'the numeric record it has now.']);

        $this->assertDatabaseCount('matatag_section_curricula', 0);
    }

    /**
     * Grades 2 and 3 have no catalog until DepEd's workbooks arrive. The
     * honest answer is to say so — not to hand them Grade 1's competencies,
     * which is precisely what the source workbook invites.
     */
    public function test_a_grade_2_section_is_refused_because_no_catalog_exists(): void
    {
        $section = $this->makeSection($this->schoolA, 'Grade 2', 'Adelfa', $this->adviserA1);

        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$section->id}/opt-in")
            ->assertStatus(422)
            ->assertJsonPath('code', 'no_catalog')
            ->assertJsonFragment(['message' => 'No DepEd catalog has been published for Grade 2 yet, '
                .'so there is nothing for this section to report against. The catalog arrives as a '
                .'data file; no code change is needed once DepEd releases the workbook.']);
    }

    public function test_a_catalog_for_the_wrong_grade_level_cannot_be_pinned_by_hand(): void
    {
        $grade2 = $this->loadSecondCatalog('deped-matatag-ks1-grade-2-v1', 'Grade 2');

        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in", [
                'curriculum_version_id' => $grade2->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'grade_level_mismatch');

        $this->assertDatabaseCount('matatag_section_curricula', 0);
    }

    /**
     * The pin is the whole point of pinning. Once a section is on a catalog
     * for a year, publishing a revision and making it the grade level's
     * default must not move it.
     */
    public function test_changing_the_grade_level_default_does_not_move_a_pinned_section(): void
    {
        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertCreated();

        $original = $this->catalog();
        $revision = $this->loadSecondCatalog(self::CATALOG_CODE.'-rev1', 'Grade 1', makeDefault: true);

        $this->assertSame(
            $revision->id,
            MatatagGradeLevelCurriculum::find('Grade 1')?->curriculum_version_id,
            'the revision must actually be the new default, or this test proves nothing',
        );

        $this->assertSame(
            $original->id,
            MatatagSectionCurriculum::where('class_section_id', $this->sectionA1->id)
                ->value('curriculum_version_id'),
            'A section mid-year stays on the catalog it started on.',
        );

        $this->as($this->adviserA1)
            ->getJson('/api/matatag/grid?class_section_id='.$this->sectionA1->id.'&term=1')
            ->assertOk()
            ->assertJsonPath('data.curriculum_version.id', $original->id);
    }

    /**
     * `class_sections.grade_level` is a free string a school types and may
     * rename mid-year — 'Grade 1' to 'Grade 1 - Sampaguita'. The pin carries
     * its own snapshot precisely so that cannot unpin a section that already
     * has descriptors.
     */
    public function test_renaming_the_sections_grade_level_does_not_unpin_it(): void
    {
        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertCreated();

        $this->sectionA1->update(['grade_level' => 'Grade 1 - Sampaguita (SY 2026-27)']);

        $this->as($this->adviserA1)
            ->getJson('/api/matatag/grid?class_section_id='.$this->sectionA1->id.'&term=1')
            ->assertOk()
            ->assertJsonPath('data.curriculum_version.code', self::CATALOG_CODE);

        $this->assertSame(
            'Grade 1',
            MatatagSectionCurriculum::where('class_section_id', $this->sectionA1->id)->value('grade_level'),
            'The pin keeps the grade level as it was at opt-in.',
        );
    }

    public function test_a_section_that_has_been_marked_cannot_be_moved_to_another_catalog(): void
    {
        $pin = $this->optIn($this->sectionA1);
        $slot = $this->slotsFor('gmrc', 1)[0];

        MatatagCompetencyRating::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA1->id,
            'student_id' => $this->learnersA1[0]->id,
            'academic_year' => self::YEAR,
            'slot_id' => $slot->id,
            'term' => $slot->term,
            'learning_area_id' => $slot->learning_area_id,
            'curriculum_version_id' => $pin->curriculum_version_id,
            'descriptor' => 'B',
        ]);

        $revision = $this->loadSecondCatalog(self::CATALOG_CODE.'-rev1', 'Grade 1');

        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in", [
                'curriculum_version_id' => $revision->id,
            ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'already_marked');

        $this->assertSame(
            $this->catalog()->id,
            MatatagSectionCurriculum::where('class_section_id', $this->sectionA1->id)
                ->value('curriculum_version_id'),
        );
    }

    /**
     * Opting out disables. It never deletes, because a school that stops
     * reporting in March has not decided that January did not happen — and
     * the year still has to be printable.
     */
    public function test_opting_out_keeps_every_descriptor_and_narrative(): void
    {
        $pin = $this->optIn($this->sectionA1);
        $slot = $this->slotsFor('gmrc', 1)[0];

        MatatagCompetencyRating::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA1->id,
            'student_id' => $this->learnersA1[0]->id,
            'academic_year' => self::YEAR,
            'slot_id' => $slot->id,
            'term' => 1,
            'learning_area_id' => $slot->learning_area_id,
            'curriculum_version_id' => $pin->curriculum_version_id,
            'descriptor' => 'A',
        ]);

        MatatagTermNarrative::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $this->sectionA1->id,
            'student_id' => $this->learnersA1[0]->id,
            'academic_year' => self::YEAR,
            'term' => 1,
            'can_do' => 'Reads aloud with confidence.',
        ]);

        $this->as($this->principalA)
            ->deleteJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertOk()
            ->assertJsonPath('data.enabled', false)
            ->assertJsonFragment(['message' => 'Sampaguita no longer reports on MATATAG for '
                .self::YEAR.'. Its 1 descriptor(s) and 1 narrative(s) are kept and can still be printed.']);

        $this->assertSame(1, MatatagCompetencyRating::count());
        $this->assertSame(1, MatatagTermNarrative::count());
        $this->assertSame(1, MatatagSectionCurriculum::count(), 'the pin is disabled, not deleted');

        // And the grid closes, because there is nothing to write against.
        $this->as($this->adviserA1)
            ->getJson('/api/matatag/grid?class_section_id='.$this->sectionA1->id.'&term=1')
            ->assertStatus(409)
            ->assertJsonPath('code', 'not_opted_in');
    }

    public function test_opting_in_again_re_enables_without_creating_a_second_pin(): void
    {
        $this->as($this->principalA)->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")->assertCreated();
        $this->as($this->principalA)->deleteJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")->assertOk();

        $this->as($this->principalA)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertOk()
            ->assertJsonPath('data.enabled', true);

        $this->assertSame(1, MatatagSectionCurriculum::count());
    }

    public function test_the_section_list_shows_key_stage_1_sections_and_where_each_one_stands(): void
    {
        $this->optIn($this->sectionA1);

        $response = $this->as($this->principalA)
            ->getJson('/api/matatag/sections?academic_year='.self::YEAR)
            ->assertOk();

        $sections = collect($response->json('data.sections'));

        $this->assertSame(
            ['Rosal', 'Sampaguita'],
            $sections->pluck('title')->sort()->values()->all(),
            'Only Key Stage 1 sections appear — the Grade 10 section is not this module\'s business.',
        );

        $this->assertTrue($sections->firstWhere('title', 'Sampaguita')['opted_in']);
        $this->assertFalse($sections->firstWhere('title', 'Rosal')['opted_in']);

        // A section that has not opted in still reports what it could opt in
        // to, so the client can offer the button with a reason rather than
        // letting it fail.
        $this->assertSame(
            self::CATALOG_CODE,
            $sections->firstWhere('title', 'Rosal')['available_curriculum_version']['code'],
        );
    }

    public function test_an_adviser_without_view_all_sees_only_their_own_sections(): void
    {
        $sections = $this->as($this->adviserA1)
            ->getJson('/api/matatag/sections?academic_year='.self::YEAR)
            ->assertOk()
            ->json('data.sections');

        $this->assertSame(['Sampaguita'], array_column($sections, 'title'));
    }

    // -----------------------------------------------------------------

    private function loadSecondCatalog(string $code, string $gradeLevel, bool $makeDefault = false): MatatagCurriculumVersion
    {
        $payload = CatalogLoader::decodeFile(database_path('data/matatag/grade-1.v1.json'));
        $payload['version']['code'] = $code;
        $payload['version']['grade_level'] = $gradeLevel;
        $payload['version']['title'] = $gradeLevel.' '.$code;

        return (new CatalogLoader)->load($payload, makeDefault: $makeDefault)->version;
    }
}
