<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * One backfill that named the fees on collections posted as "General / Other".
 *
 * See the migration for what the operation is and why it is recorded rather than done
 * quietly. A run is either in force or reverted; `reverted_at` is the only state it has.
 */
class FeeNamingRun extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'academic_year',
        'receipt_count',
        'line_count',
        'total_amount',
        'created_by',
        'reverted_at',
        'reverted_by',
    ];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'reverted_at' => 'datetime',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reverter()
    {
        return $this->belongsTo(User::class, 'reverted_by');
    }

    /** The lines this run named — the renamed originals and the siblings it inserted. */
    public function payments()
    {
        return $this->hasMany(StudentPayment::class, 'fee_naming_run_id');
    }

    public function isReverted(): bool
    {
        return $this->reverted_at !== null;
    }
}
