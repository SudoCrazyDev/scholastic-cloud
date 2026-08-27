<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;

class PaymentTransaction extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'student_id',
        'academic_year',
        'payment_date',
        'payment_method',
        'reference_number',
        'or_number',
        'receipt_number',
        'remarks',
        'total_amount',
        'amount_tendered',
        'change_due',
        'received_by',
        'voided_at',
    ];

    protected $casts = [
        'payment_date' => 'date',
        'total_amount' => 'decimal:2',
        'amount_tendered' => 'decimal:2',
        'change_due' => 'decimal:2',
        'voided_at' => 'datetime',
    ];

    /**
     * Database-generated copies of the two identifiers, holding the number only while
     * this receipt stands so the unique index releases it on a void. They exist for the
     * index alone — `or_number` and `reference_number` are what anything reads.
     */
    protected $hidden = [
        'live_or_number',
        'live_reference_number',
    ];

    public function items()
    {
        return $this->hasMany(StudentPayment::class, 'payment_transaction_id');
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public static function generateUniqueReceiptNumber(): string
    {
        $prefix = 'RCPT-' . now()->format('Ymd');

        do {
            $receiptNumber = $prefix . '-' . Str::upper(Str::random(6));
            $exists = self::where('receipt_number', $receiptNumber)->exists()
                || StudentPayment::where('receipt_number', $receiptNumber)->exists();
        } while ($exists);

        return $receiptNumber;
    }
}
