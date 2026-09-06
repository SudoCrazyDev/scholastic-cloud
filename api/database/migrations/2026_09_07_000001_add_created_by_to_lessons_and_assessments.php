<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Records who actually made a lesson or an assessment.
 *
 * Until now the only answer to "who put this up?" was the subject's current
 * adviser, which is not the same question: a subject changes hands mid-year,
 * an administrator builds a quiz for a teacher who is out, and a lesson copied
 * across five sections was created by whoever pressed Copy. Teaching Activity
 * reports per teacher, so it needs the person, not the post.
 *
 * Deliberately not backfilled. Writing the current adviser into every existing
 * row would state as fact something we do not know, and would be wrong for
 * exactly the subjects that changed hands — the ones a principal is most
 * likely to be looking at. Old rows stay NULL and the monitor falls back to
 * the subject's adviser at read time, which is honest about being a fallback
 * (App\Services\TeachingActivityReport::CREATOR_EXPRESSION).
 *
 * Nullable for the same reason going forward: nothing is gated on attribution,
 * so a row that cannot name a creator is a gap in a report, never a failed
 * write.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('topics', function (Blueprint $table) {
            $table->foreignUuid('created_by_user_id')->nullable()->after('subject_id')
                ->constrained('users')->nullOnDelete();
        });

        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->foreignUuid('created_by_user_id')->nullable()->after('subject_ecr_id')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('topics', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by_user_id');
        });

        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by_user_id');
        });
    }
};
