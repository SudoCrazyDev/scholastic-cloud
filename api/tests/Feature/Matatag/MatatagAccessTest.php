<?php

namespace Tests\Feature\Matatag;

use App\Models\MatatagCompetencyRating;
use App\Models\MatatagSectionCurriculum;
use App\Models\Role;
use App\Support\Features;

/**
 * Who can reach what.
 *
 * Scoping in this repo is per-controller by design — there is no global scope
 * doing it for you — so every one of these is a bug that would exist if one
 * `where()` were missing. `SF9Controller::denyUnlessOwnStudent()` exists
 * because exactly this class of bug let any holder of `consolidated-grades.view`
 * print any student's report card from any school.
 *
 * The two gates compose, and the order matters: the **feature** closes a route
 * for a school that has not been switched on, whatever its roles say and
 * including for a super-administrator; the **module** is then the school's own
 * decision about which of its staff may work here.
 */
class MatatagAccessTest extends MatatagTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->optIn($this->sectionA1);
        $this->optIn($this->sectionB1);
    }

    /** Every route in the module, as [method, url, body]. */
    private function everyRoute(): array
    {
        $section = $this->sectionA1->id;
        $slot = $this->slotsFor('gmrc', 1)[0]->id;
        $student = $this->learnersA1[0]->id;

        return [
            'reference' => ['getJson', '/api/matatag/reference', []],
            'curriculum' => ['getJson', '/api/matatag/curriculum?code='.self::CATALOG_CODE, []],
            'sections' => ['getJson', '/api/matatag/sections', []],
            'grid' => ['getJson', "/api/matatag/grid?class_section_id={$section}&term=1", []],
            'attendance' => ['getJson', "/api/matatag/attendance?class_section_id={$section}", []],
            'narratives' => ['getJson', "/api/matatag/narratives?class_section_id={$section}", []],
            'progress report' => ['getJson', "/api/matatag/progress-report?class_section_id={$section}", []],
            'one card' => ['getJson', "/api/matatag/progress-report/{$student}?class_section_id={$section}", []],
            'workbook' => ['getJson', "/api/matatag/workbook?class_section_id={$section}", []],
            'opt-in' => ['postJson', "/api/matatag/sections/{$section}/opt-in", []],
            'opt-out' => ['deleteJson', "/api/matatag/sections/{$section}/opt-in", []],
            'grid write' => ['postJson', '/api/matatag/grid/bulk-upsert', [
                'class_section_id' => $section,
                'term' => 1,
                'ratings' => [['student_id' => $student, 'slot_id' => $slot, 'descriptor' => 'A']],
            ]],
            'narrative write' => ['postJson', '/api/matatag/narratives/bulk-upsert', [
                'class_section_id' => $section,
                'narratives' => [['student_id' => $student, 'term' => 1, 'can_do' => 'Reads well.']],
            ]],
        ];
    }

    /** The write routes only. */
    private function writeRoutes(): array
    {
        return array_intersect_key(
            $this->everyRoute(),
            array_flip(['opt-in', 'opt-out', 'grid write', 'narrative write']),
        );
    }

    // -----------------------------------------------------------------
    // The feature gate
    // -----------------------------------------------------------------

    /**
     * A school that has not been switched on sees nothing here — and
     * `EnsureFeatureEnabled` deliberately does not honour the
     * super-administrator wildcard, so not even the platform's own account
     * reaches it through the API.
     */
    public function test_with_the_feature_off_every_route_is_closed_even_to_a_super_administrator(): void
    {
        $this->enableFeature($this->schoolA, false);

        $superAdmin = $this->makeUser($this->schoolA, 'super-administrator', 'super@matatag.test', 'tok-super');
        $this->assertTrue($superAdmin->fresh()->hasFullAccess(), 'the fixture must hold the wildcard');

        foreach ($this->everyRoute() as $name => [$method, $url, $body]) {
            foreach ([$this->principalA, $this->adviserA1, $superAdmin] as $user) {
                $response = $this->as($user)->{$method}($url, $body);

                $this->assertContains(
                    $response->status(),
                    [403, 404],
                    "{$name} must be closed while the feature is off for this school",
                );
            }
        }

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    public function test_switching_the_feature_on_opens_it_again(): void
    {
        $this->enableFeature($this->schoolA, false);
        $this->as($this->adviserA1)
            ->getJson("/api/matatag/grid?class_section_id={$this->sectionA1->id}&term=1")
            ->assertForbidden();

        $this->enableFeature($this->schoolA, true);
        $this->as($this->adviserA1)
            ->getJson("/api/matatag/grid?class_section_id={$this->sectionA1->id}&term=1")
            ->assertOk();
    }

    // -----------------------------------------------------------------
    // Cross-tenant
    // -----------------------------------------------------------------

    /**
     * School B's principal holds every MATATAG permission — in School B.
     * None of it reaches School A.
     */
    public function test_another_schools_principal_cannot_reach_this_schools_sections(): void
    {
        foreach ($this->everyRoute() as $name => [$method, $url, $body]) {
            if (in_array($name, ['reference', 'curriculum', 'sections'], true)) {
                continue;   // not section-scoped; covered separately below
            }

            $response = $this->as($this->principalB)->{$method}($url, $body);

            $this->assertSame(404, $response->status(), "{$name} must not be reachable across schools");
        }

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    /**
     * The section list is institution-scoped rather than 404ing, so this is
     * the one that would leak a roster of section names.
     */
    public function test_the_section_list_never_names_another_schools_sections(): void
    {
        $titles = array_column(
            $this->as($this->principalB)->getJson('/api/matatag/sections')->assertOk()->json('data.sections'),
            'title',
        );

        $this->assertSame(['Ilang-Ilang'], $titles);
        $this->assertNotContains('Sampaguita', $titles);
    }

    /**
     * `institution_id` in the body proves the row exists, not that the caller
     * has any business with it.
     */
    public function test_a_foreign_institution_id_in_the_body_is_refused_not_honoured(): void
    {
        $this->as($this->principalB)
            ->getJson('/api/matatag/sections?institution_id='.$this->schoolA->id)
            ->assertForbidden();
    }

    // -----------------------------------------------------------------
    // Within one school
    // -----------------------------------------------------------------

    /**
     * Any staff member with MATATAG Progress opens and marks every section in
     * their own school, not only the one they advise — the school wants
     * whoever is on hand to be able to fill a card in.
     */
    public function test_an_adviser_marks_the_section_next_door(): void
    {
        $this->optIn($this->sectionA2);

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/grid?class_section_id={$this->sectionA2->id}&term=1")
            ->assertOk()
            ->assertJsonPath('data.can_manage', true);

        $learner = $this->makeLearner($this->schoolA, $this->sectionA2, 'Dana', 'Esteban', 'female');

        $this->as($this->adviserA1)
            ->postJson('/api/matatag/grid/bulk-upsert', [
                'class_section_id' => $this->sectionA2->id,
                'term' => 1,
                'ratings' => [[
                    'student_id' => $learner->id,
                    'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
                    'descriptor' => 'A',
                ]],
            ])
            ->assertOk();

        $this->assertSame(1, MatatagCompetencyRating::count());
    }

    public function test_view_all_opens_the_other_sections(): void
    {
        $this->optIn($this->sectionA2);
        $this->grant($this->adviserA1, 'matatag-grading.view-all');

        $this->as($this->adviserA1)
            ->getJson("/api/matatag/grid?class_section_id={$this->sectionA2->id}&term=1")
            ->assertOk();
    }

    /**
     * View is enough to mark competencies and write remarks. Switching a
     * section on or off MATATAG still needs `set-up`.
     */
    public function test_a_view_only_role_marks_and_writes_remarks_but_cannot_opt_in(): void
    {
        $head = $this->makeUser($this->schoolA, 'curriculum-head', 'head@matatag.test', 'tok-head');

        $this->assertTrue(
            $head->hasModuleAccess('matatag-grading', 'view', $this->schoolA->id),
            'the fixture must actually be able to read, or this test proves nothing',
        );
        $this->assertFalse(
            $head->hasModuleAccess('matatag-grading', 'manage', $this->schoolA->id),
            'the fixture must lack manage, or this test proves nothing',
        );

        $this->optIn($this->sectionA1);
        $routes = $this->writeRoutes();

        foreach (['grid write', 'narrative write'] as $name) {
            [$method, $url, $body] = $routes[$name];
            $this->as($head)->{$method}($url, $body)->assertOk();
        }

        $this->assertSame(1, MatatagCompetencyRating::count());

        $this->assertFalse($head->hasModuleAccess('matatag-grading', 'set-up', $this->schoolA->id));

        foreach (['opt-in', 'opt-out'] as $name) {
            [$method, $url, $body] = $routes[$name];
            $this->as($head)->{$method}($url, $body)->assertForbidden();
        }
    }

    /**
     * `set-up` decides how a whole year is reported and pins the catalog every
     * descriptor in it is recorded against. An adviser marking learners does
     * not need it, and should not have it by accident.
     */
    public function test_marking_is_allowed_without_set_up_and_opting_in_is_not(): void
    {
        $this->assertFalse(
            $this->adviserA1->hasModuleAccess('matatag-grading', 'set-up', $this->schoolA->id),
            'an adviser is not a person who decides how the year is reported',
        );

        $this->as($this->adviserA1)
            ->postJson('/api/matatag/grid/bulk-upsert', [
                'class_section_id' => $this->sectionA1->id,
                'term' => 1,
                'ratings' => [[
                    'student_id' => $this->learnersA1[0]->id,
                    'slot_id' => $this->slotsFor('gmrc', 1)[0]->id,
                    'descriptor' => 'A',
                ]],
            ])
            ->assertOk();

        $this->as($this->adviserA1)
            ->postJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertForbidden();
        $this->as($this->adviserA1)
            ->deleteJson("/api/matatag/sections/{$this->sectionA1->id}/opt-in")
            ->assertForbidden();

        $this->assertTrue(MatatagSectionCurriculum::first()->enabled, 'the pin is untouched');
    }

    // -----------------------------------------------------------------
    // Students
    // -----------------------------------------------------------------

    /**
     * `StudentPortalUser` holds no module permissions at all, and nothing in
     * this module is a student's own record to edit.
     */
    public function test_a_student_portal_token_is_refused_everywhere(): void
    {
        $this->makeStudentPortalToken($this->learnersA1[0], 'tok-portal');

        foreach ($this->everyRoute() as $name => [$method, $url, $body]) {
            $response = $this->withHeader('Authorization', 'Bearer tok-portal')->{$method}($url, $body);

            $this->assertContains(
                $response->status(),
                [401, 403, 404],
                "{$name} must be closed to a student portal token",
            );
        }

        $this->assertSame(0, MatatagCompetencyRating::count());
    }

    public function test_an_unauthenticated_request_is_refused_everywhere(): void
    {
        foreach ($this->everyRoute() as $name => [$method, $url, $body]) {
            $this->{$method}($url, $body)->assertUnauthorized();
        }
    }

    // -----------------------------------------------------------------
    // A role with no MATATAG grant at all
    // -----------------------------------------------------------------

    public function test_a_role_the_school_has_not_granted_the_module_is_refused(): void
    {
        Features::flush();

        $cashier = $this->makeUser($this->schoolA, 'cashier', 'cashier@matatag.test', 'tok-cashier');
        $this->revoke($cashier, 'matatag-grading.view');
        $this->revoke($cashier, 'matatag-grading.manage');

        foreach ($this->everyRoute() as $name => [$method, $url, $body]) {
            $this->as($cashier)->{$method}($url, $body)->assertForbidden();
        }
    }
}
