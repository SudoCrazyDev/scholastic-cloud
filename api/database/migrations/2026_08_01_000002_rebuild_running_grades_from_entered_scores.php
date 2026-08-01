<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Artisan;

return new class extends Migration
{
    /**
     * Rebuild the running grades that the missing academic year had zeroed out.
     *
     * Stamping the year back onto grade items corrected which items belong to a
     * grading period, but nothing recomputed the grades already stored against
     * them. A class whose scores were all entered still had either a zero
     * running grade or, once the stranded zero rows were cleared, no row at all
     * — which is why the class record showed no calculated grade to apply.
     *
     * Only students who actually have scores are visited, so this is bounded by
     * what a school has entered rather than by its roster.
     */
    public function up(): void
    {
        Artisan::call('grades:recalculate-running');
    }

    /**
     * Irreversible, and harmlessly so: this recomputes derived values from the
     * scores teachers entered. Final grades are never touched.
     */
    public function down(): void
    {
        //
    }
};
