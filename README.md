# SiteTrack API

Backend for **SiteTrack**, a construction project and materials tracker. It covers projects, tasks with
dependencies, the materials catalogue, the company store and project stores, and deliveries between them.

**Stack:** TypeScript · NestJS 12 · PostgreSQL 17 · raw SQL via `node-postgres` · Docker Compose

---

## Run it

```bash
docker compose up
```

That's all. Compose builds the API, starts Postgres, waits until it is healthy, applies the SQL
migrations on boot, and serves:

| What | URL |
|---|---|
| API | `http://localhost:3000/api/v1/...` |
| Interactive API docs (Swagger UI) | `http://localhost:3000/docs` |
| OpenAPI JSON (for client generation) | `http://localhost:3000/docs/openapi.json` |
| Health check | `http://localhost:3000/health` |

### Load data at the brief's scale

```bash
docker compose exec api npm run seed            # empty database
docker compose exec api npm run seed -- --force # wipe and re-seed
```

This generates **5,000 users, 2,000 projects (5 to 50 members each, 10 projects with 3,000 tasks), about 58k
invitations, 507k tasks, 1.34M dependencies, 20k materials, and 400k deliveries with 3.0M lines**
(about 900 MB). Everything is generated inside Postgres with `generate_series`, so it takes **about
40 seconds** on a laptop. `SEED_SCALE=0.05` gives a small data set for quick local work.

The generated data obeys every business rule. A started task only waits on done tasks, there are no
cycles, every project has an admin, and there are no negative stores and no pending invitations for
existing members.

Every seeded account uses the password **`Password123!`**:

| Account | Role | Notes |
|---|---|---|
| `user@sitetrack.dev` | User | Admin of PRJ-0001 (3,000 tasks), member of ~50 projects, has pending invitations |
| `manager@sitetrack.dev` | Company store manager | |
| `superadmin@sitetrack.dev` | SuperAdmin | |

### Tests

```bash
npm install
npm test                                        # unit tests (task rules / graph)
docker compose up -d && npm run test:e2e        # end-to-end against the running API
```

The e2e suite exercises the rules that matter most: 404 for non-members, login that never reveals
whether an email exists, logout and refresh rotation, invitation flow, the "at least one admin" rule,
concurrent task numbering, cycles, the status machine, and concurrent deliveries that must never
drive stock negative.

### Without Docker

```bash
cp .env.example .env    # point DB_* at a Postgres 14+ database
npm install
npm run start:dev
```

---

## Using the API (for the frontend team)

The full contract, with request and response schemas, is in Swagger at `/docs`. The conventions:

- **Auth.** `POST /api/v1/auth/login` returns `accessToken` (JWT, 15 min) and `refreshToken`.
  Send `Authorization: Bearer <accessToken>`. When a call answers **401**, call
  `POST /api/v1/auth/refresh` with the refresh token, then retry. Each refresh returns a *new*
  refresh token, so store it. Sessions slide: an active user is never logged out, and an idle one
  expires after 30 days.
- **Envelope.** Success is `{ "data": ..., "requestId": "..." }`. Lists are
  `data: { items: [...], meta: { page, limit, total, totalPages } }`. Errors are
  `{ statusCode, error, message, details?, path, requestId }`.
- **IDs.** Projects are addressed by code (`PRJ-0042`) and tasks by code (`PRJ-0042-T-0137`).
- **Lists.** Every list takes `page` (from 1), `limit` (max 200), `sortBy`, `order=asc|desc` and
  screen-specific filters. Multi-value filters accept `?status=A,B`.
- **Status codes.** 400 invalid input · 401 not logged in · 403 role not allowed · 404 not found
  *or not yours* · 409 a business rule refused the change (for example, not enough stock, or a
  cycle).

### Endpoints by screen

