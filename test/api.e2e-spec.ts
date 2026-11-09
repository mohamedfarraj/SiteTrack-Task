/**
 * End-to-end tests against a running API (docker compose up).
 *
 *   API_URL=http://localhost:3000 npm run test:e2e
 *
 * Every test registers fresh accounts, so it can run against a seeded or an
 * empty database without interfering with existing data.
 */
const API = `${process.env.API_URL ?? 'http://localhost:3000'}/api/v1`;
const run = Date.now().toString(36);
let seq = 0;

interface Res<T = any> {
  status: number;
  body: { data: T; message?: string };
}

async function call<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<Res<T>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Res<T>['body'] };
}

async function register(role = 'USER') {
  const email = `e2e-${run}-${++seq}@test.dev`;
  const res = await call('POST', '/auth/register', undefined, {
    name: `E2E ${seq}`,
    email,
    password: 'Password123!',
    role,
  });
  expect(res.status).toBe(201);
  return { ...res.body.data, email, token: res.body.data.accessToken as string };
}

async function newProject(token: string) {
  const res = await call('POST', '/projects', token, {
    name: `E2E project ${run}`,
    plannedStart: '2026-01-01',
    plannedEnd: '2026-12-31',
  });
  expect(res.status).toBe(201);
  return res.body.data.code as string;
}

