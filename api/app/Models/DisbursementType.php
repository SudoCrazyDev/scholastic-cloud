<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DisbursementType extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'name',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function disbursements()
    {
        return $this->hasMany(Disbursement::class);
    }
}
