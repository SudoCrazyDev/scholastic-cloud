<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StudentPayment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'student_id',
        'school_fee_id',
        'academic_year',
        'amount',
        'payment_date',
        'payment_method',
        'reference_number',
        'receipt_number',
        'remarks',
        'received_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'date',
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

    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