async function newTask(token: string, project: string, name: string, dependsOn: string[] = []) {
  const res = await call('POST', `/projects/${project}/tasks`, token, {
    name,
    plannedStart: '2026-02-01',
    plannedEnd: '2026-02-10',
    dependsOn,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('SiteTrack API', () => {
  describe('accounts', () => {
    it('never reveals whether an email is registered', async () => {
      const user = await register();
      const wrongPassword = await call('POST', '/auth/login', undefined, { email: user.email, password: 'nope-nope' });
      const unknownEmail = await call('POST', '/auth/login', undefined, {
        email: `x${user.email}`,
        password: 'nope-nope',
      });
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('logout kills the session immediately; refresh tokens rotate', async () => {
      const user = await register();
      expect((await call('GET', '/auth/me', user.token)).status).toBe(200);

      const refreshed = await call('POST', '/auth/refresh', undefined, { refreshToken: user.refreshToken });
      expect(refreshed.status).toBe(200);
      // The old refresh token is single-use; replaying it revokes the session.
      const replay = await call('POST', '/auth/refresh', undefined, { refreshToken: user.refreshToken });
      expect(replay.status).toBe(401);

      const login = await call('POST', '/auth/login', undefined, { email: user.email, password: 'Password123!' });
      const token = login.body.data.accessToken;
      expect((await call('POST', '/auth/logout', token)).status).toBe(200);
      expect((await call('GET', '/auth/me', token)).status).toBe(401);
    });

    it('never returns password hashes', async () => {
      const user = await register();
      const me = await call('GET', '/auth/me', user.token);
      expect(JSON.stringify(me.body)).not.toMatch(/password/i);
    });
  });

  describe('project access', () => {
    it('answers 404 for projects the caller is not a member of, exactly like a missing one', async () => {
      const owner = await register();
      const stranger = await register();
      const code = await newProject(owner.token);

      const hidden = await call('GET', `/projects/${code}`, stranger.token);
      const missing = await call('GET', `/projects/PRJ-9999999`, stranger.token);
      expect(hidden.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(hidden.body.message).toBe(missing.body.message);

      for (const path of ['tasks', 'store', 'deliveries', 'members', 'invitations']) {
        expect((await call('GET', `/projects/${code}/${path}`, stranger.token)).status).toBe(404);
      }
      const list = await call('GET', `/projects?search=${code}`, stranger.token);
      expect(list.body.data.items).toHaveLength(0);
    });

    it('SuperAdmins reach every project', async () => {
      const owner = await register();
      const admin = await register('SUPER_ADMIN');
      const code = await newProject(owner.token);
      expect((await call('GET', `/projects/${code}`, admin.token)).status).toBe(200);
    });

    it('invitation flow, admin rules, and removal effective on the next request', async () => {
      const owner = await register();
      const invitee = await register();
      const code = await newProject(owner.token);

      // Only project admins invite.
      const invite = await call('POST', `/projects/${code}/invitations`, owner.token, { email: invitee.email });
      expect(invite.status).toBe(201);
      const duplicate = await call('POST', `/projects/${code}/invitations`, owner.token, { email: invitee.email });
      expect(duplicate.status).toBe(409);

      // Not a member until accepted.
      expect((await call('GET', `/projects/${code}`, invitee.token)).status).toBe(404);
      const unread = await call('GET', '/notifications/unread-count', invitee.token);
      expect(unread.body.data.unreadCount).toBe(1);

      // Only the invited person can answer.
      expect((await call('POST', `/notifications/${invite.body.data.id}/accept`, owner.token)).status).toBe(404);
      expect((await call('POST', `/notifications/${invite.body.data.id}/accept`, invitee.token)).status).toBe(200);
      expect((await call('GET', `/projects/${code}`, invitee.token)).status).toBe(200);

      // Plain members cannot manage members.
      expect((await call('POST', `/projects/${code}/invitations`, invitee.token, { email: owner.email })).status).toBe(
        403,
      );

      // The last admin cannot step down.
      expect(
        (await call('PATCH', `/projects/${code}/members/${owner.user.id}`, owner.token, { isAdmin: false })).status,
      ).toBe(400);

      // Removal takes effect on the very next request.
      expect((await call('DELETE', `/projects/${code}/members/${invitee.user.id}`, owner.token)).status).toBe(200);
      expect((await call('GET', `/projects/${code}/tasks`, invitee.token)).status).toBe(404);
    });
  });

  describe('tasks', () => {
    it('numbers tasks per project without duplicates under concurrency', async () => {
      const owner = await register();
      const code = await newProject(owner.token);
      const created = await Promise.all(Array.from({ length: 25 }, (_, i) => newTask(owner.token, code, `Task ${i}`)));
      const codes = new Set(created.map((t) => t.code));
      expect(codes.size).toBe(25);
      expect(codes.has(`${code}-T-0001`)).toBe(true);
      expect(codes.has(`${code}-T-0025`)).toBe(true);
    });

    it('enforces dependencies, cycles and the status machine', async () => {
      const owner = await register();
      const code = await newProject(owner.token);
      const a = await newTask(owner.token, code, 'A');
      const b = await newTask(owner.token, code, 'B', [a.code]);
      const c = await newTask(owner.token, code, 'C', [b.code]);
      const path = (t: { code: string }, suffix = '') => `/projects/${code}/tasks/${t.code}${suffix}`;

      // C waits on B (1 step) and A (2 steps) and is blocked.
      const details = (await call('GET', path(c), owner.token)).body.data;
      expect(details.blocked).toBe(true);
      expect(details.allowedActions).toEqual([]);
      expect(details.waitsOn.map((t: any) => [t.code, t.distance])).toEqual([
        [b.code, 1],
        [a.code, 2],
      ]);
      const aDetails = (await call('GET', path(a), owner.token)).body.data;
      expect(aDetails.waitedOnBy.map((t: any) => t.distance)).toEqual([1, 2]);

      // Cycles (direct and indirect) are rejected.
      expect((await call('POST', path(a, '/dependencies'), owner.token, { dependsOn: c.code })).status).toBe(409);
      expect((await call('POST', path(a, '/dependencies'), owner.token, { dependsOn: a.code })).status).toBe(400);

      // Cannot start before what it waits on is done; cannot skip states.
      expect((await call('POST', path(c, '/start'), owner.token)).status).toBe(409);
      expect((await call('POST', path(a, '/complete'), owner.token)).status).toBe(409);
      expect((await call('POST', path(a, '/start'), owner.token)).status).toBe(200);
      expect((await call('POST', path(a, '/complete'), owner.token)).status).toBe(200);
      expect((await call('POST', path(b, '/start'), owner.token)).status).toBe(200);

      // Reopen is refused once a dependent has started.
      expect((await call('POST', path(a, '/reopen'), owner.token)).status).toBe(409);
      expect((await call('POST', path(b, '/complete'), owner.token)).status).toBe(200);
      expect((await call('POST', path(c, '/start'), owner.token)).status).toBe(200);

      const project = (await call('GET', `/projects/${code}`, owner.token)).body.data;
      expect(project.taskCounts).toEqual({ notStarted: 0, inProgress: 1, done: 2 });
      expect(project.blockedTasks).toBe(0);
    });

    it('rejects dependencies across projects', async () => {
      const owner = await register();
      const p1 = await newProject(owner.token);
      const p2 = await newProject(owner.token);
      const other = await newTask(owner.token, p2, 'other');
      const res = await call('POST', `/projects/${p1}/tasks`, owner.token, {
        name: 'x',
        plannedStart: '2026-01-01',
        plannedEnd: '2026-01-02',
        dependsOn: [other.code],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('stores and deliveries', () => {
    it('moves stock atomically and never goes negative under concurrency', async () => {
      const manager = await register('STORE_MANAGER');
      const member = await register();
      const code = await newProject(member.token);

      // Plain users cannot reach the company store.
      expect((await call('GET', '/company-store/stock', member.token)).status).toBe(403);

      const material = (
        await call('POST', '/materials', manager.token, {
          name: `Cement ${run}-${seq}`,
          category: 'Cement',
          unit: 'bag',
        })
      ).body.data;
      expect(
        (
          await call('POST', '/company-store/stock/additions', manager.token, {
            lines: [{ materialId: material.id, quantity: 100 }],
          })
        ).status,
      ).toBe(201);

      const reorder = await call('PUT', `/company-store/stock/${material.id}/reorder-point`, manager.token, {
        reorderPoint: 20,
      });
      expect(reorder.body.data).toMatchObject({ quantity: 100, status: 'AVAILABLE' });

      // 5 parallel deliveries of 30 from a stock of 100: at most 3 succeed.
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          call('POST', '/company-store/deliveries', manager.token, {
            projectCode: code,
            lines: [{ materialId: material.id, quantity: 30 }],
          }),
        ),
      );
      const ok = attempts.filter((r) => r.status === 201);
      expect(ok).toHaveLength(3);
      expect(attempts.filter((r) => r.status === 409)).toHaveLength(2);

      const stock = async () =>
        (await call('GET', `/company-store/stock?search=${encodeURIComponent(material.name)}`, manager.token)).body.data
          .items[0];
      expect(await stock()).toMatchObject({ quantity: 10, inTransitToProjects: 90, status: 'LOW_STOCK' });

      // The project records one, rejects one; the company cancels the third.
      const [d1, d2, d3] = ok.map((r) => r.body.data.id);
      expect((await call('POST', `/projects/${code}/deliveries/${d1}/record`, member.token)).status).toBe(200);
      expect((await call('POST', `/projects/${code}/deliveries/${d2}/reject`, member.token)).status).toBe(200);
      expect((await call('POST', `/projects/${code}/deliveries/${d3}/cancel`, member.token)).status).toBe(403);
      expect((await call('POST', `/company-store/deliveries/${d3}/cancel`, manager.token)).status).toBe(200);
      expect((await call('POST', `/projects/${code}/deliveries/${d1}/record`, member.token)).status).toBe(409);
      expect(await stock()).toMatchObject({ quantity: 70, inTransitToProjects: 0 });

      // Send 10 back to the company store; it records them.
      const back = await call('POST', `/projects/${code}/deliveries`, member.token, {
        lines: [{ materialId: material.id, quantity: 10 }],
      });
      expect(back.status).toBe(201);
      const tooMuch = await call('POST', `/projects/${code}/deliveries`, member.token, {
        lines: [{ materialId: material.id, quantity: 21 }],
      });
      expect(tooMuch.status).toBe(409);
      expect((await call('POST', `/company-store/deliveries/${back.body.data.id}/record`, manager.token)).status).toBe(
        200,
      );

      const projectStore = (await call('GET', `/projects/${code}/store`, member.token)).body.data.items;
      expect(projectStore).toMatchObject([{ materialId: material.id, quantity: 20 }]);
      expect(await stock()).toMatchObject({ quantity: 80 });

      const deliveries = (await call('GET', `/projects/${code}/deliveries`, member.token)).body.data;
      expect(deliveries.meta.total).toBe(4);
      expect(deliveries.items[0].direction).toBe('TO_COMPANY');
    });
  });
});
