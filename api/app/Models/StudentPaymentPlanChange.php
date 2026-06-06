<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudentPaymentPlanChange extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'student_id',
        'academic_year',
        'payment_plan_id',
        'previous_payment_plan_id',
        'changed_at',
        'changed_by',
        'changed_by_student',
        'note',
    ];

    protected $casts = [
        'changed_at' => 'datetime',
        'changed_by_student' => 'boolean',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function paymentPlan()
    {
        return $this->belongsTo(PaymentPlan::class);
    }

    public function previousPaymentPlan()
    {
        return $this->belongsTo(PaymentPlan::class, 'previous_payment_plan_id');
    }

    public function changedBy()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
