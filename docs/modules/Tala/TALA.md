# Module: Tala

> Context doc for working on or integrating with **Tala**, the AI teaching assistant.
> Use the [file map](#file-map) to jump straight to whatever a new feature touches.
> **Before adding a tool, read [Guardrails](#guardrails) in full.** Tala is the one module where
> a mistake hands an assistant — and through it, whatever a teacher typed into a chat box — access
> to somebody else's data. Since the assessment tools landed it is also the one module where a
> mistake could *change* a gradebook, which is why
> [the write path](#the-write-path-nothing-the-model-says-changes-anything) is built the way it is.

Location in nav: **My Work → Tala** (`/tala`).
Applying an assessment suggestion additionally requires **`subjects.manage`** — see
[the write path](#the-write-path-nothing-the-model-says-changes-anything).
Module key: `tala`. **No role grants it.** An administrator holding `tala.configure`
(`institution-administrator`, `principal`) gives it to individual teachers, and a row in
`tala_access` is the whole access decision — see [Permissions](#permissions--tala-is-the-one-module-a-role-cannot-grant).
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
again)* → assistant message persisted. Up to **6 model round trips** per turn
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
- `app/Support/SystemRolePermissions.php` — seeds `tala.configure` to `institution-administrator`
  and `principal`. `tala` itself appears in no role's list: chatting is granted per teacher.
- `app/Models/Concerns/HasModulePermissions.php` — `applyTalaAccess()`, the one place the role system
  and the per-teacher grant meet.

**Backend — data (`api/`)**
- Migrations (`database/migrations/`):
  - `2026_08_01_120000_create_tala_credentials_table.php` — `tala_credentials`.
  - `2026_08_01_120100_create_tala_conversations_table.php` — `tala_conversations`.
  - `2026_08_01_120200_create_tala_messages_table.php` — `tala_messages`.
  - `2026_08_02_140000_create_tala_access_table.php` — `tala_access`, and the two deletions that
    retire the old model: teachers' personal keys, and `tala.view`/`tala.manage` on roles.
- Models (`app/Models/`): `TalaCredential.php`, `TalaAccess.php`, `TalaConversation.php`,
  `TalaMessage.php` (all `HasUuids`).

**Backend — chat providers (`api/app/Services/Ai/Chat/`)**
- `ChatProvider.php` — the interface: `stream()`, `withToolResults()` (which also inlines
  attachments), and `supportsAttachment()`.
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
- `TalaContext.php` — builds the system prompt, including the
  [records-versus-knowledge rule](#their-records-versus-your-knowledge).
- `SectionLabel.php` — names a class section. `class_sections.grade_level` already holds `"Grade 7"`,
  so prefixing `"Grade "` yields `"Grade Grade 7"` — which is what the model was being told before
  this existed.
- `Tools/` — see [Guardrails](#guardrails):
  - Plumbing: `ToolContext.php`, `TalaTool.php`, `ToolOutcome.php`, `ToolRegistry.php`,
    `ToolInput.php` (coerces the model's arguments), `ToolMemory.php` (what the tools did this
    turn — how one tool requires that another ran first).
  - Scopes: `AssignedSubjectScope.php` (subjects), `AssignedLessonScope.php` (lessons, inheriting the
    subject scope as a subquery), `AssignedAssessmentScope.php` (assessments, one join deeper —
    and the scope the **write** path re-resolves through).
  - Read tools: `ListAssignedSubjectsTool.php`, `ListLessonsTool.php`, `GetLessonTool.php`,
    `ListAssessmentsTool.php`, `GetAssessmentTool.php`.
  - `ProposeAssessmentTool.php` — the only tool that writes anything, and what it writes is a
    proposal. **Read its docblock before touching it.**
  - `ReadLessonMaterialTool.php` — opens a lesson's uploaded images and PDFs. Costs real money
    per call, which is why it is separate from `get_lesson`.
  - `LessonText.php` — HTML → plain text, and the block renderer that **drops signed media URLs**.
- `Attachments/` — reading a lesson's uploaded files:
  - `AttachmentReader.php` — fetches from R2 server-side, sniffs the real type, enforces the
    budgets, and routes an oversized PDF to `PdfReader`. **The content goes to the provider; the
    location never does.**
  - `PdfReader.php` — opens a PDF too large to send and decides, by measurement, whether to extract
    its text or lift its pages out as images. `PdfExtract.php` is the result of that decision.
  - `Png.php` — writes a PNG with nothing but zlib and crc32, because there is no GD here.
  - `LessonAttachment.php`, `AttachmentBatch.php` — the bytes, the extracted text, and what was
    skipped and why.
- `Assessments/` — everything behind the approval card:
  - `AssessmentTypes.php` — the allowlists, narrower than the schema on purpose, with the reason
    for each exclusion.
  - `AssessmentSpec.php` — validates the model's questions and **converts answer keys to the
    letters the student UI actually submits**. The single most load-bearing conversion in the
    module; its docblock explains what breaks without it.
  - `AssessmentPresenter.php` — reads a stored assessment back out, keys rendered as readable
    text, editor images reported as a count rather than a signed URL.
  - `ProposalApplier.php` — the one place a proposal becomes a real change. Re-checks scope,
    refuses stale proposals, single-use.

**Backend — HTTP (`api/`)**
- `app/Http/Controllers/TalaCredentialController.php` — config + the school's key. There is no
  teacher-key scope any more.
- `app/Http/Controllers/TalaAccessController.php` — who may chat. The administrator's roster, and
  the grant/revoke that backs it.
- `app/Http/Controllers/TalaConversationController.php` — thread CRUD.
- `app/Http/Controllers/TalaChatController.php` — the SSE endpoint and the tool loop.
- `app/Http/Controllers/TalaProposalController.php` — **the write path.** Apply/discard an
  assessment suggestion. Double-gated: `tala,manage` + `subjects,manage`.
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

## Permissions — Tala is the one module a role cannot grant

Every other module is answered entirely by the role attached to a user's institution. **Tala is not.**
An administrator grants it to individual teachers, because schools wanted to run it with two teachers
before opening it to a department, and a role could only ever say all-or-nothing.

So a row in **`tala_access`** is the only source of `tala.view` and `tala.manage`. The rule lives in
one place — `HasModulePermissions::applyTalaAccess()` — and reads:

| Holder | Gets | Why |
|---|---|---|
| An active `tala_access` row | `tala.view` + `tala.manage` | This is the grant. It is the whole access decision. |
| A role carrying `tala.view`/`tala.manage` | **nothing** | Stripped, not merely un-added — roles predating this change still store them. |
| `tala.configure` (a role ability) | `tala.view` | So the administrator can open the screen where the key and the access list live. `view` only: administering Tala is not using it. |
| The wildcard `*` | everything | Platform super-administrator, who must be able to support a school's setup and is not somebody a school can grant. |

Because the grant materialises as ordinary permission strings, **nothing downstream needed changing**:
`EnsureModuleAccess` still gates routes on `module:tala,manage`, the sidebar still reads the profile's
permission list, and every `can()` check keeps working. One source of truth, one place to look.

Two consequences worth knowing:

- **`config/modules.php` declares `'base_abilities' => []` for Tala**, so the role builder draws only
  its extra abilities and not the View/Manage pair. A checkbox that set something inert would be worse
  than no checkbox — it is exactly the "I granted it and nothing happened" complaint the design avoids.
- **`Modules::expand()` skips the implied `.view`** for such a module, so `tala.configure` does not
  quietly write a permission into a role that the role is not allowed to hold.

`EnsureModuleAccess` still upgrades every write verb to `manage`, so sending a message needs
`tala.manage` — which is to say, needs the grant.

**The sidebar gates Tala on `tala.view`, not `manage`.** For a teacher that is the same thing, since
the grant confers both. What it additionally admits is the administrator holding `tala.configure`,
who needs the link precisely to reach the setup screen; they get the administration panel instead of
a composer (`can_chat` on `/tala/config` tells the two apart).

Granting is `PUT /api/tala/access` with a list of user ids, gated on `tala.configure`. Membership of
the institution is **verified server-side** rather than trusted from the request — the ids come from a
browser, and granting Tala to somebody at another school would spend this school's key on a stranger.
Revoking keeps the row and clears `is_active`, so who granted, who revoked, and when all survive.

---

## Credentials — one key, and an administrator sets it

One kind of row now: `user_id` is always null, the institution's key, set under `tala.configure` and
used by every teacher who has been granted access.

**Teachers have no setup step at all.** They open Tala and type. There is no screen on which a teacher
could add, view or replace a key, and `CredentialResolver` has no personal-key branch to fall back to.

That last point is worth stating plainly rather than leaving implied: when the school's key is missing
or parked (`shared_with_staff` off, which is now the "pause Tala for everyone" switch), **Tala does not
answer.** It does not quietly find another way to bill someone.

Resolution looks only at **what exists and is enabled**, never at what errored at runtime — a teacher
whose school key has expired sees "the school's key was rejected", which is the truth and is
actionable by the person who can fix it.

> **Migration note.** `2026_08_02_140000_create_tala_access_table` **deletes every user-owned row** in
> `tala_credentials`. They were unreachable after this change — no screen could show, rotate or delete
> them — and they held encrypted third-party credentials that nobody owned. It also clears
> `tala.view`/`tala.manage` out of `role_permissions`, since nothing reads them and leaving them would
> have the table claim a school still hands out Tala by role.

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

**Lessons inherit that scope rather than restating it.** Lessons live on `topics`, which has no owner
column — a lesson belongs to whoever owns its subject. `Tools/AssignedLessonScope.php` expresses
exactly that, as a subquery over the subject scope:

```sql
select * from `topics`
where `subject_id` in (
  select `subjects`.`id` from `subjects` where `adviser` = ? and `institution_id` = ?
)
```

Written as a subquery over `AssignedSubjectScope::query()` and not as a hand-rolled join, so there
stays exactly one definition of "this teacher's subjects" in the codebase. Change the subject rule and
lessons follow it without being edited.

### Lesson attachments: the content leaves, the location does not

Tala can read the images and PDFs a teacher uploaded to a lesson, so it can build an assessment from
a scanned handout rather than from its filename.

The property to preserve: **attachment bytes are sent to the provider; attachment URLs are not.**
Lesson files live in a private R2 bucket behind signed links, and handing a model the URL would put a
working credential for student-visible material into Anthropic's or OpenAI's logs. `AttachmentReader`
fetches server-side and inlines the bytes. Verified by asserting that neither the base64 nor the
`probe/` object key appears in the JSON the model reads.

Three checks, cheapest first, because each costs more than the last:

1. **Worth fetching?** Extension and the recorded MIME, then the stored object's size via
   `Storage::size()` — no point pulling an 80 MB video out of R2 to discover nobody can read it.
2. **Is it what it claims?** The block's `mime` came from the browser at upload time. The fetched
   bytes are sniffed with `finfo` and **the sniffed type wins.** A file named `.pdf` that is really a
   PNG is sent as an image, not mislabelled as a document. (Tested.)
3. **Does it fit?** Per-file and per-turn byte budgets, a file count, and an image edge limit — all
   in `config/tala.php` under `attachments`.

**Oversized images are refused, not downscaled.** There is no GD and no Imagick on these servers, so
there is nothing to resize with. The skip reason tells the teacher to re-save it smaller, which is
better than a request that fails at the provider.

### A PDF too large to send is reduced, not refused

Refusing an oversized PDF was the wrong answer, and it shipped that way first: a teacher uploaded a
29.8 MB lesson PDF and Tala said it was over the 10 MB limit, which is true and useless. Real lesson
files are that size routinely — a deck exported to PDF carries a photograph on every slide.

So `max_pdf_bytes` now means *what may be sent as a PDF*, and anything larger is opened on the server
by `PdfReader` (`smalot/pdfparser`, pure PHP, needs only zlib) and reduced to the part worth sending.
Which part depends on what the file turns out to be, and that **cannot be told from the name or the
size, so it is measured** — characters recovered per page:

| The file is | Route | What the model gets | What it loses |
|---|---|---|---|
| ≤ `max_pdf_bytes` | sent whole | text, diagrams, tables, layout | nothing |
| a deck or document exported to PDF (has a text layer) | text extracted | the written text, as JSON under `text_extracts` | **diagrams and photographs** |
| scanned or photographed (no text layer) | pages as images | the first `max_pdf_pages` pages, as the model would see a photocopy | the later pages |
| fax-encoded (CCITT/JBIG2) or JPEG 2000 scans | refused | a reason naming the format, and a suggestion | — |

Measured on hand-built fixtures at the production 512 MB `memory_limit`: a 29.9 MB, 30-page scan
yields **0 chars/page** and reads as 8 page images (7.97 MB, 0.3s, 190 MB peak); a 23.7 MB, 24-page
deck yields 154 chars/page and reads as 3,709 characters of text. A 400-page text PDF extracts to
1.27M characters, which is why extracted text has its own character budget and not just a file cap.

Details worth keeping:

- **Page images pass through, they are not re-encoded.** A `DCTDecode` stream *is* a JPEG — the
  scanner's own file, stored verbatim — so it is sent as-is. That covers what scanners and phones
  produce.
- **A raw bitmap is wrapped as a PNG by hand** (`Png::fromPixels`) because there is no GD. The guard
  is arithmetic rather than trust: raw 8-bit pixels are exactly `width × height × components` bytes,
  and if the length does not match, the bytes are something else and the page is skipped rather than
  sent garbled.
- **The file is parsed twice on the scanned route**, once without image content and once with.
  Retaining every embedded image costs several times the file size in memory, and paying that before
  knowing whether the text layer makes it unnecessary is the expensive way round. Two passes over a
  30 MB file measured at a fifth of a second.
- **`max_pdf_fetch_bytes` is this server's limit, not a provider's.** Two schools share one machine
  (see `project_vip_shared_server`); raising it means re-checking headroom against `memory_limit`.
- **Truncation is always named.** "pages 1–8 of 30 were read; the rest were not" goes into `skipped`,
  and the text route's note says outright that diagrams were not read. A model that has only the text
  layer is told not to describe the pictures.
- **A scan spends one file's worth of the per-turn file count**, not eight. `$filesRead` is counted
  separately from `$attachments` for exactly this reason.
- **Text reaches the model as JSON, bytes as inlined attachments** — two different routes out of
  `AttachmentBatch`, which is why `isEmpty()` checks both.

**Skips are data, not log lines.** `AttachmentBatch::$skipped` carries a reason per file into the
tool result, and the prompt tells the model to repeat them. A teacher whose handout was too large
needs to hear that — otherwise the answer quietly omits the material the question was about.

**Cost.** An attachment is the most expensive thing a turn can hold: a PDF page runs roughly a page
of text plus an image of the page. Two things bound it. It is a **separate tool** rather than part of
`get_lesson`, so "what's in my lesson" does not silently pay for every file in it. And attachments
are **never replayed** — `historyForModel()` replays only user and assistant text, so a file is paid
for once, on the turn that asked. Within that turn it persists across tool rounds, which is necessary
and capped by `MAX_TOOL_ROUNDS`.

**Per-provider capability.** `ChatProvider::supportsAttachment()` is asked once per turn and the
answer rides on `ToolContext::$attachmentTypes`. **Both providers read images and PDFs.**

On OpenAI, a PDF is a `file` content part rather than an `image_url` one, and PDF parsing there reads
the text *and* renders each page as an image — so it needs a vision-capable model, gpt-4o or later.
Every OpenAI model on the allowlist in `config/tala.php` qualifies, which is why
`supportsAttachment()` does not branch on the model; if a non-vision model is ever added to that list,
that method is where it has to be excluded.

Wire shapes, all verified by asserting the built message rather than assumed:

```
Anthropic — one user turn, tool_result first (the API requires that):
  [0] tool_result   [1] text  [2] image {source:{type:base64,media_type,data}}
                    [3] text  [4] document {source:{type:base64,media_type:application/pdf,data}}

OpenAI — a tool message takes a string, so files follow as a user turn:
  [0] assistant(tool_calls)  [1] tool
  [2] user[ text,
            image_url {url:"data:image/png;base64,…"},
            file      {filename:"handout.pdf", file_data:"data:application/pdf;base64,…"} ]
```

`filename` on the OpenAI `file` part is what tells that API what it is looking at, so it is not
optional in practice.

Attachments are **not** put inside a `tool_result` block: what that supports varies, whereas an image
or document block in an ordinary user turn is the plainest thing either API does.

**What cannot be read at all:** PowerPoint, Word, Excel, audio, video. The prompt tells Tala to say so
and ask the teacher to describe the content or upload a PDF — never to describe a file from its name.
Office formats are the obvious next step (a `.pptx` is a ZIP of XML; slide text extracts with
`ZipArchive` + `DOMDocument` and no new dependency), and `ext-zip` is **not enabled** in the XAMPP dev
PHP — `php_zip.dll` exists but `extension=zip` is commented out.

A PDF is no longer on that list at any size, only above `max_pdf_fetch_bytes` — see
[the reduction routes](#a-pdf-too-large-to-send-is-reduced-not-refused).

### An assessment "from a lesson" comes from the lesson

`propose_assessment` takes `based_on_lesson`. When it is set, the tool **refuses** unless that
lesson's readable uploads were opened with `read_lesson_material` **in the same turn**.

Two things force that shape rather than something simpler:

- **A tool cannot fetch its own inputs.** By the time `propose_assessment` runs, the model has
  already written the questions. It cannot read the handout and *then* author from it inside one
  call, so the check is necessarily after the fact and blocking: read the files, propose again.
- **Same turn, not same conversation.** Attachments are never replayed (see
  [attachments](#lesson-attachments-the-content-leaves-the-location-does-not)), so on a later turn
  the model no longer sees the handout — only its own earlier summary of it. Questions written from
  that are questions written from a paraphrase, which is the failure this module already had once.

The gate lives on `ToolMemory`, a small mutable object on `ToolContext` recording what the tools did
this turn. It is the mechanism for "one tool requires another ran first"; nothing in it is persisted.

It does **not** fire when there is nothing to read — a text-only lesson, or a school on a model that
cannot read files at all. Blocking there would be a dead end rather than a safeguard.

Provenance is recorded on the proposal and shown on the card as **From lesson** and **Read from**, so
a teacher checking a quiz can see which lesson it came from and which of its files were actually
opened.

Verified: unread upload refuses and creates no proposal; read-then-propose succeeds and records both
filenames; a fresh turn refuses again; text-only lesson proceeds; a lesson that is not theirs refuses;
omitting `based_on_lesson` is unaffected.

### The write path: nothing the model says changes anything

Tala has create, update, delete, publish and unpublish access to a teacher's assessments. It has no
write access to the database. Both of those are true at once, and the gap between them is the
design.

```
model turn                          teacher's browser
──────────                          ─────────────────
propose_assessment ──> tala_assessment_proposals (a row describing an intent)
                                      │
                                      ▼
                              approval card renders
                                      │
                            teacher clicks "Create draft"
                                      │
                                      ▼
                       POST tala/proposals/{id}/apply
                       (tala,manage + subjects,manage)
                                      │
                                      ▼
                              ProposalApplier ──> subject_ecr_items
```

`ProposeAssessmentTool` validates a change and writes a **proposal**. `ProposalApplier` is the only
code that touches `subject_ecr_items`, and the only caller is `TalaProposalController::apply()` — an
ordinary authenticated POST. There is no path from a streamed turn to a gradebook write, so a model
that misreads "no, not that one" as approval leaves an un-clicked card and nothing else.

That is what makes full CRUD defensible rather than reckless: **the model's judgement decides what to
suggest, and a teacher's click decides what happens.**

Five things hold it up, in the order they would be tested:

1. **Two permissions, not one.** `apply` requires `subjects,manage` on top of `tala,manage`.
   `subjects,manage` is what the Assessments screen sits behind, so Tala can never be a route around
   a permission the teacher does not already have. `subject-teacher` holds it; the route was checked
   against `SystemRolePermissions` rather than assumed.
2. **Ownership, twice.** The controller scopes every proposal query to `user_id`, so one teacher
   cannot see or apply another's card even holding both abilities. Then the applier re-resolves the
   target through `AssignedAssessmentScope`, so a teacher who has since lost the subject cannot apply
   an old card either.
3. **A staleness guard.** The proposal stores the target's status, submission count and question
   count at draft time. If any has moved by the time the button is pressed, the apply is **refused** —
   approving "replace these questions" is a different decision once a class has answered them. The
   teacher is told what changed and asks Tala again.
4. **Single use.** `claim()` flips `pending → applied` with a conditional `UPDATE` inside the
   transaction. A second concurrent apply matches zero rows and is rejected, so a double-click cannot
   create two assessments.
5. **Draft is not negotiable.** `subject_ecr_items.status` **defaults to `published`**. A create
   payload sets `draft` explicitly, `status` is not in the tool schema at all, and the applier
   hard-codes it again rather than reading it from the payload. Three places, because forgetting any
   one of them ships a quiz to a class the moment a card is approved.

**Warnings are computed server-side, not written by the model.** A published target, existing
submissions, questions being replaced, an empty assessment being published — each produces a
`notice`/`warning`/`danger` entry the card renders and the prompt tells the model to repeat in
words. The teacher who chose to allow edits to published work sees exactly what that costs before
clicking, per question rather than as a net count: a "one question shorter" edit that also rewords
four others discards the answers to five, and a net count hides that completely.

**Question ids are carried forward server-side.** `AssessmentV2Service::syncQuestions()` reuses a row
when the payload has its id and creates a new one otherwise. The model never sees ids — so without
help, every question in an update would look new, all rows would be replaced, and every student
answer (keyed by question id) would stop matching anything live, *including answers to questions
nobody touched*. `ProposeAssessmentTool::carryIds()` matches retained questions by prompt text and
attaches their ids. This was caught by a test asserting the soft-deleted row count, not by reading
the code.

### Three deliberate omissions

1. **No ids in the tool schemas.** `list_assigned_subjects` takes `search`, `class_section`,
   `academic_year`; the lesson tools take `subject`, `class_section`, `grading_period`, `search` and —
   on `get_lesson` — a `title`. None of them return a row id, and none accept one. A teacher names a
   lesson the way they'd say it out loud, that title is resolved *through* the scope, and a title
   belonging to somebody else's lesson simply does not resolve. There is no identifier for the model
   to place in a later argument and nothing to probe with.
2. **The overview-role widening is not reproduced.** `UserController::getMySubjects()` widens to
   every subject in the institution for principals, institution administrators and department heads.
   That is right for a screen someone opened on purpose and wrong for an assistant: Tala answers about
   the teacher it is talking to, so a principal who also teaches sees their own load and nothing more.
   **If institution-wide visibility is ever wanted, it must be its own tool, described as such, gated
   on its own permission** — not a branch inside this one.
3. **No tool changes school data directly.** Stated on the `TalaTool` interface. Every tool is
   read-only against the records it touches; `propose_assessment` writes a row, but the row is a
   proposal. A tool that mutates a subject, lesson, assessment, grade or attendance record *without a
   teacher's click between the model's decision and the write* does not belong in this layer — and
   grades and attendance are not proposable either, because a wrong grade a teacher waved through is
   a different kind of harm from a wrong quiz question.

### Their records versus your knowledge

This is a guardrail, not a style note, and it was written after a failure in production.

Asked *"for Sincerity what lessons do I have for term 1?"*, Tala — which at the time had no tool that
could read lessons — answered with five plausible Grade 7 Science topics from the DepEd MATATAG
curriculum and presented them as **the teacher's own Term 1 lessons**. Every item was invented. The
teacher's actual saved lessons were something else entirely.

Two things were wrong, and both needed fixing:

1. **A missing tool.** There was no way to read `topics`, so the model had nothing to answer from.
   `list_lessons` and `get_lesson` close that.
2. **A prompt that invited the substitution.** The guidance said *"Follow the DepEd K-12 MATATAG
   Curriculum when the question touches Philippine curriculum content"* — which, read literally, is
   exactly what the model did. Curriculum guidance is now scoped to **drafting new material** and
   explicitly disclaimed as a source for anything already recorded.

The rule now stated in `TalaContext`, and the reason each part of it is there:

- **Three sources, named explicitly**: the system prompt, what a tool returned *this turn*, and what
  the teacher said in the conversation. Everything else is background knowledge — usable, but not a
  source and never presentable as one.
- **No internet, stated as fact.** Tala cannot search, browse, open a link the teacher pastes, or read
  a PDF or a DepEd memo, and it must not say or imply that it did. This is a claim about the system,
  and the code has to keep it true — see [the constraint below](#the-no-internet-claim-is-a-contract).
- **No self-authored citations.** No URLs, memo or order numbers, page references, "according to
  DepEd", competency codes or quoted passages. A fabricated reference is worse than none: it goes into
  a lesson plan and someone asks the teacher to produce it. Material the *teacher* supplied — a code or
  quotation they typed — is theirs and may be reused freely; the ban is on adding references they did
  not give.
- A question about what the teacher *has* is a tool call, every time. Never answered from curriculum
  knowledge.
- **An empty tool result is the answer.** Say nothing is saved and say where they'd create it. Do not
  follow it with what such lessons "usually" contain unless asked — and if asked, label it a
  suggestion.
- **A failed tool result is not permission to answer anyway.** Say the lookup did not work.
- Suggestions and records must be distinguishable in the reply, marked in the sentence that carries
  them ("here's a sequence teachers often use", "this isn't from your records"). A teacher who cannot
  tell them apart will plan around the wrong one.
- **Prefer an honest gap to a confident guess.** No manufactured numbers, dates, titles, names or
  codes to fill a hole.

### The no-internet claim is a contract

Two lines in the prompt — *"You have no internet access"* and *"these are the only tools you have"* —
are assertions about the system rather than instructions to the model, and they are true only because
of how the request is built: `ChatProvider::stream()` receives exactly what
`ToolRegistry::definitions()` returns, every entry is a read against this database, and **neither
provider declares a server-side tool**. No `web_search_*`, no `web_fetch_*`, no code execution.

If a web search or fetch tool is ever added, **rewrite those paragraphs in the same commit.** A model
told it cannot search, that then can, either narrates the search wrongly or declines to use it. The
guardrail check asserts the declared tool names contain nothing matching `/web|fetch|browse|url/`.

The tools carry the same rule in their own payloads, because a tool result is the last thing the model
reads before it writes:

- `description()` on both lesson tools says *"call this — do not answer from general curriculum
  knowledge"* and *"if this returns no lessons, the teacher genuinely has none saved"*.
- An empty `list_lessons` returns a `note` telling the model not to substitute curriculum knowledge —
  plus `lessons_by_quarter`, a count of where their lessons actually are. A bare "none found" invites
  the model to fill the silence, and is also just unhelpful to a teacher who asked about the wrong
  period.
- A miss on `get_lesson` says *"do not describe the contents of a lesson that was not found"*.
- Truncating a long lesson body appends a `note` block saying how many parts were dropped, so the
  model reports the gap instead of assuming what was in it. Truncation is **by block**, never
  mid-sentence — half a paragraph with no marker gets presented as the whole lesson.

Do not soften these when adding a tool. The next missing tool will be filled the same way.

### Verified behaviour

Checked against two teachers across two institutions. Subjects:

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

Lessons:

| Attempt | Result |
|---|---|
| Baseline list, owner | Own lessons only |
| Same institution, different teacher | Empty, with the "none saved" note |
| Same teacher, different institution | Empty |
| `get_lesson` on the exact title, as another teacher | Not found |
| `get_lesson` on the exact title, cross-institution | Not found |
| `subject` / `class_section` filter naming a colleague's subject or section | Empty |
| `grading_period` with no lessons in it | Empty + `lessons_by_quarter` breakdown |
| `grading_period: "Term 1"`, `"Q1"`, `1`, `"99"` | Normalised to `1`; `"99"` treated as absent |
| Junk args (nested array, null, int) | Treated as absent; scope unchanged |
| `get_lesson` with no title / an array title | Error outcome, no query run |
| Ambiguous title matching two lessons | Candidates listed; **no lesson picked** |
| Signed media URL / R2 object path in a lesson body | Never sent to the provider |
| Declared tool names matched against `/web\|fetch\|browse\|url/` | No match — the no-internet claim holds |

Assessments, including the write path:

| Attempt | Result |
|---|---|
| `propose_assessment` create, then count rows before approval | 0 created — nothing exists until the click |
| Apply as a different teacher | Refused; 0 rows created |
| Apply the same proposal twice | Second refused; exactly 1 assessment exists |
| Submission arrives between proposal and click | **Apply refused** with the counts, item untouched |
| Applied create | `status=draft`, `content_version=2`, `academic_year` set, `score` = sum of points |
| `status: "published"` smuggled into the tool input | Ignored — payload is `draft` |
| Perfect student paper on a Tala-written quiz | Full objective marks (verified through `AssessmentScoringService`) |
| Wrong paper | 0 |
| Two choices sharing a first letter (`Melting`/`Mixing`) | Marks correctly — keys are letters, not text |
| Answer not among the choices | Rejected, nothing stored |
| `single_choice` with two answers, or every choice marked correct | Rejected |
| Unsupported question type (`drag_picture`) or assessment type (`other`) | Rejected |
| Create for a subject the teacher is not assigned to | Rejected |
| Subject with several grading components, none named | Rejected, asks the teacher which |
| `grading_period: "9"` | Rejected against the year's period count |
| Update that keeps 1 of 3 questions | 1 row kept with its id, 2 soft-deleted; answer history preserved |
| Editor images in a question prompt | Reported as a count; no signed URL sent to the provider |

Access, in `tests/Feature/TalaAccessTest.php` — a permission boundary, so it lives in the suite
rather than in a scratch run:

| Attempt | Result |
|---|---|
| A teacher before an administrator grants anything | No `tala.*` at all; cannot chat |
| Administrator grants them | `tala.view` + `tala.manage`; can chat |
| Administrator revokes | Cannot chat; **row kept**, with who revoked it and when |
| A role that still stores `tala.manage` from before the change | Stripped — the role confers nothing |
| Administrator with `tala.configure`, no grant | Can open and administer; **cannot chat** |
| A grant at another school | Does not carry across |
| Granting somebody outside the institution | 422, nothing written |
| A teacher granting themselves | 403, nothing written |
| A teacher reading the access list | 403 |
| `PUT tala/credentials` (a teacher's own key) | **404 — the route is gone**, not merely gated |
| `Modules::isValidPermission('tala.view' / 'tala.manage')` | False; `tala.configure` still true |
| `Modules::expand(['tala.configure'])` | Just itself — no manufactured `tala.view` |

Lesson attachments:

| Attempt | Result |
|---|---|
| Read a lesson's files on Anthropic | Image + PDF loaded, `.pptx` skipped with a reason |
| Same lesson on OpenAI | Image + PDF loaded (PDF as a `file` part), `.pptx` skipped |
| Model that reads no files | Filenames reported, nothing fetched, teacher told to describe it |
| base64 or the R2 object key in the model-facing tool JSON | **Neither** — only in the message blocks |
| File named `.pdf` that is really a PNG | Sniffed and sent as an **image**; the recorded MIME loses |
| File missing from the bucket | Skipped, "could not be downloaded"; turn continues |
| File block with no filename | Ignored silently — a broken upload, nothing to say about it |
| Another teacher reading the same lesson's files | No lesson matched, 0 attachments |
| Per-file cap, total cap, file count, image edge | All enforced, each with its own skip reason |
| Lesson with no uploads | Says so, tells the model not to describe material that isn't there |

Large PDFs, against hand-built fixtures at the production 512 MB `memory_limit`:

| Attempt | Result |
|---|---|
| 29.9 MB, 30-page scan (the reported case) | 0 chars/page → **8 page images**, 7.97 MB, 0.3s, 190 MB peak |
| 23.7 MB, 24-page deck with a text layer | 154 chars/page → 3,709 chars of text, 0 bytes sent |
| Same deck, on a model that cannot read PDFs | Still read — the text route needs no provider support |
| 3 KB PDF | Sent whole, so its diagrams survive |
| Scan stored as a raw bitmap, not a JPEG | Wrapped as a PNG by hand; `finfo` and `getimagesize` accept it |
| Model that reads nothing | Filenames only; no fetch, no parse |
| Over `max_pdf_fetch_bytes` | Refused **before downloading**, with both sizes named |
| Text over the character budget | Truncated, and `truncated: true` plus a note saying so |
| `max_pdf_pages` set to 2 | 2 read, and "pages 1–2 of 30 were read; the rest were not" |
| `names()` after reading a scan as pages | The **lesson filename**, not "… (page 3)" — so the `based_on_lesson` gate still matches |

And against a real-world corpus rather than fixtures (`pdf-parse`'s test data — files from actual
generators, PDF 1.4 to 1.7, one using an object stream, one deliberately malformed):

| Attempt | Result |
|---|---|
| 3 valid PDFs, 1.4–1.7, 79 KB – 3.4 MB | All read as text (18.7k–40k chars); the 14-page one truncated and said so |
| A deliberately malformed PDF | "may be damaged, or password-protected"; **nothing thrown** |
| A near-empty PDF using an object stream | Reported as nothing to work from — see below |
| Whole corpus | **0 exceptions**, 54 MB peak |

**A low character count does not prove a file is scanned**, and the messages no longer claim it does.
That near-empty file yields 0 chars here and 22 via pdf.js — it is neither scanned nor text-bearing,
just empty. What the measurement establishes is only that there is not enough text to answer from, so
the pages are worth trying; if those yield nothing either, the report is that the file could not be
read, without a guess at why.

### Other limits in the same layer

- **`ToolRegistry` never throws.** An unknown tool name (models hallucinate them) or a tool that
  blows up returns an error `ToolOutcome`, so the model can say "I could not look that up" instead of
  the turn dying mid-sentence.
- **Registration is explicit** in `ToolRegistry::__construct`, not discovered from the filesystem. A
  tool appearing in Tala's hands should be a line someone wrote on purpose.
- **Round cap.** `MAX_TOOL_ROUNDS = 6` stops a model that keeps re-asking for the same lookup from
  spending a school's budget in a loop. Hitting it is not an error — the text produced still stands.
  Raised from 4 with the lesson tools: survey with `list_lessons`, then open two lessons, and four
  rounds are gone before a word is written.
- **Result caps**, each reported in the payload rather than silently clipped:
  `ListAssignedSubjectsTool::MAX_RESULTS = 60`, `ListLessonsTool::MAX_RESULTS = 100`
  (`truncated` + a note asking the model to narrow), `GetLessonTool::MAX_BODY_CHARS = 8000` and
  `MAX_CANDIDATES = 12`.
- **Attachments are named, never linked.** `LessonText` reports a file's name and MIME type and drops
  its URL and R2 object key. Those are signed links to private media, and this payload is sent to
  Anthropic or OpenAI. Video URLs are kept — they are public links the teacher pasted in.
- **A lesson's HTML is flattened before it is sent.** Markup costs tokens, and a model reading `<p>`
  tags writes them back out.
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

**`tala_assessment_proposals`** — a change to an assessment that nobody has approved.
`institution_id`, `user_id` (the only person who can see or apply it), `conversation_id`,
`message_id` (backfilled after the turn), `action`, resolved `subject_id` / `subject_ecr_id` /
`subject_ecr_item_id`, `payload` (storage-shaped, includes the staleness `guard`), `preview` (the
same content shaped for a human), `warnings`, `summary`, `status`
(`pending` | `applied` | `discarded` | `failed`), `applied_item_id`, `applied_at`, `discarded_at`,
`failure_reason`.

`payload` is `$hidden` on the model: it is the applier's input and has no business in a chat
response. The card reads `preview`, which is the same change with answer keys rendered back to
readable choice text.

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
| `GET` | `tala/access` | `tala.configure` |
| `PUT` | `tala/access` | `tala.configure` |
| `GET` | `tala/institution-credentials` | `tala.configure` |
| `PUT` | `tala/institution-credentials` | `tala.configure` |
| `DELETE` | `tala/institution-credentials/{provider}` | `tala.configure` |
| `GET` | `tala/conversations` | `tala.view` |
| `POST` | `tala/conversations` | `tala.manage` |
| `GET` | `tala/conversations/{id}` | `tala.view` |
| `PATCH` | `tala/conversations/{id}` | `tala.manage` |
| `DELETE` | `tala/conversations/{id}` | `tala.manage` |
| `POST` | `tala/conversations/{id}/messages` | `tala.manage` |
| `GET` | `tala/conversations/{id}/proposals` | `tala.view` |
| `GET` | `tala/proposals/{id}` | `tala.view` |
| `POST` | `tala/proposals/{id}/apply` | `tala.manage` **+ `subjects.manage`** |
| `POST` | `tala/proposals/{id}/discard` | `tala.manage` |

`apply` answers **409** with a teacher-readable message when the suggestion no longer fits the
database — a submission arrived, someone else published it, it was already applied. The client shows
that message rather than a generic failure, because the reason is the actionable part.

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
event: tool    data: {"name":"list_lessons","status":"running"}
event: tool    data: {"name":"list_lessons","status":"done","summary":"6 lessons"}
event: proposal data: {"id":"...","action":"create","status":"pending","preview":{...},"warnings":[...]}
event: delta   data: {"text":"..."}
event: done    data: {"message_id":"...","tokens_in":2400,"tokens_out":75}
event: error   data: {"message_id":"...","message":"..."}
```

Payloads are JSON-encoded specifically so a reply containing newlines cannot break SSE framing.

The `proposal` event comes from `ToolOutcome::$meta`, which the controller reads and the **provider
never sees** — a tool that produces something the UI must render names it there rather than smuggling
it through the tool result the model reads. Cards are pushed mid-turn so they are on screen while the
model is still explaining what it suggested; `message_id` is backfilled once the assistant message
exists, which is what lets a reopened thread draw the card in the right place.

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
  teaching load and their lessons, and see that it read nothing else. Labels come from `TOOL_LABELS` in
  `Transcript.tsx`; a tool with no entry still renders under its wire name, because a missing chip
  would hide the lookup entirely.
- **`ProposalCard` is the approval gate, not a summary.** Every question and every answer key is on
  the card before the button, expanded by default up to ten questions. A teacher approving a quiz is
  taking responsibility for all of it, so "you can see what you are approving" beats a tidy card.
- **Cards are merged by id from two sources**: `streamedProposals` (from the SSE event, so the card
  appears while the reply is still being written) and `useTalaProposals` (the server list, which knows
  what has been applied). The server wins. Cards with a `message_id` render under that message; one
  raised in the current turn has none yet and renders after the last entry.
- **Applying invalidates the assessment caches too**, not just the proposal list — a teacher with the
  Assessments screen open in another tab should not be reading a stale list.

---

## Spend

Every message counts, because every message is on the school's key — there is no longer any other
kind. The cap is per teacher, set alongside the key, and applies to each teacher who has been granted
access.

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
4. Return filters only in `inputSchema()`. No identities. Prefer omitting ids entirely — name rows the
   way a teacher would, and resolve the name through the scope. Read arguments with `ToolInput` rather
   than off `$input` directly; models send arrays and integers where strings were asked for.
5. Register it in `ToolRegistry::__construct`.
6. Mention it in `TalaContext`'s "What you can and cannot see" section, including what it still
   cannot reach.
7. **Make the empty result say so.** A tool that answers "nothing found" and nothing else will be
   filled in from the model's own knowledge and presented as the teacher's record — see
   [Their records versus your knowledge](#their-records-versus-your-knowledge). Return a note saying
   there is none saved, where the teacher would create it, and not to substitute.
8. Cap the result size and report the cap in the payload. Truncate at a boundary the model can see,
   never mid-sentence.
9. Check what leaves the building. Signed URLs, object keys and ids sent as part of a tool result end
   up in a third party's logs.
10. Add a label to `TOOL_LABELS` in `Transcript.tsx`, so the teacher can see the lookup happen.
11. Add the cross-teacher / cross-institution / injected-argument cases to the guardrail checks.

**If the tool would change anything**, it does not write — it proposes, following
`ProposeAssessmentTool` → `tala_assessment_proposals` → a card → an authenticated apply endpoint.
Additionally:

12. Gate the apply endpoint on the permission the equivalent screen requires, on top of
    `tala,manage`. Tala must never be a way around a permission the teacher lacks.
13. Re-resolve the target through its scope **inside the applier**, not just when proposing.
14. Store a staleness guard and refuse an apply whose ground has shifted.
15. Make the claim single-use with a conditional `UPDATE` inside the transaction.
16. Compute the consequences server-side as `warnings`. Do not leave it to the model to notice that
    something is destructive, and do not let a net count hide per-row damage.
17. Check what the underlying write service does with ids — see `carryIds()` for the trap.

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
- **Attachments ride on `ToolOutcome::$meta`, not the tool result.** `meta` never reaches the
  provider as text, which is what keeps megabytes of base64 out of both the model's JSON and the
  `tala_messages` audit row. Add a new attachment-producing tool the same way.
- **A new `ChatProvider` must answer `supportsAttachment()` honestly.** Returning true for a type the
  model cannot read turns a readable lesson into a failed turn; returning false loses capability but
  degrades to an explanation. Prefer false when unverified.

---

## Not yet wired

- **Seven tools.** Six read (`list_assigned_subjects`, `list_lessons`, `get_lesson`,
  `read_lesson_material`, `list_assessments`, `get_assessment`) and one that proposes
  (`propose_assessment`). No class
  records, no attendance, no grades, and not the AI planner's `lesson_plans` /
  `subject_quarter_plans` — a teacher asking "what's my Term 1 schedule" gets lessons, not the
  generated day-by-day plan.
- **Lessons are read-only.** Tala can draft an assessment but not a lesson. Same pattern would
  work; nobody has asked for it.
- **Office formats, audio and video in lesson uploads cannot be read.** `.pptx`/`.docx`/`.xlsx` are
  ZIPs of XML and would extract with `ZipArchive` + `DOMDocument` — no new dependency — which is the
  obvious next step. Legacy binary `.doc`/`.ppt`/`.xls` would need a real library. Audio and video,
  nothing.
- **No extracted-text cache.** Every `read_lesson_material` call re-fetches from R2 and re-sends the
  bytes. Bounded by the caps and by attachments not being replayed across turns, but a teacher asking
  five questions about the same handout pays for it five times. This costs more now that a large PDF
  is parsed on every read: the parse itself is fast (a fifth of a second for 30 MB) but the R2 fetch
  and the 190 MB peak are paid again each time. Keying a cache on the object path and size would fix
  both, and nothing in `PdfReader` depends on being called fresh.
- **Only the first `max_pdf_pages` pages of a scan are read** — 8 by default. A 30-page scanned
  lesson is read as its first 8 pages, which is stated in the result but is still partial material to
  build an assessment from. Raising it costs tokens linearly and hits `max_total_bytes` first.
- **Fax-encoded scans (CCITT, JBIG2) and JPEG 2000 pages cannot be read.** No decoder exists here and
  neither format is one a provider accepts. The skip names the format and suggests exporting from the
  original file instead of scanning it.
- **Neither provider's PDF reading has been exercised against a live key.** The wire format is the
  documented one and is asserted in the checks; whether a given school's model handles a particular
  scanned PDF well is a question only a real run answers.
- **Question types Tala can author are five of the ten the schema allows** — see
  `AssessmentTypes`. `fill_in_the_blanks` is excluded because `num_blanks` is missing from
  `SubjectEcrItemController`'s validation rules and is therefore stripped before storage, so **every
  fill-in-the-blanks question written through the API renders a single blank regardless of its key.**
  That is a bug in the existing write path, not in Tala; fixing it is what would unblock the type.
- **Assessment settings are not proposable** — time limits, attempt caps, pass marks, due dates,
  scheduling, `allow_late_submission`. The teacher sets those on the assessment itself.
- **No proposal expiry or cleanup.** Rows in `tala_assessment_proposals` live as long as their
  conversation. The staleness guard means an old card refuses to apply rather than doing something
  surprising, so this is untidy rather than unsafe.
- **No institution usage screen.** The data is on `tala_messages` (`credential_source`, token counts);
  nothing renders it yet.
- **No retention policy.** Conversations persist until a teacher deletes them.
- **No key validation on save.** Length bounds only — whether a key works is answered the first time
  a teacher sends a message, where the error surfaces in the chat they are already looking at.
- **Institution key config lives in the Tala settings dialog**, not as a Settings tab.
- **Not exercised in a browser** against a live provider key. The wire format, client parser, tool
  scoping and persistence are covered by checks; the rendered screen is not.
