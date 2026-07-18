<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class SiblingGroupMember extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'sibling_group_id',
        'student_id',
        'discount_type',
        'discount_value',
        'added_by',
    ];

    protected $casts = [
        'discount_value' => 'decimal:2',
    ];

    public function group()
    {
        return $this->belongsTo(SiblingGroup::class, 'sibling_group_id');
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function addedBy()
    {
        return $this->belongsTo(User::class, 'added_by');
    }
}
