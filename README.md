# Mini Task Manager — "Task Ledger"

An internal app for managing simple tasks, with **change history as the main thing**.
It answers the original problem: *task status changes often, but it is not clear who changed what and
changes are hard to trace.*

Status changes are the only special thing here: every transition is recorded, the record cannot be
edited or deleted, and the UI is built so that the question *“who changed what, when”* is answered
even before a single click.

---

## Running it

```bash
npm install        # monorepo: packages/shared, server, web
npm run seed       # 3 actors + 5 sample tasks (optional, but the app will be empty without it)
npm run dev        # server :3000 + web :5173 (single command)
```

Open **http://localhost:5173**. No Docker, no external services, no API keys.

| Command | Purpose |
|---|---|
| `npm test` | unit + integration + component tests (75 tests) |
| `npm run typecheck` | `tsc` for all three packages |
| `npm run e2e` | Playwright: status-change flow through soft delete (separate database) |
| `npm run db:reset` | delete the local database, then reseed sample data |

---

## Why it is designed this way (and what was rejected)

| # | Decision | Rejected alternative | Reason |
|---|---|---|---|
| D1 | **SQLite via `node:sqlite`** (bundled with Node ≥ 22.5) behind a repository interface | JSON file / Postgres / `better-sqlite3` | SQL gives real transactions, triggers, and indexes — yet stays a single file **with no native dependency**, so `npm install` works on any machine. Postgres is prepared as a separate adapter (see below) |
| D2 | **One step** (`to_do → pending → in_progress → done`), written as a transition table | chained `if`s / free-form | The rule is readable in one place, easy to test, and deliberately inflexible |
| D3 | **Soft delete** (`deleted_at`) | hard delete | The task row remains so its history is never orphaned; “the audit log must not be deleted” stays intact |
| D4 | Audit log as a **separate table + snapshot** of title & actor name | embed in the task / store only `task_id` | Entries stay readable even if the task is renamed or deleted. The duplication is intentional |
| D5 | No-op responds with **`200 { changed: false }`** | `409` / `204` | Idempotent: sending the same status is not a client error. `409` is reserved for something genuinely different — an illegal transition — so the two events do not share a code |
| D6 | Actors from a **fixed list, validated server-side** | free-form string | The dropdown is only UX; truth stays in the backend (`422`) |
| D7 | **`packages/shared`** as the single source of types & rules | duplicated types / OpenAPI codegen | FE–BE consistency becomes an inherent property, not manual discipline |
| D8 | FE is **not optimistic**: it uses `{ changed, task, log }` from the server response | optimistic update + rollback | Removes the entire class of “the UI tells a different story than the database” bugs |
| D9 | Tests focus on **invariants** | per-branch UI tests | Here the tests act as documentation of the rules |

### Why `200 changed:false`, not `409`

```
from === to (already in that status)   → 200 { changed:false }   not an error
transition not in the table            → 409 Conflict            (skip / rollback)
```

`409` means *a conflict with the resource state*. Using it for “already like this” forces clients to handle
an “error” path even though nothing is wrong. The response shape is also deliberately uniform (`log: null`
on a no-op), so the frontend has only one code path and status–history can never drift apart.

### Why deleting a task does not write a history entry

The requirement writes an audit-log entry only for **status changes** (per the spec). `DELETE /tasks/:id`
changes the `deleted_at` column, not the status, so there is no new entry — and old entries are not touched
at all. If you want deletions recorded too, that is a small, sensible change: send an `actorId` on `DELETE`
and write a `deleted`-type entry. It is not done yet so the scope stays within the request.

---

## Locked rules (invariants) and where they are tested

| # | Invariant | Evidence |
|---|---|---|
| I1 | Audit-log entries **cannot be edited/deleted** — enforced by a database trigger | `server/test/repo.test.ts` (UPDATE & DELETE rejected) + `DELETE /audit-logs/:id` → 404 |
| I2 | Status changes ⇒ an entry is written, in **one transaction**; if the log write fails ⇒ status is rolled back | `server/test/service.test.ts` (append sabotaged ⇒ status unchanged) |
| I3 | **Idempotent**: `from === to` ⇒ no new entry | `server/test/service.test.ts`, `server/test/api.test.ts`, `web/test/App.test.tsx` |
| I4 | **Exactly one step**; skip/rollback ⇒ `409` | `packages/shared/src/index.test.ts` (every status pair), service, API |
| I5 | A soft-deleted task ⇒ gone from the list & `404`, but **its history is still readable** | `server/test/api.test.ts`, `e2e/task-ledger.spec.ts` |
| I6 | Validation order is fixed: `400 → 404 → 422 → 200 changed:false → 409` | `server/test/api.test.ts` |

