<?php

namespace App\Http\Controllers;

use App\Models\UserWorkExperience;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserWorkExperienceController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        $experiences = UserWorkExperience::where('user_id', $user->id)->get();
        return response()->json(['success' => true, 'data' => $experiences]);
    }

    public function store(Request $request)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'work_details' => 'required|array',
        ]);
        $experience = UserWorkExperience::create([
            'user_id' => $user->id,
            'work_details' => $validated['work_details'],
        ]);
        return response()->json(['success' => true, 'data' => $experience], 201);
    }

    public function show($id)
    {
        $user = Auth::user();
        $experience = UserWorkExperience::where('user_id', $user->id)->where('id', $id)->first();
        if (!$experience) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }
        return response()->json(['success' => true, 'data' => $experience]);
    }

    public function update(Request $request, $id)
    {
        $user = Auth::user();
        $experience = UserWorkExperience::where('user_id', $user->id)->where('id', $id)->first();
        if (!$experience) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }
        $validated = $request->validate([
            'work_details' => 'required|array',
        ]);
        $experience->update([
            'work_details' => $validated['work_details'],
        ]);
        return response()->json(['success' => true, 'data' => $experience]);
    }

    public function destroy($id)
    {
        $user = Auth::user();
        $experience = UserWorkExperience::where('user_id', $user->id)->where('id', $id)->first();
        if (!$experience) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }
        $experience->delete();
        return response()->json(['success' => true, 'message' => 'Deleted.']);
    }
} 