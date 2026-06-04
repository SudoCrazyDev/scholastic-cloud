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
    ];

    protected $casts = [
        'payment_date' => 'date',
        'total_amount' => 'decimal:2',
        'amount_tendered' => 'decimal:2',
        'change_due' => 'decimal:2',
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
