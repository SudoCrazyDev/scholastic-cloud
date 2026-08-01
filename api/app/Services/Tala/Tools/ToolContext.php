<?php

namespace App\Services\Tala\Tools;

use App\Models\User;

/**
 * Who a tool is running as.
 *
 * This is the security boundary of the whole tool layer. It is built once, in
 * the controller, from the authenticated request — never from anything the
 * model said — and a tool receives it alongside the model's arguments so the
 * two can never be confused for one another.
 *
 * The rule every tool follows: identity and scope come from here, filters come
 * from the model. A tool that reads a user id or an institution id out of its
 * input is broken by definition, because the model's input is ultimately
 * whatever a teacher typed into a chat box.
 */
class ToolContext
{
    public function __construct(
        public readonly User $user,
        public readonly string $institutionId,
        /**
         * The thread this is running in. Carried so a tool that records
         * something durable — an assessment proposal — can anchor it to the
         * conversation the teacher will approve it from. Nullable because the
         * read tools neither need it nor should depend on it.
         */
        public readonly ?string $conversationId = null,
    ) {}

    public function userId(): string
    {
        return $this->user->id;
    }
}
