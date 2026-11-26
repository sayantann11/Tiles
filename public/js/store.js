// Local-first data store: everything lives in memory + IndexedDB and syncs to the server in the background.
// Works fully offline; changes wait in an outbox and are pushed when the connection is back.
import { uid, fyLabel } from './core.js';

export const COLLS = ['settings', 'products', 'lots', 'parties', 'invoices', 'quotes', 'returns', 'purchases', 'payments', 'adjustments', 'expenses', 'leads'];
const NUM_PREFIX = { invoices: 'INV', quotes: 'QT', returns: 'CN', purchases: 'PUR' };
const SESSION_KEY = 'td-session';
const API = (window.TD_API || '').replace(/\/$/, '');

const data = Object.fromEntries(COLLS.map(c => [c, new Map()]));
const listCache = new Map();
const listeners = new Set();
const statusListeners = new Set();
let idb = null, dbName = null, seq = 0, rev = Date.now();
let pollTimer = null, syncing = false, again = false, pushTimer = null;
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('tiledesk') : null;

export const status = { online: navigator.onLine, syncing: false, pending: 0, lastSync: 0, error: '' };
export const S = { session: null, version: 0 };

/* ---------------- IndexedDB ---------------- */
function openIdb(name) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('rec'); db.createObjectStore('out'); db.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });
async function metaGet(k) { return req(idb.transaction('meta').objectStore('meta').get(k)); }
async function metaSet(k, v) { const t = idb.transaction('meta', 'readwrite'); t.objectStore('meta').put(v, k); return txDone(t); }
const key = (c, id) => c + '|' + id;

/* ---------------- session ---------------- */
export function loadSession() {
  try { S.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { S.session = null; }
  return S.session;
}
function saveSession(s) { S.session = s; if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }
export const isDemo = () => S.session && S.session.mode === 'demo';
export const me = () => (S.session && S.session.user) || { name: 'Owner', role: 'owner' };
export const role = () => me().role || 'owner';
export const can = what => {
  const r = role();
  if (r === 'owner') return true;
  const M = { manager: ['viewCost', 'products', 'purchases', 'cancel', 'reports', 'expensesAll', 'stockAdjust', 'returns', 'delete'], staff: ['stockAdjust'] };
  return (M[r] || []).includes(what);
};

/* ---------------- open / close ---------------- */
export async function open(session) {
  saveSession(session);
  const name = session.mode === 'demo' ? 'tiledesk-demo' : 'tiledesk-' + session.shop.id + '-' + session.user.id;
  if (idb && dbName === name) return;
  if (idb) idb.close();
  COLLS.forEach(c => data[c].clear()); listCache.clear();
  idb = await openIdb(name); dbName = name;
  const t = idb.transaction(['rec', 'out', 'meta']);
  const [recs, outs, s] = await Promise.all([req(t.objectStore('rec').getAll()), req(t.objectStore('out').getAll()), req(t.objectStore('meta').get('seq'))]);
  for (const r of recs) if (!r.del && data[r.c]) data[r.c].set(r.id, r.d);
  for (const o of outs) if (data[o.c]) { if (o.del) data[o.c].delete(o.id); else data[o.c].set(o.id, o.d); }
  seq = s || 0; status.pending = outs.length;
  bump();
  if (session.mode === 'cloud') startSync();
}
export async function isEmpty() { return data.settings.size === 0 && data.products.size === 0 && data.invoices.size === 0; }

export async function logout(wipe = true) {
  stopSync();
  const name = dbName;
  if (idb) { idb.close(); idb = null; dbName = null; }
  if (wipe && name) await new Promise(r => { const d = indexedDB.deleteDatabase(name); d.onsuccess = d.onerror = d.onblocked = () => r(); });
  COLLS.forEach(c => data[c].clear()); listCache.clear();
  saveSession(null); bump();
}

/* ---------------- reads ---------------- */
export const get = (c, id) => id == null ? null : data[c].get(id) || null;
export function list(c) {
  const k = c + '@' + S.version;
  let v = listCache.get(k);
  if (!v) { v = [...data[c].values()]; listCache.set(k, v); }
  return v;
}
export const settings = () => data.settings.get('shop') || {};
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
let bumpQueued = false;
function bump() {
  S.version++; listCache.clear();
  if (bumpQueued) return; bumpQueued = true;
  queueMicrotask(() => { bumpQueued = false; listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); });
}
function emitStatus() { statusListeners.forEach(f => { try { f(status); } catch (e) { console.error(e); } }); }

