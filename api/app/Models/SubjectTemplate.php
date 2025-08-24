<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubjectTemplate extends Model
{
    use HasUuids;
    
    protected $fillable = [
        'institution_id',
        'name',
        'description',
        'grade_level',
        'created_by',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the institution that owns the template.
     */
    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    /**
     * Get the user who created the template.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the template items.
     */
    public function items(): HasMany
    {
        return $this->hasMany(SubjectTemplateItem::class, 'template_id')->orderBy('order');
    }

    /**
     * Get only parent items (subjects with no parent).
     */
    public function parentItems(): HasMany
    {
        return $this->hasMany(SubjectTemplateItem::class, 'template_id')
            ->whereNull('parent_item_id')
            ->orderBy('order');
    }

    /**
     * Apply template to create subjects for a class section.
     */
    public function applyToClassSection(string $classSectionId): array
    {
        $createdSubjects = [];
        $parentMapping = []; // Map template item IDs to created subject IDs

        // First, create parent subjects
        $parentItems = $this->parentItems()->with('childItems')->get();
        
        foreach ($parentItems as $parentItem) {
            $parentSubject = Subject::create([
                'institution_id' => $this->institution_id,
                'class_section_id' => $classSectionId,
                'subject_type' => 'parent',
                'title' => $parentItem->title,
                'variant' => $parentItem->variant,
                'start_time' => $parentItem->start_time,
                'end_time' => $parentItem->end_time,
                'is_limited_student' => $parentItem->is_limited_student,
                'order' => $parentItem->order,
            ]);
            
            $createdSubjects[] = $parentSubject;
            $parentMapping[$parentItem->id] = $parentSubject->id;
            
            // Create child subjects for this parent
            foreach ($parentItem->childItems as $childItem) {
                $childSubject = Subject::create([
                    'institution_id' => $this->institution_id,
                    'class_section_id' => $classSectionId,
                    'subject_type' => 'child',
                    'parent_subject_id' => $parentSubject->id,
                    'title' => $childItem->title,
                    'variant' => $childItem->variant,
                    'start_time' => $childItem->start_time,
                    'end_time' => $childItem->end_time,
                    'is_limited_student' => $childItem->is_limited_student,
                    'order' => $childItem->order,
                ]);
                
                $createdSubjects[] = $childSubject;
            }
        }
        
        // Create standalone child subjects (no parent in template)
        $standaloneChildren = $this->items()
            ->where('subject_type', 'child')
            ->whereNull('parent_item_id')
            ->get();
            
        foreach ($standaloneChildren as $childItem) {
            $childSubject = Subject::create([
                'institution_id' => $this->institution_id,
                'class_section_id' => $classSectionId,
                'subject_type' => 'child',
                'title' => $childItem->title,
                'variant' => $childItem->variant,
                'start_time' => $childItem->start_time,
                'end_time' => $childItem->end_time,
                'is_limited_student' => $childItem->is_limited_student,
                'order' => $childItem->order,
            ]);
            
            $createdSubjects[] = $childSubject;
        }
        
        return $createdSubjects;
    }
}