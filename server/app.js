// TileDesk API: platform-neutral (Web Request/Response + a D1-compatible `env.DB`).
// Runs on Cloudflare Pages Functions in production and on Node (dev/server.mjs) for local work and tests.

import { SCHEMA } from './schema.js';

const COLLS = new Set(['settings', 'products', 'lots', 'parties', 'invoices', 'quotes', 'returns', 'purchases', 'payments', 'adjustments', 'expenses', 'leads']);
const STAFF_DENY = new Set(['settings', 'products', 'lots', 'purchases']);
const NUMBERED = { invoices: 'INV', quotes: 'QT', returns: 'CN', purchases: 'PUR', payments: null };
const ROLES = new Set(['owner', 'manager', 'staff']);
const TOKEN_DAYS = 90;
const PBKDF2_ITER = 100000;
const enc = new TextEncoder();

/* ---------------- helpers ---------------- */
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra }
});
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS'
};
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const now = () => Date.now();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = (n = 16) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const newId = p => p + Date.now().toString(36) + rand(6).replace(/[-_]/g, '').slice(0, 6);
const cleanUser = s => String(s || '').trim().toLowerCase();
const fyOf = date => {
  const d = /^\d{4}-\d{2}-\d{2}/.test(date || '') ? new Date(date.slice(0, 10) + 'T12:00:00Z') : new Date();
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const s = m >= 3 ? y : y - 1;
  return String(s % 100).padStart(2, '0') + '-' + String((s + 1) % 100).padStart(2, '0');
};

async function readJson(req, max = 2_000_000) {
  const text = await req.text();
  if (text.length > max) fail(413, 'Request too large');
  try { return text ? JSON.parse(text) : {}; } catch { fail(400, 'Invalid JSON'); }
}

