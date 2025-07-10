<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, HasUuids;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'first_name',
        'middle_name',
        'last_name',
        'ext_name',
        'gender',
        'birthdate',
        'email',
        'password',
        'token',
        'token_expiry',
        'is_new',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /**
     * Get the user institutions for the user.
     */
    public function userInstitutions()
    {
        return $this->hasMany(\App\Models\UserInstitution::class);
    }

    /**
     * The institutions that belong to the user.
     */
    public function institutions()
    {
        return $this->belongsToMany(\App\Models\Institution::class, 'user_institutions')
            ->withPivot('role_id', 'is_default', 'is_main')
            ->withTimestamps();
    }

    /**
     * Get the main role for the user through user institutions.
     */
    public function role()
    {
        return $this->hasOneThrough(
            \App\Models\Role::class,
            \App\Models\UserInstitution::class,
            'user_id', // Foreign key on user_institutions table
            'id', // Foreign key on roles table
            'id', // Local key on users table
            'role_id' // Local key on user_institutions table
        )->where('user_institutions.is_main', true);
    }
}
