<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\AdmissionFormSubmission;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdmissionFormSubmissionController extends Controller
{
    private function isSuperAdmin(Request $request): bool
    {
        $user = $request->user();
        if (!$user instanceof User) {
            return false;
        }
        $role = $user->getRole();

        return $role && $role->slug === 'super-administrator';
    }

    /**
     * Public: verify institution exists (minimal data for admission form header).
     */
    public function publicInstitution(string $id): JsonResponse
    {
        $institution = Institution::query()->select(['id', 'title', 'abbr', 'address'])->find($id);

        if (!$institution) {
            return response()->json([
                'success' => false,
                'message' => 'Institution not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $institution,
        ]);
    }

    /**
     * Public: submit online admission form (no auth).
     */
    public function publicStore(Request $request): JsonResponse
    {
        $request->replace($this->normalizeAdmissionRequestPayload($request->all()));

        try {
            $validated = $request->validate($this->submissionValidationRules());
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        }

        $submission = AdmissionFormSubmission::create([
            'institution_id' => $validated['institution_id'],
            'payload' => $this->payloadFromValidated($validated),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Admission form submitted successfully.',
            'data' => [
                'id' => $submission->id,
            ],
        ], 201);
    }

    /**
     * Authenticated: list submissions for the user’s institution (super-admin: all or filter).
     */
    public function index(Request $request): JsonResponse
    {
        if ($request->user() instanceof StudentPortalUser) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        $user = $request->user();
        $perPage = min((int) $request->get('per_page', 15), 100);

        $query = AdmissionFormSubmission::query()->with('institution:id,title,abbr');

        // Always scope to one institution (never list all schools). Super-admins may pass
        // institution_id to switch context; staff always use their assigned institution only.
        if ($this->isSuperAdmin($request)) {
            $institutionId = $request->get('institution_id');
            if (!$institutionId) {
                $institutionId = $user->getDefaultInstitutionId();
                if (!$institutionId) {
                    $institutionId = $user->userInstitutions()->first()?->institution_id;
                }
            }
        } else {
            $institutionId = $user->getDefaultInstitutionId();
            if (!$institutionId) {
                $institutionId = $user->userInstitutions()->first()?->institution_id;
            }
        }

        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned.',
            ], 400);
        }

        $query->where('institution_id', $institutionId);

        if ($request->filled('search')) {
            $term = '%' . $request->get('search') . '%';
            $query->where(function ($q) use ($term) {
                $q->where('payload->general_information->full_name', 'like', $term)
                    ->orWhere('payload->general_information->first_name', 'like', $term)
                    ->orWhere('payload->general_information->surname', 'like', $term)
                    ->orWhere('payload->general_information->lrn', 'like', $term);
            });
        }

        $submissions = $query->orderByDesc('created_at')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $submissions->items(),
            'pagination' => [
                'current_page' => $submissions->currentPage(),
                'last_page' => $submissions->lastPage(),
                'per_page' => $submissions->perPage(),
                'total' => $submissions->total(),
                'from' => $submissions->firstItem(),
                'to' => $submissions->lastItem(),
            ],
        ]);
    }

    /**
     * Authenticated: single submission (scoped to institution unless super-admin).
     */
    public function show(Request $request, string $id): JsonResponse
    {
        if ($request->user() instanceof StudentPortalUser) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        $submission = AdmissionFormSubmission::query()->with('institution:id,title,abbr,address')->find($id);

        if (!$submission) {
            return response()->json([
                'success' => false,
                'message' => 'Submission not found.',
            ], 404);
        }

        if (!$this->isSuperAdmin($request)) {
            $institutionId = $request->user()->getDefaultInstitutionId();
            if (!$institutionId) {
                $first = $request->user()->userInstitutions()->first();
                $institutionId = $first?->institution_id;
            }
            if (!$institutionId || $submission->institution_id !== $institutionId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Forbidden.',
                ], 403);
            }
        }

        return response()->json([
            'success' => true,
            'data' => $submission,
        ]);
    }

    private function submissionValidationRules(): array
    {
        return [
            'institution_id' => 'required|uuid|exists:institutions,id',
            'grade_level' => 'required|string|max:255',

            'general_information' => 'required|array',
            'general_information.surname' => 'required|string|max:255',
            'general_information.first_name' => 'required|string|max:255',
            'general_information.middle_name' => 'nullable|string|max:255',
            'general_information.full_name' => 'nullable|string|max:500',
            'general_information.complete_address' => 'required|string|max:1000',
            'general_information.mobile_number' => 'required|string|max:50',
            'general_information.birthdate' => 'required|string|max:50',
            'general_information.place_of_birth' => 'nullable|string|max:255',
            'general_information.religion' => 'nullable|string|max:255',
            'general_information.gender' => 'required|string|max:50',
            'general_information.age' => 'nullable|numeric|min:0|max:120',
            'general_information.mother_tongue' => 'nullable|string|max:255',
            'general_information.last_school_attended' => 'nullable|string|max:500',
            'general_information.school_year' => 'nullable|string|max:100',
            'general_information.school_address' => 'nullable|string|max:1000',
            'general_information.lrn' => 'nullable|string|max:50',

            'family_information' => 'required|array',
            'family_information.father' => 'required|array',
            'family_information.father.name' => 'nullable|string|max:255',
            'family_information.father.age' => 'nullable|numeric|min:0|max:120',
            'family_information.father.occupation' => 'nullable|string|max:255',
            'family_information.mother' => 'required|array',
            'family_information.mother.name' => 'nullable|string|max:255',
            'family_information.mother.age' => 'nullable|numeric|min:0|max:120',
            'family_information.mother.occupation' => 'nullable|string|max:255',
            'family_information.siblings' => 'required|array',
            'family_information.siblings.brothers' => 'sometimes|nullable|integer|min:0',
            'family_information.siblings.sisters' => 'sometimes|nullable|integer|min:0',

            'emergency_contact' => 'required|array',
            'emergency_contact.name' => 'required|string|max:255',
            'emergency_contact.address' => 'nullable|string|max:1000',
            'emergency_contact.relationship' => 'nullable|string|max:255',
            'emergency_contact.age' => 'nullable|numeric|min:0|max:120',
            'emergency_contact.contact_number' => 'required|string|max:50',

            'health_information' => 'required|array',
            'health_information.had_chicken_pox' => 'required|array',
            'health_information.had_chicken_pox.answer' => 'required|boolean',
            'health_information.had_chicken_pox.when' => 'nullable|string|max:255',
            'health_information.had_chicken_pox_vaccine' => 'required|array',
            'health_information.had_chicken_pox_vaccine.answer' => 'required|boolean',
            'health_information.had_chicken_pox_vaccine.when' => 'nullable|string|max:255',
            'health_information.hospitalization_past_year' => 'required|array',
            'health_information.hospitalization_past_year.answer' => 'required|boolean',
            'health_information.hospitalization_past_year.details' => 'nullable|string|max:2000',
            'health_information.chronic_condition' => 'required|array',
            'health_information.chronic_condition.answer' => 'required|boolean',
            'health_information.chronic_condition.details' => 'nullable|string|max:2000',
            'health_information.allergies' => 'required|array',
            'health_information.allergies.answer' => 'required|boolean',
            'health_information.allergies.details' => 'nullable|string|max:2000',
            'health_information.other_medical_problems' => 'required|array',
            'health_information.other_medical_problems.answer' => 'required|boolean',
            'health_information.other_medical_problems.details' => 'nullable|string|max:2000',

            'agreement' => 'required|array',
            'agreement.school_policies_accepted' => ['required', Rule::in([true, 1, '1', 'true'])],
            'agreement.privacy_read_policy' => ['required', Rule::in([true, 1, '1', 'true'])],
            'agreement.privacy_consent_given' => ['required', Rule::in([true, 1, '1', 'true'])],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalizeAdmissionRequestPayload(array $data): array
    {
        if (isset($data['family_information']['siblings']) && is_array($data['family_information']['siblings'])) {
            foreach (['brothers', 'sisters'] as $key) {
                if (! array_key_exists($key, $data['family_information']['siblings'])) {
                    continue;
                }
                $v = $data['family_information']['siblings'][$key];
                if ($v === '' || $v === null) {
                    $data['family_information']['siblings'][$key] = null;
                }
            }
        }

        return $data;
    }

    private function payloadFromValidated(array $validated): array
    {
        return [
            'grade_level' => $validated['grade_level'],
            'general_information' => $validated['general_information'],
            'family_information' => $validated['family_information'],
            'emergency_contact' => $validated['emergency_contact'],
            'health_information' => $validated['health_information'],
            'agreement' => $validated['agreement'],
        ];
    }
}
