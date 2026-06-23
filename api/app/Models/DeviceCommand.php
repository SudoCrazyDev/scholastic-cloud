<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class DeviceCommand extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'device_id',
        'cmd_id',
        'command_type',
        'payload',
        'status',
        'device_response',
        'sent_at',
        'completed_at',
    ];

    protected $casts = [
        'sent_at'      => 'datetime',
        'completed_at' => 'datetime',
    ];

    public static function buildAddUserPayload(string $pin, string $name, string $password = '0000'): string
    {
        // ZKTeco ADMS field names — NOT the pull-SDK names. The device expects
        // Pri / Passwd / Card / Grp; unknown keys (Privilege, Password, CardNo…)
        // are silently ignored by the firmware.
        $fields = [
            "PIN={$pin}",
            "Name={$name}",
            "Pri=0",            // 0 = normal user, 14 = admin
            "Passwd={$password}",
            "Card=0",
            "Grp=1",
            "TZ=0",
        ];
        return 'DATA UPDATE USERINFO ' . implode("\t", $fields);
    }

    public static function buildDeleteUserPayload(string $pin): string
    {
        return "DATA DELETE USERINFO PIN={$pin}";
    }

    /**
     * ADMS command that forces the device to upload its full enrolled-user roster.
     * The device replies by POSTing the users to /iclock/cdata (table=USERINFO),
     * which IClockController ingests into zk_user_mappings.
     *
     * Note: a few firmwares ignore DATA QUERY USERINFO and only respond to a full
     * CHECK re-sync. If a given MB-10VL returns nothing, fall back to "CHECK".
     */
    public static function buildQueryUsersPayload(): string
    {
        return 'DATA QUERY USERINFO';
    }

    /**
     * ADMS command that makes the device re-upload its stored attendance punches
     * within a time window. The device replies by POSTing them to /iclock/cdata
     * (table=ATTLOG); IClockController::processAttLog ingests + dedupes them.
     *
     * $start / $end are 'Y-m-d H:i:s' strings.
     */
    public static function buildQueryAttlogPayload(string $start, string $end): string
    {
        return "DATA QUERY ATTLOG StartTime={$start}\tEndTime={$end}";
    }

    public static function generateCmdId(): string
    {
        return (string) random_int(100000, 999999);
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(BiometricDevice::class, 'device_id');
    }
}
