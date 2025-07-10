<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class UserInstitution extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'user_institutions';

    protected $fillable = [
        'user_id',
        'institution_id',
        'role_id',
        'is_default',
        'is_main',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function role()
    {
        return $this->belongsTo(Role::class);
    }
} 