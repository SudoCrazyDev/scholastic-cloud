<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserCivilServiceEligibility extends Model
{
    use HasUuids;

    protected $table = 'user_civil_service_eligibility';

    protected $fillable = [
        'user_id',
        'details',
    ];

    protected $casts = [
        'details' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
} 