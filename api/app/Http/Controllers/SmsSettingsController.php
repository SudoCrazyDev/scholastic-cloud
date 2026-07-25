<?php

namespace App\Http\Controllers;

use App\Models\SmsGateway;
use App\Models\SmsSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SmsSettingsController extends Controller
{
    private function institutionId(Request $request): ?string
    {
        return $request->user()->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');
    }

    public function show(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $settings = SmsSetting::firstOrCreate(
            ['institution_id' => $institutionId],
            ['rate_limit_per_minute' => 20, 'opt_out_keywords' => 'STOP'],
        );

        return response()->json(['success' => true, 'data' => $settings]);
    }

    public function update(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $request->validate([
            'default_gateway_id' => 'nullable|uuid',
            'rate_limit_per_minute' => 'nullable|integer|min:1|max:600',
            'send_window_start' => 'nullable|date_format:H:i',
            'send_window_end' => 'nullable|date_format:H:i',
            'opt_out_keywords' => 'nullable|string|max:255',
            'sender_name' => 'nullable|string|max:32',
        ]);

        if (! empty($validated['default_gateway_id'])) {
            $owns = SmsGateway::where('institution_id', $institutionId)
                ->where('id', $validated['default_gateway_id'])
                ->exists();
            if (! $owns) {
                return response()->json(['success' => false, 'message' => 'Gateway not found'], 404);
            }
        }

        $settings = SmsSetting::firstOrCreate(['institution_id' => $institutionId]);
        $settings->update($validated);

        return response()->json(['success' => true, 'data' => $settings->fresh()]);
    }
}
