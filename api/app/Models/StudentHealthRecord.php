<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StudentHealthRecord extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'student_id',
        'had_chicken_pox',
        'had_chicken_pox_note',
        'had_chicken_pox_vaccine',
        'had_chicken_pox_vaccine_note',
        'hospitalization_past_year',
        'hospitalization_past_year_note',
        'chronic_condition',
        'chronic_condition_note',
        'allergies',
        'allergies_note',
        'other_medical_problems',
        'other_medical_problems_note',
    ];

    protected $casts = [
        'had_chicken_pox' => 'boolean',
        'had_chicken_pox_vaccine' => 'boolean',
        'hospitalization_past_year' => 'boolean',
        'chronic_condition' => 'boolean',
        'allergies' => 'boolean',
        'other_medical_problems' => 'boolean',
    ];

    public function student()
    {
        return $this->belongsTo(Student::class);
    }
}
