<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The MATATAG curriculum catalog: what DepEd says Key Stage 1 is made of.
 *
 * These six tables are **platform-wide, not per-institution**. A competency is
 * DepEd's, identical in every school, so there is one copy and no
 * `institution_id` anywhere here. An institution clean-up never touches them —
 * see the `matatag` group in InstitutionCleanupGroups, which lists only the
 * tenant tables.
 *
 * They are created in one migration because they are one concept and are
 * meaningless apart: a learning area with no competencies is nothing.
 *
 * ## Versions, and why they are never edited
 *
 * DepEd revises. A revision is a **new `matatag_curriculum_versions` row with
 * new ids throughout**, never an edit of the old one, and a section is pinned
 * to one version for a whole academic year. Descriptors already recorded
 * therefore cannot move underneath a school mid-year. See MATATAG.md,
 * "Receiving a DepEd update".
 *
 * ## Why term and macro_skill are 0 and 'none' rather than NULL
 *
 * MySQL allows unlimited NULLs in a unique index, so a nullable column in a
 * uniqueness constraint does not constrain. `UNIQUE (competency_id, term,
 * macro_skill)` with a nullable `macro_skill` would happily let a second
 * catalog load double GMRC's 24 slots to 48. That is the likeliest seed bug in
 * this module, and these defaults are what make it impossible.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('matatag_curriculum_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();

            // The loader's idempotency key: re-running a load must find its own
            // version rather than create a second one.
            $table->string('code', 80)->unique();

            $table->string('title');
            $table->string('grade_level', 50);
            $table->string('source')->nullable();
            $table->date('published_on')->nullable();

            // Stamped the first time a descriptor is recorded against this
            // version. The loader refuses a locked version, so "just fix a typo
            // in v1.0" fails loudly instead of rewriting history under marks a
            // teacher has already made.
            $table->timestamp('locked_at')->nullable();

            // Asserted by the loader against what it actually inserted. A
            // mismatch rolls the whole load back rather than half-loading.
            $table->unsignedInteger('competency_count')->default(0);
            $table->unsignedInteger('slot_count')->default(0);

            $table->timestamps();

            $table->index('grade_level');
        });

        // Which version a grade level gets when a section opts in without
        // naming one. `grade_level` is the primary key, so exactly one default
        // per grade level is structural rather than a rule someone has to
        // remember; MySQL has no partial unique index, so an `is_default` flag
        // on the versions table could not be constrained this way.
        //
        // Grades 2 and 3 simply have no row until their catalogs arrive, and
        // that absence is what makes opt-in refuse them with a clear message.
        Schema::create('matatag_grade_level_curricula', function (Blueprint $table) {
            $table->string('grade_level', 50)->primary();
            $table->uuid('curriculum_version_id');
            $table->timestamps();

            $table->foreign('curriculum_version_id')
                ->references('id')->on('matatag_curriculum_versions')
                ->restrictOnDelete();
        });

        Schema::create('matatag_learning_areas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('curriculum_version_id');
            $table->string('key', 50);
            $table->string('title');

            // 'year_list'     - one competency list for the whole year, each
            //                   rated in some subset of the terms (Reading &
            //                   Literacy, Language).
            // 'per_term_list' - a separate list per term, numbering restarting
            //                   each time (Mathematics, GMRC, Makabansa).
            //
            // A string, deliberately not an enum: a grade level that lays an
            // area out a third way must be a data change, not an ALTER TABLE.
            $table->string('shape', 20);

            // What the entry grid and the PACE form branch on. Never branch on
            // the area key or the grade level — those differ per grade level
            // and these flags are what make the catalog data rather than code.
            $table->boolean('uses_macro_skills')->default(false);
            $table->boolean('has_domains')->default(false);
            $table->boolean('carries_values')->default(false);

            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('curriculum_version_id')
                ->references('id')->on('matatag_curriculum_versions')
                ->cascadeOnDelete();

            // One Language list per version. A double load must collide here.
            $table->unique(['curriculum_version_id', 'key'], 'mtg_areas_version_key_uniq');
            $table->index(['curriculum_version_id', 'sort_order'], 'mtg_areas_version_order_idx');
        });

        Schema::create('matatag_domains', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('learning_area_id');

            // 0 when the domain spans the year (Reading & Literacy, Language);
            // 1-3 when it belongs to one term (Mathematics prints two domains
            // per term, drawn from three across the year).
            $table->unsignedTinyInteger('term')->default(0);

            $table->string('code', 100);
            $table->string('title', 500);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('learning_area_id')
                ->references('id')->on('matatag_learning_areas')
                ->cascadeOnDelete();

            $table->unique(['learning_area_id', 'term', 'code'], 'mtg_domains_area_term_code_uniq');
            $table->index(['learning_area_id', 'term', 'sort_order'], 'mtg_domains_area_term_order_idx');
        });

        Schema::create('matatag_competencies', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('learning_area_id');
            $table->uuid('domain_id')->nullable();

            // Exactly one level of nesting: a numbered competency may have
            // lettered children, and those children have none.
            $table->uuid('parent_id')->nullable();

            // 1-3 for a per-term area, 0 for a year-long one.
            $table->unsignedTinyInteger('term')->default(0);

            // The natural key, and the identifier to quote when DepEd revises
            // wording: 'T1.9.a', '.12.a', '.1'.
            //
            // Not (term, number, letter): `letter` is null on every parent and
            // `number` is null on some children, and MySQL would accept a
            // hundred (area, 0, NULL, NULL) rows. `path` is one non-null
            // human-readable string that actually constrains.
            $table->string('path', 60);

            $table->string('number', 10)->nullable();
            $table->string('letter', 5)->nullable();

            // What prints in the form's No. column: '9', or 'a' for a child.
            $table->string('label', 20)->default('');

            $table->text('text');

            // GMRC prints a performance standard beside each value it
            // cultivates. Null for every other area.
            $table->text('performance_standard')->nullable();

            // Room for a field a later grade level introduces, so a third
            // per-competency column is a data change rather than a migration.
            $table->json('extra')->nullable();

            // False for a parent whose children hold the slots.
            $table->boolean('is_rateable')->default(true);

            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('learning_area_id')
                ->references('id')->on('matatag_learning_areas')
                ->cascadeOnDelete();
            $table->foreign('domain_id')
                ->references('id')->on('matatag_domains')
                ->nullOnDelete();
            $table->foreign('parent_id')
                ->references('id')->on('matatag_competencies')
                ->cascadeOnDelete();

            $table->unique(['learning_area_id', 'path'], 'mtg_competencies_area_path_uniq');
            $table->index(['learning_area_id', 'term', 'sort_order'], 'mtg_competencies_area_term_order_idx');
            $table->index('parent_id', 'mtg_competencies_parent_idx');
        });

        // One row per rateable cell. 606 of them for Grade 1.
        Schema::create('matatag_competency_slots', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('competency_id');

            // Denormalised so the grid can fetch a whole (area, term) block
            // without joining up through competencies.
            $table->uuid('learning_area_id');

            $table->unsignedTinyInteger('term');

            // 'listening' | 'speaking' | 'reading' | 'copying_guided_writing'
            // | 'none'. See the note at the top about why this is not nullable.
            $table->string('macro_skill', 40)->default('none');

            // Presentation order within (area, term). Deliberately NOT part of
            // the unique key: it is renumbered whenever a domain is reordered,
            // whereas a cell's identity is which competency, which skill,
            // which term.
            $table->integer('sort_order')->default(0);

            $table->timestamps();

            $table->foreign('competency_id')
                ->references('id')->on('matatag_competencies')
                ->cascadeOnDelete();
            $table->foreign('learning_area_id')
                ->references('id')->on('matatag_learning_areas')
                ->cascadeOnDelete();

            $table->unique(['competency_id', 'term', 'macro_skill'], 'mtg_slots_competency_term_skill_uniq');
            $table->index(['learning_area_id', 'term', 'sort_order'], 'mtg_slots_area_term_order_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('matatag_competency_slots');
        Schema::dropIfExists('matatag_competencies');
        Schema::dropIfExists('matatag_domains');
        Schema::dropIfExists('matatag_learning_areas');
        Schema::dropIfExists('matatag_grade_level_curricula');
        Schema::dropIfExists('matatag_curriculum_versions');
    }
};
