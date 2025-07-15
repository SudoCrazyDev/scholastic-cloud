<?php

namespace App\Http\Controllers;

use App\Models\UserFamily;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

class UserFamilyController extends Controller
{
    public function store(Request $request)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'spouse_first_name' => 'nullable|string',
            'spouse_middle_name' => 'nullable|string',
            'spouse_last_name' => 'nullable|string',
            'spouse_extension_name' => 'nullable|string',
            'spouse_occupation' => 'nullable|string',
            'spouse_employer' => 'nullable|string',
            'spouse_business_address' => 'nullable|string',
            'spouse_telephone' => 'nullable|string',
            'father_first_name' => 'nullable|string',
            'father_middle_name' => 'nullable|string',
            'father_last_name' => 'nullable|string',
            'father_extension_name' => 'nullable|string',
            'mother_first_name' => 'nullable|string',
            'mother_middle_name' => 'nullable|string',
            'mother_last_name' => 'nullable|string',
            'mother_extension' => 'nullable|string',
        ]);
        $validated['user_id'] = $user->id;
        $existing = UserFamily::where('user_id', $user->id)->first();
        if ($existing) {
            return response()->json(['message' => 'User family info already exists.'], 409);
        }
        $family = UserFamily::create($validated);
        return response()->json($family, 201);
    }

    public function show(Request $request)
    {
        $user = Auth::user();
        $family = UserFamily::where('user_id', $user->id)->first();
        if (!$family) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        return response()->json($family);
    }

    public function update(Request $request)
    {
        $user = Auth::user();
        $family = UserFamily::where('user_id', $user->id)->first();
        if (!$family) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        $validated = $request->validate([
            'spouse_first_name' => 'nullable|string',
            'spouse_middle_name' => 'nullable|string',
            'spouse_last_name' => 'nullable|string',
            'spouse_extension_name' => 'nullable|string',
            'spouse_occupation' => 'nullable|string',
            'spouse_employer' => 'nullable|string',
            'spouse_business_address' => 'nullable|string',
            'spouse_telephone' => 'nullable|string',
            'father_first_name' => 'nullable|string',
            'father_middle_name' => 'nullable|string',
            'father_last_name' => 'nullable|string',
            'father_extension_name' => 'nullable|string',
            'mother_first_name' => 'nullable|string',
            'mother_middle_name' => 'nullable|string',
            'mother_last_name' => 'nullable|string',
            'mother_extension' => 'nullable|string',
        ]);
        $family->update($validated);
        return response()->json($family);
    }

    public function destroy(Request $request)
    {
        $user = Auth::user();
        $family = UserFamily::where('user_id', $user->id)->first();
        if (!$family) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        $family->delete();
        return response()->json(['message' => 'Deleted.']);
    }
} 