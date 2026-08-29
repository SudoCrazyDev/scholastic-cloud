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
        'institution_payment_gateway_id',
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

    /**
     * The merchant account this payment was taken through. Held on the
     * transaction rather than looked up when a callback lands, so a school that
     * changes provider can still have last term's payments verified and read
     * back with the keys they were started under.
     */
    public function gateway()
    {
        return $this->belongsTo(InstitutionPaymentGateway::class, 'institution_payment_gateway_id');
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
