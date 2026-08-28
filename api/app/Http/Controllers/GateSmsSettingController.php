<?php

namespace App\Http\Controllers;

use App\Models\GateSmsSetting;
use App\Models\SmsGateway;
use App\Services\GateSmsNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin config for the Gate Entries → SMS Gateway producer: per gate
 * (entrance / exit) pick the sending gateway and the message template.
 */
class GateSmsSettingController extends Controller
{
    private function institutionId(Request $request): ?string
    {
        return $request->user()->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');
    }

    /**
     * Both gate types, created with defaults on first read.
     */
    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $settings = collect(GateSmsSetting::GATE_TYPES)->map(
            fn (string $gateType) => GateSmsSetting::firstOrCreate(
                ['institution_id' => $institutionId, 'gate_type' => $gateType],
                ['message_template' => GateSmsSetting::defaultTemplate($gateType)],
            ),
        );

        return response()->json([
            'success' => true,
            'data' => $settings,
            'meta' => ['variables' => GateSmsNotifier::VARIABLES],
        ]);
    }

    public function update(Request $request, string $gateType): JsonResponse
    {
        if (! in_array($gateType, GateSmsSetting::GATE_TYPES, true)) {
            return response()->json(['success' => false, 'message' => 'Unknown gate type'], 404);
        }

        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $request->validate([
            'is_enabled' => 'nullable|boolean',
            'sms_gateway_id' => 'nullable|uuid',
            'message_template' => 'nullable|string|max:1600',
            'cooldown_minutes' => 'nullable|integer|min:0|max:1440',
            // 0 disables suppression: always send, however late the scan arrives.
            'late_threshold_minutes' => 'nullable|integer|min:0|max:1440',
            'timezone' => 'nullable|string|timezone',
        ]);

        if (! empty($validated['sms_gateway_id'])) {
            $owns = SmsGateway::where('institution_id', $institutionId)
                ->where('id', $validated['sms_gateway_id'])
                ->exists();
            if (! $owns) {
                return response()->json(['success' => false, 'message' => 'Gateway not found'], 404);
            }
        }

        $setting = GateSmsSetting::firstOrCreate(
            ['institution_id' => $institutionId, 'gate_type' => $gateType],
            ['message_template' => GateSmsSetting::defaultTemplate($gateType)],
        );

        // An enabled gate with an empty template would queue blank SMS — keep the default instead.
        if (array_key_exists('message_template', $validated) && trim((string) $validated['message_template']) === '') {
            $validated['message_template'] = GateSmsSetting::defaultTemplate($gateType);
        }

        $setting->update($validated);

        return response()->json(['success' => true, 'data' => $setting->fresh()]);
    }
}
