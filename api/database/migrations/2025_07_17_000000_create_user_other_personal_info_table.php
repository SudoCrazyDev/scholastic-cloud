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
        Schema::create('user_other_personal_info', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('place_of_birth')->nullable();
            $table->string('civil_status')->nullable();
            $table->string('height')->nullable();
            $table->string('weight')->nullable();
            $table->string('blood_type')->nullable();
            $table->string('gsis_id')->nullable();
            $table->string('pag_ibig_id')->nullable();
            $table->string('philhealth_id')->nullable();
            $table->string('sss')->nullable();
            $table->string('tin')->nullable();
            $table->string('agency_employee_id')->nullable();
            $table->string('telephone_no')->nullable();
            $table->string('mobile_no')->nullable();
            $table->timestamps();

            $table->unique('user_id');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_other_personal_info');
    }
}; 