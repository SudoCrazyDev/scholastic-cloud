<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A change to an assessment that Tala has drafted and nobody has approved yet.
 *
 * This table is the whole reason Tala can be given write access to a gradebook.
 * The model never writes to `subject_ecr_items`; it writes a row here, the chat
 * renders it as a card, and the mutation happens only when the teacher clicks —
 * through an ordinary authenticated endpoint, under their own permissions. A
 * proposal is a description of an intent, not a change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tala_assessment_proposals', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->uuid('institution_id');
            // The teacher the proposal belongs to. Only they can see or apply it,
            // regardless of who else holds subjects.manage at the school.
            $table->uuid('user_id');
            $table->uuid('conversation_id');
            // The assistant message the card hangs under. Null until the turn
            // finishes, because the proposal is written mid-stream and the
            // message row does not exist yet.
            $table->uuid('message_id')->nullable();

            $table->string('action');

            // Resolved server-side from the teacher's own scope, never taken
            // from the model's arguments.
            $table->uuid('subject_id')->nullable();
            $table->uuid('subject_ecr_id')->nullable();
            // Null for a create; the item being changed otherwise.
            $table->uuid('subject_ecr_item_id')->nullable();

            $table->string('title')->nullable();
            $table->string('assessment_type')->nullable();
            $table->string('quarter')->nullable();

            // The validated, storage-shaped payload the applier will write.
            // Already normalised: answer keys converted to the letters the
            // student UI submits, points defaulted, questions ordered.
            $table->longText('payload')->nullable();
            // What the teacher is shown on the card, with answers rendered back
            // as readable choice text.
            $table->longText('preview')->nullable();
            // Consequences worth a second look before clicking: a published
            // target, existing student attempts, questions being removed.
            $table->longText('warnings')->nullable();
            $table->string('summary')->nullable();

            $table->string('status')->default('pending');
            $table->uuid('applied_item_id')->nullable();
            $table->timestamp('applied_at')->nullable();
            $table->timestamp('discarded_at')->nullable();
            $table->text('failure_reason')->nullable();

            $table->timestamps();

            $table->index(['conversation_id', 'created_at']);
            $table->index(['user_id', 'status']);
            $table->index('subject_ecr_item_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tala_assessment_proposals');
    }
};
