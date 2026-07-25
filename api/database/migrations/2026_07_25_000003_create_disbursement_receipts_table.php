<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Move disbursement receipts to a one-to-many table so a single
     * disbursement can carry multiple receipt files. Any existing single
     * receipt (receipt_path/name/mime) is migrated in, then those columns
     * are dropped.
     */
    public function up(): void
    {
        Schema::create('disbursement_receipts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('disbursement_id')->references('id')->on('disbursements')->onDelete('cascade');
            $table->string('path');
            $table->string('name');
            $table->string('mime')->nullable();
            $table->timestamps();

            $table->index('disbursement_id');
        });

        if (Schema::hasColumn('disbursements', 'receipt_path')) {
            $rows = DB::table('disbursements')->whereNotNull('receipt_path')->get();
            foreach ($rows as $row) {
                DB::table('disbursement_receipts')->insert([
                    'id' => (string) Str::uuid(),
                    'disbursement_id' => $row->id,
                    'path' => $row->receipt_path,
                    'name' => $row->receipt_name ?? 'receipt',
                    'mime' => $row->receipt_mime ?? null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            Schema::table('disbursements', function (Blueprint $table) {
                $table->dropColumn(['receipt_path', 'receipt_name', 'receipt_mime']);
            });
        }
    }

    public function down(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->string('receipt_path')->nullable();
            $table->string('receipt_name')->nullable();
            $table->string('receipt_mime')->nullable();
        });

        Schema::dropIfExists('disbursement_receipts');
    }
};
