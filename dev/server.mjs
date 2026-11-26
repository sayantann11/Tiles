// Local dev server: serves /public and runs the same API as production on Node's built-in SQLite.
// Usage: node dev/server.mjs [--port 8787] [--db dev/local.db]   (use --db :memory: for tests)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { handle } from '../server/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('--port', process.env.PORT || 8787);
const DBFILE = arg('--db', path.join(root, 'dev', 'local.db'));
const LATENCY = +arg('--latency', 0);

/* D1-compatible wrapper around node:sqlite (prepare/bind/first/all/run/batch). */
function d1(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  class Stmt {
    constructor(sql) { this.sql = sql; this.args = []; }
    bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
    _run() {
      const st = db.prepare(this.sql);
      const isRead = /^\s*(SELECT|WITH)/i.test(this.sql) || /RETURNING/i.test(this.sql);
      if (isRead) return { results: st.all(...this.args), success: true, meta: {} };
      const r = st.run(...this.args);
      return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    }
    async first(col) { const r = this._run().results[0] || null; return col ? (r ? r[col] : null) : r; }
    async all() { return this._run(); }
    async run() { return this._run(); }
  }
  return {
    prepare: sql => new Stmt(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = stmts.map(s => s._run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async exec(sql) { db.exec(sql); return {}; }
  };
}

const env = { DB: d1(DBFILE) };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      if (LATENCY) await new Promise(r => setTimeout(r, LATENCY));
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return;
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e); res.writeHead(500); res.end('Server error');
  }
});
server.listen(PORT, () => console.log(`TileDesk dev server on http://localhost:${PORT}  (db: ${DBFILE})`));
