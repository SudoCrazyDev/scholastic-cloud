<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a loan's history — who did what, and when.
 *
 * The actor's name is copied in rather than only referenced. A staff member can
 * leave and be deleted; the record of who put a deduction on somebody's salary
 * has to outlive them.
 */
class StaffLoanEvent extends Model
{
    use HasUuids;

    public const ACTION_CREATED = 'created';

    public const ACTION_UPDATED = 'updated';

    public const ACTION_APPROVED = 'approved';

    public const ACTION_REJECTED = 'rejected';

    public const ACTION_CANCELLED = 'cancelled';

    /** A released payroll period took an installment. */
    public const ACTION_COLLECTED = 'collected';

    /** A period was reopened, so a collection was given back. */
    public const ACTION_RELEASED = 'released';

    public const ACTION_COMPLETED = 'completed';

    protected $fillable = [
        'staff_loan_id',
        'action',
        'actor_id',
        'actor_name',
        'amount',
        'note',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function loan(): BelongsTo
    {
        return $this->belongsTo(StaffLoan::class, 'staff_loan_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
