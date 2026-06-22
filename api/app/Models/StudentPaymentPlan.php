<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudentPaymentPlan extends Model
{
    use HasFactory, HasUuids;

    public const TYPE_MONTHLY = 'monthly';

    public const TYPE_QUARTERLY = 'quarterly';

    protected $fillable = [
        'institution_id',
        'student_id',
        'academic_year',
        'payment_plan_id',
        'plan_type',
        'selected_at',
        'selected_by',
        'selected_by_student',
    ];

    protected $casts = [
        'selected_at' => 'datetime',
        'selected_by_student' => 'boolean',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function selectedBy()
    {
        return $this->belongsTo(User::class, 'selected_by');
    }

    public function paymentPlan()
    {
        return $this->belongsTo(PaymentPlan::class);
    }
}
