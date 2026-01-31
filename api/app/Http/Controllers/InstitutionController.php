<?php

namespace App\Http\Controllers;

use App\Models\Institution;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
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
