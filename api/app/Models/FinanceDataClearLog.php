<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * One completed Finance data clear.
 *
 * Written by FinanceDataCleaner inside the same transaction as the deletes, so
 * a clear that rolls back leaves no entry claiming it happened.
 */
class FinanceDataClearLog extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'academic_year',
        'groups',
        'deleted_counts',
        'total_deleted',
        'files_deleted',
        'files_failed',
        'cleared_by',
        'cleared_by_name',
        'cleared_by_role',
    ];

    protected $casts = [
        'groups' => 'array',
        'deleted_counts' => 'array',
        'total_deleted' => 'integer',
        'files_deleted' => 'integer',
        'files_failed' => 'integer',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function clearedBy()
    {
        return $this->belongsTo(User::class, 'cleared_by');
    }
}
