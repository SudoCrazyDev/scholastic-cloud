<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Log;

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
        'role_id',
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

    /**
     * Get any role for the user through user institutions.
     */
    public function anyRole()
    {
        return $this->hasOneThrough(
            \App\Models\Role::class,
            \App\Models\UserInstitution::class,
            'user_id', // Foreign key on user_institutions table
            'id', // Foreign key on roles table
            'id', // Local key on users table
            'role_id' // Local key on user_institutions table
        );
    }

    /**
     * Get the main role for the user (alternative method).
     */
    public function getMainRole()
    {
        $mainUserInstitution = $this->userInstitutions()
            ->where('is_main', true)
            ->with('role')
            ->first();
        
        return $mainUserInstitution ? $mainUserInstitution->role : null;
    }

    /**
     * Get any role for the user (alternative method).
     */
    public function getAnyRole()
    {
        $userInstitution = $this->userInstitutions()
            ->with('role')
            ->first();
        
        return $userInstitution ? $userInstitution->role : null;
    }

    /**
     * Get the user's role with fallback logic.
     * First tries to get role from default institution, then main institution, then direct role_id.
     */
    public function getRole()
    {
        // First try to get role from default institution
        $defaultUserInstitution = $this->userInstitutions()
            ->where('is_default', true)
            ->with('role')
            ->first();
        
        if ($defaultUserInstitution && $defaultUserInstitution->role) {
            return $defaultUserInstitution->role;
        }

        // Then try to get role from main institution
        $mainUserInstitution = $this->userInstitutions()
            ->where('is_main', true)
            ->with('role')
            ->first();
        
        if ($mainUserInstitution && $mainUserInstitution->role) {
            return $mainUserInstitution->role;
        }

        // Finally, fall back to direct role_id on user
        if ($this->role_id) {
            return $this->directRole;
        }

        return null;
    }

    /**
     * Get the user's role ID with fallback logic.
     * First tries to get role_id from default institution, then main institution, then direct role_id.
     */
    public function getRoleId()
    {
        // First try to get role_id from default institution
        $defaultUserInstitution = $this->userInstitutions()
            ->where('is_default', true)
            ->first();
        
        if ($defaultUserInstitution && $defaultUserInstitution->role_id) {
            return $defaultUserInstitution->role_id;
        }

        // Then try to get role_id from main institution
        $mainUserInstitution = $this->userInstitutions()
            ->where('is_main', true)
            ->first();
        
        if ($mainUserInstitution && $mainUserInstitution->role_id) {
            return $mainUserInstitution->role_id;
        }

        // Finally, fall back to direct role_id on user
        return $this->role_id;
    }

    /**
     * Direct relationship to role through role_id.
     */
    public function directRole()
    {
        return $this->belongsTo(\App\Models\Role::class, 'role_id');
    }

    /**
     * Get the user's default institution.
     */
    public function defaultInstitution()
    {
        return $this->hasOneThrough(
            \App\Models\Institution::class,
            \App\Models\UserInstitution::class,
            'user_id', // Foreign key on user_institutions table
            'id', // Foreign key on institutions table
            'id', // Local key on users table
            'institution_id' // Local key on user_institutions table
        )->where('user_institutions.is_default', true);
    }

    /**
     * Get the user's default institution ID.
     */
    public function getDefaultInstitutionId()
    {
        $defaultInstitution = $this->userInstitutions()
            ->where('is_default', true)
            ->first();
        
        return $defaultInstitution ? $defaultInstitution->institution_id : null;
    }

    /**
     * Get the class sections that this user advises.
     */
    public function advisedClassSections()
    {
        return $this->hasMany(ClassSection::class, 'adviser');
    }

    /**
     * Get the subjects that this user advises.
     */
    public function advisedSubjects()
    {
        return $this->hasMany(\App\Models\Subject::class, 'adviser');
    }
}
