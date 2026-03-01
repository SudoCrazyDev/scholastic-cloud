<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudentOnlinePaymentTransaction extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'student_id',
        'school_fee_id',
        'completed_payment_id',
        'created_by',
        'provider',
        'status',
        'academic_year',
        'amount',
        'currency',
        'request_reference_number',
        'provider_payment_id',
        'provider_charge_id',
        'checkout_url',
        'expires_at',
        'paid_at',
        'failure_reason',
        'provider_payload',
        'provider_response',
        'metadata',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'expires_at' => 'datetime',
        'paid_at' => 'datetime',
        'provider_payload' => 'array',
        'provider_response' => 'array',
        'metadata' => 'array',
    ];

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function schoolFee()
    {
        return $this->belongsTo(SchoolFee::class);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function completedPayment()
    {
        return $this->belongsTo(StudentPayment::class, 'completed_payment_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
