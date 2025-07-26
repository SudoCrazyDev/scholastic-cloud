<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class CoreValueMarking extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'core_value_markings';

    protected $fillable = [
        'id',
        'student_id',
        'quarter',
        'core_value',
        'behavior_statement',
        'marking',
        'academic_year',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    public function student()
    {
        return $this->belongsTo(Student::class);
    }
} 