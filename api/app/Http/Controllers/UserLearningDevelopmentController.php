<?php

namespace App\Http\Controllers;

use App\Models\UserLearningDevelopment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserLearningDevelopmentController extends Controller
{
    public function index()
    {
        // List all records (admin use, or for debugging)
        $records = UserLearningDevelopment::all();
        return response()->json($records);
    }

    public function store(Request $request)
    {
        $user = Auth::user();
        $data = $request->validate([
            'development_details' => 'required|array',
        ]);
        $data['user_id'] = $user->id;
        // Enforce one record per user
        if (UserLearningDevelopment::where('user_id', $user->id)->exists()) {
            return response()->json(['message' => 'Learning development record already exists for this user.'], 409);
        }
        $record = UserLearningDevelopment::create($data);
        return response()->json($record, 201);
    }

    public function show()
    {
        $user = Auth::user();
        $record = UserLearningDevelopment::where('user_id', $user->id)->firstOrFail();
        return response()->json($record);
    }

    public function update(Request $request)
    {
        $user = Auth::user();
        $record = UserLearningDevelopment::where('user_id', $user->id)->firstOrFail();
        $data = $request->validate([
            'development_details' => 'required|array',
        ]);
        $record->update($data);
        return response()->json($record);
    }

    public function destroy()
    {
        $user = Auth::user();
        $record = UserLearningDevelopment::where('user_id', $user->id)->firstOrFail();
        $record->delete();
        return response()->json(['message' => 'Deleted successfully']);
    }
} 