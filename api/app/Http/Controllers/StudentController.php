<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\StudentInstitution;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
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
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        // Filter students by the user's institution
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
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        // Build validation rules
        $rules = [
            'lrn' => 'nullable|string|unique:students,lrn',
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'ext_name' => 'nullable|string|max:255',
            'gender' => 'required|string',
            'religion' => 'nullable|string|in:Islam,Catholic,Iglesia Ni Cristo,Baptists,Others',
            'birthdate' => 'required|date',
            'is_active' => 'boolean',
        ];

        // Only validate profile_picture as file if it's actually being uploaded
        if ($request->hasFile('profile_picture')) {
            $rules['profile_picture'] = 'required|file|image|mimes:jpeg,png,jpg,gif,webp|max:5120';
        }

        $validated = $request->validate($rules);

        DB::beginTransaction();
        try {
            // Create student first (without profile picture)
            $studentData = $validated;
            unset($studentData['profile_picture']);
            $student = Student::create($studentData);

            // Handle profile picture upload to R2
            if ($request->hasFile('profile_picture')) {
                try {
                    $file = $request->file('profile_picture');
                    $extension = $file->getClientOriginalExtension() ?: 'jpg';
                    $fileName = Str::uuid() . '.' . $extension;
                    $r2Path = $defaultInstitutionId . '/student/' . $student->id . '/profile/' . $fileName;
                    Storage::disk('r2')->put($r2Path, file_get_contents($file->getRealPath()));
                    $student->update(['profile_picture' => $r2Path]);
                } catch (\Exception $e) {
                    // Continue without profile picture - student is already created
                }
            }

            // Create only one institution relationship with the user's institution
            StudentInstitution::create([
                'student_id' => $student->id,
                'institution_id' => $defaultInstitutionId,
                'is_active' => true,
                'academic_year' => null,
            ]);

            DB::commit();
            return response()->json(['success' => true, 'data' => $student->fresh()->load('studentInstitutions')], 201);
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
        // Get the authenticated user's institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();

        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
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
        // Get the authenticated user's institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->find($id);
        
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Student not found'], 404);
        }
        
        // Build validation rules
        $rules = [
            'lrn' => 'nullable|string|unique:students,lrn,' . $id,
            'first_name' => 'sometimes|required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'ext_name' => 'nullable|string|max:255',
            'gender' => 'sometimes|required|string',
            'religion' => 'nullable|string|in:Islam,Catholic,Iglesia Ni Cristo,Baptists,Others',
            'birthdate' => 'sometimes|required|date',
            'is_active' => 'boolean',
        ];

        // Only validate profile_picture as file if it's actually being uploaded
        // Check both hasFile() and direct file() access for compatibility with PUT requests
        $profilePictureFileForValidation = $request->file('profile_picture');
        if ($request->hasFile('profile_picture') || ($profilePictureFileForValidation instanceof \Illuminate\Http\UploadedFile)) {
            $rules['profile_picture'] = 'required|file|image|mimes:jpeg,png,jpg,gif,webp|max:5120';
        }

        $validated = $request->validate($rules);

        // Prepare update data (exclude file from validated data)
        $updateData = $validated;
        unset($updateData['profile_picture']);

        // Handle profile picture upload to R2
        $profilePictureFile = $request->file('profile_picture');
        $hasProfilePictureFile = $request->hasFile('profile_picture') || ($profilePictureFile instanceof \Illuminate\Http\UploadedFile);
        
        if ($hasProfilePictureFile && $profilePictureFile) {
            $oldPath = $student->getRawOriginal('profile_picture');
            if ($oldPath && !str_starts_with($oldPath, 'http')) {
                try {
                    if (Storage::disk('r2')->exists($oldPath)) {
                        Storage::disk('r2')->delete($oldPath);
                    } elseif (Storage::disk('s3')->exists($oldPath)) {
                        Storage::disk('s3')->delete($oldPath);
                    }
                } catch (\Exception $e) {
                    // Silently fail if deletion fails
                }
            }

            try {
                $file = $profilePictureFile;
                $extension = $file->getClientOriginalExtension() ?: 'jpg';
                $fileName = Str::uuid() . '.' . $extension;
                $r2Path = $defaultInstitutionId . '/student/' . $student->id . '/profile/' . $fileName;
                Storage::disk('r2')->put($r2Path, file_get_contents($file->getRealPath()));
                $updateData['profile_picture'] = $r2Path;
            } catch (\Exception $e) {
                // Don't update profile picture if upload fails
            }
        }
        
        $student->update($updateData);
        return response()->json(['success' => true, 'data' => $student->fresh('studentInstitutions')]);
    }

    /**
     * Update student with file upload support (POST method)
     * This method is specifically for updating student data when file uploads are involved,
     * as PUT/PATCH requests don't handle multipart/form-data correctly in Laravel.
     */
    public function updateWithFile(Request $request, $id): JsonResponse
    {
        // Get the authenticated user's institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->find($id);
        
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Student not found'], 404);
        }
        
        // Build validation rules
        $rules = [
            'lrn' => 'nullable|string|unique:students,lrn,' . $id,
            'first_name' => 'sometimes|required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'ext_name' => 'nullable|string|max:255',
            'gender' => 'sometimes|required|string',
            'religion' => 'nullable|string|in:Islam,Catholic,Iglesia Ni Cristo,Baptists,Others',
            'birthdate' => 'sometimes|required|date',
            'is_active' => 'boolean',
        ];

        // Only validate profile_picture as file if it's actually being uploaded
        if ($request->hasFile('profile_picture')) {
            $rules['profile_picture'] = 'required|file|image|mimes:jpeg,png,jpg,gif,webp|max:5120';
        }

        $validated = $request->validate($rules);

        // Prepare update data (exclude file from validated data)
        $updateData = $validated;
        unset($updateData['profile_picture']);

        // Handle profile picture upload to R2
        if ($request->hasFile('profile_picture')) {
            $profilePictureFile = $request->file('profile_picture');
            $oldPath = $student->getRawOriginal('profile_picture');
            if ($oldPath && !str_starts_with($oldPath, 'http')) {
                try {
                    if (Storage::disk('r2')->exists($oldPath)) {
                        Storage::disk('r2')->delete($oldPath);
                    } elseif (Storage::disk('s3')->exists($oldPath)) {
                        Storage::disk('s3')->delete($oldPath);
                    }
                } catch (\Exception $e) {
                    // Silently fail if deletion fails
                }
            }

            try {
                $extension = $profilePictureFile->getClientOriginalExtension() ?: 'jpg';
                $fileName = Str::uuid() . '.' . $extension;
                $r2Path = $defaultInstitutionId . '/student/' . $student->id . '/profile/' . $fileName;
                Storage::disk('r2')->put($r2Path, file_get_contents($profilePictureFile->getRealPath()));
                $updateData['profile_picture'] = $r2Path;
            } catch (\Exception $e) {
                // Don't update profile picture if upload fails
            }
        }
        
        $student->update($updateData);
        return response()->json(['success' => true, 'data' => $student->fresh('studentInstitutions')]);
    }

    /**
     * Remove the specified student from storage.
     */
    public function destroy(Request $request, $id): JsonResponse
    {
        // Get the authenticated user's institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->find($id);
        
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Student not found'], 404);
        }
        // Delete profile picture from R2 or S3 (legacy) if exists
        $logoKey = $student->getRawOriginal('profile_picture');
        if ($logoKey && !str_starts_with($logoKey, 'http')) {
            try {
                if (Storage::disk('r2')->exists($logoKey)) {
                    Storage::disk('r2')->delete($logoKey);
                } elseif (Storage::disk('s3')->exists($logoKey)) {
                    Storage::disk('s3')->delete($logoKey);
                }
            } catch (\Exception $e) {
                // Silently fail
            }
        }
        $student->delete();
        return response()->json(['success' => true, 'message' => 'Student deleted successfully']);
    }

    /**
     * Check if a student with the given names exists.
     */
    public function exists(Request $request): JsonResponse
    {
        // Get the authenticated user's institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
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

    /**
     * Search students for assignment to class sections.
     */
    public function searchForAssignment(Request $request): JsonResponse
    {
        $perPage = $request->get('per_page', 20);
        $search = $request->get('search', '');
        $excludeSectionId = $request->get('exclude_section_id');

        // Get the authenticated user's default institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        $query = Student::query();

        // Filter students by the user's institution
        // $query->whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
        //     $q->where('institution_id', $defaultInstitutionId);
        // });

        // Exclude students already assigned to the specified section
        if ($excludeSectionId) {
            $query->whereDoesntHave('studentSections', function ($q) use ($excludeSectionId) {
                $q->where('section_id', $excludeSectionId);
            });
        }

        // Search functionality - if search is empty, show at least 5 students
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', '%' . $search . '%')
                  ->orWhere('middle_name', 'like', '%' . $search . '%')
                  ->orWhere('last_name', 'like', '%' . $search . '%')
                  ->orWhere('lrn', 'like', '%' . $search . '%');
            });
        } else {
            // If no search term, limit to 5 students to show some options
            $perPage = min($perPage, 5);
        }

        $students = $query->orderBy('last_name', 'asc')
                         ->orderBy('first_name', 'asc')
                         ->paginate($perPage);

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
} 