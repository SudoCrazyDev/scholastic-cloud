<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('author_id')->nullable();
            // Snapshot of the author's role slug at creation time, for display
            // ("Posted by Teacher / Admin") without an extra join.
            $table->string('author_role')->nullable();
            $table->string('title');
            $table->longText('body')->nullable();
            // Who the announcement is for. Teacher posts are always 'students'.
            $table->enum('audience', ['students', 'teachers', 'both'])->default('students');
            // How the audience is narrowed. Teacher posts are always 'sections'.
            $table->enum('scope', ['institution', 'grade_levels', 'sections'])->default('institution');
            $table->boolean('is_pinned')->default(false);
            // Drafts are never visible. A 'published' row with a future publish_at
            // is effectively "scheduled" — visibility is gated at query time.
            $table->enum('status', ['draft', 'published'])->default('published');
            $table->timestamp('publish_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('author_id')->references('id')->on('users')->nullOnDelete();

            $table->index(['institution_id', 'status'], 'announcements_institution_status_idx');
            $table->index(['institution_id', 'is_pinned'], 'announcements_institution_pinned_idx');
            $table->index('publish_at', 'announcements_publish_at_idx');
            $table->index('expires_at', 'announcements_expires_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcements');
    }
};