| Screen | Endpoints |
|---|---|
| 1-2 Log in / Register | `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| 3 Notifications | `GET /notifications` (includes `unreadCount`), `GET /notifications/unread-count`, `POST /notifications/:id/accept`, `/reject`, `/read`, `POST /notifications/read-all` |
| 4 Projects | `GET /projects?search=&hasLateTasks=&sortBy=name\|startDate\|percentDone\|lateTasks`, `POST /projects`, `GET/PATCH/DELETE /projects/:code` |
| 5 Project: Tasks | `GET /projects/:code/tasks?status=&late=&blocked=&from=&to=&search=&sortBy=id\|name\|startDate\|endDate\|dependents`, `POST /projects/:code/tasks` |
| 6 Task details | `GET/PATCH/DELETE /projects/:code/tasks/:taskCode`, `POST .../start`, `.../complete`, `.../reopen`, `POST .../dependencies`, `DELETE .../dependencies/:dependsOnCode` |
| 7 Project: Store | `GET /projects/:code/store?search=&category=&sortBy=name\|quantity\|lastDelivery` |
| 8 Project: Deliveries | `GET /projects/:code/deliveries?direction=&status=&from=&to=`, `POST /projects/:code/deliveries` (send back), `POST .../deliveries/:id/record`, `/reject`, `/cancel` |
| 9 Project: Members | `GET /projects/:code/members`, `PATCH`/`DELETE /projects/:code/members/:userId`, `GET`/`POST /projects/:code/invitations`, `DELETE /projects/:code/invitations/:id` |
| 10 Company store: Stock | `GET /company-store/stock?status=&category=&search=&sortBy=name\|quantity\|status`, `POST /company-store/stock/additions`, `PUT /company-store/stock/:materialId/reorder-point` |
| 11 Company store: Deliveries | `GET /company-store/deliveries?projectCode=&direction=&status=&from=&to=`, `POST /company-store/deliveries`, `POST .../:id/record`, `/reject`, `/cancel`, `GET /company-store/projects` (project picker) |
| Catalogue | `GET /materials`, `GET /materials/categories`, `GET/POST/PATCH/DELETE /materials/:id` |
| Admin | `GET /users`, `PATCH /users/:id/role` (SuperAdmin) |

Task and delivery responses include `allowedActions`, so the UI can show exactly the buttons
that will work right now.

---

## Decisions and why

### Architecture
- **NestJS + raw SQL (no ORM).** The hard parts of this brief are concurrency (stock, IDs, the task
  graph) and aggregate list screens over millions of rows. Those are best expressed directly in SQL:
  row locks, advisory locks, partial indexes, window functions. A thin `DatabaseService` gives
  `query`, `one` and `transaction`. Every value is a `$n` parameter, and sort columns come from
  whitelists, so there is no SQL injection surface.
- **Schema as versioned SQL migrations** (`src/database/migrations`), applied automatically on boot
  under an advisory lock, so several instances can start at once.
- **Global guards:** throttling, then JWT authentication, then app-role authorisation. Every
  route is private unless marked `@Public()`. Project-level access goes through one gate,
  `ProjectAccessService`.

### Authentication and sessions
- **Short-lived access JWTs plus rotating refresh tokens backed by a `sessions` table.** The JWT
  carries the session id, and the auth guard checks on *every request* (one primary-key lookup)
  that the session is still active and loads the user's current role. That gives:
  - logout takes effect immediately, including for the access token in use;
  - a changed app role, or removal from a project, applies on the very next request;
  - an active user is never asked to log in again (the refresh window slides).
- Refresh tokens are random, stored only as SHA-256 hashes, and single-use. Replaying a rotated
  token revokes the whole session (theft detection).
- Passwords are hashed with bcrypt. Login runs bcrypt even for unknown emails and returns the same
  401 message, so neither the response nor its timing reveals whether an email is registered.

### Access control
- Non-members get **404 "Project not found"**, the same response as a non-existent project, for
  the project and everything inside it. Lists, counts and searches are always filtered by
  membership in SQL, never after the fact.
- **SuperAdmins** can read and work in every project, but managing members and invitations is
  limited to the project's admins, as the brief says. A SuperAdmin who needs to manage a project's
  members has to be one of its admins.
- **Materials catalogue:** readable by everyone. Creating, editing and removing materials is
  limited to store managers and SuperAdmins, because new material enters through the company store.
- **App role at registration:** the brief says the role is chosen when registering, so any role can
  be picked. In production I would restrict self-registration to `USER` and let SuperAdmins
  promote people (`PATCH /users/:id/role` already exists).
- Members may remove themselves (leave a project), subject to the at-least-one-admin rule.

### IDs
- **Project IDs** come from a Postgres `SEQUENCE`. It is atomic under concurrency and never hands a
  value out twice, even after rollbacks or deletes. `PRJ-0042` is a generated column. Past 9999 it
  becomes `PRJ-10000` instead of being truncated.
- **Task numbers** come from a per-project counter, `UPDATE projects SET last_task_number =
  last_task_number + 1 RETURNING ...`. The row lock serialises concurrent creation in one project,
  and the counter never decreases, so numbers are never reused after a delete.
- Projects are **soft-deleted**, which keeps delivery history intact. Deleting a project is refused
  while it still holds stock or has deliveries in transit, so stock cannot disappear.

### Task dependencies and status (the interesting part)
- One invariant makes **Blocked** cheap: *if a task has started, everything it waits on
  (transitively) is Done.* It is enforced by refusing every operation that would break it: Start
  requires all direct dependencies done, Reopen requires that no direct dependent has started, and
  a started task can only gain dependencies on Done tasks. Because of it, *"blocked" is equivalent
  to "has a direct dependency that isn't done"*, so no graph walk is needed. The proof is in
  `src/modules/tasks/task-rules.ts`.
- Triggers maintain `open_deps_count` and `dependents_count` per task, plus status and blocked
  counters per project. The Projects and Tasks screens read plain columns.
- **Late** depends on today's date, so it is computed at query time from two partial indexes. It is
  never stored, so it can never be stale. "Today" is the UTC date.
- **Task details** load the project's edges (one indexed query) and run a BFS in memory to get every
  ancestor and descendant with its shortest distance. BFS is linear in tasks plus edges, even in
  diamond-heavy graphs where a recursive SQL CTE would enumerate an exponential number of paths.
- **Cycle detection** uses the same BFS. All graph and status mutations in a project are serialised
  by `pg_advisory_xact_lock(projectId)`, so two concurrent edits cannot each pass the check and
  together create a cycle. Other projects are not affected.

### Stores and deliveries
- `company_stock` has one row per material and also tracks `in_transit_out`, the quantity on its way
  to projects that screen 10 needs. `project_stock` holds one row per project and material.
- Each step (add stock, initiate, record, reject, cancel) is a single transaction. Stock rows are
  locked with `SELECT ... FOR UPDATE` **in material-id order** (no deadlocks), availability is checked
  under the lock, and `CHECK (quantity >= 0)` is the final guard. The e2e test fires parallel
  deliveries at the same stock to prove it never goes negative.
- A delivery always has the company store at one end (`project_id` plus `direction`), so
  project-to-project deliveries are impossible by construction. Deliveries are never edited, only
  moved out of `IN_TRANSIT` once. The sending side may cancel and the receiving side may record or
  reject; anyone else gets 403 or 404.
- Quantities are `numeric(14,3)`, so materials can be counted in tonnes or m³ as well as pieces.
- Supplier additions are logged in `stock_additions` for auditability.

### Performance at scale

Measured with `node scripts/bench.mjs` on the full seed (Docker on a laptop, median of 5 runs):

| Screen / query | Median |
|---|---|
| Projects: user (63 projects), sorted by late tasks | 6 ms |
| Projects: SuperAdmin, all 2,000, sorted by late tasks / % done | 30 ms |
| Tasks of a 3,000-task project, sorted by dependents | 4 ms |
| Tasks filtered by Blocked + Late | 4 ms |
| Task details (all ancestors / descendants with distances) | 20 to 25 ms |
| Project store / project deliveries / members | 2 to 4 ms |
| Company stock (20,000 materials), sorted by status | 13 ms |
| Company deliveries (400k rows, exact total, page 1 or page 1000) | 60 ms |
| Notifications, materials search, non-member 404 | 1 to 4 ms |

- Indexes match the access paths: membership by user, tasks by project and status, partial indexes
  for late tasks, deliveries by `(project, sent_at)` and `(sent_at)`, and trigram GIN indexes for
  `ILIKE` search on names.
- List endpoints paginate in SQL and aggregate child data (dependencies, delivery lines) **only for
  the rows on the current page**.
- Postgres settings in `docker-compose.yml` are tuned for a small shared server.

---

## Trade-offs I accepted

- **One DB lookup per request for auth.** This is what makes instant logout and role or membership
  changes possible. It is a primary-key join and costs well under a millisecond. A cache would need
  invalidation that is harder to get right than it is worth here.
- **Offset pagination.** It is simple for the frontend and supports "page N". Very deep pages on
  the 400k-row company deliveries list get slower. Keyset pagination would fix that if needed.
- **Exact `total` counts** (`count(*) OVER()`). Fine at this scale. On much bigger tables I would
  switch to estimates or "has more".
- **Per-project serialisation of task-graph writes.** It is simple and obviously correct. The
  contention it adds is limited to one project's writers.
- **"Late" is computed at query time** rather than stored, so it is always correct for today's
  date. Sorting all 2,000 projects by late tasks (SuperAdmin view) scans the open-task partial
  index, which is still fast.
- **Seeded project-store quantities** are derived from the generated delivery history (received
  minus sent back, floored at 0) rather than by replaying every delivery in order.

## What I would add with more time

- Keyset pagination for deliveries, plus an `updated_since` parameter for frontend caching.
- Restricting self-registration to `USER`, plus email verification and password reset.
- Notifications as a general table (delivery arrived, task unblocked), pushed over SSE or WebSocket.
- Audit log of who changed what (task status history, membership changes).
- Load tests (k6) in CI against the seeded data set, with p95 latency budgets per screen.
- Integration tests that run in CI against an ephemeral Postgres (Testcontainers).
- Configurable company time zone for "today" instead of UTC.

---

## Project layout

```
src/
  main.ts                    bootstrap, validation, Swagger, security headers
  app.module.ts              modules + global guards
  config/app.config.ts       typed configuration from env vars
  database/
    database.service.ts      pg pool, query/one/transaction helpers
    migrator.ts              forward-only SQL migrations (advisory-locked)
    migrations/              schema, indexes, counter triggers
    seed/                    large-scale data generator
  common/                    auth guards & decorators, DTO helpers, filters, interceptors
  modules/
    auth/ users/             accounts, sessions, roles
    projects/ members/       projects, access gate, members, invitations
    notifications/           invitations inbox
    tasks/                   tasks, dependencies, status machine (task-rules.ts)
    materials/               catalogue
    stores/ deliveries/      company & project stores, deliveries, stock movements
    health/
test/api.e2e-spec.ts         end-to-end tests against the running API
```
