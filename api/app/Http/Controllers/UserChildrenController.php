<?php

namespace App\Http\Controllers;

use App\Models\UserChildren;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserChildrenController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $children = UserChildren::where('user_id', $user->id)->get();
        return response()->json($children);
    }

    public function store(Request $request)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'children_name' => 'required|string',
            'date_of_birth' => 'nullable|date',
        ]);
        $validated['user_id'] = $user->id;
        $children = UserChildren::create($validated);
        return response()->json($children, 201);
    }

    public function show($id)
    {
        $user = Auth::user();
        $children = UserChildren::where('user_id', $user->id)->where('id', $id)->first();
        if (!$children) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        return response()->json($children);
    }

    public function update(Request $request, $id)
    {
        $user = Auth::user();
        $children = UserChildren::where('user_id', $user->id)->where('id', $id)->first();
        if (!$children) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        $validated = $request->validate([
            'children_name' => 'sometimes|required|string',
            'date_of_birth' => 'nullable|date',
        ]);
        $children->update($validated);
        return response()->json($children);
    }

    public function destroy($id)
    {
        $user = Auth::user();
        $children = UserChildren::where('user_id', $user->id)->where('id', $id)->first();
        if (!$children) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        $children->delete();
        return response()->json(['message' => 'Deleted.']);
    }
} 