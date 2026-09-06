<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One completed institution clean-up.
 *
 * Written by InstitutionDataCleaner inside the same transaction as the deletes,
 * so a run that rolls back leaves no entry claiming it happened. Never deleted
 * by a clean-up, including a later clean-up of the same institution — this table
 * is the only thing left to answer what became of a school's records.
 */
class InstitutionCleanupLog extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
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
