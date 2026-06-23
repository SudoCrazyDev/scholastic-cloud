<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Family / guardian information captured on the admission form.
     * One row per guardian (father, mother, guardian, ...).
     */
    public function up(): void
    {
        Schema::create('student_guardians', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('student_id')->constrained('students')->onDelete('cascade');
            $table->string('relation'); // father | mother | guardian
            $table->string('name')->nullable();
            $table->unsignedSmallInteger('age')->nullable();
            $table->string('occupation')->nullable();
            $table->timestamps();

            $table->index(['student_id', 'relation']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_guardians');
    }
};
