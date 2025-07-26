<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('core_value_markings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->string('quarter'); // e.g. '1st Quarter', '2nd Quarter', etc.
            $table->string('core_value'); // e.g. 'Maka-Diyos', etc.
            $table->string('behavior_statement');
            $table->enum('marking', ['AO', 'SO', 'RO', 'NO']);
            $table->string('academic_year');
            $table->timestamps();

            $table->foreign('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->unique(['student_id', 'quarter', 'core_value', 'behavior_statement', 'academic_year'], 'uq_core_value_marking');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('core_value_markings');
    }
}; 