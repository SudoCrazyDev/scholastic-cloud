<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RolePermission extends Model
{
    protected $table = 'role_permissions';

    protected $fillable = [
        'role_id',
        'permission',
    ];

    public function role()
    {
        return $this->belongsTo(Role::class);
    }
}
