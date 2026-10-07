<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\ReportCardTemplate;
use App\Models\ReportCardTemplateGradeLevel;
use App\Support\GradingPeriods;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * A school's report card designs and the grade levels they are assigned to.
 *
 * Managing templates is a Settings concern (`settings.view` / `settings.manage`
 * on the routes). Resolving which template a grade level prints is not: every
 * adviser who opens a report card needs the answer, so `forGradeLevel` is
 * staff-only but otherwise ungated, like the grading period structure.
 *
 * Everything is scoped to the caller's active institution here, per controller,
 * because nothing else will do it.
 */
class ReportCardTemplateController extends Controller
{
    use AuthorizesModuleAccess;

    /** Settings keys a template may carry, and how long a text value may be. */
    private const MAX_SETTINGS_KEYS = 60;

    private const MAX_SETTING_LENGTH = 5000;

    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->activeInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $templates = ReportCardTemplate::where('institution_id', $institutionId)
            ->with('gradeLevels')
            ->orderBy('name')
            ->get()
            ->map(fn (ReportCardTemplate $template) => $this->payload($template));

        return response()->json([
            'success' => true,
            'data' => $templates,
            'layouts' => collect(ReportCardTemplate::LAYOUTS)
                ->map(fn (string $label, string $value) => ['value' => $value, 'label' => $label])
                ->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->activeInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $this->validateTemplate($request, true);

        $template = DB::transaction(function () use ($institutionId, $validated) {
            $template = ReportCardTemplate::create([
                'institution_id' => $institutionId,
                'name' => $validated['name'],
                'layout' => $validated['layout'],
                'settings' => $this->cleanSettings($validated['settings'] ?? []),
            ]);

            $this->assignGradeLevels($template, $validated['grade_levels'] ?? []);

            return $template;
        });

        return response()->json([
            'success' => true,
            'message' => 'Report card template created.',
            'data' => $this->payload($template->load('gradeLevels')),
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->activeInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $template = ReportCardTemplate::where('institution_id', $institutionId)->find($id);
        if (! $template) {
            return response()->json(['success' => false, 'message' => 'Report card template not found.'], 404);
        }

        $validated = $this->validateTemplate($request, false);

        DB::transaction(function () use ($template, $validated) {
            $changes = array_intersect_key($validated, array_flip(['name', 'layout']));
            if (array_key_exists('settings', $validated)) {
                $changes['settings'] = $this->cleanSettings($validated['settings'] ?? []);
            }
            $template->update($changes);

            if (array_key_exists('grade_levels', $validated)) {
                $this->assignGradeLevels($template, $validated['grade_levels'] ?? []);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Report card template saved.',
            'data' => $this->payload($template->fresh('gradeLevels')),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->activeInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $template = ReportCardTemplate::where('institution_id', $institutionId)->find($id);
        if (! $template) {
            return response()->json(['success' => false, 'message' => 'Report card template not found.'], 404);
        }

        // The grade level rows cascade, so its grade levels go back to the
        // standard card.
        $template->delete();

        return response()->json([
            'success' => true,
            'message' => 'Report card template deleted.',
        ]);
    }

    /**
     * The template a grade level prints, or null for the standard card.
     */
    public function forGradeLevel(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $institutionId = $this->activeInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $gradeLevel = GradingPeriods::canonicalGradeLevel($request->query('grade_level'));
        if ($gradeLevel === null) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $assignment = ReportCardTemplateGradeLevel::where('institution_id', $institutionId)
            ->whereRaw('LOWER(grade_level) = ?', [mb_strtolower($gradeLevel)])
            ->first();

        $template = $assignment
            ? ReportCardTemplate::where('institution_id', $institutionId)
                ->with('gradeLevels')
                ->find($assignment->report_card_template_id)
            : null;

        return response()->json([
            'success' => true,
            'data' => $template ? $this->payload($template) : null,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateTemplate(Request $request, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes|required';

        $validated = $request->validate([
            'name' => "{$required}|string|max:255",
            'layout' => [$creating ? 'required' : 'sometimes', 'string', Rule::in(array_keys(ReportCardTemplate::LAYOUTS))],
            'settings' => 'sometimes|nullable|array|max:'.self::MAX_SETTINGS_KEYS,
            'grade_levels' => 'sometimes|nullable|array',
            'grade_levels.*' => 'string|max:50',
        ]);

        foreach (($validated['settings'] ?? []) as $key => $value) {
            if (! is_string($key) || ! (is_null($value) || is_scalar($value))) {
                throw ValidationException::withMessages([
                    'settings' => 'Each report card setting must be a single text, number or yes/no value.',
                ]);
            }
            if (is_string($value) && mb_strlen($value) > self::MAX_SETTING_LENGTH) {
                throw ValidationException::withMessages([
                    "settings.{$key}" => 'This text is too long for a report card.',
                ]);
            }
        }

        return $validated;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    private function cleanSettings(array $settings): array
    {
        return array_filter($settings, fn ($value) => $value !== null);
    }

    /**
     * Make these grade levels this template's, and only these.
     *
     * A grade level already on another of the school's templates is moved here
     * rather than refused: the person assigning it is answering "which card does
     * Grade 11 print?", and there is only ever one answer.
     *
     * @param  array<int, string>  $gradeLevels
     */
    private function assignGradeLevels(ReportCardTemplate $template, array $gradeLevels): void
    {
        $canonical = collect($gradeLevels)
            ->map(fn ($gradeLevel) => GradingPeriods::canonicalGradeLevel((string) $gradeLevel))
            ->filter()
            ->unique(fn (string $gradeLevel) => mb_strtolower($gradeLevel))
            ->values();

        ReportCardTemplateGradeLevel::where('report_card_template_id', $template->id)->delete();

        if ($canonical->isEmpty()) {
            return;
        }

        $lowered = $canonical->map(fn (string $gradeLevel) => mb_strtolower($gradeLevel))->all();
        ReportCardTemplateGradeLevel::where('institution_id', $template->institution_id)
            ->whereIn(DB::raw('LOWER(grade_level)'), $lowered)
            ->delete();

        foreach ($canonical as $gradeLevel) {
            ReportCardTemplateGradeLevel::create([
                'institution_id' => $template->institution_id,
                'report_card_template_id' => $template->id,
                'grade_level' => $gradeLevel,
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(ReportCardTemplate $template): array
    {
        return [
            'id' => $template->id,
            'name' => $template->name,
            'layout' => $template->layout,
            'settings' => (object) ($template->settings ?? []),
            'grade_levels' => $template->gradeLevels->pluck('grade_level')->sort()->values(),
            'created_at' => $template->created_at,
            'updated_at' => $template->updated_at,
        ];
    }

    private function noInstitution(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'User does not have any institution assigned.',
        ], 400);
    }
}
