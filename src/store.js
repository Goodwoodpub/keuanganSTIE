'use strict';
/*
 * Lapisan penyimpanan.
 * - Jika DATABASE_URL tersedia (Railway PostgreSQL) -> PostgreSQL.
 * - Jika tidak -> file JSON di folder DATA_DIR (untuk uji lokal / Railway Volume).
 */
const fs = require('fs');
const path = require('path');

const emptyState = () => ({ reqs: [], notes: [], log: [], seq: 1, limit: 5000000 });

/* ---------- PostgreSQL ---------- */
function pgStore(url) {
  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: process.env.PGSSL === 'disable' || local ? false : { rejectUnauthorized: false },
    max: 5,
  });
  const q = (t, p) => pool.query(t, p);

  return {
    kind: 'postgres',
    async init() {
      await q(`CREATE TABLE IF NOT EXISTS users(
        username TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
        pass_hash TEXT NOT NULL, pv INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`CREATE TABLE IF NOT EXISTS app_state(
        id INTEGER PRIMARY KEY, version BIGINT NOT NULL, data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`CREATE TABLE IF NOT EXISTS files(
        id TEXT PRIMARY KEY, name TEXT, mime TEXT NOT NULL, size INTEGER NOT NULL,
        data BYTEA NOT NULL, created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`INSERT INTO app_state(id,version,data) VALUES(1,1,$1) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(emptyState())]);
      await q(`CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, val JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    },
    /* Penyimpanan kecil terpisah (mis. notifikasi LMS), tidak mengubah versi data utama. */
    async getKV(k) { const r = (await q('SELECT val FROM kv WHERE key=$1', [k])).rows[0]; return r ? r.val : null; },
    async setKV(k, v) { await q('INSERT INTO kv(key,val,updated_at) VALUES($1,$2,now()) ON CONFLICT (key) DO UPDATE SET val=EXCLUDED.val, updated_at=now()', [k, JSON.stringify(v)]); },
    async countUsers() { return +(await q('SELECT count(*)::int n FROM users')).rows[0].n; },
    async listUsers() {
      return (await q('SELECT username u,name,role FROM users ORDER BY created_at,username')).rows;
    },
    async getUser(u) {
      const r = (await q('SELECT username u,name,role,pass_hash,pv FROM users WHERE username=$1', [u])).rows[0];
      return r || null;
    },
    async createUser({ u, name, role, pass_hash }) {
      await q('INSERT INTO users(username,name,role,pass_hash) VALUES($1,$2,$3,$4)', [u, name, role, pass_hash]);
    },
    async deleteUser(u) { await q('DELETE FROM users WHERE username=$1', [u]); },
    async setPassword(u, pass_hash) {
      await q('UPDATE users SET pass_hash=$2, pv=pv+1 WHERE username=$1', [u, pass_hash]);
    },
    async getState() {
      const r = (await q('SELECT version,data FROM app_state WHERE id=1')).rows[0];
      return { version: +r.version, data: r.data };
    },
    async getVersion() { return +(await q('SELECT version FROM app_state WHERE id=1')).rows[0].version; },
    async putState(data, base) {
      const r = await q('UPDATE app_state SET data=$1, version=version+1, updated_at=now() WHERE id=1 AND version=$2 RETURNING version',
        [JSON.stringify(data), base]);
      return r.rowCount ? +r.rows[0].version : null;
    },
    async reset() {
      await q('UPDATE app_state SET data=$1, version=version+1, updated_at=now() WHERE id=1', [JSON.stringify(emptyState())]);
      await q('DELETE FROM files');
    },
    async putFile(f) {
      await q('INSERT INTO files(id,name,mime,size,data,created_by) VALUES($1,$2,$3,$4,$5,$6)',
        [f.id, f.name, f.mime, f.data.length, f.data, f.by]);
    },
    async getFile(id) {
      return (await q('SELECT id,name,mime,data FROM files WHERE id=$1', [id])).rows[0] || null;
    },
    async cleanupFiles(keep) {
      const r = (await q(`SELECT id FROM files WHERE created_at < now() - interval '1 day'`)).rows;
      const del = r.map(x => x.id).filter(id => !keep.has(id));
      if (del.length) await q('DELETE FROM files WHERE id = ANY($1)', [del]);
      return del.length;
    },
  };
}

/* ---------- File JSON (lokal) ---------- */
function fileStore(dir) {
  const dbf = path.join(dir, 'db.json');
  const fdir = path.join(dir, 'files');
  let db;
  const flush = () => {
    const tmp = dbf + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, dbf);
  };
  const safe = id => /^[a-f0-9]{32}$/.test(id);

  return {
    kind: 'file:' + dir,
    async init() {
      fs.mkdirSync(fdir, { recursive: true });
      db = fs.existsSync(dbf) ? JSON.parse(fs.readFileSync(dbf, 'utf8')) : { users: [], version: 1, data: emptyState(), files: {} };
      db.files = db.files || {};
      db.kv = db.kv || {};
      flush();
    },
    async getKV(k) { return db.kv[k] ?? null; },
    async setKV(k, v) { db.kv[k] = v; flush(); },
    async countUsers() { return db.users.length; },
    async listUsers() { return db.users.map(({ u, name, role }) => ({ u, name, role })); },
    async getUser(u) { return db.users.find(x => x.u === u) || null; },
    async createUser(x) { db.users.push({ ...x, pv: 1 }); flush(); },
    async deleteUser(u) { db.users = db.users.filter(x => x.u !== u); flush(); },
    async setPassword(u, h) { const x = db.users.find(y => y.u === u); if (x) { x.pass_hash = h; x.pv = (x.pv || 1) + 1; flush(); } },
    async getState() { return { version: db.version, data: db.data }; },
    async getVersion() { return db.version; },
    async putState(data, base) {
      if (base !== db.version) return null;
      db.data = data; db.version++; flush(); return db.version;
    },
    async reset() {
      db.data = emptyState(); db.version++;
      for (const id of Object.keys(db.files)) { try { fs.unlinkSync(path.join(fdir, id)); } catch (e) {} }
      db.files = {}; flush();
    },
    async putFile(f) {
      fs.writeFileSync(path.join(fdir, f.id), f.data);
      db.files[f.id] = { name: f.name, mime: f.mime, at: Date.now() }; flush();
    },
    async getFile(id) {
      if (!safe(id) || !db.files[id]) return null;
      return { id, ...db.files[id], data: fs.readFileSync(path.join(fdir, id)) };
    },
    async cleanupFiles(keep) {
      let n = 0;
      for (const [id, m] of Object.entries(db.files)) {
        if (!keep.has(id) && Date.now() - m.at > 864e5) { try { fs.unlinkSync(path.join(fdir, id)); } catch (e) {} delete db.files[id]; n++; }
      }
      if (n) flush();
      return n;
    },
  };
}

module.exports = function createStore() {
  if (process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  return fileStore(path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')));
};
module.exports.emptyState = emptyState;
