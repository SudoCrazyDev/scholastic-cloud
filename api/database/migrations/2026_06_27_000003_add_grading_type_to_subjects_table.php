<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subjects', function (Blueprint $table) {
            $table->enum('grading_type', ['numerical', 'non_numerical'])->default('numerical')->after('variant');
            $table->uuid('grading_scale_id')->nullable()->after('grading_type');
            $table->foreign('grading_scale_id')->references('id')->on('grading_scales')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('subjects', function (Blueprint $table) {
            $table->dropForeign(['grading_scale_id']);
            $table->dropColumn(['grading_type', 'grading_scale_id']);
        });
    }
};
