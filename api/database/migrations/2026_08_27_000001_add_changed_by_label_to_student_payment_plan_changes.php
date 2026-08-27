<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who made a plan change, in words, recorded at the moment it happened.
 *
 * `changed_by` only ever holds a staff user id. A student or parent signs in through the
 * portal, which is not a row in `users`, so a self-service change left the actor as
 * nothing but a boolean and the history could say no more than "Student". Now that a
 * family can change their own plan, finance needs to see the account that did it.
 *
 * The label is a snapshot on purpose: it still names the actor after a rename, and after
 * the staff user is deleted and `changed_by` has been nulled out from under it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_payment_plan_changes', function (Blueprint $table) {
            $table->string('changed_by_label')->nullable()->after('changed_by_student');
        });
    }

    public function down(): void
    {
        Schema::table('student_payment_plan_changes', function (Blueprint $table) {
            $table->dropColumn('changed_by_label');
        });
    }
};
