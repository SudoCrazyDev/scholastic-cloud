# Module: Tala

> Context doc for working on or integrating with **Tala**, the AI teaching assistant.
> Use the [file map](#file-map) to jump straight to whatever a new feature touches.
> **Before adding a tool, read [Guardrails](#guardrails) in full.** Tala is the one module where
> a mistake hands an assistant — and through it, whatever a teacher typed into a chat box — access
> to somebody else's data.

Location in nav: **My Work → Tala** (`/tala`).
Module key: `tala`. Shipped to `subject-teacher` only; `institution-administrator` and `principal`
also hold `tala.configure`.
Everything is **institution-scoped**, resolved from the authenticated user — never from the request
body and never from anything the model says.

---

## Core concept

A chat module. A teacher asks Tala for help with the work of teaching — lesson plans, assessment
items, parent messages, differentiating for a struggling learner — and the reply streams back token
by token.

Three things distinguish it from the **AI planner** (`api/app/Services/Ai/`, the `ai/*` routes behind
Subjects), which is a separate, older feature that stays where it is:

| | AI planner | Tala |
|---|---|---|
| Shape | Task (generate topics, generate a lesson plan) | Conversation |
| Key | One platform-wide key from `.env` (`config/ai.php`) | A key the **tenant** supplies, resolved per request |
| Transport | Request/response, queued for long jobs | Server-Sent Events |
| Interface | `App\Services\Ai\AiProvider` | `App\Services\Ai\Chat\ChatProvider` |

They deliberately do not share an interface. Folding chat into `AiProvider` would have meant every
implementation growing methods it has no use for.

**Turn lifecycle:** teacher sends → user message persisted → credential resolved → spend guard →
model streams → *(optionally: model asks for a tool, tool runs, results fed back, model streams
again)* → assistant message persisted. Up to **4 model round trips** per turn
(`TalaChatController::MAX_TOOL_ROUNDS`).

---

## File map

Everything the module touches, so a new feature knows exactly what to open. Paths are
repo-relative; line numbers drift — search the symbol if it has moved.

**Backend — access & config (`api/`)**
- `config/modules.php` — the `assistant` group and the `tala` module entry (with the `configure`
  special ability). The single source of truth the sidebar, role builder and middleware all read.
- `config/tala.php` — provider catalog, **model allowlist**, effort, `max_tokens`, history window,
  message length cap, default monthly limit, timezone. **No credentials live here.**
- `app/Support/TalaProviders.php` — reads `config/tala.php`; answers what providers/models exist and
  resolves a stored model that has since left the allowlist.
- `app/Support/SystemRolePermissions.php` — seeds `tala` (view+manage) to `subject-teacher`,
  `institution-administrator`, `principal`; `tala.configure` to the latter two.

**Backend — data (`api/`)**
- Migrations (`database/migrations/`):
  - `2026_08_01_120000_create_tala_credentials_table.php` — `tala_credentials`.
  - `2026_08_01_120100_create_tala_conversations_table.php` — `tala_conversations`.
  - `2026_08_01_120200_create_tala_messages_table.php` — `tala_messages`.
- Models (`app/Models/`): `TalaCredential.php`, `TalaConversation.php`, `TalaMessage.php`
  (all `HasUuids`).

**Backend — chat providers (`api/app/Services/Ai/Chat/`)**
- `ChatProvider.php` — the interface: `stream()` and `withToolResults()`.
- `AnthropicChatProvider.php` — Claude, Messages API.
- `OpenAiChatProvider.php` — OpenAI, Chat Completions.
- `ChatProviderFactory.php` — builds one from a **resolved credential** (contrast `AiManager`, which
  reads the env).
- `ChatResult.php`, `ToolCall.php`, `SseReader.php`.

**Backend — Tala services (`api/app/Services/Tala/`)**
- `CredentialResolver.php` — **which key answers**, and the `describe()` payload the UI renders.
- `ResolvedCredential.php` — decrypted key + resolved model, kept out of Eloquent so it cannot be
  serialised into a response by accident.
- `UsageGuard.php` — the monthly spend cap, counted in Manila time.
- `TalaContext.php` — builds the system prompt.
- `Tools/` — see [Guardrails](#guardrails):
  `ToolContext.php`, `TalaTool.php`, `ToolOutcome.php`, `ToolRegistry.php`,
  `AssignedSubjectScope.php`, `ListAssignedSubjectsTool.php`.

**Backend — HTTP (`api/`)**
- `app/Http/Controllers/TalaCredentialController.php` — config + both key scopes.
- `app/Http/Controllers/TalaConversationController.php` — thread CRUD.
- `app/Http/Controllers/TalaChatController.php` — the SSE endpoint and the tool loop.
- `app/Http/Controllers/Concerns/AuthorizesModuleAccess.php` — `resolveStaff()` was added here for
  these controllers.
- `routes/api.php` — the `tala/*` block, directly after the `ai/*` planner routes.

**Frontend (`app/src/`)**
- `services/talaService.ts` — REST via the shared axios client, **plus** `streamMessage()` on raw
  `fetch` (axios buffers a body to completion, which would defeat streaming).
- `hooks/useTala.ts` — `useTalaConfig`, `useTalaConversations`, `useTalaConversation`,
  `useTalaConversationMutations`, `useTalaKeyMutations`, `useTalaChat`.
- `pages/Tala/TalaChat.tsx` — the screen.
- `pages/Tala/components/` — `ConversationList.tsx`, `Transcript.tsx`, `Composer.tsx`,
  `TalaSettingsDialog.tsx`, `MarkdownLite.tsx`.
- `App.tsx` — `/tala` route, `RequireModule module="tala" ability="manage"`.
- `components/sidebar/Sidebar.tsx` — the **My Work** entry.

---

## Permissions

`EnsureModuleAccess` **upgrades every write verb to `manage`**, whatever the route declares. Sending
a message is a POST, so it needs `tala.manage` — `tala.view` alone would show a teacher a screen that
reads old threads and answers nothing. That constraint is why the abilities split the way they do:

| Permission | Means |
|---|---|
| `tala.view` | Read past conversations |
| `tala.manage` | **Chat**, and set your own API key |
| `tala.configure` | Set the school-wide key, cap per-teacher usage |

`Modules::expand()` makes any non-`view` permission carry `.view`, so `tala.configure` implies
`tala.view` — there is no way to grant configure-without-read, and no reason to want one.

Widening Tala beyond subject teachers is **one entry** in `SystemRolePermissions::MANAGE`, or a
checkbox in a school's own role builder. `department-head` shares the subject-teacher permission set
in that file and was deliberately left out.

---

## Credentials

Two scopes in one table, told apart by `user_id`:

- **`user_id` null** — the institution's key, set by an administrator, used by every teacher.
- **`user_id` set** — a teacher's own key.

**The institution's key wins.** A school that has set one up is paying the bill and choosing the
model its staff talk to; a personal key is the fallback for schools that have not set one up, or
that have switched sharing off (`shared_with_staff`).

Resolution (`CredentialResolver::resolve`) looks only at **what exists and is enabled**. It does not
fail over to a personal key because the school's key errored at runtime — a teacher whose school key
has expired sees "the school's key was rejected", not a silent switch onto their own credit card.

Storage notes that will bite if forgotten:

- `api_key` uses Laravel's `encrypted` cast, keyed on **`APP_KEY`**. Rotating `APP_KEY` orphans every
  stored key. The resolver treats an undecryptable key as *absent* rather than throwing, so a
  rotation degrades to "re-enter your key" instead of a broken module.
- MySQL treats NULLs as distinct in a unique index, so `(institution_id, user_id, provider)` would
  happily accept two institution keys. **`owner_key`** is the same value with the null collapsed to a
  sentinel; the model keeps it in step on save.
- `key_last_four` is derived in the model's `saving` hook, so every write path — controller, seeder,
  tinker — leaves the UI something to display.
- **No endpoint ever returns a stored key.** Responses carry provider, model and `••••••••1234`.

---

## Guardrails

The tool layer is where Tala stops being a text box and starts reading the database. Everything in
this section is load-bearing.

### The rule

> **Identity and scope come from `ToolContext`. Filters come from the model.**

`ToolContext` (`Tools/ToolContext.php`) carries the authenticated `User` and the resolved
`institution_id`. It is built once, in `TalaChatController`, from the request — never from anything
the model emitted. It is passed to `TalaTool::run()` as a **separate parameter** from the model's
arguments precisely so the two cannot be confused:

```php
public function run(array $input, ToolContext $context): ToolOutcome;
//                  ^ untrusted        ^ trusted
```

A tool that reads a user id or an institution id out of `$input` is broken by definition, because
`$input` is ultimately whatever a teacher typed into a chat box.

### The scope

Every subject query goes through `Tools/AssignedSubjectScope.php`, which applies both clauses from
context before any filter is considered:

```sql
select * from `subjects` where `adviser` = ? and `institution_id` = ?
```

- `adviser` on a subject is the assigned subject teacher.
- `institution_id` matters because a teacher can hold posts at **more than one school** on this
  platform. The conversation belongs to one of them; the other one's data is out of scope for it.

`AssignedSubjectScope::find()` is the only sanctioned way for a future tool to accept a subject id.
It resolves *through* the scope and returns `null` for an id that exists but is not this teacher's,
so an outsider's id and a nonexistent one are indistinguishable from the chat.

### Three deliberate omissions

1. **No id in the tool schema.** `list_assigned_subjects` takes `search`, `class_section`,
   `academic_year` — and returns no subject ids. There is no row identifier for the model to place in
   a later argument, and nothing to probe with.
2. **The overview-role widening is not reproduced.** `UserController::getMySubjects()` widens to
   every subject in the institution for principals, institution administrators and department heads.
   That is right for a screen someone opened on purpose and wrong for an assistant: Tala answers about
   the teacher it is talking to, so a principal who also teaches sees their own load and nothing more.
   **If institution-wide visibility is ever wanted, it must be its own tool, described as such, gated
   on its own permission** — not a branch inside this one.
3. **Read-only, with no write path planned.** Stated on the `TalaTool` interface, not merely implied
   by the one implementation. An assistant that can change grades or attendance is a different
   product with a different approval story.

### Verified behaviour

Checked against two teachers across two institutions:

| Attempt | Result |
|---|---|
| Baseline list | Own subject only |
| Another teacher's subject, same school | Blocked |
| Own `adviser` id, different institution | Blocked |
| Unassigned subject (`adviser` null) | Blocked |
| `search` naming a colleague's subject | Empty |
| Injected `adviser` / `institution_id` / `user_id` keys in tool input | Ignored; own subject only |
| `search: "%' OR '1'='1"` | Empty (bound parameter) |
| Wrong argument types (int / array / null) | Treated as absent |
| `AssignedSubjectScope::find()` with a colleague's or cross-tenant id | `null` |

### Other limits in the same layer

- **`ToolRegistry` never throws.** An unknown tool name (models hallucinate them) or a tool that
  blows up returns an error `ToolOutcome`, so the model can say "I could not look that up" instead of
  the turn dying mid-sentence.
- **Registration is explicit** in `ToolRegistry::__construct`, not discovered from the filesystem. A
  tool appearing in Tala's hands should be a line someone wrote on purpose.
- **Round cap.** `MAX_TOOL_ROUNDS = 4` stops a model that keeps re-asking for the same lookup from
  spending a school's budget in a loop. Hitting it is not an error — the text produced still stands.
- **Result cap.** `ListAssignedSubjectsTool::MAX_RESULTS = 60`, with `truncated` reported in the
  payload.
- **Audit trail.** Every call is written to `tala_messages` with `role = 'tool'` — tool name,
  arguments, one-line summary. Excluded from the replay window, so it costs nothing on later turns.
- **The prompt states the boundary.** `TalaContext` tells the model it cannot see other teachers'
  loads or any student records, that this is a property of the system rather than a setting, and
  that it must not offer to look past it or suggest the teacher grant access.

### Privacy boundary

Conversations belong to the person, not the school. **No endpoint returns another user's
conversations** — `TalaConversationController` scopes every query to the signed-in user, and an
administrator holding `tala.configure` sees usage counts only. Keeping that true is easier now than
after a "let me see what my teachers are asking" screen exists.

---

## Data model

**`tala_credentials`** — `institution_id`, `user_id` (null = institution-wide), `owner_key`,
`provider`, `model`, `api_key` (encrypted), `key_last_four`, `shared_with_staff`,
`monthly_message_limit`, `is_active`, `created_by`, `last_used_at`.
Unique on `(institution_id, owner_key, provider)`.

**`tala_conversations`** — `institution_id`, `user_id`, `title`, `provider`, `model`,
`last_message_at`, `archived_at`. Provider/model are recorded per thread rather than looked up at
read time: a school can change its key tomorrow and an old thread should still say who wrote it.

**`tala_messages`** — `conversation_id`, denormalised `institution_id` + `user_id` (so the usage
query never joins back), `role` (`user` | `assistant` | `tool`), `content`, `provider`, `model`,
`credential_source`, `tokens_in`, `tokens_out`, `stop_reason`, `error_message`.

Two ordering facts worth knowing:

- **`created_at` is second-resolution**, and a question and its answer are routinely written inside
  the same second. Both the `messages()` relation and `historyForModel()` tie-break on `id`, which
  `HasUuids` issues time-ordered. Drop that and the model can be handed a conversation with its turns
  reversed.
- **Failed turns are kept, not rolled back.** A blank chat pane after a provider outage tells the
  teacher nothing. They are excluded from the replay window instead.

---

## API

All under `auth.token`. Institution resolved by `resolveRequestedInstitution()`.

| Method | Path | Ability |
|---|---|---|
| `GET` | `tala/config` | `tala.view` |
| `PUT` | `tala/credentials` | `tala.manage` |
| `DELETE` | `tala/credentials/{provider}` | `tala.manage` |
| `GET` | `tala/institution-credentials` | `tala.configure` |
| `PUT` | `tala/institution-credentials` | `tala.configure` |
| `DELETE` | `tala/institution-credentials/{provider}` | `tala.configure` |
| `GET` | `tala/conversations` | `tala.view` |
| `POST` | `tala/conversations` | `tala.manage` |
| `GET` | `tala/conversations/{id}` | `tala.view` |
| `PATCH` | `tala/conversations/{id}` | `tala.manage` |
| `DELETE` | `tala/conversations/{id}` | `tala.manage` |
| `POST` | `tala/conversations/{id}/messages` | `tala.manage` |

### The streaming endpoint

`POST tala/conversations/{id}/messages` answers **either** `text/event-stream` **or** JSON — and the
client distinguishes them by content type, not status code alone.

Failures *before* the model is reached answer as ordinary JSON so the UI can react to the cause:
`422 no_credential`, `429 quota_exceeded`, validation. Anything that goes wrong *after* the stream
opens arrives as an `error` event, because by then the teacher is looking at a partial answer that
should stay on screen.

Events:

```
event: start   data: {"user_message_id": "..."}
event: tool    data: {"name":"list_assigned_subjects","status":"running"}
event: tool    data: {"name":"...","status":"done","summary":"3 assigned subjects"}
event: delta   data: {"text":"..."}
event: done    data: {"message_id":"...","tokens_in":2400,"tokens_out":75}
event: error   data: {"message_id":"...","message":"..."}
```

Payloads are JSON-encoded specifically so a reply containing newlines cannot break SSE framing.

**Serving notes.** The controller sets `Cache-Control: no-cache, no-transform` (a proxy that gzips
will buffer, and a buffered stream is just a slow request), `X-Accel-Buffering: no`, calls
`set_time_limit(0)`, flushes every output buffer, and sets `ignore_user_abort(true)` so a partial
answer is still written to the thread when the teacher closes the tab. A stream broken out of early
cannot use `$generator->getReturn()`; the controller builds its own result in that case.

---

## Frontend

- **`streamMessage()` uses `fetch`, not axios.** Axios buffers a response body until complete, which
  would turn the stream into a pause followed by the whole answer at once.
- **The transcript is local state**, not query cache — it changes on every token, and a cache write
  per token would re-render the conversation list and sidebar with it.
- **Syncing is once per thread**, tracked by a ref in `TalaChat.tsx`. A second sync landing mid-answer
  would replace what is on screen with the server's not-yet-written copy. A freshly created thread is
  marked synced up front for the same reason.
- **`send(text, targetId?)`** takes an explicit id so sending from the empty screen can create the
  thread and send into it in one go, rather than waiting a render for the hook to catch up.
- **`MarkdownLite`** is a deliberate non-dependency: the app has no Markdown renderer and four
  constructs did not justify adding one. It builds React nodes and never touches
  `dangerouslySetInnerHTML`, so model output cannot inject markup.
- **Tool activity is shown, not hidden** — a teacher should be able to see that Tala read their
  teaching load, and see that it read nothing else.

---

## Spend

Only messages sent on the **institution's** key count. A teacher on their own key is spending their
own money and is not capped.

Months are counted in **`Asia/Manila`**, not UTC. `config/app.php` pins the app to UTC while the
schools do not, so a naive `whereMonth` would roll a teacher's allowance over at 8am on the 1st and
hand back eight hours of the previous month. `UsageGuard` builds the window in school time and
converts back to UTC for the query — which is also why it is a range rather than a date function.

---

## Adding a tool

1. Implement `TalaTool` in `app/Services/Tala/Tools/`.
2. Scope every query through a scope class that applies `ToolContext` first. Do **not** query a model
   directly. If the tool needs an id, resolve it through the scope's `find()`.
3. Say the scope out loud in `description()` — "the subjects assigned to you" — so the model does not
   ask for something it cannot have and then explain the refusal as though something broke.
4. Return filters only in `inputSchema()`. No identities. Prefer omitting ids entirely.
5. Register it in `ToolRegistry::__construct`.
6. Mention it in `TalaContext`'s "What you can and cannot see" section, including what it still
   cannot reach.
7. Add the cross-teacher / cross-institution / injected-argument cases to the guardrail checks.

Both providers pick the new tool up automatically — `ToolRegistry::definitions()` returns a neutral
shape each translates (Anthropic `tools[]`, OpenAI `tools[].function`).

---

## Gotchas for provider work

- **Claude's assistant turn must be echoed back verbatim, thinking blocks included.** They carry
  signatures the API validates on the follow-up request, so rebuilding the turn from its text fails
  the continuation. `AnthropicChatProvider` reassembles blocks by index as they stream, including
  `signature_delta`.
- **Tool arguments arrive split mid-token** (`{"class_sec` + `tion":"Grade 7"}`). Buffer, then decode.
- **A turn that is only a tool call has empty text.** That is not a failure — only empty text *with
  no tool call* is.
- **A Claude refusal is HTTP 200** with an empty or truncated body and `stop_reason: "refusal"`.
  Check `stop_reason` before trusting `content`.
- **Thinking stays on.** Disabling it on Opus 5 makes the model write reasoning — sometimes literal
  `<thinking>` tags — into the visible reply, and occasionally emit a tool call as plain text that
  never runs. Chat stays responsive via `output_config.effort` instead.
- **`max_tokens` covers thinking and the reply together.**
- **Provider errors are never thrown**, they come back as a failed `ChatResult`. Raw error bodies are
  logged, not shown — they can carry organisation and key detail.

---

## Not yet wired

- **One tool only** (`list_assigned_subjects`). No lessons, assessments, class records or attendance.
- **No institution usage screen.** The data is on `tala_messages` (`credential_source`, token counts);
  nothing renders it yet.
- **No retention policy.** Conversations persist until a teacher deletes them.
- **No key validation on save.** Length bounds only — whether a key works is answered the first time
  a teacher sends a message, where the error surfaces in the chat they are already looking at.
- **Institution key config lives in the Tala settings dialog**, not as a Settings tab.
- **Not exercised in a browser** against a live provider key. The wire format, client parser, tool
  scoping and persistence are covered by checks; the rendered screen is not.
