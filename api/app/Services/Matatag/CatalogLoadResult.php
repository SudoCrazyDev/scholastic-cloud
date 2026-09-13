<?php

namespace App\Services\Matatag;

use App\Models\MatatagCurriculumVersion;

/**
 * What one catalog load actually did.
 *
 * `changes` is per table so a re-run can report "nothing changed" honestly
 * rather than claiming a successful write it never made. That distinction is
 * the whole point of running the loader twice.
 */
class CatalogLoadResult
{
    /**
     * @param  array<string, array{created: int, updated: int, deleted: int}>  $changes
     */
    public function __construct(
        public readonly MatatagCurriculumVersion $version,
        public readonly int $competencyCount,
        public readonly int $slotCount,
        public readonly array $changes,
        public readonly bool $madeDefault,
    ) {}

    public function changedAnything(): bool
    {
        foreach ($this->changes as $counts) {
            if ($counts['created'] || $counts['updated'] || $counts['deleted']) {
                return true;
            }
        }

        return false;
    }
}
