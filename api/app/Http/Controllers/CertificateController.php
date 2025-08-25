<?php

namespace App\Http\Controllers;

use App\Models\Certificate;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CertificateController extends Controller
{
    public function index()
    {
        /** @var User $user */
        $user = Auth::user();
        
        // Get user's default institution
        $defaultInstitution = $user->userInstitutions()
            ->where('is_default', true)
            ->first();
        
        if (!$defaultInstitution) {
            // Fallback to main institution
            $defaultInstitution = $user->userInstitutions()
                ->where('is_main', true)
                ->first();
        }
        
        if (!$defaultInstitution) {
            // If no institution found, return empty result
            return response()->json(['data' => [], 'meta' => ['total' => 0]]);
        }
        
        // Filter certificates by institution
        return Certificate::where('institution_id', $defaultInstitution->institution_id)
            ->orderByDesc('updated_at')
            ->paginate(20);
    }

    public function show($id)
    {
        /** @var User $user */
        $user = Auth::user();
        
        // Get user's default institution
        $defaultInstitution = $user->userInstitutions()
            ->where('is_default', true)
            ->first();
        
        if (!$defaultInstitution) {
            $defaultInstitution = $user->userInstitutions()
                ->where('is_main', true)
                ->first();
        }
        
        if (!$defaultInstitution) {
            return response()->json(['message' => 'No institution found'], 404);
        }
        
        // Get certificate and verify it belongs to user's institution
        $certificate = Certificate::where('id', $id)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
            
        if (!$certificate) {
            return response()->json(['message' => 'Certificate not found'], 404);
        }
        
        return response()->json($certificate);
    }

    public function store(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();
        
        // Get user's default institution
        $defaultInstitution = $user->userInstitutions()
            ->where('is_default', true)
            ->first();
        
        if (!$defaultInstitution) {
            $defaultInstitution = $user->userInstitutions()
                ->where('is_main', true)
                ->first();
        }
        
        if (!$defaultInstitution) {
            return response()->json(['message' => 'No institution found'], 400);
        }
        
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'design_json' => 'required|array',
        ]);
        
        $certificate = Certificate::create([
            'title' => $validated['title'],
            'design_json' => $validated['design_json'],
            'institution_id' => $defaultInstitution->institution_id,
            'created_by' => Auth::id(),
            'updated_by' => Auth::id(),
        ]);
        
        return response()->json($certificate, 201);
    }

    public function update(Request $request, $id)
    {
        /** @var User $user */
        $user = Auth::user();
        
        // Get user's default institution
        $defaultInstitution = $user->userInstitutions()
            ->where('is_default', true)
            ->first();
        
        if (!$defaultInstitution) {
            $defaultInstitution = $user->userInstitutions()
                ->where('is_main', true)
                ->first();
        }
        
        if (!$defaultInstitution) {
            return response()->json(['message' => 'No institution found'], 400);
        }
        
        // Get certificate and verify it belongs to user's institution
        $certificate = Certificate::where('id', $id)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
            
        if (!$certificate) {
            return response()->json(['message' => 'Certificate not found'], 404);
        }
        
        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'design_json' => 'sometimes|required|array',
        ]);
        
        $certificate->fill($validated);
        $certificate->updated_by = Auth::id();
        $certificate->save();
        
        return response()->json($certificate);
    }

    public function destroy($id)
    {
        /** @var User $user */
        $user = Auth::user();
        
        // Get user's default institution
        $defaultInstitution = $user->userInstitutions()
            ->where('is_default', true)
            ->first();
        
        if (!$defaultInstitution) {
            $defaultInstitution = $user->userInstitutions()
                ->where('is_main', true)
                ->first();
        }
        
        if (!$defaultInstitution) {
            return response()->json(['message' => 'No institution found'], 400);
        }
        
        // Get certificate and verify it belongs to user's institution
        $certificate = Certificate::where('id', $id)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
            
        if (!$certificate) {
            return response()->json(['message' => 'Certificate not found'], 404);
        }
        
        $certificate->delete();
        return response()->json(['message' => 'Deleted']);
    }
}