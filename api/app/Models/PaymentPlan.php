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

    /** The net charges are divided once, up front, and each installment keeps that amount. */
    public const SCHEDULE_FIXED = 'fixed';

    /**
     * What is still owed is re-divided every time a period opens, across the periods left to
     * collect it in: `remaining balance ÷ periods remaining`. The figure is then frozen for
     * that period — money paid inside it never re-prices its own bill, it lowers the balance
     * the next period opens on.
     *
     * So on 23,700 over ten months from July, a student who pays 7,900 in July is billed
     * 15,800 ÷ 9 = 1,755.56 from August; one who then pays nothing until December is billed
     * 15,800 ÷ 5 = 3,160, because the same balance now has five months to land in rather
     * than nine. Paying the figure asked for keeps it level — it only moves when the student
     * pays more or less than the schedule expected.
     *
     * A missed period is its own consequence: the shortfall is re-spread across what follows,
     * so these plans assess no surcharge (see LateFeeService, which is not run for them) and
     * `advance_payment_mode` has nothing to decide — money paid before the schedule opens is
     * already part of the first period's balance.
     */
    public const SCHEDULE_REAMORTIZING = 'reamortizing';

    public const SCHEDULE_MODES = [
        self::SCHEDULE_FIXED,
        self::SCHEDULE_REAMORTIZING,
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
        'schedule_mode',
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

    /**
     * Whether each period's amount is re-derived from the balance when it opens, rather than
     * fixed once at the start of the schedule. See SCHEDULE_REAMORTIZING.
     */
    public function reamortizes(): bool
    {
        return $this->schedule_mode === self::SCHEDULE_REAMORTIZING;
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
