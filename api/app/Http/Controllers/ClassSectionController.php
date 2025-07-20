<?php

namespace App\Http\Controllers;

use App\Models\ClassSection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ClassSectionController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, get all institutions the user has access to
        if (!$institutionId) {
            $userInstitutions = $user->userInstitutions()->pluck('institution_id');
            if ($userInstitutions->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'pagination' => [
                        'current_page' => 1,
                        'last_page' => 1,
                        'per_page' => 15,
                        'total' => 0,
                    ]
                ]);
            }
            $query = ClassSection::whereIn('institution_id', $userInstitutions);
        } else {
            $query = ClassSection::where('institution_id', $institutionId);
        }
        
        $query = $query->with('adviser');
        
        // Search by title
        if ($request->has('search') && $request->search) {
            $query->where('title', 'like', '%' . $request->search . '%');
        }
        
        // Filter by grade_level
        if ($request->has('grade_level') && $request->grade_level) {
            $query->where('grade_level', $request->grade_level);
        }
        

        
        $sections = $query->paginate($request->get('per_page', 15));
        
        return response()->json([
            'data' => $sections->items(),
            'pagination' => [
                'current_page' => $sections->currentPage(),
                'last_page' => $sections->lastPage(),
                'per_page' => $sections->perPage(),
                'total' => $sections->total(),
            ]
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        $validated = $request->validate([
            'grade_level' => 'required|string',
            'title' => 'required|string',
            'adviser' => 'nullable|exists:users,id',
            'academic_year' => 'nullable|string',
        ]);
        $validated['institution_id'] = $institutionId;
        $section = ClassSection::create($validated);
        return response()->json(['data' => $section], 201);
    }

    public function show($id, Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        $section = ClassSection::where('institution_id', $institutionId)->findOrFail($id);
        return response()->json(['data' => $section]);
    }

    public function update(Request $request, $id)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        $section = ClassSection::where('institution_id', $institutionId)->findOrFail($id);
        $validated = $request->validate([
            'grade_level' => 'sometimes|required|string',
            'title' => 'sometimes|required|string',
            'adviser' => 'nullable|exists:users,id',
            'academic_year' => 'nullable|string',
        ]);
        $validated['institution_id'] = $institutionId;
        $section->update($validated);
        return response()->json(['data' => $section]);
    }

    public function destroy($id, Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        $section = ClassSection::where('institution_id', $institutionId)->findOrFail($id);
        $section->delete();
        return response()->json(['message' => 'Deleted successfully']);
    }

    /**
     * Get class sections by institution ID
     */
    public function getByInstitution(Request $request, $institutionId = null)
    {
        $user = $request->user();
        
        // If no institution ID provided, use default institution
        if (!$institutionId) {
            $institutionId = $user->getDefaultInstitutionId();
        }
        
        // If still no institution ID, get all institutions the user has access to
        if (!$institutionId) {
            $userInstitutions = $user->userInstitutions()->pluck('institution_id');
            if ($userInstitutions->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'pagination' => [
                        'current_page' => 1,
                        'last_page' => 1,
                        'per_page' => 15,
                        'total' => 0,
                    ]
                ]);
            }
            $query = ClassSection::whereIn('institution_id', $userInstitutions);
        } else {
            $query = ClassSection::where('institution_id', $institutionId);
        }
        
        $query = $query->with('adviser');
        
        // Search by title
        if ($request->has('search') && $request->search) {
            $query->where('title', 'like', '%' . $request->search . '%');
        }
        
        // Filter by grade_level
        if ($request->has('grade_level') && $request->grade_level) {
            $query->where('grade_level', $request->grade_level);
        }
        

        
        $sections = $query->paginate($request->get('per_page', 15));
        
        return response()->json([
            'data' => $sections->items(),
            'pagination' => [
                'current_page' => $sections->currentPage(),
                'last_page' => $sections->lastPage(),
                'per_page' => $sections->perPage(),
                'total' => $sections->total(),
            ]
        ]);
    }
} 