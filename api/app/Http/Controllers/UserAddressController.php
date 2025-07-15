<?php

namespace App\Http\Controllers;

use App\Models\UserAddress;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class UserAddressController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'user_id' => ['nullable', 'uuid', 'exists:users,id'],
            'house_no' => ['nullable', 'string'],
            'street' => ['nullable', 'string'],
            'subdivision' => ['nullable', 'string'],
            'barangay' => ['nullable', 'string'],
            'city' => ['nullable', 'string'],
            'province' => ['nullable', 'string'],
            'zip_code' => ['nullable', 'string'],
            'permanent_house_no' => ['nullable', 'string'],
            'permanent_street' => ['nullable', 'string'],
            'permanent_subdivision' => ['nullable', 'string'],
            'permanent_barangay' => ['nullable', 'string'],
            'permanent_city' => ['nullable', 'string'],
            'permanent_province' => ['nullable', 'string'],
            'permanent_zip_code' => ['nullable', 'string'],
        ]);
        $address = UserAddress::create($validated);
        return response()->json(['success' => true, 'data' => $address], 201);
    }

    public function show($id)
    {
        $address = UserAddress::findOrFail($id);
        return response()->json(['success' => true, 'data' => $address]);
    }

    public function update(Request $request, $id)
    {
        $address = UserAddress::findOrFail($id);
        $validated = $request->validate([
            'user_id' => ['nullable', 'uuid', 'exists:users,id'],
            'house_no' => ['nullable', 'string'],
            'street' => ['nullable', 'string'],
            'subdivision' => ['nullable', 'string'],
            'barangay' => ['nullable', 'string'],
            'city' => ['nullable', 'string'],
            'province' => ['nullable', 'string'],
            'zip_code' => ['nullable', 'string'],
            'permanent_house_no' => ['nullable', 'string'],
            'permanent_street' => ['nullable', 'string'],
            'permanent_subdivision' => ['nullable', 'string'],
            'permanent_barangay' => ['nullable', 'string'],
            'permanent_city' => ['nullable', 'string'],
            'permanent_province' => ['nullable', 'string'],
            'permanent_zip_code' => ['nullable', 'string'],
        ]);
        $address->update($validated);
        return response()->json(['success' => true, 'data' => $address]);
    }

    public function destroy($id)
    {
        $address = UserAddress::findOrFail($id);
        $address->delete();
        return response()->json(['success' => true]);
    }
} 