/* ---------------- crypto ---------------- */
async function hashPass(pw, salt = rand(16), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${salt}$${b64u(bits)}`;
}
async function checkPass(pw, stored) {
  const [, iter, salt, hash] = String(stored).split('$');
  const again = await hashPass(pw, salt, +iter);
  const a = again.split('$')[3];
  if (a.length !== hash.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signToken(secret, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return body + '.' + b64u(sig);
}
async function verifyToken(secret, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(sig), enc.encode(body));
  if (!ok) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return p.e > now() ? p : null;
  } catch { return null; }
}

/* ---------------- schema + secret ---------------- */
let ready = null;
async function init(env) {
  if (!ready) ready = (async () => {
    const stmts = SCHEMA.split(';').map(s => s.trim()).filter(Boolean).map(s => env.DB.prepare(s));
    await env.DB.batch(stmts);
    let secret = env.AUTH_SECRET;
    if (!secret) {
      const row = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('secret').first();
      if (row) secret = row.v;
      else {
        secret = rand(32);
        await env.DB.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').bind('secret', secret).run();
        secret = (await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('secret').first()).v;
      }
    }
    return { secret };
  })().catch(e => { ready = null; throw e; });
  return ready;
}

async function auth(req, env, cfg) {
  const h = req.headers.get('authorization') || '';
  const p = await verifyToken(cfg.secret, h.replace(/^Bearer\s+/i, ''));
  if (!p) fail(401, 'Please sign in again');
  const u = await env.DB.prepare('SELECT id, shop_id, username, name, role, active, tv, last_seen FROM users WHERE id = ?').bind(p.u).first();
  if (!u || !u.active || u.tv !== p.v) fail(401, 'Please sign in again');
  if (now() - u.last_seen > 10 * 60_000) {
    await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now(), u.id).run();
  }
  return u;
}
const pubUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active, lastSeen: u.last_seen || 0 });
async function issue(env, cfg, u) {
  const token = await signToken(cfg.secret, { u: u.id, s: u.shop_id, r: u.role, v: u.tv, e: now() + TOKEN_DAYS * 864e5 });
  const shop = await env.DB.prepare('SELECT id, name FROM shops WHERE id = ?').bind(u.shop_id).first();
  return { token, user: pubUser(u), shop };
}
function validPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6) fail(400, 'Password must be at least 6 characters');
  if (pw.length > 128) fail(400, 'Password is too long');
}
function validUsername(un) {
  if (!/^[a-z0-9._@-]{3,40}$/.test(un)) fail(400, 'Username: 3–40 letters, numbers, dot, dash or @');
}

/* ---------------- handlers ---------------- */
async function signup(req, env, cfg) {
  const b = await readJson(req);
  const shopName = String(b.shopName || '').trim().slice(0, 120);
  const name = String(b.name || '').trim().slice(0, 80);
  const username = cleanUser(b.username);
  if (!shopName) fail(400, 'Shop name is required');
  if (!name) fail(400, 'Your name is required');
  validUsername(username); validPassword(b.password);
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  if (exists) fail(409, 'This username is already taken');
  const shopId = newId('shop_'), userId = newId('u_'), t = now();
  const pass = await hashPass(b.password);
  const settings = {
    id: 'shop', shopName, owner: name, phone: /^\d{10}$/.test(username) ? username : '',
    createdAt: t
  };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO shops (id, name, seq, created_at) VALUES (?, ?, 1, ?)').bind(shopId, shopName, t),
    env.DB.prepare('INSERT INTO users (id, shop_id, username, name, role, pass, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, shopId, username, name, 'owner', pass, t, t),
    env.DB.prepare('INSERT INTO records (shop_id, coll, id, data, deleted, seq, updated_at, updated_by) VALUES (?, ?, ?, ?, 0, 1, ?, ?)')
      .bind(shopId, 'settings', 'shop', JSON.stringify(settings), t, userId)
  ]);
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  return json(await issue(env, cfg, u), 201);
}

async function login(req, env, cfg) {
  const b = await readJson(req);
  const username = cleanUser(b.username);
  const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!u) { await hashPass(String(b.password || 'x')); fail(401, 'Wrong username or password'); }
  if (u.locked_until > now()) fail(429, 'Too many wrong tries. Try again in a few minutes.');
  const ok = await checkPass(String(b.password || ''), u.pass);
  if (!ok) {
    const failed = u.failed + 1;
    await env.DB.prepare('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?')
      .bind(failed >= 8 ? 0 : failed, failed >= 8 ? now() + 5 * 60_000 : 0, u.id).run();
    fail(401, 'Wrong username or password');
  }
  if (!u.active) fail(403, 'This user has been switched off by the owner');
  await env.DB.prepare('UPDATE users SET failed = 0, locked_until = 0, last_seen = ? WHERE id = ?').bind(now(), u.id).run();
  return json(await issue(env, cfg, u));
}

function stripForStaff(coll, data) {
  if (coll === 'products') { const d = { ...data }; delete d.cost; return d; }
  if (coll === 'purchases') {
    const d = { ...data, lines: (data.lines || []).map(l => ({ ...l, rate: 0 })) };
    delete d.total; delete d.taxable; delete d.tax; delete d.charges;
    return d;
  }
  if (coll === 'lots') { const d = { ...data }; delete d.cost; return d; }
  return data;
}

async function pull(url, env, u) {
  const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
  const limit = Math.min(2000, Math.max(1, parseInt(url.searchParams.get('limit') || '1000', 10) || 1000));
  const rs = await env.DB.prepare('SELECT coll, id, data, deleted, seq FROM records WHERE shop_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .bind(u.shop_id, since, limit).all();
  const rows = rs.results || [];
  const changes = rows.map(r => {
    let d = JSON.parse(r.data);
    if (u.role === 'staff') d = stripForStaff(r.coll, d);
    return { c: r.coll, id: r.id, d, del: !!r.deleted, s: r.seq };
  });
  const seq = rows.length ? rows[rows.length - 1].seq : since;
  return json({ changes, seq, more: rows.length === limit, now: now() });
}

async function push(req, env, u) {
  const b = await readJson(req, 4_000_000);
  const changes = Array.isArray(b.changes) ? b.changes : fail(400, 'changes[] required');
  if (changes.length > 200) fail(413, 'Send at most 200 changes at a time');
  const t = now();
  const clean = [];
  for (const ch of changes) {
    const c = String(ch.c || ''), id = String(ch.id || '');
    if (!COLLS.has(c)) fail(400, 'Unknown collection: ' + c);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) fail(400, 'Bad id');
    if (c === 'settings' && id !== 'shop') fail(400, 'Bad settings id');
    if (u.role === 'staff' && STAFF_DENY.has(c)) fail(403, 'Your role cannot change ' + c);
    if (u.role !== 'owner' && c === 'settings') fail(403, 'Only the owner can change shop settings');
    const d = ch.d && typeof ch.d === 'object' && !Array.isArray(ch.d) ? ch.d : {};
    d.id = id;
    const s = JSON.stringify(d);
    if (s.length > 600_000) fail(413, 'Record too large');
    clean.push({ c, id, d, del: !!ch.del });
  }
  if (!clean.length) return json({ applied: [] });

  // existing numbers (numbers never change once given)
  const numbered = clean.filter(x => x.c in NUMBERED);
  const existing = new Map();
  if (numbered.length) {
    const res = await env.DB.batch(numbered.map(x =>
      env.DB.prepare("SELECT json_extract(data, '$.no') AS no, json_extract(data, '$.createdBy') AS cb FROM records WHERE shop_id = ? AND coll = ? AND id = ?").bind(u.shop_id, x.c, x.id)));
    numbered.forEach((x, i) => { const r = res[i].results && res[i].results[0]; if (r) existing.set(x.c + '/' + x.id, r); });
  }

  const stmts = [];
  for (const x of clean) {
    const key = x.c + '/' + x.id;
    const ex = existing.get(key);
    if (ex && ex.no) x.d.no = ex.no;
    if (ex && ex.cb) x.d.createdBy = ex.cb;
    if (!ex && !x.d.createdBy) x.d.createdBy = u.name;
    x.d.updatedBy = u.name;
    x.d.updatedAt = t;
    stmts.push(env.DB.prepare('UPDATE shops SET seq = seq + 1 WHERE id = ?').bind(u.shop_id));
    let prefix = null;
    if (x.c in NUMBERED && !x.d.no && !x.del) {
      const p = x.c === 'payments' ? (x.d.dir === 'out' ? 'PAY' : 'RCPT') : NUMBERED[x.c];
      prefix = p + '/' + fyOf(x.d.date) + '/';
    }
    const sql = prefix
      ? `INSERT INTO records (shop_id, coll, id, data, deleted, seq, updated_at, updated_by)
         VALUES (?1, ?2, ?3, json_set(?4, '$.no', ?8 || printf('%04d', (SELECT n FROM counters WHERE shop_id = ?1 AND k = ?8))), ?5, (SELECT seq FROM shops WHERE id = ?1), ?6, ?7)
         ON CONFLICT (shop_id, coll, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, seq = excluded.seq, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      : `INSERT INTO records (shop_id, coll, id, data, deleted, seq, updated_at, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5, (SELECT seq FROM shops WHERE id = ?1), ?6, ?7)
         ON CONFLICT (shop_id, coll, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, seq = excluded.seq, updated_at = excluded.updated_at, updated_by = excluded.updated_by`;
    if (prefix) {
      stmts.push(env.DB.prepare('INSERT INTO counters (shop_id, k, n) VALUES (?, ?, 1) ON CONFLICT (shop_id, k) DO UPDATE SET n = n + 1').bind(u.shop_id, prefix));
      stmts.push(env.DB.prepare(sql).bind(u.shop_id, x.c, x.id, JSON.stringify(x.d), x.del ? 1 : 0, t, u.id, prefix));
    } else {
      stmts.push(env.DB.prepare(sql).bind(u.shop_id, x.c, x.id, JSON.stringify(x.d), x.del ? 1 : 0, t, u.id));
    }
    const label = String(x.d.no || x.d.name || x.d.cat || x.d.note || '').slice(0, 80);
    const action = x.del ? 'delete' : (x.d.cancelled ? 'cancel' : (ex || existing.has(key) ? 'update' : (x.c in NUMBERED ? 'create' : 'save')));
    stmts.push(env.DB.prepare('INSERT INTO audit (shop_id, at, user_id, user_name, coll, rec_id, action, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(u.shop_id, t, u.id, u.name, x.c, x.id, action, label));
  }
  await env.DB.batch(stmts);
  const back = await env.DB.batch(clean.map(x =>
    env.DB.prepare('SELECT coll, id, data, deleted, seq FROM records WHERE shop_id = ? AND coll = ? AND id = ?').bind(u.shop_id, x.c, x.id)));
  const applied = back.map(r => r.results[0]).filter(Boolean).map(r => {
    let d = JSON.parse(r.data);
    if (u.role === 'staff') d = stripForStaff(r.coll, d);
    return { c: r.coll, id: r.id, d, del: !!r.deleted, s: r.seq };
  });
  return json({ applied });
}

async function listUsers(env, u) {
  if (u.role !== 'owner') fail(403, 'Only the owner can manage users');
  const rs = await env.DB.prepare('SELECT * FROM users WHERE shop_id = ? ORDER BY created_at').bind(u.shop_id).all();
  return json({ users: (rs.results || []).map(pubUser) });
}
async function addUser(req, env, u) {
  if (u.role !== 'owner') fail(403, 'Only the owner can add users');
  const b = await readJson(req);
  const username = cleanUser(b.username), name = String(b.name || '').trim().slice(0, 80);
  const role = ROLES.has(b.role) && b.role !== 'owner' ? b.role : 'staff';
  if (!name) fail(400, 'Name is required');
  validUsername(username); validPassword(b.password);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first()) fail(409, 'This username is already taken');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE shop_id = ?').bind(u.shop_id).first();
  if (count.n >= 25) fail(400, 'User limit reached');
  const id = newId('u_'), t = now();
  await env.DB.prepare('INSERT INTO users (id, shop_id, username, name, role, pass, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, u.shop_id, username, name, role, await hashPass(b.password), t).run();
  const nu = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ user: pubUser(nu) }, 201);
}
async function editUser(req, env, u, id) {
  const b = await readJson(req);
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND shop_id = ?').bind(id, u.shop_id).first();
  if (!target) fail(404, 'User not found');
  const self = target.id === u.id;
  if (u.role !== 'owner' && !self) fail(403, 'Only the owner can change other users');
  const sets = [], vals = [];
  if (b.name != null) { const n = String(b.name).trim().slice(0, 80); if (!n) fail(400, 'Name is required'); sets.push('name = ?'); vals.push(n); }
  if (b.role != null && !self) { if (!ROLES.has(b.role) || b.role === 'owner') fail(400, 'Bad role'); sets.push('role = ?', 'tv = tv + 1'); vals.push(b.role); }
  if (b.active != null && !self) { sets.push('active = ?', 'tv = tv + 1'); vals.push(b.active ? 1 : 0); }
  if (b.password != null) {
    validPassword(b.password);
    if (self) {
      if (!(await checkPass(String(b.current || ''), target.pass))) fail(400, 'Current password is wrong');
    }
    sets.push('pass = ?', 'tv = tv + 1', 'failed = 0', 'locked_until = 0'); vals.push(await hashPass(b.password));
  }
  if (b.signOutAll) sets.push('tv = tv + 1');
  if (!sets.length) fail(400, 'Nothing to change');
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  const nu = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  const out = { user: pubUser(nu) };
  if (self && nu.tv !== target.tv) Object.assign(out, await issue(env, await init(env), nu));
  return json(out);
}

