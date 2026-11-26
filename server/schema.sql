-- TileDesk database (Cloudflare D1 / SQLite)
-- Every business document is a JSON record in `records`, keyed by shop + collection + id.
-- `seq` is a per-shop change counter used for incremental sync to every device.

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,              -- owner | manager | staff
  pass TEXT NOT NULL,              -- pbkdf2$iterations$salt$hash
  active INTEGER NOT NULL DEFAULT 1,
  tv INTEGER NOT NULL DEFAULT 1,   -- token version: bump to sign out everywhere
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_shop ON users(shop_id);

CREATE TABLE IF NOT EXISTS records (
  shop_id TEXT NOT NULL,
  coll TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (shop_id, coll, id)
);
CREATE INDEX IF NOT EXISTS records_seq ON records(shop_id, seq);

CREATE TABLE IF NOT EXISTS counters (
  shop_id TEXT NOT NULL,
  k TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (shop_id, k)
);

CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  coll TEXT NOT NULL,
  id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shares_doc ON shares(shop_id, coll, id);

CREATE TABLE IF NOT EXISTS audit (
  shop_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  user_id TEXT,
  user_name TEXT,
  coll TEXT NOT NULL,
  rec_id TEXT NOT NULL,
  action TEXT NOT NULL,
  label TEXT
);
CREATE INDEX IF NOT EXISTS audit_shop ON audit(shop_id, at);