/* ---------------- writes ---------------- */
// put([{c, d}]) or put(c, d). Returns saved records. All records in one call are written atomically.
export async function put(c, d) {
  const items = Array.isArray(c) ? c : [{ c, d }];
  const t = idb.transaction(['rec', 'out', 'meta'], 'readwrite');
  const rs = t.objectStore('rec'), os = t.objectStore('out'), ms = t.objectStore('meta');
  const demo = isDemo();
  const out = [];
  for (const it of items) {
    const rec = { ...it.d };
    if (!rec.id) rec.id = uid(it.c.slice(0, 2));
    const prev = data[it.c].get(rec.id);
    rec.updatedAt = Date.now();
    rec.updatedBy = me().name;
    if (!prev) { rec.createdBy = rec.createdBy || me().name; rec.createdAt = rec.createdAt || Date.now(); }
    if (prev && prev.no && !rec.no) rec.no = prev.no;
    if (demo && !rec.no && (NUM_PREFIX[it.c] || it.c === 'payments')) {
      const p = it.c === 'payments' ? (rec.dir === 'out' ? 'PAY' : 'RCPT') : NUM_PREFIX[it.c];
      const pre = p + '/' + fyLabel(rec.date) + '/';
      const k = 'n:' + pre;
      let maxNo = 0; for (const x of data[it.c].values()) if (x.no && x.no.startsWith(pre)) maxNo = Math.max(maxNo, parseInt(x.no.slice(pre.length), 10) || 0);
      const n = Math.max((await req(ms.get(k))) || 0, maxNo) + 1;
      ms.put(n, k);
      rec.no = p + '/' + fyLabel(rec.date) + '/' + String(n).padStart(4, '0');
    }
    data[it.c].set(rec.id, rec);
    if (demo) rs.put({ c: it.c, id: rec.id, d: rec, del: false, s: 0 }, key(it.c, rec.id));
    else os.put({ c: it.c, id: rec.id, d: rec, del: false, rev: ++rev }, key(it.c, rec.id));
    out.push(rec);
  }
  await txDone(t);
  afterWrite(out.map((r, i) => [items[i].c, r.id]));
  return Array.isArray(c) ? out : out[0];
}
export async function del(c, id) {
  const prev = data[c].get(id); if (!prev) return;
  const t = idb.transaction(['rec', 'out'], 'readwrite');
  if (isDemo()) t.objectStore('rec').delete(key(c, id));
  else t.objectStore('out').put({ c, id, d: prev, del: true, rev: ++rev }, key(c, id));
  data[c].delete(id);
  await txDone(t);
  afterWrite([[c, id]]);
}
function afterWrite(keys) {
  bump();
  if (chan) chan.postMessage({ db: dbName, keys });
  if (!isDemo()) { countPending(); schedulePush(); }
}
async function countPending() { if (!idb) return; status.pending = await req(idb.transaction('out').objectStore('out').count()); emitStatus(); }

// other tabs of the same shop: reload changed records
if (chan) chan.onmessage = async e => {
  if (!idb || e.data.db !== dbName) return;
  const t = idb.transaction(['rec', 'out']);
  for (const [c, id] of e.data.keys || []) {
    if (!c || !id) continue;
    const o = await req(t.objectStore('out').get(key(c, id)));
    const r = o || await req(t.objectStore('rec').get(key(c, id)));
    if (!r || r.del) data[c].delete(id); else data[c].set(id, r.d);
  }
  if (e.data.all) { await reloadAll(); return; }
  bump();
};
async function reloadAll() {
  const t = idb.transaction(['rec', 'out']);
  const [recs, outs] = await Promise.all([req(t.objectStore('rec').getAll()), req(t.objectStore('out').getAll())]);
  COLLS.forEach(c => data[c].clear());
  for (const r of recs) if (!r.del && data[r.c]) data[r.c].set(r.id, r.d);
  for (const o of outs) if (data[o.c]) { if (o.del) data[o.c].delete(o.id); else data[o.c].set(o.id, o.d); }
  bump();
}

/* ---------------- API ---------------- */
export async function api(method, path, body, { timeout = 20000, auth = true } = {}) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const headers = { 'content-type': 'application/json' };
    if (auth && S.session && S.session.token) headers.authorization = 'Bearer ' + S.session.token;
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, cache: 'no-store' });
    let j = {}; try { j = await r.json(); } catch { }
    if (!r.ok) { const e = new Error(j.error || ('Server error ' + r.status)); e.status = r.status; throw e; }
    return j;
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError) { const x = new Error('No internet connection. Check your network and try again.'); x.offline = true; throw x; }
    throw e;
  } finally { clearTimeout(tm); }
}
export async function signIn(username, password) {
  const r = await api('POST', '/api/login', { username, password }, { auth: false });
  await open({ mode: 'cloud', token: r.token, user: r.user, shop: r.shop });
  return r;
}
export async function signUp(body) {
  const r = await api('POST', '/api/signup', body, { auth: false });
  await open({ mode: 'cloud', token: r.token, user: r.user, shop: r.shop });
  return r;
}
export function updateSessionToken(r) { if (r && r.token) saveSession({ ...S.session, token: r.token, user: r.user || S.session.user }); }
export function setSessionUser(u) { saveSession({ ...S.session, user: { ...S.session.user, ...u } }); }

