/**
 * Bulk seed script: generates a realistic data set entirely inside Postgres
 * with generate_series, which is orders of magnitude faster than inserting
 * row by row from Node.
 *
 * Default volumes match (and slightly exceed) the brief's test scale:
 *   5,000 users · 2,000 projects (5-50 members) · ~50,000 invitations
 *   ~500,000 tasks (10 projects with 3,000) · ~1,000,000+ dependencies
 *   20,000 materials · 400,000 deliveries with ~3,000,000 lines
 *
 * The generated data respects every business rule:
 *   - a task that has started only depends on DONE tasks (see task-rules.ts),
 *   - dependencies point to lower task numbers, so the graph has no cycles,
 *   - every project has at least one project admin,
 *   - at most one pending invitation per (project, user), never for a member,
 *   - stock quantities are never negative.
 */
export interface SeedVolumes {
  users: number;
  projects: number;
  bigProjects: number;
  bigProjectTasks: number;
  /** Average tasks in a regular project. */
  avgTasks: number;
  materials: number;
  deliveries: number;
}

export const DEFAULT_VOLUMES: SeedVolumes = {
  users: 5000,
  projects: 2000,
  bigProjects: 10,
  bigProjectTasks: 3000,
  avgTasks: 240,
  materials: 20000,
  deliveries: 400000,
};

