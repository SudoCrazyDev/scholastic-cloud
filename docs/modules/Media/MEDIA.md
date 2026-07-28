# Module: Media & Uploads

> Context doc for working on anything that **uploads a file or renders one back**.
> Use the [file map](#file-map) to jump to whatever a change touches.
> If you are adding a new upload, read [Adding a new upload](#adding-a-new-upload) — you call
> `MediaUrl::for()`, you never build a URL by hand and never call `temporaryUrl()`.
> If images or PDFs are broken in a deployed tenant, go straight to
> [Diagnosing a broken file](#diagnosing-a-broken-file).

Not a user-facing module and not in the nav. This is the shared layer under assessment images,
lesson attachments, announcement attachments, student submissions, ID card assets, logos, profile
pictures, documents and receipts. Every uploaded byte in the product goes through it.

---

## Core concept

Files live in a **Cloudflare R2** bucket (S3-compatible), on the `r2` disk. The bucket is
**private**, so nothing can link to an object directly — a URL has to be produced for it. There are
two ways, and `MediaUrl::for()` picks based on config:

| `R2_URL` | What is handed out | Who serves the bytes |
| --- | --- | --- |
| set | `https://<public-domain>/<key>` — plain, unsigned | R2 directly |
| unset | `https://<api-origin>/api/media?path=<key>&signature=<hmac>` | **the API**, streaming from R2 |

**`R2_URL` is unset in dev, and the links stored by maranatha are signed `/api/media` ones, so it is
unset there too** — meaning every image and PDF is proxied through PHP. Worth knowing before
optimising anything: an assessment with twenty choice images is twenty PHP requests. Check with
`config('filesystems.disks.r2.url')` rather than assuming.
See [Serving from R2 directly](#serving-from-r2-directly).

**URLs never expire.** They used to be presigned S3 links (`temporaryUrl`), which expire after at
most 7 days, so assessment images and lesson attachments quietly rotted. Nothing may hand out a
presigned URL any more.

### The one distinction that matters

Two kinds of consumer store the result differently, and it decides everything about how a breakage
behaves:

- **Stores the object `path`, re-derives the URL on every read.** Lesson attachments
  (`Topic::contentWithFreshUrls()`), and everything behind a model accessor — logos, profile
  pictures, documents, receipts. These are **self-healing**: fix the code or the config and they
  come back on the next request.
- **Stores the finished URL and only the URL.** Assessment content — question prompt HTML,
  per-choice `choiceImages`, Drag The Picture `cards[].imageUrl`. Nothing re-derives these, so a bad
  URL is **persisted** and has to be rewritten in the database by
  [`media:repair-urls`](#the-repair-command).

When lessons work and assessments don't, this is why. Do not "fix" it by making assessments
re-derive on read — the URL is all that is stored, there is no `path` to re-derive from.

---

## File map

Everything the layer touches. Paths are repo-relative; line numbers drift — search the symbol.

**Core (`api/`)**
- `app/Support/MediaUrl.php` — the whole URL contract. `for()`, `pathFrom()`, `resolveExisting()`,
  `isOurs()`, `clean()`, `deleteByUrl()`, `deleteByPath()`, `forceOrigin()`.
- `app/Http/Controllers/MediaController.php` — `GET /api/media`, streams the object. Holds the
  extension → Content-Type map; anything not listed is served `application/octet-stream`.
- `app/Http/Middleware/ValidateMediaSignature.php` — accepts a **relative or legacy absolute**
  signature. Replaces Laravel's `signed` alias on this route only.
- `routes/api.php` — the `media.show` route. Deliberately **outside `auth.token`**: browsers request
  it from `<img src>` / `<a href>` without the bearer token, so the signature is the access control.
- `app/Console/Commands/RepairExpiringMediaUrls.php` — `media:repair-urls`.
- `config/filesystems.php` — the `r2` disk (`R2_*` env).

**Upload endpoints and key layout** — every `Storage::disk('r2')->put()` in the codebase:

| Route | Controller | Object key | Limit / types |
| --- | --- | --- | --- |
| `POST /subjects-ecr-items/images` | `SubjectEcrItemController::uploadImage` | `{institution}/assessments/images/{uuid}.{ext}` | 10 MB; png jpg jpeg webp gif |
| `DELETE /subjects-ecr-items/images` | `SubjectEcrItemController::deleteImage` | — | — |
| `POST /student-assessments/{id}/upload` | `StudentAssessmentController::uploadAttachment` | `{institution}/student/{student}/assessments/{item}/{attempt}/q{n}/{uuid}.{ext}` | 200 MB video, 25 MB image |
| `POST /topics/{id}/upload` | `TopicController::uploadAttachment` | `{institution}/subjects/{subject}/lessons/{topic}/{uuid}.{ext}` | 100 MB; docs, images, av |
| `POST /announcements/{id}/attachments` | `AnnouncementController::uploadAttachment` | `{institution}/announcements/{announcement}/{uuid}.{ext}` | 100 MB; docs, images, av |
| `POST /id-card-templates/assets` | `IdCardTemplateController::uploadAsset` | `{institution}/id-cards/assets/{uuid}.{ext}` | 10 MB; png jpg jpeg webp svg |
| `POST /students/{id}/documents` | `StudentDocumentController::store` | `{institution}/student/{student}/documents/{uuid}.{ext}` | — |
| `POST /institutions/{id}/logo` | `InstitutionController::uploadLogo` | `institutions/logos/{uuid}.{ext}` | — |
| (student create/update) | `StudentController` | `{institution}/student/{student}/profile/{uuid}.{ext}` | — |
| (receipt submission) | `PaymentReceiptSubmissionController::store` | `{institution}/student/{student}/payment-receipts/{uuid}.{ext}` | — |
| (disbursement receipt) | `DisbursementController` | `{institution}/disbursements/{uuid}.{ext}` | — |

Keys **always end in a UUID filename**, and everything except institution logos is prefixed with the
owning `{institution_id}/`. Two consequences relied on elsewhere: an upload never overwrites another
(every upload is a new object, which is what makes [sharing between copies](#sharing-and-deletion)
safe), and the institution prefix is what scopes delete authorisation — which is why logos, sitting
at a global `institutions/logos/` prefix, have no delete-on-replace path.

**Read paths that produce URLs** — `MediaUrl::for()` callers:
- `Models/Topic.php` — `contentWithFreshUrls()`, re-derives lesson file blocks from `path`.
- `Models/Institution.php`, `Models/Student.php` — logo / profile picture accessors.
- `Models/StudentDocument.php`, `Models/PaymentReceiptSubmission.php`, `Models/DisbursementReceipt.php`.
- `Http/Controllers/StudentAssessmentController.php` — student submission URLs.
- `Http/Controllers/AssessmentGradingController.php` — the same, teacher side.
- `Http/Controllers/AnnouncementController.php`, `Http/Controllers/IdCardTemplateController.php`.

**Frontend (`app/src/`)**
- `pages/MyAssessments/TakeAssessment.tsx` — `ChoiceContent` renders `choiceImages[i]` into
  `<img src>`. **React does not decode HTML entities in attributes**, so a URL that arrives
  containing `&amp;` yields a request with no `signature` parameter and a broken image. Bare URL
  values must never be HTML-escaped.
- `pages/AssignedSubjects/components/QuestionPromptView.tsx` — prompt HTML via
  `dangerouslySetInnerHTML`; here `&amp;` **is** correct, the browser decodes it.
- `pages/MyAssessments/DragPictureQuestion.tsx`, `pages/AssignedSubjects/components/PreviewAssessmentModal.tsx`,
  `pages/AssignedSubjects/components/AssessmentBuilderTab.tsx` (uploads via `subjectEcrItemService.uploadImage`).
- `pages/AssignedSubjects/components/LessonContentViewer.tsx`, `LessonEditor.tsx`.
- `pages/Announcements/*`, `pages/Finance/FinanceAnnouncementsView.tsx`.

**Tests (`api/tests/Feature/`)**
- `PermanentMediaUrlTest.php` — the URL contract: no expiry, scheme independence, origin source,
  domain moves, legacy signatures, tamper rejection, stale bucket segments, unanswerable existence.
- `RepairMediaUrlsTest.php` — the command: what it repairs, what it must not touch, idempotency.
- `StudentLessonFileUrlTest.php` — lesson URLs are re-derived on read.
- `CopyToSubjectsTest.php` — image sharing and reference-counted deletion.

---

## The URL contract

```
https://api.example.com/api/media?path=<url-encoded object key>&signature=<sha256 hmac>
```

Three properties, each of which exists because breaking it caused an outage:

**1. The signature covers the path and query only — never the scheme or host.**
`MediaUrl::for()` calls `URL::signedRoute(..., absolute: false)` and prefixes the origin itself.
Laravel's default absolute signature is validated against `$request->url()`, so it breaks whenever
the origin Laravel *sees* differs from the one the URL was minted under — a proxy that terminates
TLS and forwards plain HTTP, or a move to a new domain. Since assessment content stores the finished
URL, an origin-bound signature is a time bomb. Signing relatively means a stored link survives both.

**2. The origin comes from the incoming request, not `APP_URL`.**
`MediaUrl::origin()` uses `request()->root()`. That is the one origin guaranteed to reach the API —
it is how the caller just got here. `APP_URL` is routinely stale and on these deployments has pointed
at the **frontend**, which answers any unknown path with the SPA's `index.html`, so every image and
PDF rendered as the login page. Console and queue runs have no real request, but Laravel builds one
from `APP_URL` for them, so it stays the fallback there — which is exactly why `media:repair-urls`
takes `--origin=`.

A declared `https` `APP_URL` still upgrades the scheme, so a proxy forwarding plain HTTP cannot
produce `http://` links that a browser blocks as mixed content on an `https` page.

**3. The stored path is resolved against the bucket, not trusted.**
`MediaController` calls `MediaUrl::resolveExisting()`, which tries the key as stored and then the key
without its leading segment. Content repaired out of a path-style presigned URL
(`…/<bucket>/<key>`) can keep the bucket name glued to the front, because `pathFrom()` strips a
bucket segment only when it matches the *currently configured* name.

Each candidate is probed independently and a failed probe is swallowed, because **R2 answers
`HeadObject` for a key that is not there with 403 rather than 404 when the token cannot list the
bucket**, and Flysystem turns "cannot tell" into an exception. Left to propagate that surfaces as a
**500** on a request that should simply have tried the next candidate — which is what every broken
assessment image was actually hitting. Worst case is now a 404.

### Both signature styles are accepted

`ValidateMediaSignature` tries relative, then absolute. Links minted before relative signing are
still sitting in content and keep working on the origin they were signed for. A forged or tampered
URL still gets a 403 — swapping the `path` for another object fails, as does an unsigned request.

---

## The repair command

```bash
php artisan media:repair-urls [--dry-run] [--origin=https://api.example.com]
```

Rewrites upload links baked into stored content: `subject_ecr_items.content`,
`assessment_questions.config` + `.question`, and `topics.content`. It prints the origin it is about
to write into every row before doing anything — read that line, it is the one that goes wrong.

**Run it after any change to `APP_URL`, `APP_KEY`, or the API's domain.**

How it decides what to repair: it compares each link against **what `MediaUrl` would hand out now**.
Enumerating kinds of staleness was tried and was not enough — it missed rotated `APP_KEY`s, absolute
signatures from before relative signing, and, worst, it did nothing when the stored origin happened
to match a wrong `APP_URL`, which is precisely the state a botched repair leaves behind. Everything
reduces to "differs from the canonical form", and that is idempotent by construction: a second run
reports 0.

Two safety properties to preserve if you touch this:

- **It walks every string in the content tree**, so the gate is `MediaUrl::isOurs()` — our media
  route, a public bucket URL, or a presigned object-storage link, and nothing else. Gating on
  `pathFrom()` would be catastrophic: that returns a key for any value carrying a `path` query
  parameter, and for bare strings like a one-letter answer choice. `RepairMediaUrlsTest` pins down
  that question text, answer choices and YouTube embeds come out untouched.
- **The comparison is against the entity-decoded value**, so URLs stored inside prompt HTML (which
  come back escaped) settle after one pass instead of being rewritten forever.

---

## Sharing and deletion

Copying an assessment or lesson **shares its images with the original** rather than duplicating
them. Uploads are immutable — every upload writes a new UUID object — so a copy only diverges when
someone actually replaces a picture, and that replacement creates its own object. Storage grows with
real edits, not with copies.

The flip side is that deletion has to be reference-aware. `SubjectEcrItemController::deleteReplacedUpload()`:

1. Refuses any path outside the caller's own `{institution}/assessments/images/` prefix, so a
   crafted `previous_url` cannot delete someone else's file.
2. Counts referencing assessments via `imageReferenceCount()` and only deletes at **exactly one**.
   The assessment being edited still holds the old URL at that point — its save comes after the
   upload — so one means "nobody else needs it". Two or more means a copy still shows the picture.

`imageReferenceCount()` matches on the **basename**, not the full key: signed URLs percent-encode the
path and the JSON cast escapes slashes, so the raw key never appears verbatim in storage. Filenames
are UUIDs, so this is unambiguous.

---

## Adding a new upload

1. Validate the file (`mimes:` and `max:` — see the table above for house limits).
2. Write to `{institution_id}/<area>/…/{Str::uuid()}.{ext}` on the `r2` disk. Keep the institution
   prefix; delete authorisation depends on it.
3. Return **`MediaUrl::for($path)`** for the URL, and **also return `path`**.
4. Prefer storing the `path` and calling `MediaUrl::for()` on read (a model accessor is the usual
   home). Only store the finished URL if there is genuinely nowhere to put the path — and if you do,
   add the field to `media:repair-urls`.
5. If the file type is new, add its extension to `MediaController::MIME_TYPES`, or browsers get
   `application/octet-stream` and download instead of displaying it.

Never call `Storage::disk('r2')->temporaryUrl()`. Never build a `/api/media` URL by hand.

---

## Diagnosing a broken file

Get the **request URL and status code** for one broken file out of the browser's Network tab first.
The status alone narrows it to one cause:

| Symptom | Cause | Fix |
| --- | --- | --- |
| `200` but `Content-Type: text/html` | URL points at the **frontend** origin; the SPA answered with `index.html` | `APP_URL`/origin wrong — see [property 2](#the-url-contract) |
| `403` | signature invalid: rotated `APP_KEY`, or minted under a different origin with an absolute signature | `media:repair-urls --origin=…` |
| `404` | object genuinely not in the bucket, or path unresolvable | check the key with `Storage::disk('r2')->exists()` |
| `500` | `exists()` could not reach a verdict — R2 returned 403 on `HeadObject` | should no longer happen; `resolveExisting()` swallows it |
| blocked / `(failed)`, nothing in the log | mixed content: `http://` link on an `https://` page | set `APP_URL` to `https://…` |
| broken image, URL contains `&amp;` | a bare URL value got HTML-escaped, so there is no `signature` parameter | fix the producer; bare values are not HTML |

Then confirm the data and the object from the server:

```bash
php artisan tinker --execute="\$i=\App\Models\SubjectEcrItem::find('<item-id>'); echo json_encode(\$i->content['questions'][0] ?? [], 128);"
php artisan tinker --execute="echo var_export(\App\Support\MediaUrl::resolveExisting('<key>'), true);"
php artisan tinker --execute="echo config('app.url').' | '.var_export(config('filesystems.disks.r2.url'), true);"
```

Note that lesson attachments and model-accessor URLs re-derive on read while assessment content does
not — **"lessons fine, assessments broken" means the code is right and the stored data is stale**, so
reach for the repair command rather than editing the URL layer.

### Deploying a URL or domain change

```bash
php artisan optimize:clear      # routes and config are cached; /api/media 404s on a stale route cache
php artisan route:list --path=media
php artisan media:repair-urls --dry-run --origin=https://api.<tenant>.tld
php artisan media:repair-urls --origin=https://api.<tenant>.tld
```

On the shared VIP server, maranatha and mcadavao are separate directories. Run the repair per tenant
from its own directory — it writes that tenant's origin into every row it touches.

---

## Serving from R2 directly

Setting `R2_URL` to a public bucket domain (a custom domain, or the `r2.dev` subdomain, with public
access enabled on the bucket) switches `MediaUrl::for()` to plain public URLs: no signature, no PHP
in the request path, and immune to the whole class of origin problem above. `media:repair-urls` will
migrate stored links over, because a signed media URL differs from the canonical public one.

Consider the trade before doing it: public URLs are **unauthenticated and unguessable-only**. Keys
contain UUIDs, so they are not enumerable, but student documents, payment receipts and submission
uploads would become readable by anyone holding the link, permanently. Assessment images are
low-sensitivity; `{institution}/student/…/documents/` is not. A split — public bucket for assessment
and lesson media, signed route for anything student-personal — is the shape that actually fits, and
is **not implemented**.

---

## Not yet wired / known gaps

- **Trusted proxies are not configured.** `bootstrap/app.php` never calls `trustProxies()`, so behind
  a TLS-terminating proxy Laravel mis-detects both the scheme and the client IP. Media is immune
  (relative signatures, plus the https upgrade), but it still affects anything else deriving a URL or
  logging a client address — including RFID/gate request logging. Fixing it means choosing a proxy
  range; trusting `*` lets clients spoof `X-Forwarded-For`.
- **No cleanup for most areas.** Only assessment images are deleted on replace. Lesson, announcement,
  document, receipt and submission objects are never removed, so the bucket only grows.
- **No per-object authorisation.** A valid signature is sufficient; the route never asks *who* is
  asking. A leaked link to a student document is readable by anyone holding it. Acceptable for
  assessment media, worth revisiting for personal records.
- **Two key layouts exist in production.** Historical objects sit under
  `scholastic-cloud/{institution}/…` (the bucket name as a key prefix); current uploads write
  `{institution}/…`. `resolveExisting()` papers over the difference at read time and
  `media:repair-urls` settles stored paths, but a bulk re-key has never been done.
- **`APP_DEBUG` has been on in production.** A 500 from this route returned a full stack-trace page —
  source, file paths, framework internals — to an unauthenticated caller. Worth asserting in a
  deploy check.
- **Dev and production have shared an R2 bucket and `APP_KEY`.** A locally generated signature came
  out byte-identical to a production one, and this bucket contains a nested copy of the production
  tree. Beyond the confusion that causes while debugging, dev code can write to and delete
  production objects.
