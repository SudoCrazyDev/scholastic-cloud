<?php

namespace App\Http\Controllers;

use App\Models\UserEducationalBackground;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserEducationalBackgroundController extends Controller
{
    public function store(Request $request)
    {
        $user = Auth::user();
        if (UserEducationalBackground::where('user_id', $user->id)->exists()) {
            return response()->json(['message' => 'Educational background already exists.'], 409);
        }
        $data = $request->validate([
            'educ_details' => 'required|array',
        ]);
        $data['user_id'] = $user->id;
        $record = UserEducationalBackground::create($data);
        return response()->json(['success' => true, 'data' => $record], 201);
    }

    public function show()
    {
        $user = Auth::user();
        $record = UserEducationalBackground::where('user_id', $user->id)->first();
        if (!$record) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        return response()->json(['success' => true, 'data' => $record]);
    }

    public function update(Request $request)
    {
        $user = Auth::user();
        $record = UserEducationalBackground::where('user_id', $user->id)->first();
        if (!$record) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        $data = $request->validate([
            'educ_details' => 'required|array',
        ]);
        $record->update($data);
        return response()->json(['success' => true, 'data' => $record]);
    }

    public function destroy()
    {
        $user = Auth::user();
        $record = UserEducationalBackground::where('user_id', $user->id)->first();
        if (!$record) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        $record->delete();
        return response()->json(['success' => true, 'message' => 'Deleted.']);
    }
} 