<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which features each institution has.
 *
 * Rows are decisions, not state: a missing row means "nobody has decided about
 * this school yet", and the feature's own `default_enabled` in
 * config/features.php answers for it. That is deliberately different from
 * treating absent as off — it lets a feature ship enabled for everyone without
 * having to write a row per institution first, and it keeps the meaning of a
 * row honest, which is what makes `updated_by` worth recording.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institution_features', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');

            // The key from config/features.php. Not constrained to a list in
            // the database: features come and go with the code, and a row for a
            // feature that no longer exists is simply ignored on read.
            $table->string('feature', 64);

            $table->boolean('enabled');

            // Who last decided, for the support conversation that starts "who
            // turned this off?". Nullable because a row may be written by a
            // migration or a console command rather than a person.
            $table->uuid('updated_by')->nullable();

            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();

            // One decision per feature per school.
            $table->unique(['institution_id', 'feature'], 'institution_features_unique');

            // "everything this school has" — read on every profile load.
            $table->index('institution_id', 'institution_features_institution_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('institution_features');
    }
};
