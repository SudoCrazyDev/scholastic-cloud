<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\Pivot;

class AnnouncementSection extends Pivot
{
    use HasUuids;

    protected $table = 'announcement_sections';

    public $incrementing = false;

    protected $keyType = 'string';
}
