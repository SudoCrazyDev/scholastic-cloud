<?php

namespace App\Http\Controllers;

use App\Models\UserCivilServiceEligibility;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserCivilServiceEligibilityController extends Controller
{
    public function index(Request $request)
    {
        $query = UserCivilServiceEligibility::query();
        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|uuid|exists:users,id|unique:user_civil_service_eligibility,user_id',
            'details' => 'required|array',
        ]);
        $eligibility = UserCivilServiceEligibility::create($validated);
        return response()->json($eligibility, 201);
    }

    public function show($id)
    {
        $eligibility = UserCivilServiceEligibility::find($id);
        if (!$eligibility) {
            return response()->json(['message' => 'Not found'], 404);
        }
        return response()->json($eligibility);
    }

    public function update(Request $request, $id)
    {
        $eligibility = UserCivilServiceEligibility::find($id);
        if (!$eligibility) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $validated = $request->validate([
            'details' => 'sometimes|array',
        ]);
        $eligibility->update($validated);
        return response()->json($eligibility);
    }

    public function destroy($id)
    {
        $eligibility = UserCivilServiceEligibility::find($id);
        if (!$eligibility) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $eligibility->delete();
        return response()->json(['message' => 'Deleted successfully']);
    }
} 