---

## API

| Method | Path | Success | Otherwise | Notes |
|---|---|---|---|---|
| GET | `/actors` | 200 | — | fixed actor list (used by the dropdown) |
| GET | `/tasks` | 200 | — | `{ tasks, totalEntries }`; deleted tasks are excluded |
| POST | `/tasks` | 201 | 400, 422 | requires `title` + `actorId`; immediately writes a “created” entry |
| GET | `/tasks/:id` | 200 | 404 | 404 also for an already-deleted task |
| PUT | `/tasks/:id/status` | 200 | 400, 404, 409, 422 | `{ changed, task, log }` |
| GET | `/tasks/:id/audit-logs` | 200 | 404 | ascending chronological; **still 200** for a soft-deleted task |
| DELETE | `/tasks/:id` | 204 | 404 | soft delete; history is not touched |

There is no `PUT`/`DELETE` for `/audit-logs` — their absence is **a choice**, not an oversight.

Example:

```bash
curl localhost:3000/tasks
curl -X PUT localhost:3000/tasks/TK-1042/status \
  -H 'Content-Type: application/json' \
  -d '{"to":"in_progress","actorId":"john.doe"}'
```

---

## Code structure

```
mini-task-manager/
├── packages/shared/          single source of truth: statuses, transitions, actors, DTOs, zod schemas
│   └── src/index.ts
├── server/
│   └── src/
│       ├── routes/tasks.ts        HTTP + error mapping only (no business rules)
│       ├── services/taskService.ts ALL domain rules (validation order, idempotency, transactions)
│       ├── repos/sqlite.ts        schema + append-only triggers + queries (swappable for another adapter)
│       ├── errors.ts              domain errors → single place that maps them to HTTP codes
│       └── seed.ts                predictable sample data (fixed ids & times)
├── web/
│   └── src/
│       ├── App.tsx                screen state: list, filters, dialogs, toast
│       ├── api/client.ts          fetch wrapper (translates ErrorBody → ApiError)
│       └── components/            StatusLadder, TaskRow, AuditDrawer, Dialogs, Toast
├── e2e/task-ledger.spec.ts    real browser flow + API checks
└── design/                    approved mockups (design/task-ledger.html, design/screens/)
```

Layered rules: **routes** know nothing about the rules, **services** know nothing about SQL, **repos** know
nothing about HTTP. Storage is synchronous (`node:sqlite`), so there is no pretend `async` in the domain layer.

---

## Non-Goals (deliberately not done)

- Auth, roles, permissions, multi-tenant.
- Editing the title/description after a task is created — only the status changes.
- Drag & drop status (contradicts the one-step rule).
- Postgres, deployment, CI, pagination, i18n, dark mode, notifications, comments, attachments.

---

## If Postgres is ever needed

The entire domain only knows three interfaces (`ActorRepository`, `TaskRepository`, `AuditLogRepository`)
plus one `transaction` operation. So adding Postgres means **adding one adapter file**
(e.g. `server/src/repos/postgres.ts`), copying `SCHEMA_SQL` into a migration, and changing one line in
`server/src/index.ts`. The service, routes, invariant tests, and frontend need no changes.

The database-side feature that is actually strongest when moving to Postgres: `REVOKE UPDATE, DELETE ON audit_logs FROM app_role`
as a replacement for the triggers currently used in SQLite.

---

## Look & feel

The “Task Ledger” visual direction (editorial-swiss, light) was approved as a mockup before any code was written:
`design/task-ledger.html` and `design/screens/60-ledger-*.png` (list, history, status flow, rules, mobile,
data & contracts, plus the design specification). The finished app follows that mockup, including the
**4-step ladder** on each row that shows the status machine openly.
