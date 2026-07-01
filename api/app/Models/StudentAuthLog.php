<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Audit trail of student portal access changes (credentials created,
 * password reset, email changed) and which staff user performed them.
 */
class StudentAuthLog extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'student_auth_logs';

    protected $fillable = [
        'student_id',
        'performed_by',
        'performed_by_name',
        'action',
        'old_email',
        'new_email',
    ];

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function performedBy()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
