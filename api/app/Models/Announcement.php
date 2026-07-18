<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Announcement extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'author_id',
        'author_role',
        'category',
        'title',
        'body',
        'audience',
        'scope',
        'is_pinned',
        'status',
        'publish_at',
        'expires_at',
    ];

    protected $casts = [
        'is_pinned' => 'boolean',
        'publish_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function author()
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function sections()
    {
        return $this->belongsToMany(ClassSection::class, 'announcement_sections', 'announcement_id', 'class_section_id')
            ->using(AnnouncementSection::class)
            ->withTimestamps();
    }

    public function gradeLevels()
    {
        return $this->hasMany(AnnouncementGradeLevel::class);
    }

    public function attachments()
    {
        return $this->hasMany(AnnouncementAttachment::class);
    }

    public function reads()
    {
        return $this->hasMany(AnnouncementRead::class);
    }
}
