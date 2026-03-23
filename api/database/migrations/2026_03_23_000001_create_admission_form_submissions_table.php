<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admission_form_submissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->json('payload');
            $table->timestamps();

            $table->index('institution_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admission_form_submissions');
    }
};