/* ---------------- sync ---------------- */
let onExpired = () => { };
export function onSessionExpired(fn) { onExpired = fn; }
function startSync() {
  stopSync();
  syncNow();
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 20000);
  window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVis);
}
function stopSync() {
  clearInterval(pollTimer); pollTimer = null; clearTimeout(pushTimer);
  window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVis);
}
const onOnline = () => { status.online = true; emitStatus(); syncNow(); };
const onOffline = () => { status.online = false; emitStatus(); };
const onVis = () => { if (document.visibilityState === 'visible') syncNow(); };
function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 250); }

export async function syncNow() {
  if (!S.session || S.session.mode !== 'cloud' || !idb) return;
  if (syncing) { again = true; return; }
  syncing = true; status.syncing = true; emitStatus();
  const myDb = dbName;
  try {
    // push
    for (let guard = 0; guard < 50; guard++) {
      const outs = (await req(idb.transaction('out').objectStore('out').getAll())).slice(0, 150);
      if (!outs.length) break;
      const r = await api('POST', '/api/sync', { changes: outs.map(o => ({ c: o.c, id: o.id, d: o.d, del: o.del })) });
      if (dbName !== myDb) return;
      const byKey = new Map(r.applied.map(a => [key(a.c, a.id), a]));
      const t = idb.transaction(['rec', 'out'], 'readwrite');
      const os = t.objectStore('out'), rs = t.objectStore('rec');
      for (const o of outs) {
        const k = key(o.c, o.id), a = byKey.get(k);
        const cur = await req(os.get(k));
        if (cur && cur.rev === o.rev) {
          os.delete(k);
          if (a) { rs.put({ c: a.c, id: a.id, d: a.d, del: a.del, s: a.s }, k); if (a.del) data[a.c].delete(a.id); else data[a.c].set(a.id, a.d); }
        } else if (cur && a && a.d.no && !cur.d.no) {
          cur.d.no = a.d.no; os.put(cur, k); if (!cur.del) data[cur.c].set(cur.id, cur.d);
        }
      }
      await txDone(t);
      bump();
    }
    // pull
    for (let guard = 0; guard < 200; guard++) {
      const r = await api('GET', '/api/sync?since=' + seq + '&limit=1000');
      if (dbName !== myDb) return;
      if (r.changes.length) {
        const t = idb.transaction(['rec', 'out', 'meta'], 'readwrite');
        const os = t.objectStore('out'), rs = t.objectStore('rec');
        const pend = new Set(await req(os.getAllKeys()));
        for (const ch of r.changes) {
          const k = key(ch.c, ch.id);
          if (!data[ch.c]) continue;
          rs.put({ c: ch.c, id: ch.id, d: ch.d, del: ch.del, s: ch.s }, k);
          if (pend.has(k)) continue;
          if (ch.del) data[ch.c].delete(ch.id); else data[ch.c].set(ch.id, ch.d);
        }
        t.objectStore('meta').put(r.seq, 'seq');
        await txDone(t);
        bump();
      }
      seq = r.seq;
      if (!r.more) break;
    }
    status.lastSync = Date.now(); status.error = ''; status.online = true;
    await countPending();
  } catch (e) {
    if (e.status === 401) { status.error = 'expired'; onExpired(); }
    else if (e.offline) { status.online = false; status.error = ''; }
    else status.error = e.message;
  } finally {
    syncing = false; status.syncing = false; emitStatus();
    if (again) { again = false; setTimeout(syncNow, 50); }
  }
}

/* ---------------- backup ---------------- */
export function exportAll() {
  const out = { app: 'TileDesk', version: 1, exportedAt: new Date().toISOString(), shop: settings().shopName || '', data: {} };
  for (const c of COLLS) out.data[c] = list(c);
  return out;
}
export async function importAll(obj, { replace = false } = {}) {
  if (!obj || obj.app !== 'TileDesk' || !obj.data) throw new Error('This is not a TileDesk backup file');
  if (replace) {
    const dels = [];
    for (const c of COLLS) for (const r of list(c)) if (!(obj.data[c] || []).some(x => x.id === r.id)) dels.push([c, r.id]);
    for (const [c, id] of dels) await del(c, id);
  }
  const items = [];
  for (const c of COLLS) for (const d of obj.data[c] || []) if (d && d.id) items.push({ c, d });
  for (let i = 0; i < items.length; i += 400) await put(items.slice(i, i + 400));
  return items.length;
}
export async function wipeDemo() {
  if (!isDemo()) return;
  const t = idb.transaction(['rec', 'out', 'meta'], 'readwrite');
  t.objectStore('rec').clear(); t.objectStore('out').clear(); t.objectStore('meta').clear();
  await txDone(t);
  COLLS.forEach(c => data[c].clear()); bump();
  if (chan) chan.postMessage({ db: dbName, keys: [], all: true });
}
export const dbReady = () => !!idb;
