<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentPlan extends Model
{
    use HasFactory, HasUuids;

    /** Payments received before the schedule starts settle installments earliest-first. */
    public const ADVANCE_EQUAL_SPLIT = 'equal_split';

    /** Payments received before the schedule starts are a downpayment: they shrink every installment. */
    public const ADVANCE_NET_OF_DOWNPAYMENT = 'net_of_downpayment';

    public const ADVANCE_PAYMENT_MODES = [
        self::ADVANCE_EQUAL_SPLIT,
        self::ADVANCE_NET_OF_DOWNPAYMENT,
    ];

    /** Each installment is surcharged once, on its own amount, when it goes overdue. */
    public const SURCHARGE_PER_INSTALLMENT = 'per_installment';

    /**
     * The unpaid balance rolls forward and is surcharged again every period, on top of the
     * period's own overdue surcharge. Earlier surcharges are part of the balance that gets
     * surcharged, so the charge compounds while the account stays delinquent.
     */
    public const SURCHARGE_CARRY_OVER = 'carry_over';

    /**
     * Surcharged exactly like `per_installment` — once per installment, on its own amount,
     * with nothing compounding — but billed as one accumulating figure: every period is
     * presented owing the whole unpaid balance behind it as well as its own. An unpaid June
     * at 1,030 and an unpaid August at 1,030 make September ask for 3,060 rather than its
     * own 1,000.
     *
     * A settled period drops out of the total, so a student who missed June and August but
     * paid July is asked for June + August + September and nothing more.
     *
     * Only the presentation differs: the surcharge rows this mode books are identical to
     * `per_installment`, so moving a plan between the two never re-prices a year.
     */
    public const SURCHARGE_RUNNING_TOTAL = 'running_total';

    public const SURCHARGE_MODES = [
        self::SURCHARGE_PER_INSTALLMENT,
        self::SURCHARGE_CARRY_OVER,
        self::SURCHARGE_RUNNING_TOTAL,
    ];

    protected $fillable = [
        'institution_id',
        'name',
        'description',
        'advance_payment_mode',
        'surcharge_mode',
        'is_active',
        'sort_order',
        'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function deductsDownpayment(): bool
    {
        return $this->advance_payment_mode === self::ADVANCE_NET_OF_DOWNPAYMENT;
    }

    public function carriesOverSurcharge(): bool
    {
        return $this->surcharge_mode === self::SURCHARGE_CARRY_OVER;
    }

    /**
     * Whether each period is billed with the unpaid balance behind it folded in, rather
     * than standing on its own. Presentation only — see SURCHARGE_RUNNING_TOTAL.
     */
    public function rollsUpArrears(): bool
    {
        return $this->surcharge_mode === self::SURCHARGE_RUNNING_TOTAL;
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function installments()
    {
        return $this->hasMany(PaymentPlanInstallment::class)->orderBy('sequence');
    }

    public function studentSelections()
    {
        return $this->hasMany(StudentPaymentPlan::class);
    }
}
