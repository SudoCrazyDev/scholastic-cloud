<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->uuid('institution_id');
            $table->string('document_type'); // e.g. 'psa', 'birth_certificate' — kept as string for future flexibility
            $table->string('file_path');     // R2 storage key
            $table->string('file_name');     // original filename
            $table->string('mime_type');
            $table->uuid('uploaded_by')->nullable(); // user who uploaded
            $table->timestamps();

            $table->foreign('student_id')->references('id')->on('students')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_documents');
    }
};