async function setCounter(req, env, u) {
  if (u.role !== 'owner') fail(403, 'Only the owner can change numbering');
  const b = await readJson(req);
  const kind = { invoices: 'INV', quotes: 'QT', returns: 'CN', purchases: 'PUR', receipts: 'RCPT' }[b.kind];
  const next = parseInt(b.next, 10);
  if (!kind) fail(400, 'Bad kind');
  if (!(next >= 1 && next < 1e7)) fail(400, 'Bad number');
  const k = kind + '/' + fyOf(b.date) + '/';
  await env.DB.prepare('INSERT INTO counters (shop_id, k, n) VALUES (?, ?, ?) ON CONFLICT (shop_id, k) DO UPDATE SET n = excluded.n')
    .bind(u.shop_id, k, next - 1).run();
  return json({ ok: true, key: k, next });
}
async function getCounters(env, u) {
  const rs = await env.DB.prepare('SELECT k, n FROM counters WHERE shop_id = ?').bind(u.shop_id).all();
  return json({ counters: Object.fromEntries((rs.results || []).map(r => [r.k, r.n])) });
}

async function share(req, env, u) {
  const b = await readJson(req);
  if (!['invoices', 'quotes', 'returns'].includes(b.c)) fail(400, 'This document cannot be shared');
  const rec = await env.DB.prepare('SELECT 1 FROM records WHERE shop_id = ? AND coll = ? AND id = ? AND deleted = 0').bind(u.shop_id, b.c, String(b.id)).first();
  if (!rec) fail(404, 'Save the document first');
  const ex = await env.DB.prepare('SELECT token FROM shares WHERE shop_id = ? AND coll = ? AND id = ?').bind(u.shop_id, b.c, String(b.id)).first();
  if (ex) return json({ token: ex.token });
  const token = rand(12);
  await env.DB.prepare('INSERT INTO shares (token, shop_id, coll, id, created_at) VALUES (?, ?, ?, ?, ?)').bind(token, u.shop_id, b.c, String(b.id), now()).run();
  return json({ token });
}
async function publicDoc(env, token) {
  const s = await env.DB.prepare('SELECT * FROM shares WHERE token = ?').bind(token).first();
  if (!s) fail(404, 'This link is not valid');
  const [doc, set] = await env.DB.batch([
    env.DB.prepare('SELECT data, deleted FROM records WHERE shop_id = ? AND coll = ? AND id = ?').bind(s.shop_id, s.coll, s.id),
    env.DB.prepare("SELECT data FROM records WHERE shop_id = ? AND coll = 'settings' AND id = 'shop'").bind(s.shop_id)
  ]);
  const d = doc.results[0];
  if (!d || d.deleted) fail(404, 'This document was removed');
  const data = JSON.parse(d.data);
  const st = set.results[0] ? JSON.parse(set.results[0].data) : {};
  const shop = {};
  for (const k of ['shopName', 'tagline', 'address', 'city', 'state', 'stateCode', 'gstin', 'phone', 'email', 'upi', 'bank', 'terms', 'quoteTerms', 'logo', 'showUpiQr']) if (st[k] != null) shop[k] = st[k];
  let paid = 0;
  if (s.coll === 'invoices') {
    const rs = await env.DB.prepare("SELECT data FROM records WHERE shop_id = ? AND coll = 'payments' AND deleted = 0 AND json_extract(data, '$.invoiceId') = ?").bind(s.shop_id, s.id).all();
    for (const r of rs.results || []) { const p = JSON.parse(r.data); paid += (+p.amount || 0) * (p.dir === 'out' ? -1 : 1); }
  }
  const productIds = [...new Set((data.lines || []).map(l => l.productId).filter(Boolean))];
  const products = {};
  if (productIds.length) {
    const res = await env.DB.batch(productIds.slice(0, 80).map(pid => env.DB.prepare("SELECT data FROM records WHERE shop_id = ? AND coll = 'products' AND id = ?").bind(s.shop_id, pid)));
    res.forEach(r => { const row = r.results[0]; if (row) { const p = JSON.parse(row.data); delete p.cost; delete p.photo; products[p.id] = p; } });
  }
  if (data.cancelled) data.cancelled = true;
  return json({ kind: s.coll, doc: data, shop, paid, products });
}

