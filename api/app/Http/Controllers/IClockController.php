<?php

namespace App\Http\Controllers;

use App\Models\AttendanceLog;
use App\Models\BiometricDevice;
use App\Models\DeviceCommand;
use App\Models\ZkUserMapping;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * Handles the ZKTeco ADMS (iClock) push protocol.
 *
 * Device configuration:
 *   Server Mode:    ADMS
 *   Server Address: <your-api-host>
 *   Server Port:    8000 (or 80/443)
 *
 * The device automatically appends /iclock/cdata, /iclock/getrequest, /iclock/devicecmd.
 * Devices are identified by their serial number (SN parameter).
 */
class IClockController extends Controller
{
    // ── Find or auto-register device by serial number ─────────────────────────

    private function resolveDevice(string $sn): ?BiometricDevice
    {
        if (empty($sn)) return null;

        $device = BiometricDevice::where('serial_number', $sn)->first();

        if (!$device) {
            // Auto-register as an unregistered device so admin can claim it
            $device = BiometricDevice::create([
                'institution_id' => $this->getDefaultInstitutionId(),
                'name'           => "Device {$sn}",
                'serial_number'  => $sn,
                'status'         => 'unknown',
            ]);
            Log::info("[ADMS] Auto-registered new device SN={$sn} id={$device->id}");
        }

        $device->update(['last_seen_at' => now(), 'status' => 'online']);
        return $device;
    }

    private function getDefaultInstitutionId(): string
    {
        // Returns empty — admin must claim the device via HRIS → Biometric Devices.
        // The device will still receive ADMS init responses; logs accumulate once claimed.
        return \App\Models\Institution::orderBy('created_at')->value('id') ?? '';
    }

    private function txt(string $body): Response
    {
        return response($body, 200)->header('Content-Type', 'text/plain');
    }

    // ── GET /iclock/cdata ─────────────────────────────────────────────────────
    // Device initial handshake. Responds with server options.
    public function init(Request $request): Response
    {
        $sn   = $request->get('SN', '');
        $stamp = $request->get('stamp', '0');

        Log::info("[ADMS] init SN={$sn} stamp={$stamp} params=" . json_encode($request->all()));

        $device = $this->resolveDevice($sn);

        $serverTime = now()->format('Y-m-d H:i:s');
        $lastStamp  = $device?->updated_at?->timestamp ?? 0;

        return $this->txt(
            "GET OPTION FROM SERVER:\n" .
            "ATTLogStamp={$lastStamp}\n" .
            "OPERLogStamp=0\n" .
            "AttPhotoStamp=0\n" .
            "ErrorDelay=30\n" .
            "Delay=10\n" .
            "TransTimes=00:00;14:05\n" .
            "TransInterval=1\n" .
            "TransFlag=1000000000000000\n" .
            "Realtime=1\n" .
            "Encrypt=None\n" .
            "ServerVer=2.4.1\n" .
            "TableNameStamp=0\n" .
            "ServerTime={$serverTime}\n"
        );
    }

    // ── POST /iclock/cdata ────────────────────────────────────────────────────
    // Device uploads attendance logs, operation logs, and user data.
    public function upload(Request $request): Response
    {
        $sn    = $request->get('SN', '');
        $table = strtoupper($request->get('table', ''));

        Log::info("[ADMS] upload SN={$sn} table={$table}");
        Log::debug("[ADMS] upload body=" . $request->getContent());

        $device = $this->resolveDevice($sn);
        if (!$device) {
            return $this->txt("OK: 0\n");
        }

        $count = 0;

        if ($table === 'ATTLOG') {
            $count = $this->processAttLog($device, $request->getContent());
        } elseif ($table === 'OPERLOG') {
            $count = $this->processOperLog($device, $request->getContent());
        } elseif (empty($table)) {
            // Some devices send multiple tables in one POST
            $body = $request->getContent();
            if (str_contains($body, 'ATTLOG')) {
                $count += $this->processAttLog($device, $body);
            }
            if (str_contains($body, 'OPERLOG')) {
                $count += $this->processOperLog($device, $body);
            }
        }

        return $this->txt("OK: {$count}\n");
    }

    // ── GET /iclock/getrequest ────────────────────────────────────────────────
    // Device polls for pending commands (user add/update/delete).
    public function getRequest(Request $request): Response
    {
        $sn = $request->get('SN', '');
        Log::info("[ADMS] getrequest SN={$sn}");

        $device = $this->resolveDevice($sn);
        if (!$device) {
            return $this->txt("OK\n");
        }

        $command = DeviceCommand::where('device_id', $device->id)
            ->where('status', 'pending')
            ->orderBy('created_at')
            ->first();

        if (!$command) {
            return $this->txt("OK\n");
        }

        $command->update(['status' => 'sent', 'sent_at' => now()]);
        Log::info("[ADMS] serving command id={$command->id} cmd_id={$command->cmd_id}");

        return $this->txt("C:{$command->cmd_id}:{$command->payload}\n");
    }

