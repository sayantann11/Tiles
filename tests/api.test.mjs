// API tests: starts the dev server on an in-memory DB and checks auth, sync, numbering, roles, sharing.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 8899;
// API_BASE=http://127.0.0.1:8788 runs the same tests against `wrangler pages dev` (real Cloudflare runtime, fresh local D1)
const base = process.env.API_BASE || `http://localhost:${PORT}`;
const srv = process.env.API_BASE ? { kill() { } } : spawn(process.execPath, ['dev/server.mjs', '--port', String(PORT), '--db', ':memory:'], { stdio: ['ignore', 'pipe', 'inherit'] });
if (!process.env.API_BASE) await new Promise((res, rej) => { srv.stdout.on('data', d => String(d).includes('dev server') && res()); setTimeout(() => rej(new Error('server did not start')), 8000); });

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n', e); srv.kill(); process.exit(1); }
};
const call = async (method, p, body, token) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

let owner, staff, shop2;
await test('health', async () => { const r = await call('GET', '/api/health'); assert.equal(r.status, 200); assert.equal(r.body.ok, true); });
await test('signup validates', async () => {
  assert.equal((await call('POST', '/api/signup', { shopName: '', name: 'A', username: 'abc', password: 'secret1' })).status, 400);
  assert.equal((await call('POST', '/api/signup', { shopName: 'S', name: 'A', username: 'abc', password: '123' })).status, 400);
  assert.equal((await call('POST', '/api/signup', { shopName: 'S', name: 'A', username: 'a b', password: 'secret1' })).status, 400);
});
await test('signup + duplicate username', async () => {
  const r = await call('POST', '/api/signup', { shopName: 'Balaji Tiles', name: 'Rajesh', username: '9876543210', password: 'secret12' });
  assert.equal(r.status, 201); assert.ok(r.body.token); assert.equal(r.body.user.role, 'owner');
  owner = r.body.token;
  assert.equal((await call('POST', '/api/signup', { shopName: 'X', name: 'Y', username: '9876543210', password: 'secret12' })).status, 409);
});
await test('login wrong / right', async () => {
  assert.equal((await call('POST', '/api/login', { username: '9876543210', password: 'nope' })).status, 401);
  assert.equal((await call('POST', '/api/login', { username: 'nobody', password: 'nope' })).status, 401);
  const r = await call('POST', '/api/login', { username: ' 9876543210 ', password: 'secret12' });
  assert.equal(r.status, 200); assert.equal(r.body.shop.name, 'Balaji Tiles');
});
await test('auth required', async () => {
  assert.equal((await call('GET', '/api/sync?since=0')).status, 401);
  assert.equal((await call('GET', '/api/sync?since=0', null, owner + 'x')).status, 401);
});
await test('initial pull has settings', async () => {
  const r = await call('GET', '/api/sync?since=0', null, owner);
  assert.equal(r.status, 200);
  assert.equal(r.body.changes[0].c, 'settings');
  assert.equal(r.body.changes[0].d.shopName, 'Balaji Tiles');
});
await test('push assigns invoice numbers per FY, keeps them on edit', async () => {
  const r = await call('POST', '/api/sync', { changes: [
    { c: 'products', id: 'p1', d: { name: 'Statuario', cost: 90, rate: 120 } },
    { c: 'invoices', id: 'i1', d: { date: '2026-11-20', total: 1000 } },
    { c: 'invoices', id: 'i2', d: { date: '2026-11-21', total: 2000 } },
    { c: 'invoices', id: 'i3', d: { date: '2026-02-10', total: 50 } },
    { c: 'payments', id: 'r1', d: { date: '2026-11-21', amount: 500, dir: 'in' } },
    { c: 'payments', id: 'r2', d: { date: '2026-11-21', amount: 100, dir: 'out' } },
  ] }, owner);
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.body.applied.map(x => [x.id, x]));
  assert.equal(by.i1.d.no, 'INV/26-27/0001');
  assert.equal(by.i2.d.no, 'INV/26-27/0002');
  assert.equal(by.i3.d.no, 'INV/25-26/0001');
  assert.equal(by.r1.d.no, 'RCPT/26-27/0001');
  assert.equal(by.r2.d.no, 'PAY/26-27/0001');
  assert.equal(by.p1.d.no, undefined);
  assert.equal(by.i1.d.createdBy, 'Rajesh');
  const e = await call('POST', '/api/sync', { changes: [{ c: 'invoices', id: 'i1', d: { date: '2026-11-20', total: 1100, no: 'HACK' } }] }, owner);
  assert.equal(e.body.applied[0].d.no, 'INV/26-27/0001');
  assert.equal(e.body.applied[0].d.total, 1100);
});
await test('incremental pull', async () => {
  const all = await call('GET', '/api/sync?since=0', null, owner);
  const seq = all.body.seq;
  await call('POST', '/api/sync', { changes: [{ c: 'leads', id: 'l1', d: { name: 'Arjun' } }] }, owner);
  const inc = await call('GET', '/api/sync?since=' + seq, null, owner);
  assert.equal(inc.body.changes.length, 1);
  assert.equal(inc.body.changes[0].id, 'l1');
  const pg = await call('GET', '/api/sync?since=0&limit=2', null, owner);
  assert.equal(pg.body.changes.length, 2); assert.equal(pg.body.more, true);
});
await test('delete is a tombstone', async () => {
  await call('POST', '/api/sync', { changes: [{ c: 'leads', id: 'l1', d: { name: 'Arjun' }, del: true }] }, owner);
  const r = await call('GET', '/api/sync?since=0', null, owner);
  const l = r.body.changes.find(x => x.id === 'l1');
  assert.equal(l.del, true);
});
await test('bad input rejected', async () => {
  assert.equal((await call('POST', '/api/sync', { changes: [{ c: 'hack', id: 'x', d: {} }] }, owner)).status, 400);
  assert.equal((await call('POST', '/api/sync', { changes: [{ c: 'leads', id: '../x', d: {} }] }, owner)).status, 400);
  assert.equal((await call('POST', '/api/sync', { changes: [{ c: 'settings', id: 'other', d: {} }] }, owner)).status, 400);
});
await test('owner adds staff; staff limits', async () => {
  const a = await call('POST', '/api/users', { name: 'Suresh', username: 'suresh', password: 'staff123', role: 'staff' }, owner);
  assert.equal(a.status, 201);
  const l = await call('POST', '/api/login', { username: 'suresh', password: 'staff123' });
  staff = l.body.token; assert.equal(l.body.user.role, 'staff');
  assert.equal((await call('GET', '/api/users', null, staff)).status, 403);
  assert.equal((await call('POST', '/api/sync', { changes: [{ c: 'products', id: 'p2', d: { name: 'x' } }] }, staff)).status, 403);
  assert.equal((await call('POST', '/api/sync', { changes: [{ c: 'settings', id: 'shop', d: {} }] }, staff)).status, 403);
  const ok = await call('POST', '/api/sync', { changes: [{ c: 'invoices', id: 'i9', d: { date: '2026-11-22' } }] }, staff);
  assert.equal(ok.status, 200); assert.equal(ok.body.applied[0].d.no, 'INV/26-27/0003'); assert.equal(ok.body.applied[0].d.createdBy, 'Suresh');
  const pull = await call('GET', '/api/sync?since=0', null, staff);
  const p1 = pull.body.changes.find(x => x.id === 'p1');
  assert.equal(p1.d.cost, undefined); assert.equal(p1.d.rate, 120);
});
await test('deactivate staff signs them out', async () => {
  const list = await call('GET', '/api/users', null, owner);
  const s = list.body.users.find(u => u.username === 'suresh');
  await call('PATCH', '/api/users/' + s.id, { active: false }, owner);
  assert.equal((await call('GET', '/api/me', null, staff)).status, 401);
  assert.equal((await call('POST', '/api/login', { username: 'suresh', password: 'staff123' })).status, 403);
});
await test('change own password needs current', async () => {
  const me = await call('GET', '/api/me', null, owner);
  assert.equal((await call('PATCH', '/api/users/' + me.body.user.id, { password: 'newpass1', current: 'wrong' }, owner)).status, 400);
  const r = await call('PATCH', '/api/users/' + me.body.user.id, { password: 'newpass1', current: 'secret12' }, owner);
  assert.equal(r.status, 200); assert.ok(r.body.token);
  assert.equal((await call('GET', '/api/me', null, owner)).status, 401);
  owner = r.body.token;
  assert.equal((await call('GET', '/api/me', null, owner)).status, 200);
});
await test('shops are isolated', async () => {
  const r = await call('POST', '/api/signup', { shopName: 'Other Shop', name: 'B', username: 'other', password: 'other123' });
  shop2 = r.body.token;
  const p = await call('GET', '/api/sync?since=0', null, shop2);
  assert.equal(p.body.changes.length, 1);
  const i = await call('POST', '/api/sync', { changes: [{ c: 'invoices', id: 'i1', d: { date: '2026-11-20' } }] }, shop2);
  assert.equal(i.body.applied[0].d.no, 'INV/26-27/0001');
  const own = await call('GET', '/api/sync?since=0', null, owner);
  assert.equal(own.body.changes.find(x => x.id === 'i1').d.total, 1100);
});
await test('numbering start can be set', async () => {
  const r = await call('POST', '/api/counters', { kind: 'invoices', next: 501, date: '2026-11-25' }, owner);
  assert.equal(r.status, 200);
  const i = await call('POST', '/api/sync', { changes: [{ c: 'invoices', id: 'i10', d: { date: '2026-11-25' } }] }, owner);
  assert.equal(i.body.applied[0].d.no, 'INV/26-27/0501');
});
await test('share link + public view', async () => {
  await call('POST', '/api/sync', { changes: [
    { c: 'settings', id: 'shop', d: { shopName: 'Balaji Tiles', gstin: '24ABCDE1234F1Z5', upi: 'balaji@upi' } },
    { c: 'payments', id: 'r5', d: { date: '2026-11-20', amount: 600, invoiceId: 'i1', dir: 'in' } },
    { c: 'invoices', id: 'i1', d: { date: '2026-11-20', total: 1100, lines: [{ productId: 'p1', qty: 2 }] } }
  ] }, owner);
  const s = await call('POST', '/api/share', { c: 'invoices', id: 'i1' }, owner);
  assert.equal(s.status, 200);
  const again = await call('POST', '/api/share', { c: 'invoices', id: 'i1' }, owner);
  assert.equal(again.body.token, s.body.token);
  const pub = await call('GET', '/api/public/' + s.body.token);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.doc.no, 'INV/26-27/0001');
  assert.equal(pub.body.shop.upi, 'balaji@upi');
  assert.equal(pub.body.paid, 600);
  assert.equal(pub.body.products.p1.cost, undefined);
  assert.equal((await call('GET', '/api/public/doesnotexist123')).status, 404);
});
await test('audit log', async () => {
  const r = await call('GET', '/api/audit', null, owner);
  assert.ok(r.body.items.length > 5);
  assert.ok(r.body.items.some(i => i.label === 'INV/26-27/0001'));
});
await test('lockout after repeated wrong passwords', async () => {
  for (let i = 0; i < 8; i++) await call('POST', '/api/login', { username: 'other', password: 'bad' });
  assert.equal((await call('POST', '/api/login', { username: 'other', password: 'other123' })).status, 429);
});

srv.kill();
console.log(`\nAPI: ${passed} tests passed`);
