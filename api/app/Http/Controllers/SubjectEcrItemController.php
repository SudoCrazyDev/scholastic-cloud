<?php

namespace App\Http\Controllers;

use App\Models\SubjectEcrItem;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class SubjectEcrItemController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = SubjectEcrItem::query();
        
        // Filter by subject_ecr_id if provided
        if ($request->has('subject_ecr_id')) {
            $query->where('subject_ecr_id', $request->query('subject_ecr_id'));
        }
        
        // Filter by type if provided
        if ($request->has('type')) {
            $query->where('type', $request->query('type'));
        }
        
        $items = $query->orderBy('created_at', 'desc')->get();
        
        return response()->json([
            'success' => true,
            'data' => $items
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validatedData = $request->validate([
                'subject_ecr_id' => 'required|uuid',
                'type' => 'required|string|max:255',
                'title' => 'required|string|max:255',
                'description' => 'nullable|string',
                'score' => 'nullable|numeric|min:0|max:999999.99',
            ]);

            $item = SubjectEcrItem::create($validatedData);

            return response()->json([
                'success' => true,
                'data' => $item,
                'message' => 'Subject ECR item created successfully'
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
                'message' => 'Failed to create subject ECR item',
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
            $item = SubjectEcrItem::findOrFail($id);
            
            return response()->json([
                'success' => true,
                'data' => $item
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Subject ECR item not found'
            ], 404);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $item = SubjectEcrItem::findOrFail($id);
            
            $validatedData = $request->validate([
                'subject_ecr_id' => 'sometimes|required|uuid',
                'type' => 'sometimes|required|string|max:255',
                'title' => 'sometimes|required|string|max:255',
                'description' => 'nullable|string',
                'score' => 'nullable|numeric|min:0|max:999999.99',
            ]);

            $item->update($validatedData);

            return response()->json([
                'success' => true,
                'data' => $item->fresh(),
                'message' => 'Subject ECR item updated successfully'
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
                'message' => 'Failed to update subject ECR item',
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
            $item = SubjectEcrItem::findOrFail($id);
            $item->delete();

            return response()->json([
                'success' => true,
                'message' => 'Subject ECR item deleted successfully'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete subject ECR item',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}