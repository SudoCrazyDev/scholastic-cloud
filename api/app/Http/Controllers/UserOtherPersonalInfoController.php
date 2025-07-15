<?php

namespace App\Http\Controllers;

use App\Models\UserOtherPersonalInfo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserOtherPersonalInfoController extends Controller
{
    public function store(Request $request)
    {
        $user = Auth::user();
        $data = $request->validate([
            'place_of_birth' => 'nullable|string',
            'civil_status' => 'nullable|string',
            'height' => 'nullable|string',
            'weight' => 'nullable|string',
            'blood_type' => 'nullable|string',
            'gsis_id' => 'nullable|string',
            'pag_ibig_id' => 'nullable|string',
            'philhealth_id' => 'nullable|string',
            'sss' => 'nullable|string',
            'tin' => 'nullable|string',
            'agency_employee_id' => 'nullable|string',
            'telephone_no' => 'nullable|string',
            'mobile_no' => 'nullable|string',
        ]);
        $data['user_id'] = $user->id;
        $info = UserOtherPersonalInfo::create($data);
        return response()->json($info, 201);
    }

    public function show()
    {
        $user = Auth::user();
        $info = UserOtherPersonalInfo::where('user_id', $user->id)->firstOrFail();
        return response()->json($info);
    }

    public function update(Request $request)
    {
        $user = Auth::user();
        $info = UserOtherPersonalInfo::where('user_id', $user->id)->firstOrFail();
        $data = $request->validate([
            'place_of_birth' => 'nullable|string',
            'civil_status' => 'nullable|string',
            'height' => 'nullable|string',
            'weight' => 'nullable|string',
            'blood_type' => 'nullable|string',
            'gsis_id' => 'nullable|string',
            'pag_ibig_id' => 'nullable|string',
            'philhealth_id' => 'nullable|string',
            'sss' => 'nullable|string',
            'tin' => 'nullable|string',
            'agency_employee_id' => 'nullable|string',
            'telephone_no' => 'nullable|string',
            'mobile_no' => 'nullable|string',
        ]);
        $info->update($data);
        return response()->json($info);
    }

    public function destroy()
    {
        $user = Auth::user();
        $info = UserOtherPersonalInfo::where('user_id', $user->id)->firstOrFail();
        $info->delete();
        return response()->json(['message' => 'Deleted successfully']);
    }
} 