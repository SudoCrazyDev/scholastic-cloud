<?php

namespace App\Http\Controllers;

use App\Models\Subject;
use App\Models\SubjectEcrItem;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Validator;

class SubjectEcrItemController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = Validator::make($request->all(), [
            'subject_id' => ['nullable', 'uuid', 'exists:subjects,id'],
            // Accepts subject_ecr_id as string or array (same behavior as before)
            'subject_ecr_id' => ['nullable'],
            'type' => ['nullable', 'string', Rule::in(['quiz', 'assignment', 'activity', 'project', 'exam', 'other'])],
            'quarter' => ['nullable', 'string', Rule::in(['1', '2', '3', '4'])],
            'scheduled_date' => ['nullable', 'date_format:Y-m-d'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
        ])->validate();

        // If subject_id is used, enforce institution access similar to other controllers.
        if (!empty($validated['subject_id'])) {
            $authenticatedUser = $request->user();
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            $subject = Subject::where('id', $validated['subject_id'])
                ->where('institution_id', $defaultInstitution->institution_id)
                ->first();

            if (!$subject) {
                return response()->json([
                    'success' => false,
                    'message' => 'Subject not found or access denied'
                ], 404);
            }
        }

        $query = SubjectEcrItem::query()->with('subjectEcr');

        if (!empty($validated['subject_id'])) {
            $query->whereHas('subjectEcr', function ($q) use ($validated) {
                $q->where('subject_id', $validated['subject_id']);
            });
        }

        if (!empty($validated['subject_ecr_id'])) {
            $subjectEcrIds = $request->query('subject_ecr_id');
            if (is_array($subjectEcrIds)) {
                $query->whereIn('subject_ecr_id', $subjectEcrIds);
            } else {
                $query->where('subject_ecr_id', $subjectEcrIds);
            }
        }

        if (!empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }

        if (!empty($validated['quarter'])) {
            $query->where('quarter', $validated['quarter']);
        }

        if (!empty($validated['scheduled_date'])) {
            $query->whereDate('scheduled_date', $validated['scheduled_date']);
        }

        if (!empty($validated['date_from'])) {
            $query->whereDate('scheduled_date', '>=', $validated['date_from']);
        }
        if (!empty($validated['date_to'])) {
            $query->whereDate('scheduled_date', '<=', $validated['date_to']);
        }

        $items = $query->orderByRaw('scheduled_date IS NULL, scheduled_date ASC')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $items]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validatedData = $request->validate([
                'subject_ecr_id' => 'required|uuid',
                'type' => 'nullable|string|max:255',
                'title' => 'required|string|max:255',
                'description' => 'nullable|string',
                'quarter' => 'nullable|string',
                'scheduled_date' => 'nullable|date_format:Y-m-d',
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
                'type' => 'nullable|string|max:255',
                'title' => 'sometimes|required|string|max:255',
                'description' => 'nullable|string',
                'scheduled_date' => 'nullable|date_format:Y-m-d',
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