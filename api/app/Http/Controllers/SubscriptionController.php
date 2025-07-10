<?php

namespace App\Http\Controllers;

use App\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class SubscriptionController extends Controller
{
    /**
     * Display a listing of the resource with pagination.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = $request->get('per_page', 15);
        $search = $request->get('search', '');
        
        $query = Subscription::query();
        
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }
        
        $subscriptions = $query->orderBy('created_at', 'desc')
                              ->paginate($perPage);
        
        return response()->json([
            'success' => true,
            'data' => $subscriptions->items(),
            'pagination' => [
                'current_page' => $subscriptions->currentPage(),
                'last_page' => $subscriptions->lastPage(),
                'per_page' => $subscriptions->perPage(),
                'total' => $subscriptions->total(),
                'from' => $subscriptions->firstItem(),
                'to' => $subscriptions->lastItem(),
            ]
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'title' => 'required|string|max:255|unique:subscriptions,title',
                'description' => 'nullable|string',
                'price' => 'required|numeric|min:0',
            ]);

            $subscription = Subscription::create($validated);

            return response()->json([
                'success' => true,
                'message' => 'Subscription created successfully',
                'data' => $subscription
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
                'message' => 'Failed to create subscription',
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
            $subscription = Subscription::findOrFail($id);
            
            return response()->json([
                'success' => true,
                'data' => $subscription
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Subscription not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve subscription',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $subscription = Subscription::findOrFail($id);
            
            $validated = $request->validate([
                'title' => 'required|string|max:255|unique:subscriptions,title,' . $id,
                'description' => 'nullable|string',
                'price' => 'required|numeric|min:0',
            ]);

            $subscription->update($validated);

            return response()->json([
                'success' => true,
                'message' => 'Subscription updated successfully',
                'data' => $subscription->fresh()
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Subscription not found'
            ], 404);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update subscription',
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
            $subscription = Subscription::findOrFail($id);
            $subscription->delete();

            return response()->json([
                'success' => true,
                'message' => 'Subscription deleted successfully'
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Subscription not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete subscription',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
