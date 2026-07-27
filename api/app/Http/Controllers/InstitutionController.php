<?php

namespace App\Http\Controllers;

use App\Models\Institution;
use App\Models\InstitutionAcademicYear;
use App\Models\Subscription;
use App\Support\GradingPeriods;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class InstitutionController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): JsonResponse
    {
        $institutions = Institution::with(['subscription', 'defaultDepartment'])->get();
        
        return response()->json([
            'success' => true,
            'data' => $institutions
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validator = Validator::make($request->all(), Institution::getValidationRules());
            
            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors()
                ], 422);
            }

            $data = $validator->validated();

            // default_department_id must belong to this institution
            if (array_key_exists('default_department_id', $data)) {
                $data['default_department_id'] = ($data['default_department_id'] && $institution->departments()->where('id', $data['default_department_id'])->exists())
                    ? $data['default_department_id'] : null;
            }

            // Handle logo file upload to R2
            if ($request->hasFile('logo')) {
                $logo = $request->file('logo');
                $extension = $logo->getClientOriginalExtension() ?: 'png';
                $filename = Str::uuid() . '.' . $extension;
                $r2Path = 'institutions/logos/' . $filename;
                Storage::disk('r2')->put($r2Path, file_get_contents($logo->getRealPath()));
                $data['logo'] = $r2Path;
            }

            $institution = Institution::create($data);

            return response()->json([
                'success' => true,
                'message' => 'Institution created successfully',
                'data' => $institution->load(['subscription', 'defaultDepartment'])
            ], 201);

        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create institution',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id): JsonResponse
    {
        try {
            $institution = Institution::with(['subscription', 'defaultDepartment'])->findOrFail($id);
            
            return response()->json([
                'success' => true,
                'data' => $institution
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Institution not found'
            ], 404);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $institution = Institution::findOrFail($id);
            
            $validator = Validator::make($request->all(), Institution::getValidationRules());
            
            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors()
                ], 422);
            }

            $data = $validator->validated();

            // Handle logo file upload to R2
            if ($request->hasFile('logo')) {
                // Delete old logo from R2 if exists
                $oldLogoKey = $institution->getRawOriginal('logo');
                if ($oldLogoKey && str_starts_with($oldLogoKey, 'institutions/')) {
                    Storage::disk('r2')->delete($oldLogoKey);
                }
                // Legacy: remove old public-disk path if stored as URL
                if ($oldLogoKey && str_contains($oldLogoKey, '/storage/')) {
                    $legacyPath = str_replace('/storage/', '', $oldLogoKey);
                    Storage::disk('public')->delete($legacyPath);
                }

                $logo = $request->file('logo');
                $extension = $logo->getClientOriginalExtension() ?: 'png';
                $filename = Str::uuid() . '.' . $extension;
                $r2Path = 'institutions/logos/' . $filename;
                Storage::disk('r2')->put($r2Path, file_get_contents($logo->getRealPath()));
                $data['logo'] = $r2Path;
            }

            $institution->update($data);

            return response()->json([
                'success' => true,
                'message' => 'Institution updated successfully',
                'data' => $institution->load(['subscription', 'defaultDepartment'])
            ]);

        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update institution',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        try {
            $institution = Institution::findOrFail($id);
            
            // Delete logo from R2 if exists (key stored in logo)
            $logoKey = $institution->getRawOriginal('logo');
            if ($logoKey && str_starts_with($logoKey, 'institutions/')) {
                Storage::disk('r2')->delete($logoKey);
            }
            // Legacy: delete from public disk if stored as old URL
            if ($logoKey && str_contains($logoKey, '/storage/')) {
                $legacyPath = str_replace('/storage/', '', $logoKey);
                Storage::disk('public')->delete($legacyPath);
            }
            
            $institution->delete();

            return response()->json([
                'success' => true,
                'message' => 'Institution deleted successfully'
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete institution',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Serve institution logo image (for report cards, etc.).
     * Streams the file from R2 so the frontend can use it with auth.
     */
    public function showLogo(string $id): Response|JsonResponse
    {
        try {
            $institution = Institution::findOrFail($id);
            $logoKey = $institution->getRawOriginal('logo');
            if (! $logoKey || ! str_starts_with($logoKey, 'institutions/')) {
                return response()->json(['message' => 'Logo not found'], 404);
            }
            if (! Storage::disk('r2')->exists($logoKey)) {
                return response()->json(['message' => 'Logo file not found'], 404);
            }
            $contents = Storage::disk('r2')->get($logoKey);
            $mime = match (strtolower(pathinfo($logoKey, PATHINFO_EXTENSION))) {
                'jpg', 'jpeg' => 'image/jpeg',
                'gif' => 'image/gif',
                'webp' => 'image/webp',
                default => 'image/png',
            };
            return response($contents, 200, [
                'Content-Type' => $mime,
                'Cache-Control' => 'private, max-age=3600',
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json(['message' => 'Institution not found'], 404);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Failed to load logo'], 500);
        }
    }

    /**
     * Upload logo file only.
     */
    public function uploadLogo(Request $request, string $id): JsonResponse
    {
        try {
            $institution = Institution::findOrFail($id);
            
            $validator = Validator::make($request->all(), [
                'logo' => 'required|file|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
            ]);
            
            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors()
                ], 422);
            }

            // Delete old logo from R2 if exists
            $oldLogoKey = $institution->getRawOriginal('logo');
            if ($oldLogoKey && str_starts_with($oldLogoKey, 'institutions/')) {
                Storage::disk('r2')->delete($oldLogoKey);
            }
            if ($oldLogoKey && str_contains($oldLogoKey, '/storage/')) {
                $legacyPath = str_replace('/storage/', '', $oldLogoKey);
                Storage::disk('public')->delete($legacyPath);
            }

            $logo = $request->file('logo');
            $extension = $logo->getClientOriginalExtension() ?: 'png';
            $filename = Str::uuid() . '.' . $extension;
            $r2Path = 'institutions/logos/' . $filename;
            Storage::disk('r2')->put($r2Path, file_get_contents($logo->getRealPath()));
            $institution->update(['logo' => $r2Path]);

            $institution->refresh();

            return response()->json([
                'success' => true,
                'message' => 'Logo uploaded successfully',
                'data' => [
                    'logo' => $institution->logo
                ]
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to upload logo',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * List all academic years for an institution.
     */
    public function getAcademicYears(string $id): JsonResponse
    {
        $institution = Institution::findOrFail($id);
        $years = $institution->academicYears()->get()->map(function (InstitutionAcademicYear $year) {
            $year->grading_periods = GradingPeriods::config($year->grading_period_type);

            return $year;
        });

        return response()->json([
            'success' => true,
            'data' => $years,
        ]);
    }

    /**
     * Resolved grading period structure for the signed-in user's institution.
     * Optionally scoped to a specific academic year via ?academic_year=.
     */
    public function gradingPeriods(Request $request): JsonResponse
    {
        $academicYear = $request->query('academic_year');
        $institutionId = $request->query('institution_id')
            ?: GradingPeriods::institutionIdForUser($request->user());

        $type = GradingPeriods::forInstitution($institutionId, $academicYear ?: null);

        return response()->json([
            'success' => true,
            'data' => GradingPeriods::config($type),
        ]);
    }

    /**
     * Set whether an academic year is divided into 4 quarters or 3 terms.
     *
     * The structure is per academic year on purpose: institutions adopt DepEd's
     * 3-term structure on a school-year boundary, and past years must keep
     * reporting on the structure their grades were entered under.
     */
    public function updateAcademicYearGradingPeriods(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $role = $user->getRole();

        if (! $role || ! in_array($role->slug, ['principal', 'institution-administrator'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'year' => ['required', 'string', 'regex:/^\d{4}-\d{4}$/'],
            'grading_period_type' => ['required', 'string', Rule::in(GradingPeriods::TYPES)],
        ]);

        $institution = Institution::findOrFail($id);

        $academicYear = InstitutionAcademicYear::where('institution_id', $institution->id)
            ->where('year', $validated['year'])
            ->first();

        if (! $academicYear) {
            return response()->json([
                'success' => false,
                'message' => 'Academic year not found for this institution.',
            ], 404);
        }

        $academicYear->update(['grading_period_type' => $validated['grading_period_type']]);
        GradingPeriods::flushCache();

        $academicYear->grading_periods = GradingPeriods::config($academicYear->grading_period_type);

        return response()->json([
            'success' => true,
            'message' => 'Grading period structure updated successfully',
            'data' => $academicYear,
        ]);
    }

    /**
     * Update the current academic year for an institution.
     * Also records the year in institution_academic_years if not already present.
     * Restricted to principal and institution-administrator roles.
     */
    public function updateAcademicYear(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $role = $user->getRole();

        if (!$role || !in_array($role->slug, ['principal', 'institution-administrator'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'current_academic_year' => ['required', 'string', 'regex:/^\d{4}-\d{4}$/'],
            'grading_period_type' => ['nullable', 'string', Rule::in(GradingPeriods::TYPES)],
        ]);

        $institution = Institution::findOrFail($id);
        $year = $validated['current_academic_year'];

        // Mark all other years as not current
        InstitutionAcademicYear::where('institution_id', $institution->id)
            ->where('year', '!=', $year)
            ->update(['is_current' => false]);

        // Upsert the selected year as current. Only overwrite the grading period
        // structure when one was explicitly supplied, so re-selecting an existing
        // year never silently re-labels the grades already entered under it.
        $attributes = ['is_current' => true];
        if (! empty($validated['grading_period_type'])) {
            $attributes['grading_period_type'] = $validated['grading_period_type'];
        }

        InstitutionAcademicYear::updateOrCreate(
            ['institution_id' => $institution->id, 'year' => $year],
            $attributes
        );

        $institution->update(['current_academic_year' => $year]);
        GradingPeriods::flushCache();

        return response()->json([
            'success' => true,
            'message' => 'Academic year updated successfully',
            'data' => $institution,
        ]);
    }

    /**
     * Get available subscriptions for institutions.
     */
    public function getSubscriptions(): JsonResponse
    {
        $subscriptions = Subscription::all();
        
        return response()->json([
            'success' => true,
            'data' => $subscriptions
        ]);
    }
}
