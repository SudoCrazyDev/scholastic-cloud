<?php

namespace App\Http\Controllers;

use App\Models\SubjectTemplate;
use App\Models\SubjectTemplateItem;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class SubjectTemplateController extends Controller
{
    /**
     * Display a listing of templates.
     */
    public function index(Request $request): JsonResponse
    {
        $authenticatedUser = $request->user();

        // Get the authenticated user's default institution
        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        $query = SubjectTemplate::with(['creator', 'items.parentItem', 'items.childItems'])
            ->where('institution_id', $defaultInstitution->institution_id);

        // Optional grade level filter
        if ($request->has('grade_level')) {
            $query->where('grade_level', $request->grade_level);
        }

        // Search by name
        if ($request->has('search')) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        $templates = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $templates
        ]);
    }

    /**
     * Store a newly created template.
     */
    public function store(Request $request): JsonResponse
    {
        $authenticatedUser = $request->user();

        // Get the authenticated user's default institution
        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'grade_level' => 'nullable|string|max:50',
            'items' => 'required|array|min:1',
            'items.*.subject_type' => 'required|in:parent,child',
            'items.*.parent_item_index' => 'nullable|integer|min:0', // Index reference for parent item
            'items.*.title' => 'required|string|max:255',
            'items.*.variant' => 'nullable|string|max:255',
            'items.*.start_time' => 'nullable|date_format:H:i',
            'items.*.end_time' => 'nullable|date_format:H:i',
            'items.*.is_limited_student' => 'boolean',
            'items.*.order' => 'nullable|integer|min:0',
        ]);

        try {
            DB::beginTransaction();

            // Create the template
            $template = SubjectTemplate::create([
                'institution_id' => $defaultInstitution->institution_id,
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'grade_level' => $validated['grade_level'] ?? null,
                'created_by' => $authenticatedUser->id,
            ]);

            // Create template items
            $createdItems = [];
            foreach ($validated['items'] as $index => $itemData) {
                $parentItemId = null;
                
                // If this is a child item with a parent reference
                if ($itemData['subject_type'] === 'child' && isset($itemData['parent_item_index'])) {
                    $parentIndex = $itemData['parent_item_index'];
                    if (isset($createdItems[$parentIndex])) {
                        $parentItemId = $createdItems[$parentIndex]->id;
                    }
                }

                $item = SubjectTemplateItem::create([
                    'template_id' => $template->id,
                    'subject_type' => $itemData['subject_type'],
                    'parent_item_id' => $parentItemId,
                    'title' => $itemData['title'],
                    'variant' => $itemData['variant'] ?? null,
                    'start_time' => $itemData['start_time'] ?? null,
                    'end_time' => $itemData['end_time'] ?? null,
                    'is_limited_student' => $itemData['is_limited_student'] ?? false,
                    'order' => $itemData['order'] ?? $index,
                ]);

                $createdItems[$index] = $item;
            }

            DB::commit();

            // Load relationships
            $template->load(['creator', 'items.parentItem', 'items.childItems']);

            return response()->json([
                'success' => true,
                'message' => 'Subject template created successfully',
                'data' => $template
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to create subject template: ' . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'message' => 'Failed to create subject template'
            ], 500);
        }
    }

    /**
     * Display the specified template.
     */
    public function show(string $id): JsonResponse
    {
        $template = SubjectTemplate::with(['creator', 'items.parentItem', 'items.childItems'])
            ->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $template
        ]);
    }

    /**
     * Update the specified template.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $template = SubjectTemplate::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'grade_level' => 'nullable|string|max:50',
            'items' => 'sometimes|required|array|min:1',
            'items.*.id' => 'nullable|string', // Existing item ID
            'items.*.subject_type' => 'required|in:parent,child',
            'items.*.parent_item_index' => 'nullable|integer|min:0',
            'items.*.title' => 'required|string|max:255',
            'items.*.variant' => 'nullable|string|max:255',
            'items.*.start_time' => 'nullable|date_format:H:i',
            'items.*.end_time' => 'nullable|date_format:H:i',
            'items.*.is_limited_student' => 'boolean',
            'items.*.order' => 'nullable|integer|min:0',
        ]);

        try {
            DB::beginTransaction();

            // Update template basic info
            $template->update([
                'name' => $validated['name'] ?? $template->name,
                'description' => $validated['description'] ?? $template->description,
                'grade_level' => $validated['grade_level'] ?? $template->grade_level,
            ]);

            // If items are provided, update them
            if (isset($validated['items'])) {
                // Get existing item IDs
                $existingItemIds = $template->items()->pluck('id')->toArray();
                $updatedItemIds = [];

                // Track created/updated items for parent references
                $itemsMap = [];

                foreach ($validated['items'] as $index => $itemData) {
                    $parentItemId = null;
                    
                    // Handle parent reference
                    if ($itemData['subject_type'] === 'child' && isset($itemData['parent_item_index'])) {
                        $parentIndex = $itemData['parent_item_index'];
                        if (isset($itemsMap[$parentIndex])) {
                            $parentItemId = $itemsMap[$parentIndex]->id;
                        }
                    }

                    if (isset($itemData['id']) && in_array($itemData['id'], $existingItemIds)) {
                        // Update existing item
                        $item = SubjectTemplateItem::find($itemData['id']);
                        $item->update([
                            'subject_type' => $itemData['subject_type'],
                            'parent_item_id' => $parentItemId,
                            'title' => $itemData['title'],
                            'variant' => $itemData['variant'] ?? null,
                            'start_time' => $itemData['start_time'] ?? null,
                            'end_time' => $itemData['end_time'] ?? null,
                            'is_limited_student' => $itemData['is_limited_student'] ?? false,
                            'order' => $itemData['order'] ?? $index,
                        ]);
                        $updatedItemIds[] = $itemData['id'];
                    } else {
                        // Create new item
                        $item = SubjectTemplateItem::create([
                            'template_id' => $template->id,
                            'subject_type' => $itemData['subject_type'],
                            'parent_item_id' => $parentItemId,
                            'title' => $itemData['title'],
                            'variant' => $itemData['variant'] ?? null,
                            'start_time' => $itemData['start_time'] ?? null,
                            'end_time' => $itemData['end_time'] ?? null,
                            'is_limited_student' => $itemData['is_limited_student'] ?? false,
                            'order' => $itemData['order'] ?? $index,
                        ]);
                        $updatedItemIds[] = $item->id;
                    }
                    
                    $itemsMap[$index] = $item;
                }

                // Delete items that were not in the update
                $itemsToDelete = array_diff($existingItemIds, $updatedItemIds);
                if (!empty($itemsToDelete)) {
                    SubjectTemplateItem::whereIn('id', $itemsToDelete)->delete();
                }
            }

            DB::commit();

            // Reload with relationships
            $template->load(['creator', 'items.parentItem', 'items.childItems']);

            return response()->json([
                'success' => true,
                'message' => 'Subject template updated successfully',
                'data' => $template
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to update subject template: ' . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'message' => 'Failed to update subject template'
            ], 500);
        }
    }

    /**
     * Remove the specified template.
     */
    public function destroy(string $id): JsonResponse
    {
        try {
            $template = SubjectTemplate::findOrFail($id);
            $template->delete();

            return response()->json([
                'success' => true,
                'message' => 'Subject template deleted successfully'
            ]);

        } catch (\Exception $e) {
            Log::error('Failed to delete subject template: ' . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete subject template'
            ], 500);
        }
    }

    /**
     * Apply a template to a class section.
     */
    public function applyToSection(Request $request, string $id): JsonResponse
    {
        $template = SubjectTemplate::findOrFail($id);

        $validated = $request->validate([
            'class_section_id' => 'required|exists:class_sections,id',
        ]);

        try {
            DB::beginTransaction();

            $createdSubjects = $template->applyToClassSection($validated['class_section_id']);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Template applied successfully',
                'data' => $createdSubjects
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to apply template: ' . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'message' => 'Failed to apply template to class section'
            ], 500);
        }
    }
}