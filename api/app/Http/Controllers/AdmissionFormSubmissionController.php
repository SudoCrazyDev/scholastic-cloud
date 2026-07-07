<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\AdmissionFormSubmission;
use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\User;
use App\Support\AdmissionPayloadMapper;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdmissionFormSubmissionController extends Controller
{
    /** Roles allowed to list/view admission submissions (staff UI). */
    private const ADMISSION_SUBMISSION_ROLES = ['principal', 'institution-administrator'];

    private function canAccessAdmissionSubmissions(Request $request): bool
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return false;
        }
        $slug = $user->getRole()?->slug;

        return $slug !== null && in_array($slug, self::ADMISSION_SUBMISSION_ROLES, true);
    }

    private function resolveUserInstitutionId(User $user): ?string
    {
        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $institutionId = $user->userInstitutions()->first()?->institution_id;
        }

        return $institutionId;
    }

    /**
     * Public: verify institution exists (minimal data for admission form header, including logo URL).
     */
    public function publicInstitution(string $id): JsonResponse
    {
        $institution = Institution::query()->select(['id', 'title', 'abbr', 'address', 'logo', 'admission_form_open'])->find($id);

        if (! $institution) {
            return response()->json([
                'success' => false,
                'message' => 'Institution not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $institution->id,
                'title' => $institution->title,
                'abbr' => $institution->abbr,
                'address' => $institution->address,
                'logo_url' => $institution->logo,
                'admission_form_open' => (bool) $institution->admission_form_open,
            ],
        ]);
    }

    /**
     * Authenticated: get admission form settings for the user's institution.
     */
    public function settings(Request $request): JsonResponse
    {
        if (! $this->canAccessAdmissionSubmissions($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        /** @var User $user */
        $user = $request->user();
        $institutionId = $this->resolveUserInstitutionId($user);

        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned.',
            ], 400);
        }

        $institution = Institution::query()->select(['id', 'admission_form_open'])->find($institutionId);
        if (! $institution) {
            return response()->json(['success' => false, 'message' => 'Institution not found.'], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'admission_form_open' => (bool) $institution->admission_form_open,
            ],
        ]);
    }

    /**
     * Authenticated: open or close the public admission form for the user's institution.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        if (! $this->canAccessAdmissionSubmissions($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        /** @var User $user */
        $user = $request->user();
        $institutionId = $this->resolveUserInstitutionId($user);

        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned.',
            ], 400);
        }

        $validated = $request->validate([
            'admission_form_open' => 'required|boolean',
        ]);

        $institution = Institution::find($institutionId);
        if (! $institution) {
            return response()->json(['success' => false, 'message' => 'Institution not found.'], 404);
        }

        $institution->update(['admission_form_open' => $validated['admission_form_open']]);

        return response()->json([
            'success' => true,
            'message' => $validated['admission_form_open']
                ? 'Admission form is now open.'
                : 'Admission form is now closed.',
            'data' => [
                'admission_form_open' => (bool) $institution->admission_form_open,
            ],
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

        // Reject submissions when the institution has closed its admission form.
        $institution = Institution::query()->select(['id', 'admission_form_open'])->find($validated['institution_id']);
        if (! $institution || ! $institution->admission_form_open) {
            return response()->json([
                'success' => false,
                'message' => 'This admission form is currently closed and is no longer accepting submissions.',
            ], 403);
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
     * Authenticated: list submissions for the user’s institution (principal & institution-administrator only).
     */
    public function index(Request $request): JsonResponse
    {
        if ($request->user() instanceof StudentPortalUser) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        if (! $this->canAccessAdmissionSubmissions($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        /** @var User $user */
        $user = $request->user();
        $perPage = min((int) $request->get('per_page', 15), 100);

        $query = AdmissionFormSubmission::query()->with('institution:id,title,abbr');

        $institutionId = $this->resolveUserInstitutionId($user);

        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned.',
            ], 400);
        }

        $query->where('institution_id', $institutionId);

        $status = $request->get('status', 'pending');
        if (in_array($status, ['pending', 'accepted', 'rejected'])) {
            $query->where('status', $status);
        }

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

        $items = $submissions->items();
        $augmented = $this->augmentWithStudentMatches($items, $institutionId);

        return response()->json([
            'success' => true,
            'data' => $augmented,
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
     * Authenticated: single submission (principal & institution-administrator; scoped to institution).
     */
    public function show(Request $request, string $id): JsonResponse
    {
        if ($request->user() instanceof StudentPortalUser) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        if (! $this->canAccessAdmissionSubmissions($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        /** @var User $user */
        $user = $request->user();

        $submission = AdmissionFormSubmission::query()->with('institution:id,title,abbr,address')->find($id);

        if (!$submission) {
            return response()->json([
                'success' => false,
                'message' => 'Submission not found.',
            ], 404);
        }

        $institutionId = $this->resolveUserInstitutionId($user);
        if (! $institutionId || $submission->institution_id !== $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => $submission,
        ]);
    }

    /**
     * Authenticated: accept a submission — create/link student and assign to a section.
     */
    public function accept(Request $request, string $id): JsonResponse
    {
        if (! $this->canAccessAdmissionSubmissions($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        /** @var User $user */
        $user = $request->user();
        $institutionId = $this->resolveUserInstitutionId($user);

        $submission = AdmissionFormSubmission::query()->find($id);
        if (! $submission || $submission->institution_id !== $institutionId) {
            return response()->json(['success' => false, 'message' => 'Submission not found.'], 404);
        }
        if ($submission->status === 'accepted') {
            return response()->json(['success' => false, 'message' => 'This submission has already been accepted.'], 422);
        }

        $validated = $request->validate([
            'section_id'  => 'required|uuid|exists:class_sections,id',
            // New-student fields (required only when student_id is absent)
            'student_id'  => 'nullable|uuid',   // existing student — skip creation
            'first_name'  => 'required_without:student_id|string|max:255',
            'last_name'   => 'required_without:student_id|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'lrn'         => 'nullable|string|max:50',
            'gender'      => 'nullable|string|max:50',
            'birthdate'   => 'nullable|string|max:50',
            'religion'    => 'nullable|string|in:Catholic,Islam,Iglesia Ni Cristo,Baptists,Others',
        ]);

        $section = ClassSection::where('institution_id', $institutionId)->find($validated['section_id']);
        if (! $section) {
            return response()->json(['success' => false, 'message' => 'Section not found or does not belong to this institution.'], 422);
        }

        $institution = Institution::find($institutionId);
        $academicYear = $institution?->current_academic_year ?? $section->academic_year ?? date('Y') . '-' . (date('Y') + 1);

        DB::beginTransaction();
        try {
            if (! empty($validated['student_id'])) {
                // Existing student — just enroll in the new section
                $student = Student::find($validated['student_id']);
                if (! $student) {
                    DB::rollBack();
                    return response()->json(['success' => false, 'message' => 'Student not found.'], 422);
                }
            } else {
                // New student — create from payload + modal overrides
                $gi = $submission->payload['general_information'] ?? [];
                $student = Student::create([
                    'first_name'  => $validated['first_name'],
                    'last_name'   => $validated['last_name'],
                    'middle_name' => $validated['middle_name'] ?? ($gi['middle_name'] ?? null),
                    'lrn'         => $validated['lrn'] ?? ($gi['lrn'] ?? null) ?: null,
                    'gender'      => $validated['gender'] ?? ($gi['gender'] ?? null),
                    'birthdate'   => $validated['birthdate'] ?? ($gi['birthdate'] ?? null),
                    'religion'    => $validated['religion'] ?? null,
                    'is_active'   => true,
                ]);

                // Link student to institution (skip if already linked)
                StudentInstitution::firstOrCreate(
                    ['student_id' => $student->id, 'institution_id' => $institutionId],
                    ['is_active' => true, 'academic_year' => $academicYear]
                );
            }

            // Enroll in section (skip if already in this section for this academic year)
            StudentSection::firstOrCreate(
                ['student_id' => $student->id, 'section_id' => $section->id, 'academic_year' => $academicYear],
                ['is_active' => true, 'is_promoted' => false]
            );

            // Fan the application payload out into the student's normalized,
            // queryable records (profile, guardians, emergency contacts, health).
            AdmissionPayloadMapper::syncToStudent($student, $submission->payload ?? []);

            $submission->update([
                'status'     => 'accepted',
                'student_id' => $student->id,
            ]);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Failed to accept submission: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Submission accepted. Student enrolled in section.',
            'data'    => ['student_id' => $student->id],
        ]);
    }

    /**
     * Authenticated: force-create a brand-new student from an already-accepted
     * submission and re-link the submission to it. Recovery path for forms that
     * were accepted but re-enrolled an existing student instead of creating one.
     */
    public function createStudent(Request $request, string $id): JsonResponse
    {
        if (! $this->canAccessAdmissionSubmissions($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        /** @var User $user */
        $user = $request->user();
        $institutionId = $this->resolveUserInstitutionId($user);

        $submission = AdmissionFormSubmission::query()->find($id);
        if (! $submission || $submission->institution_id !== $institutionId) {
            return response()->json(['success' => false, 'message' => 'Submission not found.'], 404);
        }
        if ($submission->status !== 'accepted') {
            return response()->json(['success' => false, 'message' => 'Only accepted submissions can have a student created this way.'], 422);
        }

        $validated = $request->validate([
            'section_id'  => 'required|uuid|exists:class_sections,id',
            'first_name'  => 'required|string|max:255',
            'last_name'   => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'lrn'         => 'nullable|string|max:50',
            'gender'      => 'nullable|string|max:50',
            'birthdate'   => 'nullable|string|max:50',
            'religion'    => 'nullable|string|in:Catholic,Islam,Iglesia Ni Cristo,Baptists,Others',
        ]);

        $section = ClassSection::where('institution_id', $institutionId)->find($validated['section_id']);
        if (! $section) {
            return response()->json(['success' => false, 'message' => 'Section not found or does not belong to this institution.'], 422);
        }

        $institution = Institution::find($institutionId);
        $academicYear = $institution?->current_academic_year ?? $section->academic_year ?? date('Y') . '-' . (date('Y') + 1);

        DB::beginTransaction();
        try {
            $gi = $submission->payload['general_information'] ?? [];
            $student = Student::create([
                'first_name'  => $validated['first_name'],
                'last_name'   => $validated['last_name'],
                'middle_name' => $validated['middle_name'] ?? ($gi['middle_name'] ?? null),
                'lrn'         => $validated['lrn'] ?? ($gi['lrn'] ?? null) ?: null,
                'gender'      => $validated['gender'] ?? ($gi['gender'] ?? null),
                'birthdate'   => $validated['birthdate'] ?? ($gi['birthdate'] ?? null),
                'religion'    => $validated['religion'] ?? null,
                'is_active'   => true,
            ]);

            StudentInstitution::firstOrCreate(
                ['student_id' => $student->id, 'institution_id' => $institutionId],
                ['is_active' => true, 'academic_year' => $academicYear]
            );

            StudentSection::firstOrCreate(
                ['student_id' => $student->id, 'section_id' => $section->id, 'academic_year' => $academicYear],
                ['is_active' => true, 'is_promoted' => false]
            );

            AdmissionPayloadMapper::syncToStudent($student, $submission->payload ?? []);

            // Re-link the submission to the newly created student.
            $submission->update(['student_id' => $student->id]);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Failed to create student: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Student record created and enrolled in section.',
            'data'    => ['student_id' => $student->id],
        ]);
    }

    /**
     * Authenticated: reject a submission.
     */
    public function reject(Request $request, string $id): JsonResponse
    {
        if (! $this->canAccessAdmissionSubmissions($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        /** @var User $user */
        $user = $request->user();
        $institutionId = $this->resolveUserInstitutionId($user);

        $submission = AdmissionFormSubmission::query()->find($id);
        if (! $submission || $submission->institution_id !== $institutionId) {
            return response()->json(['success' => false, 'message' => 'Submission not found.'], 404);
        }
        if ($submission->status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'Only pending submissions can be rejected.'], 422);
        }

        $submission->update(['status' => 'rejected']);

        return response()->json(['success' => true, 'message' => 'Submission rejected.']);
    }

    /**
     * For each submission item, look up a matching student (by LRN or first+last name)
     * scoped to the institution, and attach student_match with their latest section.
     */
    private function augmentWithStudentMatches(array $items, string $institutionId): array
    {
        $lrns = [];
        $namePairs = [];

        foreach ($items as $item) {
            $gi = $item->payload['general_information'] ?? [];
            $lrn = trim($gi['lrn'] ?? '');
            $firstName = trim($gi['first_name'] ?? '');
            $lastName = trim($gi['surname'] ?? '');

            if ($lrn !== '') {
                $lrns[] = $lrn;
            }
            if ($firstName !== '' && $lastName !== '') {
                $namePairs[] = [$firstName, $lastName];
            }
        }

        $matchedStudents = collect();

        if (!empty($lrns) || !empty($namePairs)) {
            $matchedStudents = Student::query()
                ->whereHas('studentInstitutions', fn ($q) => $q->where('institution_id', $institutionId))
                ->where(function ($q) use ($lrns, $namePairs) {
                    if (!empty($lrns)) {
                        $q->whereIn('lrn', $lrns);
                    }
                    foreach ($namePairs as [$fn, $ln]) {
                        $q->orWhere(function ($inner) use ($fn, $ln) {
                            $inner->whereRaw('LOWER(first_name) = ?', [strtolower($fn)])
                                  ->whereRaw('LOWER(last_name) = ?', [strtolower($ln)]);
                        });
                    }
                })
                ->with(['studentSections' => function ($q) {
                    $q->with('classSection:id,title,grade_level,academic_year')
                      ->orderByDesc('academic_year')
                      ->orderByDesc('created_at');
                }])
                ->get();
        }

        $byLrn = $matchedStudents->filter(fn ($s) => $s->lrn !== null && $s->lrn !== '')
                                 ->keyBy('lrn');
        $byName = $matchedStudents->keyBy(
            fn ($s) => strtolower(trim($s->first_name)) . '|' . strtolower(trim($s->last_name))
        );

        return collect($items)->map(function ($item) use ($byLrn, $byName) {
            $gi = $item->payload['general_information'] ?? [];
            $lrn = trim($gi['lrn'] ?? '');
            $firstName = strtolower(trim($gi['first_name'] ?? ''));
            $lastName = strtolower(trim($gi['surname'] ?? ''));

            $student = null;
            if ($lrn !== '' && $byLrn->has($lrn)) {
                $student = $byLrn->get($lrn);
            } elseif ($firstName !== '' && $lastName !== '') {
                $student = $byName->get("$firstName|$lastName");
            }

            $latestSection = $student?->studentSections->first()?->classSection;

            $arr = $item->toArray();
            $arr['student_match'] = $student ? [
                'id' => $student->id,
                'section' => $latestSection ? [
                    'id' => $latestSection->id,
                    'title' => $latestSection->title,
                    'grade_level' => $latestSection->grade_level,
                    'academic_year' => $latestSection->academic_year,
                ] : null,
            ] : null;

            return $arr;
        })->all();
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