async function audit(url, env, u) {
  if (u.role === 'staff') fail(403, 'Not allowed');
  const before = parseInt(url.searchParams.get('before') || '0', 10) || now() + 1;
  const rs = await env.DB.prepare('SELECT at, user_name, coll, rec_id, action, label FROM audit WHERE shop_id = ? AND at < ? ORDER BY at DESC LIMIT 100')
    .bind(u.shop_id, before).all();
  return json({ items: rs.results || [] });
}

/* ---------------- router ---------------- */
export async function handle(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  try {
    if (!env || !env.DB) fail(500, 'Database is not connected (D1 binding "DB" missing)');
    const cfg = await init(env);
    const m = req.method;
    if (path === '/api/health') return json({ ok: true, time: now() });
    if (path === '/api/signup' && m === 'POST') return await signup(req, env, cfg);
    if (path === '/api/login' && m === 'POST') return await login(req, env, cfg);
    const pm = path.match(/^\/api\/public\/([A-Za-z0-9_-]{8,40})$/);
    if (pm && m === 'GET') return await publicDoc(env, pm[1]);

    const u = await auth(req, env, cfg);
    if (path === '/api/me' && m === 'GET') {
      const shop = await env.DB.prepare('SELECT id, name, seq FROM shops WHERE id = ?').bind(u.shop_id).first();
      return json({ user: pubUser(u), shop });
    }
    if (path === '/api/sync' && m === 'GET') return await pull(url, env, u);
    if (path === '/api/sync' && m === 'POST') return await push(req, env, u);
    if (path === '/api/users' && m === 'GET') return await listUsers(env, u);
    if (path === '/api/users' && m === 'POST') return await addUser(req, env, u);
    const um = path.match(/^\/api\/users\/([A-Za-z0-9_-]+)$/);
    if (um && m === 'PATCH') return await editUser(req, env, u, um[1]);
    if (path === '/api/counters' && m === 'GET') return await getCounters(env, u);
    if (path === '/api/counters' && m === 'POST') return await setCounter(req, env, u);
    if (path === '/api/share' && m === 'POST') return await share(req, env, u);
    if (path === '/api/audit' && m === 'GET') return await audit(url, env, u);
    fail(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
}

export const _test = { fyOf, hashPass, checkPass, signToken, verifyToken };
