/**
 * 001 - initial SiteTrack schema.
 *
 * Design notes (see README "Decisions" for the long version):
 *
 *  - Project IDs come from a Postgres SEQUENCE. Sequences are concurrency-safe
 *    and never hand out the same value twice (even after a rollback or delete),
 *    which is exactly the "never reused" rule. The PRJ-0042 string is a
 *    generated column derived from the numeric id.
 *
 *  - Task numbers come from a per-project counter (`projects.last_task_number`)
 *    that is incremented with `UPDATE ... RETURNING`. The row lock serialises
 *    concurrent task creation inside one project, and the counter never goes
 *    down, so numbers are never reused.
 *
 *  - Counters are denormalised and kept correct by triggers, so the Projects
 *    and Tasks screens never need to walk the dependency graph:
 *        tasks.open_deps_count   direct dependencies that are not DONE
 *        tasks.dependents_count  tasks that directly depend on this task
 *        projects.tasks_*        task counts by status, and blocked tasks
 *        projects.member_count
 *
 *  - Stock quantities are numeric(14,3) with CHECK (quantity >= 0). The
 *    services also use conditional updates, so a store can never go negative,
 *    even under concurrent deliveries; the CHECK is the last line of defence.
 */
export const initialSchema = {
  id: '001-initial-schema',
  up: /* sql */ `
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Formats a counter as at least four digits: 42 -> 0042, 12345 -> 12345.
-- (lpad alone would truncate numbers longer than four digits.)
CREATE FUNCTION format_seq(n bigint) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END $$;

CREATE TYPE app_role          AS ENUM ('USER', 'STORE_MANAGER', 'SUPER_ADMIN');
CREATE TYPE task_status       AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');
CREATE TYPE invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE delivery_direction AS ENUM ('TO_PROJECT', 'TO_COMPANY');
CREATE TYPE delivery_status   AS ENUM ('IN_TRANSIT', 'DELIVERED', 'REJECTED', 'CANCELLED');

-------------------------------------------------------------------------------
-- Accounts
-------------------------------------------------------------------------------
CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  name          text        NOT NULL,
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  role          app_role    NOT NULL DEFAULT 'USER',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Emails are unique case-insensitively.
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

-- One row per login. Access tokens carry the session id, and every request
-- checks the session is still active, so logout takes effect immediately.
CREATE TABLE sessions (
  id                 uuid PRIMARY KEY,
  user_id            bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at  timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  user_agent         text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-------------------------------------------------------------------------------
-- Projects and membership
-------------------------------------------------------------------------------
CREATE SEQUENCE project_number_seq;

CREATE TABLE projects (
  id                integer PRIMARY KEY DEFAULT nextval('project_number_seq'),
  code              text GENERATED ALWAYS AS ('PRJ-' || format_seq(id)) STORED,
  name              text        NOT NULL,
  planned_start     date        NOT NULL,
  planned_end       date        NOT NULL,
  created_by        bigint      REFERENCES users (id) ON DELETE SET NULL,
  last_task_number  integer     NOT NULL DEFAULT 0,
  member_count      integer     NOT NULL DEFAULT 0,
  tasks_not_started integer     NOT NULL DEFAULT 0,
  tasks_in_progress integer     NOT NULL DEFAULT 0,
  tasks_done        integer     NOT NULL DEFAULT 0,
  tasks_blocked     integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Projects are soft-deleted so delivery history keeps its project reference.
  deleted_at        timestamptz,
  CONSTRAINT projects_dates_chk CHECK (planned_end >= planned_start)
);
ALTER SEQUENCE project_number_seq OWNED BY projects.id;
CREATE INDEX projects_name_trgm ON projects USING gin (name gin_trgm_ops);

CREATE TABLE project_members (
  project_id integer     NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_admin   boolean     NOT NULL DEFAULT false,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
-- "Which projects can this user see?" is the hottest access path.
CREATE INDEX project_members_user_idx ON project_members (user_id, project_id);

CREATE TABLE project_invitations (
  id           bigserial PRIMARY KEY,
  project_id   integer           NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id      bigint            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invited_by   bigint            REFERENCES users (id) ON DELETE SET NULL,
  status       invitation_status NOT NULL DEFAULT 'PENDING',
  created_at   timestamptz       NOT NULL DEFAULT now(),
  responded_at timestamptz,
  read_at      timestamptz
);
-- At most one open invitation per person per project.
CREATE UNIQUE INDEX project_invitations_pending_uq
  ON project_invitations (project_id, user_id) WHERE status = 'PENDING';
-- Notifications screen: newest first for one user, and the unread badge.
CREATE INDEX project_invitations_user_idx ON project_invitations (user_id, created_at DESC, id DESC);
CREATE INDEX project_invitations_unread_idx ON project_invitations (user_id) WHERE read_at IS NULL;

-------------------------------------------------------------------------------
-- Tasks and dependencies
-------------------------------------------------------------------------------
CREATE TABLE tasks (
  id               bigserial PRIMARY KEY,
  project_id       integer     NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  number           integer     NOT NULL,
  code             text GENERATED ALWAYS AS ('PRJ-' || format_seq(project_id) || '-T-' || format_seq(number)) STORED,
  name             text        NOT NULL,
  planned_start    date        NOT NULL,
  planned_end      date        NOT NULL,
  status           task_status NOT NULL DEFAULT 'NOT_STARTED',
  open_deps_count  integer     NOT NULL DEFAULT 0,
  dependents_count integer     NOT NULL DEFAULT 0,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_number_uq UNIQUE (project_id, number),
  CONSTRAINT tasks_dates_chk CHECK (planned_end >= planned_start)
);
CREATE INDEX tasks_project_status_idx ON tasks (project_id, status);
-- Partial indexes that make "late task" counts cheap across all projects.
CREATE INDEX tasks_open_end_idx  ON tasks (project_id, planned_end)   WHERE status <> 'DONE';
CREATE INDEX tasks_unstarted_idx ON tasks (project_id, planned_start) WHERE status = 'NOT_STARTED';
CREATE INDEX tasks_name_trgm ON tasks USING gin (name gin_trgm_ops);

-- "task_id depends on depends_on_id": task_id waits for depends_on_id.
CREATE TABLE task_dependencies (
  task_id       bigint      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  depends_on_id bigint      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  project_id    integer     NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_id),
  CONSTRAINT task_dependencies_no_self_chk CHECK (task_id <> depends_on_id)
);
CREATE INDEX task_dependencies_depends_on_idx ON task_dependencies (depends_on_id);
CREATE INDEX task_dependencies_project_idx ON task_dependencies (project_id);

-------------------------------------------------------------------------------
-- Materials, stores and deliveries
-------------------------------------------------------------------------------
CREATE TABLE materials (
  id         bigserial PRIMARY KEY,
  name       text        NOT NULL,
  category   text        NOT NULL,
  unit       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX materials_name_uq ON materials (lower(name));
CREATE INDEX materials_name_trgm ON materials USING gin (name gin_trgm_ops);
CREATE INDEX materials_category_idx ON materials (category);

-- The company store: exactly one row per material (created with the material).
CREATE TABLE company_stock (
  material_id    bigint PRIMARY KEY REFERENCES materials (id) ON DELETE CASCADE,
  quantity       numeric(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  -- Quantity that left this store and is on its way to projects.
  in_transit_out numeric(14, 3) NOT NULL DEFAULT 0 CHECK (in_transit_out >= 0),
  reorder_point  numeric(14, 3) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  updated_at     timestamptz    NOT NULL DEFAULT now()
);

-- Each project's store. A row appears the first time a material moves in or out.
CREATE TABLE project_stock (
  project_id       integer        NOT NULL REFERENCES projects (id),
  material_id      bigint         NOT NULL REFERENCES materials (id),
  quantity         numeric(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  last_delivery_at timestamptz,
  PRIMARY KEY (project_id, material_id)
);
CREATE INDEX project_stock_material_idx ON project_stock (material_id);

-- Audit trail of stock entering SiteTrack from suppliers.
CREATE TABLE stock_additions (
  id          bigserial PRIMARY KEY,
  material_id bigint         NOT NULL REFERENCES materials (id),
  quantity    numeric(14, 3) NOT NULL CHECK (quantity > 0),
  note        text,
  added_by    bigint         REFERENCES users (id) ON DELETE SET NULL,
  added_at    timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX stock_additions_material_idx ON stock_additions (material_id);

CREATE TABLE deliveries (
  id          bigserial PRIMARY KEY,
  project_id  integer            NOT NULL REFERENCES projects (id),
  direction   delivery_direction NOT NULL,
  status      delivery_status    NOT NULL DEFAULT 'IN_TRANSIT',
  note        text,
  line_count  integer            NOT NULL,
  sent_by     bigint             REFERENCES users (id) ON DELETE SET NULL,
  sent_at     timestamptz        NOT NULL DEFAULT now(),
  -- Who recorded / rejected / cancelled it, and when.
  resolved_by bigint             REFERENCES users (id) ON DELETE SET NULL,
  resolved_at timestamptz,
  CONSTRAINT deliveries_resolution_chk CHECK ((status = 'IN_TRANSIT') = (resolved_at IS NULL))
);
CREATE INDEX deliveries_project_sent_idx ON deliveries (project_id, sent_at DESC, id DESC);
CREATE INDEX deliveries_sent_idx ON deliveries (sent_at DESC, id DESC);
CREATE INDEX deliveries_status_sent_idx ON deliveries (status, sent_at DESC);

CREATE TABLE delivery_lines (
  delivery_id bigint         NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
  material_id bigint         NOT NULL REFERENCES materials (id),
  quantity    numeric(14, 3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (delivery_id, material_id)
);
-- Needed so deleting a material can check for references without a full scan.
CREATE INDEX delivery_lines_material_idx ON delivery_lines (material_id);

-------------------------------------------------------------------------------
-- Triggers that keep the denormalised counters correct
-------------------------------------------------------------------------------

-- projects.member_count
CREATE FUNCTION trg_project_members_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE projects SET member_count = member_count + 1 WHERE id = NEW.project_id;
  ELSE
    UPDATE projects SET member_count = member_count - 1 WHERE id = OLD.project_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER project_members_count
  AFTER INSERT OR DELETE ON project_members
  FOR EACH ROW EXECUTE FUNCTION trg_project_members_count();

-- Adding/removing an edge updates dependents_count on the prerequisite and,
-- when the prerequisite is not DONE yet, open_deps_count on the waiting task.
-- NOTE: the services always delete a task's edges *before* deleting the task,
-- so the prerequisite row is still visible here.
CREATE FUNCTION trg_task_dependencies_counters() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  edge  task_dependencies;
  delta integer;
BEGIN
  IF TG_OP = 'INSERT' THEN edge := NEW; delta := 1; ELSE edge := OLD; delta := -1; END IF;

  UPDATE tasks SET dependents_count = dependents_count + delta
   WHERE id = edge.depends_on_id;

  UPDATE tasks SET open_deps_count = open_deps_count + delta
   WHERE id = edge.task_id
     AND EXISTS (SELECT 1 FROM tasks p WHERE p.id = edge.depends_on_id AND p.status <> 'DONE');
  RETURN NULL;
END $$;
CREATE TRIGGER task_dependencies_counters
  AFTER INSERT OR DELETE ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION trg_task_dependencies_counters();

-- When a task becomes DONE (or stops being DONE) every task that directly
-- waits on it gains/loses one open dependency.
CREATE FUNCTION trg_tasks_propagate_done() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.status = 'DONE') IS DISTINCT FROM (NEW.status = 'DONE') THEN
    UPDATE tasks t
       SET open_deps_count = t.open_deps_count + CASE WHEN NEW.status = 'DONE' THEN -1 ELSE 1 END
      FROM task_dependencies d
     WHERE d.depends_on_id = NEW.id AND t.id = d.task_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER tasks_propagate_done
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_tasks_propagate_done();

-- Per-project task counters (by status, plus blocked) for the Projects screen.
-- A task is blocked when it is not DONE and has at least one open dependency
-- (see TaskRules for why direct dependencies are enough).
CREATE FUNCTION trg_tasks_project_counters() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d_ns integer := 0; d_ip integer := 0; d_done integer := 0; d_blocked integer := 0;
  pid  integer;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    pid       := OLD.project_id;
    d_ns      := d_ns      - (OLD.status = 'NOT_STARTED')::int;
    d_ip      := d_ip      - (OLD.status = 'IN_PROGRESS')::int;
    d_done    := d_done    - (OLD.status = 'DONE')::int;
    d_blocked := d_blocked - (OLD.status <> 'DONE' AND OLD.open_deps_count > 0)::int;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    pid       := NEW.project_id;
    d_ns      := d_ns      + (NEW.status = 'NOT_STARTED')::int;
    d_ip      := d_ip      + (NEW.status = 'IN_PROGRESS')::int;
    d_done    := d_done    + (NEW.status = 'DONE')::int;
    d_blocked := d_blocked + (NEW.status <> 'DONE' AND NEW.open_deps_count > 0)::int;
  END IF;

  IF d_ns <> 0 OR d_ip <> 0 OR d_done <> 0 OR d_blocked <> 0 THEN
    UPDATE projects
       SET tasks_not_started = tasks_not_started + d_ns,
           tasks_in_progress = tasks_in_progress + d_ip,
           tasks_done        = tasks_done + d_done,
           tasks_blocked     = tasks_blocked + d_blocked
     WHERE id = pid;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER tasks_project_counters
  AFTER INSERT OR DELETE OR UPDATE OF status, open_deps_count ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_tasks_project_counters();
`,
};
