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

];
