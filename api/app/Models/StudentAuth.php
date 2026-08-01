<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudentAuth extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'student_auth';

    protected $fillable = [
        'student_id',
        'email',
        'password',
        'token',
        'token_expiry',
        'is_new',
    ];

    protected $hidden = [
        'password',
        // Live portal credential — see the note on User::$hidden.
        'token',
        'token_expiry',
    ];

    protected function casts(): array
    {
        return [
            'is_new' => 'boolean',
        ];
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }
}
