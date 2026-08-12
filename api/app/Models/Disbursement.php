<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Disbursement extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'disbursement_type_id',
        'disbursement_component_type_id',
        'title',
        'description',
        'amount',
        'date_issued',
        'in_charge_user_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'date_issued' => 'date',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function type()
    {
        return $this->belongsTo(DisbursementType::class, 'disbursement_type_id');
    }

    public function componentType()
    {
        return $this->belongsTo(DisbursementComponentType::class, 'disbursement_component_type_id');
    }

    public function inCharge()
    {
        return $this->belongsTo(User::class, 'in_charge_user_id');
    }

    public function receipts()
    {
        return $this->hasMany(DisbursementReceipt::class);
    }
}
