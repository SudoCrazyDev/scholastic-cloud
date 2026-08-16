<?php

namespace Tests\Concerns;

use App\Models\InstitutionFeature;
use App\Support\Features;

/**
 * Switches a platform feature on for a school inside a test.
 *
 * Features ship off while they are being rolled out, which is right for
 * production and wrong for a test suite that is about what the feature does once
 * a school has it. Those tests say so explicitly rather than relying on a
 * default — so that changing a feature's default in config/features.php cannot
 * silently change what they prove.
 */
trait EnablesInstitutionFeatures
{
    protected function enableFeature(string $institutionId, string $feature, bool $enabled = true): void
    {
        InstitutionFeature::updateOrCreate(
            ['institution_id' => $institutionId, 'feature' => $feature],
            ['enabled' => $enabled],
        );

        // The resolver memoises per request, and a test makes several.
        Features::flush($institutionId);
    }
}
