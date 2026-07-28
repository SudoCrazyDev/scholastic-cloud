<?php

namespace App\Http\Controllers;

use App\Models\UserCivilServiceEligibility;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserCivilServiceEligibilityController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $eligibilities = UserCivilServiceEligibility::where('user_id', $user->id)->get();
        return response()->json($eligibilities);
    }

    public function store(Request $request)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'details' => 'present|array',
        ]);
        if (UserCivilServiceEligibility::where('user_id', $user->id)->exists()) {
            return response()->json(['message' => 'Civil service eligibility already exists.'], 409);
        }
        $eligibility = UserCivilServiceEligibility::create([
            'user_id' => $user->id,
            'details' => $validated['details'],
        ]);
        return response()->json($eligibility, 201);
    }

    public function show($id)
    {
        $eligibility = $this->findForUser($id);
        if (!$eligibility) {
            return response()->json(['message' => 'Not found'], 404);
        }
        return response()->json($eligibility);
    }

    public function update(Request $request, $id)
    {
        $eligibility = $this->findForUser($id);
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
        $eligibility = $this->findForUser($id);
        if (!$eligibility) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $eligibility->delete();
        return response()->json(['message' => 'Deleted successfully']);
    }

    private function findForUser($id): ?UserCivilServiceEligibility
    {
        $user = Auth::user();
        return UserCivilServiceEligibility::where('user_id', $user->id)
            ->where('id', $id)
            ->first();
    }
}
