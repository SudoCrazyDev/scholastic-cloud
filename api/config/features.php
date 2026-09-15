<?php

/*
|--------------------------------------------------------------------------
| Feature catalog
|--------------------------------------------------------------------------
|
| What a school has, as opposed to what a person may reach. These are two
| different questions and the platform answers them in two different places:
|
|   config/modules.php   — which people in a school may open a screen. Decided
|                          by the school, in its own role builder.
|   config/features.php  — whether the school has the thing at all. Decided by
|                          the platform, on the Feature Access screen, and not
|                          visible to the school.
|
| A feature switched off is closed to everyone in that institution including
| its own administrator, because the decision is not theirs to make. The two
| gates compose: a school must have the feature *and* the person must have the
| permission, where the feature carries one.
|
| `default_enabled` is what applies to an institution nobody has decided about
| yet — a school created after the feature shipped, or before this catalog
| existed. Default a feature to false while it is being rolled out and turn it
| on school by school; default it to true once it is simply part of the product.
|
*/

return [

    'chat' => [
        'label' => 'Chat',
        'description' => 'Group chat for teachers and students. A group appears for each advisory section and each subject, derived from enrolment — there is nothing to set up per school.',

        /*
         * Off until a school is switched on, deliberately.
         *
         * Chat is the first feature to go through this screen and is still
         * being rolled out: it is the only part of the platform that can carry
         * a conversation between a teacher and a minor, and some schools will
         * want a policy in place before it opens. Defaulting it on would hand
         * it to every institution the moment this deploys, which is the
         * opposite of what this screen is for.
         */
        'default_enabled' => false,

        // Shown on the Feature Access screen so whoever is switching schools on
        // knows what else has to be true for it to work.
        'notes' => 'Where a chat service is configured for the deployment, messages are served from Cloudflare rather than this server.',
    ],

    'matatag-grading' => [
        'label' => 'MATATAG Progress (Key Stage 1)',
        'description' => "DepEd's MATATAG competency-based progress report for Grades 1 to 3 - letter descriptors against each learning competency each term, instead of numeric grades. It runs alongside the school's existing four-quarter numeric grading and replaces none of it.",

        /*
         * Off until a school is switched on, deliberately.
         *
         * Only Grade 1's DepEd catalog has been loaded so far, so a Grade 2 or
         * Grade 3 section would open the screen and find nothing to mark. And a
         * school still on the older report card should not discover a second,
         * differently-shaped one in Academics without having asked for it.
         *
         * Turn this on school by school while Key Stage 1 rolls out, and change
         * the default once Grades 2 and 3 have catalogs.
         */
        'default_enabled' => false,

        // Shown on the Feature Access screen.
        'notes' => 'Only grade levels a DepEd catalog has been loaded for can be used. Grade 1 ships with this release; Grades 2 and 3 arrive as data, with no deployment.',
    ],

    'deped-performance-report' => [
        'label' => "DepEd Performance Report (Grades 2 to 10)",
        'description' => "The Learner's Performance Report prescribed by DepEd Order 15, s. 2026 - three term columns, a final grade and a general average per learning area, the Advancing to Emerging descriptors, and the adviser's remarks per term. It prints alongside the school's existing report card and replaces none of it.",

        /*
         * Off until a school is switched on, deliberately.
         *
         * This is a second, differently-shaped report card for grade levels
         * that already have one, and which of the two a school hands a parent
         * is the school's decision to announce - not something to change under
         * them on a deploy. DO 15 also only took effect for SY 2026-2027, so a
         * school printing an earlier year has no use for it at all.
         *
         * Change the default once the older card is retired.
         */
        'default_enabled' => false,

        // Shown on the Feature Access screen.
        'notes' => 'Needs the section\'s academic year to be recorded as three terms; a four-quarter year has no fourth column on this form, so the tab says so rather than dropping a quarter.',
    ],

];
