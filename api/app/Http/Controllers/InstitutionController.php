<?php

namespace App\Http\Controllers;

use App\Models\Institution;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class InstitutionController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): JsonResponse
    {
        $institutions = Institution::with('subscription')->get();
        
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

            // Handle logo file upload
            if ($request->hasFile('logo')) {
                $logo = $request->file('logo');
                $logoPath = $logo->store('institutions/logos', 'public');
                $data['logo'] = Storage::url($logoPath);
            }

            $institution = Institution::create($data);

            return response()->json([
                'success' => true,
                'message' => 'Institution created successfully',
                'data' => $institution->load('subscription')
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
            $institution = Institution::with('subscription')->findOrFail($id);
            
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

            // Handle logo file upload
            if ($request->hasFile('logo')) {
                // Delete old logo if exists
                if ($institution->logo) {
                    $oldLogoPath = str_replace('/storage/', '', $institution->logo);
                    Storage::disk('public')->delete($oldLogoPath);
                }
                
                $logo = $request->file('logo');
                $logoPath = $logo->store('institutions/logos', 'public');
                $data['logo'] = Storage::url($logoPath);
            }

            $institution->update($data);

            return response()->json([
                'success' => true,
                'message' => 'Institution updated successfully',
                'data' => $institution->load('subscription')
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
            
            // Delete logo file if exists
            if ($institution->logo) {
                $logoPath = str_replace('/storage/', '', $institution->logo);
                Storage::disk('public')->delete($logoPath);
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
     * Upload logo file only.
     */
    public function uploadLogo(Request $request, string $id): JsonResponse
    {
        try {
            $institution = Institution::findOrFail($id);
            
            $validator = Validator::make($request->all(), [
                'logo' => 'required|file|image|mimes:jpeg,png,jpg,gif|max:2048'
            ]);
            
            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors()
                ], 422);
            }

            // Delete old logo if exists
            if ($institution->logo) {
                $oldLogoPath = str_replace('/storage/', '', $institution->logo);
                Storage::disk('public')->delete($oldLogoPath);
            }
            
            $logo = $request->file('logo');
            $logoPath = $logo->store('institutions/logos', 'public');
            $logoUrl = Storage::url($logoPath);
            
            $institution->update(['logo' => $logoUrl]);

            return response()->json([
                'success' => true,
                'message' => 'Logo uploaded successfully',
                'data' => [
                    'logo' => $logoUrl
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
