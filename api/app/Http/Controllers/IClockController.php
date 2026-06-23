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

        $body = $request->getContent();

        if ($table === 'ATTLOG') {
            $count = $this->processAttLog($device, $body);
        } elseif ($table === 'OPERLOG') {
            $count = $this->processOperLog($device, $body);
        } elseif ($table === 'USERINFO') {
            // Response to a "DATA QUERY USERINFO" command — the full enrolled roster.
            $count = $this->processUserData($device, $body);
        } elseif (empty($table)) {
            // Some devices send multiple tables in one POST
            if (str_contains($body, 'ATTLOG')) {
                $count += $this->processAttLog($device, $body);
            }
            if (str_contains($body, 'OPERLOG')) {
                $count += $this->processOperLog($device, $body);
            }
            // User records may arrive without an explicit table param
            $count += $this->processUserData($device, $body);
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

        // QUERY commands (query_users / query_attlog) return their result as a
        // separate cdata upload and never send a devicecmd ack — so mark them done
        // on delivery instead of leaving them stuck at "sent" forever. Mutating
        // commands (add_user, etc.) do get an ack via deviceCmd(), so stay "sent".
        $isQuery = str_starts_with($command->command_type, 'query_');
        $command->update([
            'status'       => $isQuery ? 'done' : 'sent',
            'sent_at'      => now(),
            'completed_at' => $isQuery ? now() : $command->completed_at,
        ]);
        Log::info("[ADMS] serving command id={$command->id} cmd_id={$command->cmd_id} type={$command->command_type}");

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
        // OPERLOG carries device-side operations AND, on most firmwares, user
        // records (lines prefixed "USER " / "USERINFO "). Parse the user rows.
        Log::info("[ADMS] OPERLOG SN={$device->serial_number} body=" . substr($body, 0, 500));

        return $this->processUserData($device, $body);
    }

    /**
     * Parse enrolled-user records out of an ADMS upload body.
     *
     * Firmware sends one user per line, tab-separated key=value pairs, prefixed
     * with either "USER " or "USERINFO ", e.g.:
     *   USER PIN=1\tName=John Doe\tPri=0\tPasswd=\tCard=123\tGrp=1
     *   USERINFO PIN=1\tName=John\tPrivilege=14\t...
     */
    private function processUserData(BiometricDevice $device, string $body): int
    {
        $count = 0;
        foreach (explode("\n", trim($body)) as $line) {
            $line = trim($line);
            if (!preg_match('/^USER(INFO)?\s+/i', $line)) continue;
            if ($this->upsertUserLine($device, $line)) {
                $count++;
            }
        }
        if ($count) {
            Log::info("[ADMS] processUserData: upserted {$count} users SN={$device->serial_number}");
        }
        return $count;
    }

    private function upsertUserLine(BiometricDevice $device, string $line): bool
    {
        // Strip the "USER " / "USERINFO " prefix, then collect key=value pairs.
        $line = preg_replace('/^USER(INFO)?\s+/i', '', $line);

        $data = [];
        preg_match_all('/(\w+)=([^\t\n]*)/', $line, $matches, PREG_SET_ORDER);
        foreach ($matches as $m) {
            $data[strtolower($m[1])] = trim($m[2]);
        }

        $pin = $data['pin'] ?? null;
        if (empty($pin)) return false;

        $name    = $data['name'] ?? null;
        $cardNo  = $data['card'] ?? $data['cardno'] ?? null;
        $privCode = $data['pri'] ?? $data['privilege'] ?? null;

        $attributes = [
            'institution_id' => $device->institution_id,
            'last_synced_at' => now(),
        ];
        // Only overwrite name/card/privilege when the device actually sent them,
        // so a sparse re-sync doesn't wipe existing values.
        if ($name !== null && $name !== '')   $attributes['zk_name'] = $name;
        if ($cardNo !== null && $cardNo !== '' && $cardNo !== '0') $attributes['zk_card_no'] = $cardNo;
        if ($privCode !== null && $privCode !== '') $attributes['zk_privilege'] = $privCode;

        // Confirm a pending enrollment: this device sends no command ack, so the
        // proof that a pushed user "took" is the device reporting it back here.
        $existing = ZkUserMapping::where('device_id', $device->id)->where('zk_user_id', $pin)->first();
        if ($existing && $existing->push_status === 'pending' && $existing->push_action === 'enroll_user') {
            $attributes['push_status'] = 'done';
            $attributes['push_error']  = null;
        }

        ZkUserMapping::updateOrCreate(
            ['device_id' => $device->id, 'zk_user_id' => $pin],
            $attributes
        );
        Log::info("[ADMS] upserted user PIN={$pin} name={$name}");
        return true;
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
