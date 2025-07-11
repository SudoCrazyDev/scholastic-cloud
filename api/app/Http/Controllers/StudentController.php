<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\StudentInstitution;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StudentController extends Controller
{
    /**
     * Display a listing of the students with pagination and search.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = $request->get('per_page', 15);
        $query = Student::query();

        // Get the authenticated user's default institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have a default institution'
            ], 400);
        }

        // Filter students by the user's default institution
        $query->whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        });

        if ($request->filled('first_name')) {
            $query->where('first_name', 'like', '%' . $request->first_name . '%');
        }
        if ($request->filled('middle_name')) {
            $query->where('middle_name', 'like', '%' . $request->middle_name . '%');
        }
        if ($request->filled('last_name')) {
            $query->where('last_name', 'like', '%' . $request->last_name . '%');
        }
        if ($request->filled('lrn')) {
            $query->where('lrn', 'like', '%' . $request->lrn . '%');
        }

        $students = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $students->items(),
            'pagination' => [
                'current_page' => $students->currentPage(),
                'last_page' => $students->lastPage(),
                'per_page' => $students->perPage(),
                'total' => $students->total(),
                'from' => $students->firstItem(),
                'to' => $students->lastItem(),
            ]
        ]);
    }

    /**
     * Store a newly created student in storage.
     */
    public function store(Request $request): JsonResponse
    {
        // Get the authenticated user
        $user = $request->user();
        
        // Get the user's default institution
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have a default institution'
            ], 400);
        }

        $validated = $request->validate([
            'lrn' => 'nullable|string|unique:students,lrn',
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'ext_name' => 'nullable|string|max:255',
            'gender' => 'required|string',
            'religion' => 'nullable|string|in:Islam,Catholic,Iglesia Ni Cristo,Baptists,Others',
            'birthdate' => 'required|date',
            'profile_picture' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        DB::beginTransaction();
        try {
            $student = Student::create($validated);

            // Create only one institution relationship with the user's default institution
            StudentInstitution::create([
                'student_id' => $student->id,
                'institution_id' => $defaultInstitutionId,
                'is_active' => true,
                'academic_year' => null,
            ]);

            DB::commit();
            return response()->json(['success' => true, 'data' => $student->load('studentInstitutions')], 201);
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Display the specified student.
     */
    public function show(Request $request, $id): JsonResponse
    {
        // Get the authenticated user's default institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have a default institution'
            ], 400);
        }

        $student = Student::with('studentInstitutions')
            ->whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
                $q->where('institution_id', $defaultInstitutionId);
            })
            ->find($id);
            
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Student not found'], 404);
        }
        return response()->json(['success' => true, 'data' => $student]);
    }

    /**
     * Update the specified student in storage.
     */
    public function update(Request $request, $id): JsonResponse
    {
        // Get the authenticated user's default institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have a default institution'
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->find($id);
        
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Student not found'], 404);
        }
        
        $validated = $request->validate([
            'lrn' => 'nullable|string|unique:students,lrn,' . $id,
            'first_name' => 'sometimes|required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'ext_name' => 'nullable|string|max:255',
            'gender' => 'sometimes|required|string',
            'religion' => 'nullable|string|in:Islam,Catholic,Iglesia Ni Cristo,Baptists,Others',
            'birthdate' => 'sometimes|required|date',
            'profile_picture' => 'nullable|string',
            'is_active' => 'boolean',
        ]);
        $student->update($validated);
        return response()->json(['success' => true, 'data' => $student->fresh('studentInstitutions')]);
    }

    /**
     * Remove the specified student from storage.
     */
    public function destroy(Request $request, $id): JsonResponse
    {
        // Get the authenticated user's default institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have a default institution'
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->find($id);
        
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Student not found'], 404);
        }
        $student->delete();
        return response()->json(['success' => true, 'message' => 'Student deleted successfully']);
    }

    /**
     * Check if a student with the given names exists.
     */
    public function exists(Request $request): JsonResponse
    {
        // Get the authenticated user's default institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have a default institution'
            ], 400);
        }

        $validated = $request->validate([
            'first_name' => 'required|string',
            'middle_name' => 'nullable|string',
            'last_name' => 'nullable|string',
        ]);
        
        $query = Student::whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->where('first_name', $validated['first_name']);
        
        if ($validated['middle_name']) {
            $query->where('middle_name', $validated['middle_name']);
        }
        if ($validated['last_name']) {
            $query->where('last_name', $validated['last_name']);
        }
        $exists = $query->exists();
        return response()->json(['exists' => $exists]);
    }
} 