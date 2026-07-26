<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A staff-filed exception to what the biometric logs say about a day,
 * consumed by payroll once approved.
 */
class StaffAttendanceRequest extends Model
{
    use HasFactory, HasUuids;

    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_DISAPPROVED = 'disapproved';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_DISAPPROVED,
        self::STATUS_CANCELLED,
    ];

    /** Arrived after the grace period for an approved reason (e.g. an off-site event in the morning). */
    public const KIND_LATE_ARRIVAL = 'late_arrival';

    /** Left before the scheduled end with permission (emergency, medical, etc.). */
    public const KIND_EARLY_OUT = 'early_out';

    /** Away on school business — punches may be missing entirely. */
    public const KIND_OFFICIAL_BUSINESS = 'official_business';

    /** Present the whole day but the biometric punch is missing. */
    public const KIND_FORGOT_PUNCH = 'forgot_punch';

    public const KINDS = [
        self::KIND_LATE_ARRIVAL,
        self::KIND_EARLY_OUT,
        self::KIND_OFFICIAL_BUSINESS,
        self::KIND_FORGOT_PUNCH,
    ];

    protected $fillable = [
        'institution_id',
        'user_id',
        'date_from',
        'date_to',
        'kind',
        'waive_late',
        'waive_undertime',
        'pay_full_day',
        'credited_time_in',
        'credited_time_out',
        'reason',
        'status',
        'review_note',
        'requested_by',
        'reviewed_by',
        'reviewed_at',
    ];

    protected $casts = [
        'date_from' => 'date',
        'date_to' => 'date',
        'waive_late' => 'boolean',
        'waive_undertime' => 'boolean',
        'pay_full_day' => 'boolean',
        'reviewed_at' => 'datetime',
    ];

    /**
     * The payroll effect each kind is allowed to have.
     *
     * Derived server-side instead of accepted from the requester so staff
     * cannot grant themselves a pay floor by hand-crafting a payload. An
     * approver can still override the flags when approving.
     *
     * @return array{waive_late: bool, waive_undertime: bool, pay_full_day: bool}
     */
    public static function defaultFlagsForKind(string $kind): array
    {
        return match ($kind) {
            // Excused for arriving late; still expected to work through to the
            // scheduled end, so undertime remains chargeable.
            self::KIND_LATE_ARRIVAL => [
                'waive_late' => true,
                'waive_undertime' => false,
                'pay_full_day' => true,
            ],
            // Excused for leaving early; arriving late is still chargeable.
            self::KIND_EARLY_OUT => [
                'waive_late' => false,
                'waive_undertime' => true,
                'pay_full_day' => true,
            ],
            // Off-site all or part of the day — neither bound applies.
            self::KIND_OFFICIAL_BUSINESS, self::KIND_FORGOT_PUNCH => [
                'waive_late' => true,
                'waive_undertime' => true,
                'pay_full_day' => true,
            ],
            default => [
                'waive_late' => false,
                'waive_undertime' => false,
                'pay_full_day' => false,
            ],
        };
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    /** The staff member the exception applies to. */
    public function staff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
