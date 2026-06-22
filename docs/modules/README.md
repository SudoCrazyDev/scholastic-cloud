# Module Docs

Context docs for individual feature modules. Read the relevant file before working on or
integrating with a module — each one covers its data model, API, frontend, and how other
modules should consume its data.

## Index
- [Staff Schedules](STAFF_SCHEDULES.md) — HRIS. Reusable schedule templates (weekly hours + lunch),
  assigned to staff (one per staff), plus an institution calendar of holidays & events.

## Conventions
- One file per module, named in `SCREAMING_SNAKE_CASE.md`.
- Keep an **Integration** section showing how other modules pull data from this one.
- Note anything **not yet wired** so future work doesn't assume it exists.