    // ── POST /iclock/devicecmd ────────────────────────────────────────────────
    // Device reports the result of a command we issued.
    public function deviceCmd(Request $request): Response
    {
        $sn         = $request->get('SN', '');
        $cmdId      = $request->get('ID', '');
        $returnCode = $request->get('Return', '0');
        $cmdText    = $request->get('CMD', '');

        Log::info("[ADMS] devicecmd SN={$sn} ID={$cmdId} Return={$returnCode} CMD={$cmdText}");

        $command = DeviceCommand::where('cmd_id', $cmdId)->first();
        if ($command) {
            $success = $returnCode === '0';
            $command->update([
                'status'          => $success ? 'done' : 'failed',
                'device_response' => $cmdText,
                'completed_at'    => now(),
            ]);

            // Update zk_user_mapping push status if this was a user enrollment
            if ($command->command_type === 'add_user') {
                // Extract PIN from payload "DATA UPDATE USERINFO PIN=X\t..."
                preg_match('/PIN=(\S+)/', $command->payload, $m);
                $pin = $m[1] ?? null;
                if ($pin) {
                    ZkUserMapping::where('device_id', $command->device_id)
                        ->where('zk_user_id', $pin)
                        ->update([
                            'push_status' => $success ? 'done' : 'failed',
                            'push_error'  => $success ? null : "Device returned code {$returnCode}",
                        ]);
                }
            }
        }

        return $this->txt("OK\n");
    }

    // ── Attendance log parser ─────────────────────────────────────────────────

    private function processAttLog(BiometricDevice $device, string $body): int
    {
        $count = 0;
        foreach (explode("\n", trim($body)) as $line) {
            $line = trim($line);
            if (empty($line) || str_starts_with($line, 'ATTLOG')) continue;

            // Format: <pin>\t<datetime>\t<status>\t<verify>\t<workcode>
            $parts = preg_split('/\t/', $line);
            if (count($parts) < 3) continue;

            $pin        = trim($parts[0]);
            $datetime   = trim($parts[1]);
            $statusCode = (int) trim($parts[2] ?? 0);
            $verifyCode = (int) trim($parts[3] ?? 0);

            if (empty($pin) || empty($datetime)) continue;

            $mapping = ZkUserMapping::where('device_id', $device->id)
                ->where('zk_user_id', $pin)->first();

            try {
                AttendanceLog::updateOrCreate(
                    ['device_id' => $device->id, 'zk_user_id' => $pin, 'punched_at' => $datetime],
                    [
                        'institution_id'  => $device->institution_id,
                        'user_id'         => $mapping?->user_id,
                        'punch_type_code' => $statusCode,
                        'punch_type'      => $this->punchType($statusCode),
                        'verify_type'     => $this->verifyType($verifyCode),
                    ]
                );
                $count++;
            } catch (\Exception $e) {
                Log::warning("[ADMS] attlog insert failed: {$e->getMessage()} line={$line}");
            }
        }
        Log::info("[ADMS] processAttLog: {$count} records saved");
        return $count;
    }

    private function processOperLog(BiometricDevice $device, string $body): int
    {
        // OPERLOG contains device-side operations: user enroll, FP enroll, etc.
        // Log for now; parse in V2 for real-time sync
        Log::info("[ADMS] OPERLOG SN={$device->serial_number} body=" . substr($body, 0, 500));

        // If the OPERLOG contains user info (some devices send USERINFO here)
        $count = 0;
        foreach (explode("\n", trim($body)) as $line) {
            $line = trim($line);
            if (str_starts_with($line, 'USERINFO')) {
                $this->processUserInfoLine($device, $line);
                $count++;
            }
        }
        return $count;
    }

    private function processUserInfoLine(BiometricDevice $device, string $line): void
    {
        // Format: USERINFO PIN=1\tName=Admin\tPassword=\tPrivilege=14\t...
        $data = [];
        preg_match_all('/(\w+)=([^\t\n]*)/', $line, $matches, PREG_SET_ORDER);
        foreach ($matches as $m) {
            $data[$m[1]] = $m[2];
        }
        $pin  = $data['PIN'] ?? null;
        $name = $data['Name'] ?? null;
        if (!$pin) return;

        ZkUserMapping::updateOrCreate(
            ['device_id' => $device->id, 'zk_user_id' => $pin],
            [
                'institution_id' => $device->institution_id,
                'zk_name'        => $name,
                'last_synced_at' => now(),
            ]
        );
        Log::info("[ADMS] upserted user PIN={$pin} name={$name}");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function punchType(int $code): string
    {
        return match($code) {
            0 => 'check_in',
            1 => 'check_out',
            2 => 'break_out',
            3 => 'break_in',
            4 => 'ot_in',
            5 => 'ot_out',
            default => 'unknown',
        };
    }

    private function verifyType(int $code): string
    {
        return match($code) {
            0  => 'password',
            1  => 'fingerprint',
            2  => 'fingerprint',
            3  => 'fingerprint',
            4  => 'card',
            15 => 'face',
            default => 'unknown',
        };
    }
}