/** All numbers are integers produced by our own code, never user input. */
export function seedSql(v: SeedVolumes): string[] {
  const minTasks = Math.max(1, v.avgTasks - 100);
  const taskSpread = 201;
  // Each project draws its deliveries from a pool of materials (a site does
  // not use all 20,000 catalogue items), keeping project stores realistic.
  const pool = Math.min(300, v.materials);

  // NOTE: the "+ x * 0" terms below reference the outer row on purpose. Without
  // an outer reference Postgres may evaluate a LATERAL subquery only once, and
  // every row would get the same "random" value.
  return [
    // Reproducible "random" data.
    `SELECT setseed(0.4242)`,

    `TRUNCATE users, sessions, projects, project_members, project_invitations, tasks,
              task_dependencies, materials, company_stock, project_stock, stock_additions,
              deliveries, delivery_lines RESTART IDENTITY CASCADE`,

    // ----------------------------------------------------------------- users
    `INSERT INTO users (id, name, email, password_hash, role) VALUES
       (1, 'Sara SuperAdmin', 'superadmin@sitetrack.dev', current_setting('seed.hash'), 'SUPER_ADMIN'),
       (2, 'Omar StoreManager', 'manager@sitetrack.dev', current_setting('seed.hash'), 'STORE_MANAGER'),
       (3, 'Lina User', 'user@sitetrack.dev', current_setting('seed.hash'), 'USER')`,
    `INSERT INTO users (id, name, email, password_hash, role, created_at)
     SELECT g,
            (ARRAY['Ahmed','Fatima','John','Maria','Wei','Aisha','Carlos','Priya','Yusuf','Elena',
                   'Kenji','Nadia','Liam','Sofia','Omar','Hana','Lucas','Zara','Ivan','Leila'])[1 + g % 20]
            || ' ' ||
            (ARRAY['Hassan','Smith','Garcia','Chen','Khan','Silva','Novak','Ali','Brown','Haddad',
                   'Tanaka','Kumar','Rossi','Mendes','Farouk','Kim','Schmidt','Costa','Ibrahim','Lopez'])[1 + (g / 20) % 20],
            'user' || g || '@sitetrack.dev',
            current_setting('seed.hash'),
            (CASE WHEN g % 500 = 0 THEN 'SUPER_ADMIN' WHEN g % 50 = 0 THEN 'STORE_MANAGER' ELSE 'USER' END)::app_role,
            now() - (random() * 1500 || ' days')::interval
       FROM generate_series(4, ${v.users}) g`,

    // -------------------------------------------------------------- projects
    `INSERT INTO projects (id, name, planned_start, planned_end, created_by, created_at)
     SELECT g,
            (ARRAY['Riverside','Harbor','Northgate','Cedar','Skyline','Lakeview','Granite','Oasis','Summit','Palm',
                   'Crescent','Falcon','Marina','Desert Rose','Union','Old Town','Meridian','Westfield','Pearl','Bayfront'])[1 + g % 20]
            || ' ' ||
            (ARRAY['Tower','Mall','Bridge','Hospital','School','Villas','Warehouse','Metro Station','Office Park',
                   'Hotel','Stadium','Residences','Logistics Hub','Clinic','Library'])[1 + (g / 20) % 15]
            || ' - Phase ' || (1 + g % 4),
            s.start, s.start + 120 + floor(random() * 780)::int,
            1 + ((g * 7919 + 104729) % ${v.users}),
            s.start - 30
       FROM generate_series(1, ${v.projects}) g,
            LATERAL (SELECT date '2023-01-01' + floor(random() * 1400 + g * 0)::int AS start) s`,
    `SELECT setval('project_number_seq', ${v.projects})`,

    // --------------------------------------------------------------- members
    // Member i of project p is user 1 + (p*7919 + i*104729) mod users: distinct
    // per project because 104729 is coprime with the user count step.
    `INSERT INTO project_members (project_id, user_id, is_admin, joined_at)
     SELECT p.id, 1 + ((p.id * 7919 + i * 104729) % ${v.users}),
            (i = 1 OR (i = 2 AND p.id % 3 = 0)),
            p.created_at + (i || ' hours')::interval
       FROM projects p,
            LATERAL (SELECT 5 + floor(random() * 46 + p.id * 0)::int AS k) kk,
            LATERAL generate_series(1, kk.k) i
     ON CONFLICT DO NOTHING`,
    // Demo accounts: user@ admin of the biggest project + member of many others,
    // manager@ member of a few.
    `INSERT INTO project_members (project_id, user_id, is_admin)
     SELECT id, 3, id = 1 FROM projects WHERE id = 1 OR id % 40 = 0
     ON CONFLICT (project_id, user_id) DO UPDATE SET is_admin = project_members.is_admin OR EXCLUDED.is_admin`,
    `INSERT INTO project_members (project_id, user_id, is_admin)
     SELECT id, 2, false FROM projects WHERE id % 200 = 7 ON CONFLICT DO NOTHING`,
    `UPDATE projects p SET created_by = m.user_id
       FROM (SELECT DISTINCT ON (project_id) project_id, user_id FROM project_members
              WHERE is_admin ORDER BY project_id, joined_at) m
      WHERE p.id = m.project_id`,

    // ----------------------------------------------------------- invitations
    // Accepted invitations for (most) non-admin members...
    `INSERT INTO project_invitations (project_id, user_id, invited_by, status, created_at, responded_at, read_at)
     SELECT m.project_id, m.user_id, p.created_by, 'ACCEPTED',
            m.joined_at - interval '1 day', m.joined_at, m.joined_at
       FROM project_members m JOIN projects p ON p.id = m.project_id
      WHERE NOT m.is_admin AND (m.user_id + m.project_id) % 5 <> 0`,
    // ...plus pending / rejected / withdrawn ones for people who are not members.
    `INSERT INTO project_invitations (project_id, user_id, invited_by, status, created_at, responded_at, read_at)
     SELECT c.project_id, c.user_id, p.created_by, c.status,
            c.created_at,
            CASE WHEN c.status = 'PENDING' THEN NULL ELSE c.created_at + interval '2 days' END,
            CASE WHEN c.status = 'PENDING' AND random() < 0.6 THEN NULL ELSE c.created_at + interval '1 day' END
       FROM (SELECT 1 + (g * 7) % ${v.projects} AS project_id,
                    1 + ((g::bigint * 2654435761) % ${v.users})::int AS user_id,
                    (CASE WHEN g % 10 < 5 THEN 'PENDING' WHEN g % 10 < 8 THEN 'REJECTED' ELSE 'WITHDRAWN' END)::invitation_status AS status,
                    now() - (random() * 700 || ' days')::interval AS created_at
               FROM generate_series(1, ${Math.round(v.users * 4.5)}) g) c
       JOIN projects p ON p.id = c.project_id
      WHERE NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = c.project_id AND m.user_id = c.user_id)
     ON CONFLICT (project_id, user_id) WHERE status = 'PENDING' DO NOTHING`,
    `INSERT INTO project_invitations (project_id, user_id, invited_by, status, created_at)
     SELECT p.id, 3, p.created_by, 'PENDING', now() - (p.id || ' hours')::interval
       FROM projects p
      WHERE p.id BETWEEN 2 AND 6
        AND NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = 3)
     ON CONFLICT (project_id, user_id) WHERE status = 'PENDING' DO NOTHING`,

    // ----------------------------------------------------------------- tasks
    // Plan per project: task count and how far along it is (from its dates).
    `CREATE TEMP TABLE seed_plan ON COMMIT DROP AS
     SELECT p.id, p.planned_start, p.planned_end, x.n,
            floor(x.n * x.progress * 0.85)::int AS done_cut,
            floor(x.n * x.progress * 0.85)::int + CASE WHEN x.progress > 0 AND x.progress < 1
                                                       THEN ceil(x.n * 0.06)::int ELSE 0 END AS ip_cut
       FROM projects p,
            LATERAL (SELECT CASE WHEN p.id <= ${v.bigProjects} THEN ${v.bigProjectTasks}
                                 ELSE ${minTasks} + floor(random() * ${taskSpread})::int END AS n,
                            greatest(0, least(1, (CURRENT_DATE - p.planned_start)::numeric
                                                 / greatest(1, p.planned_end - p.planned_start))) AS progress) x`,
    `INSERT INTO tasks (project_id, number, name, planned_start, planned_end, status, started_at, completed_at, created_at)
     SELECT sp.id, k,
            (ARRAY['Excavate','Pour','Install','Inspect','Frame','Wire','Plumb','Plaster','Paint','Tile',
                   'Survey','Formwork for','Rebar for','Waterproof','Clad','Insulate','Glaze','Commission'])[1 + k % 18]
            || ' ' ||
            (ARRAY['foundation','level 1 slab','level 2 slab','east wall','west wall','roof','stairwell',
                   'basement','lift shaft','car park','facade','HVAC ducts','electrical risers','windows',
                   'lobby','podium','retaining wall'])[1 + (k / 18) % 17]
            || ' - zone ' || (1 + k % 9),
            a.ts, a.ts + 2 + floor(random() * 18)::int,
            st.status,
            CASE WHEN st.status <> 'NOT_STARTED' THEN a.ts::timestamptz END,
            CASE WHEN st.status = 'DONE' THEN (a.ts + 5)::timestamptz END,
            sp.planned_start - 20
       FROM seed_plan sp,
            generate_series(1, sp.n) k,
            LATERAL (SELECT sp.planned_start
                            + floor((k - 1)::numeric * (sp.planned_end - sp.planned_start) / sp.n)::int AS ts) a,
            LATERAL (SELECT (CASE WHEN k <= sp.done_cut THEN 'DONE'
                                  WHEN k <= sp.ip_cut THEN 'IN_PROGRESS'
                                  ELSE 'NOT_STARTED' END)::task_status AS status) st`,

    // ---------------------------------------------------------- dependencies
    // Each task depends on 0-5 earlier tasks (~2.7 on average) (mostly nearby ones => realistic
    // chains). Pointing only backwards guarantees no cycles. Tasks in progress
    // only depend on DONE tasks, keeping the started-task invariant.
    `INSERT INTO task_dependencies (task_id, depends_on_id, project_id)
     SELECT t.id, d.id, t.project_id
       FROM seed_plan sp
       JOIN tasks t ON t.project_id = sp.id AND t.number > 1
       -- up to 5 candidate dependencies per task, each kept with probability 0.55
       CROSS JOIN generate_series(1, 5) j
       CROSS JOIN LATERAL (SELECT CASE
                       WHEN t.status = 'IN_PROGRESS' THEN
                         CASE WHEN sp.done_cut > 0 THEN 1 + floor(random() * sp.done_cut + j * 0)::int END
                       ELSE greatest(1, t.number - 1 - floor(random() * least(t.number - 1, 40) + j * 0)::int)
                     END AS target) x
       JOIN tasks d ON d.project_id = t.project_id AND d.number = x.target
      WHERE random() < 0.55 AND x.target IS NOT NULL AND x.target <> t.number
     ON CONFLICT DO NOTHING`,

    // ------------------------------------------------------------- materials
    `INSERT INTO materials (id, name, category, unit, created_at)
     SELECT g, b.name || ' - SKU ' || lpad(g::text, 5, '0'), b.category, b.unit, now() - interval '3 years'
       FROM generate_series(1, ${v.materials}) g
       JOIN (SELECT row_number() OVER () - 1 AS idx, * FROM (VALUES
              ('Cement, OPC 50 kg bag','Cement','bag'), ('Cement, PPC 50 kg bag','Cement','bag'),
              ('White cement 25 kg bag','Cement','bag'), ('Ready-mix concrete C30','Concrete','m3'),
              ('Ready-mix concrete C40','Concrete','m3'), ('Sand, washed','Aggregates','tonne'),
              ('Gravel 20 mm','Aggregates','tonne'), ('Crushed stone 40 mm','Aggregates','tonne'),
              ('Rebar 10 mm, 12 m','Steel','piece'), ('Rebar 16 mm, 12 m','Steel','piece'),
              ('Steel I-beam 200 mm','Steel','piece'), ('Binding wire 1.2 mm','Steel','kg'),
              ('Plywood 18 mm sheet','Timber','sheet'), ('Timber 50x100 mm, 4 m','Timber','piece'),
              ('Red clay brick','Bricks & Blocks','piece'), ('Concrete block 200 mm','Bricks & Blocks','piece'),
              ('AAC block 600x200x200','Bricks & Blocks','piece'), ('Copper cable 2.5 mm2','Electrical','m'),
              ('Copper cable 6 mm2','Electrical','m'), ('PVC conduit 25 mm','Electrical','m'),
              ('Distribution board 12-way','Electrical','piece'), ('PVC pipe 110 mm','Plumbing','m'),
              ('PPR pipe 25 mm','Plumbing','m'), ('Gate valve 50 mm','Plumbing','piece'),
              ('Emulsion paint, white','Paint','litre'), ('Primer, alkyd','Paint','litre'),
              ('Ceramic floor tile 600x600','Tiles','m2'), ('Porcelain wall tile 300x600','Tiles','m2'),
              ('Tile adhesive 20 kg','Tiles','bag'), ('Rock wool 50 mm','Insulation','m2'),
              ('XPS board 50 mm','Insulation','m2'), ('Bitumen membrane 4 mm','Waterproofing','roll'),
              ('Float glass 6 mm','Glass','m2'), ('Anchor bolt M12','Fixings','box'),
              ('Drywall screw 35 mm','Fixings','box'), ('Gypsum board 12.5 mm','Drywall','sheet')
            ) AS t(name, category, unit)) b ON b.idx = (g - 1) % 36`,

    // Company store: every material has a row. ~12% out of stock, ~18% low.
    `INSERT INTO company_stock (material_id, quantity, reorder_point)
     SELECT m.id,
            CASE WHEN r < 0.12 THEN 0
                 WHEN r < 0.30 THEN floor(random() * rp)::int + 1
                 ELSE rp + floor(random() * 5000)::int END,
            rp
       FROM materials m,
            LATERAL (SELECT random() + m.id * 0 AS r, 20 + floor(random() * 300 + m.id * 0)::int AS rp) x`,
    `INSERT INTO stock_additions (material_id, quantity, note, added_by, added_at)
     SELECT material_id, quantity, 'Opening balance', 2, now() - interval '3 years'
       FROM company_stock WHERE quantity > 0`,

    // ------------------------------------------------------------ deliveries
    `INSERT INTO deliveries (id, project_id, direction, status, line_count, sent_by, sent_at, resolved_by, resolved_at)
     SELECT g, x.project_id, x.direction, x.status, x.lines,
            CASE WHEN x.direction = 'TO_PROJECT' THEN x.manager ELSE p.created_by END,
            x.sent_at,
            CASE WHEN x.status = 'IN_TRANSIT' THEN NULL
                 WHEN x.status = 'CANCELLED' THEN
                      CASE WHEN x.direction = 'TO_PROJECT' THEN x.manager ELSE p.created_by END
                 WHEN x.direction = 'TO_PROJECT' THEN p.created_by ELSE x.manager END,
            CASE WHEN x.status = 'IN_TRANSIT' THEN NULL ELSE x.sent_at + interval '1 day' END
       FROM generate_series(1, ${v.deliveries}) g
       -- independent random draws per delivery (direction, outcome)
       CROSS JOIN LATERAL (SELECT random() + g * 0 AS r1, random() + g * 0 AS r2) rr
       CROSS JOIN LATERAL (SELECT
              1 + (g::bigint * 7919) % ${v.projects} AS project_id,
              (CASE WHEN rr.r1 < 0.7 THEN 'TO_PROJECT' ELSE 'TO_COMPANY' END)::delivery_direction AS direction,
              (CASE WHEN g > ${v.deliveries} - ${Math.round(v.deliveries / 100)} THEN 'IN_TRANSIT'
                    WHEN rr.r2 < 0.06 THEN 'REJECTED'
                    WHEN rr.r2 < 0.10 THEN 'CANCELLED'
                    ELSE 'DELIVERED' END)::delivery_status AS status,
              1 + floor(random() * 14)::int AS lines,
              -- store managers are users whose id is a multiple of 50 (plus manager@ = 2)
              CASE WHEN g % 7 = 0 THEN 2 ELSE 50 * (1 + g % ${Math.max(1, Math.floor(v.users / 50) - 1)}) END AS manager,
              CASE WHEN g > ${v.deliveries} - ${Math.round(v.deliveries / 100)}
                   THEN now() - (random() * 7 || ' days')::interval
                   ELSE now() - interval '8 days' - ((${v.deliveries} - g)::numeric / ${v.deliveries} * 1100 || ' days')::interval
              END AS sent_at) x
       JOIN projects p ON p.id = x.project_id`,
    // Line i of delivery d uses material 1 + (project offset + (random start + i*7) mod pool):
    // distinct within a delivery (7 is coprime with the pool size), and every
    // project draws from its own pool of materials.
    `INSERT INTO delivery_lines (delivery_id, material_id, quantity)
     SELECT d.id,
            1 + ((d.project_id * 997 + ((r.start + i * 7) % ${pool})) % ${v.materials}),
            CASE WHEN d.direction = 'TO_PROJECT' THEN 10 + floor(random() * 390)::int
                 ELSE 1 + floor(random() * 9)::int END
       FROM deliveries d
       CROSS JOIN LATERAL (SELECT floor(random() * ${pool} + d.id * 0)::int AS start) r
       CROSS JOIN LATERAL generate_series(1, d.line_count) i`,

    // In transit to projects (company side).
    `UPDATE company_stock cs SET in_transit_out = s.q
       FROM (SELECT l.material_id, sum(l.quantity) AS q
               FROM deliveries d JOIN delivery_lines l ON l.delivery_id = d.id
              WHERE d.status = 'IN_TRANSIT' AND d.direction = 'TO_PROJECT'
              GROUP BY l.material_id) s
      WHERE cs.material_id = s.material_id`,

    // Project stores: received minus sent back (never negative).
    `INSERT INTO project_stock (project_id, material_id, quantity, last_delivery_at)
     SELECT d.project_id, l.material_id,
            greatest(0, sum(CASE WHEN d.direction = 'TO_PROJECT' AND d.status = 'DELIVERED' THEN l.quantity
                                 WHEN d.direction = 'TO_COMPANY' AND d.status IN ('DELIVERED','IN_TRANSIT') THEN -l.quantity
                                 ELSE 0 END)),
            max(CASE WHEN d.status IN ('DELIVERED','IN_TRANSIT') THEN coalesce(d.resolved_at, d.sent_at) END)
       FROM deliveries d JOIN delivery_lines l ON l.delivery_id = d.id
      GROUP BY d.project_id, l.material_id`,

    // ------------------------------------------------- denormalised counters
    `UPDATE tasks t SET open_deps_count = s.c
       FROM (SELECT d.task_id, count(*) AS c FROM task_dependencies d
               JOIN tasks p ON p.id = d.depends_on_id WHERE p.status <> 'DONE' GROUP BY d.task_id) s
      WHERE t.id = s.task_id`,
    `UPDATE tasks t SET dependents_count = s.c
       FROM (SELECT depends_on_id, count(*) AS c FROM task_dependencies GROUP BY depends_on_id) s
      WHERE t.id = s.depends_on_id`,
    `UPDATE projects p
        SET last_task_number  = s.max_number,
            tasks_not_started = s.ns, tasks_in_progress = s.ip, tasks_done = s.done, tasks_blocked = s.blocked
       FROM (SELECT project_id, max(number) AS max_number,
                    count(*) FILTER (WHERE status = 'NOT_STARTED') AS ns,
                    count(*) FILTER (WHERE status = 'IN_PROGRESS') AS ip,
                    count(*) FILTER (WHERE status = 'DONE') AS done,
                    count(*) FILTER (WHERE status <> 'DONE' AND open_deps_count > 0) AS blocked
               FROM tasks GROUP BY project_id) s
      WHERE p.id = s.project_id`,
    `UPDATE projects p SET member_count = s.c
       FROM (SELECT project_id, count(*) AS c FROM project_members GROUP BY project_id) s
      WHERE p.id = s.project_id`,

    // Sequences continue after the explicit ids we inserted.
    `SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users))`,
    `SELECT setval(pg_get_serial_sequence('materials', 'id'), (SELECT max(id) FROM materials))`,
    `SELECT setval(pg_get_serial_sequence('deliveries', 'id'), (SELECT max(id) FROM deliveries))`,
  ];
}
