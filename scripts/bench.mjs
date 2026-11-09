// Times every screen's main endpoint against a seeded database.
// Usage: docker compose exec api npm run seed && node scripts/bench.mjs
// API_URL defaults to http://localhost:3000.
const API = `${process.env.API_URL ?? "http://localhost:3000"}/api/v1`;
async function login(email) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Password123!' }) });
  const j = await r.json(); if (!j.data) throw new Error(JSON.stringify(j)); return j.data.accessToken;
}
async function time(label, token, path, runs = 5) {
  const ms = [];
  let status, body;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
    body = await r.json(); status = r.status;
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  const total = body?.data?.meta?.total ?? (Array.isArray(body?.data) ? body.data.length : '');
  console.log(`${label.padEnd(48)} ${String(status).padEnd(4)} median ${ms[Math.floor(runs/2)].toFixed(0).padStart(5)}ms  max ${ms[runs-1].toFixed(0).padStart(5)}ms  total=${total}`);
}
const user = await login('user@sitetrack.dev');
const sa = await login('superadmin@sitetrack.dev');
const mgr = await login('manager@sitetrack.dev');
await time('notifications (user)', user, '/notifications');
await time('projects (user)', user, '/projects?sortBy=lateTasks&order=desc');
await time('projects (superadmin, all 2000, sort late)', sa, '/projects?sortBy=lateTasks&order=desc');
await time('projects (superadmin, sort percentDone)', sa, '/projects?sortBy=percentDone&order=desc&hasLateTasks=true');
await time('projects search', sa, '/projects?search=tower');
await time('tasks PRJ-0001 (3000 tasks)', user, '/projects/PRJ-0001/tasks?sortBy=dependents&order=desc');
await time('tasks PRJ-0001 blocked+late filter', user, '/projects/PRJ-0001/tasks?blocked=true&late=true');
await time('tasks PRJ-0001 search', user, '/projects/PRJ-0001/tasks?search=slab');
await time('task details PRJ-0001-T-2900', user, '/projects/PRJ-0001/tasks/PRJ-0001-T-2900');
await time('task details PRJ-0001-T-0005 (many dependents)', user, '/projects/PRJ-0001/tasks/PRJ-0001-T-0005');
await time('project store PRJ-0001', user, '/projects/PRJ-0001/store?sortBy=lastDelivery&order=desc');
await time('project deliveries PRJ-0001', user, '/projects/PRJ-0001/deliveries');
await time('project deliveries filtered', user, '/projects/PRJ-0001/deliveries?status=DELIVERED&from=2025-01-01');
await time('members PRJ-0001', user, '/projects/PRJ-0001/members');
await time('company stock', mgr, '/company-store/stock?sortBy=status');
await time('company stock low + search', mgr, '/company-store/stock?status=LOW_STOCK&search=cement');
await time('company deliveries (400k)', mgr, '/company-store/deliveries');
await time('company deliveries filtered', mgr, '/company-store/deliveries?direction=TO_COMPANY&status=IN_TRANSIT');
await time('company deliveries by project', mgr, '/company-store/deliveries?projectCode=PRJ-0042');
await time('company deliveries page 1000', mgr, '/company-store/deliveries?page=1000');
await time('materials search', mgr, '/materials?search=rebar');
await time('non-member 404', user, '/projects/PRJ-0002/tasks');
