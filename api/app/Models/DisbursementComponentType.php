<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DisbursementComponentType extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'name',
        'is_default',
    ];

    protected $casts = [
        'is_default' => 'boolean',
    ];

    /**
     * The institution's fallback component type ("Cash Dispense" as seeded),
     * created on demand so an institution added after the migration — or one
     * whose row was somehow lost — still has a working default.
     */
    public static function defaultFor(string $institutionId): self
    {
        $existing = static::where('institution_id', $institutionId)->where('is_default', true)->first();
        if ($existing) {
            return $existing;
        }

        // A school that added "Cash Dispense" by hand keeps that row — inserting
        // a second one would collide with the institution+name unique index.
        $byName = static::where('institution_id', $institutionId)->where('name', 'Cash Dispense')->first();
        if ($byName) {
            $byName->update(['is_default' => true]);

            return $byName;
        }

        return static::create([
            'institution_id' => $institutionId,
            'name' => 'Cash Dispense',
            'is_default' => true,
        ]);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function disbursements()
    {
        return $this->hasMany(Disbursement::class, 'disbursement_component_type_id');
    }
}
