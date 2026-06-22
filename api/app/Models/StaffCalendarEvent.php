<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffCalendarEvent extends Model
{
    use HasFactory, HasUuids;

    public const TYPES = ['holiday', 'event'];

    protected $fillable = [
        'institution_id',
        'title',
        'description',
        'type',
        'event_date',
        'created_by',
    ];

    protected $casts = [
        'event_date' => 'date',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
