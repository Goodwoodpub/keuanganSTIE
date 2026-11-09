'use strict';
/*
 * Sistem Manajemen Dana Operasional STIE Krakatau — server.
 * Express + PostgreSQL (Railway) dengan sesi login di sisi server.
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const createStore = require('./src/store');

const PORT = +process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET || (() => {
  if (PROD) console.warn('[PERINGATAN] SESSION_SECRET belum diatur. Sesi login akan hilang setiap kali server restart.');
  return crypto.randomBytes(32).toString('hex');
})();
const SESSION_DAYS = +process.env.SESSION_DAYS || 7;
const ROLES = ['Bendahara', 'Admin'];
const MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls', 'text/csv': 'csv',
};
const MAX_FILE = 4 * 1024 * 1024;

const store = createStore();
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ---------- Utilitas ---------- */
const hashPw = pw => new Promise((ok, no) => {
  const salt = crypto.randomBytes(16);
  crypto.scrypt(pw, salt, 64, (e, k) => e ? no(e) : ok('scrypt$' + salt.toString('hex') + '$' + k.toString('hex')));
});
const checkPw = (pw, stored) => new Promise(ok => {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt' || !s || !h) return ok(false);
  crypto.scrypt(pw, Buffer.from(s, 'hex'), 64, (e, k) => {
    if (e) return ok(false);
    const H = Buffer.from(h, 'hex');
    ok(H.length === k.length && crypto.timingSafeEqual(H, k));
  });
});
const b64u = b => Buffer.from(b).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const makeToken = u => { const p = b64u(JSON.stringify({ u: u.u, pv: u.pv || 1, exp: Date.now() + SESSION_DAYS * 864e5 })); return p + '.' + sign(p); };
const readToken = t => {
  const [p, s] = String(t || '').split('.');
  if (!p || !s) return null;
  const a = Buffer.from(sign(p)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp > Date.now() ? d : null; } catch (e) { return null; }
};
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => {
  const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
}));
const setSid = (req, res, v, maxAge) => res.append('Set-Cookie',
  `sid=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`);
const pub = u => ({ u: u.u, name: u.name, role: u.role });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validUser = s => /^[a-z0-9._-]{3,32}$/.test(s);

/* ---------- Header keamanan ---------- */
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

/* ---------- Auth middleware ---------- */
const auth = wrap(async (req, res, next) => {
  const t = readToken(cookies(req).sid);
  const u = t && await store.getUser(t.u);
  if (!u || (u.pv || 1) !== t.pv) return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
  req.user = u; next();
});
const admin = (req, res, next) => req.user.role === 'Admin' ? next() : res.status(403).json({ error: 'Hanya pimpinan yang dapat melakukan ini.' });
// Perlindungan CSRF sederhana: request yang mengubah data wajib membawa header khusus.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.get('X-Requested-With') !== 'fetch')
    return res.status(400).json({ error: 'Permintaan tidak valid.' });
  next();
});

/* ---------- Pembatas percobaan login ---------- */
const tries = new Map();
const limited = ip => { const t = tries.get(ip); return t && t.n >= 10 && Date.now() - t.at < 15 * 6e4; };
const fail = ip => { const t = tries.get(ip); if (!t || Date.now() - t.at > 15 * 6e4) tries.set(ip, { n: 1, at: Date.now() }); else t.n++; };

/* ---------- API ---------- */
const json = express.json({ limit: '8mb' });

app.get('/api/health', (req, res) => res.json({ ok: true, store: store.kind.split(':')[0] }));

app.post('/api/login', json, wrap(async (req, res) => {
  const ip = req.ip;
  if (limited(ip)) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
  const u = String(req.body?.u || '').trim().toLowerCase(), p = String(req.body?.p || '');
  const user = await store.getUser(u);
  if (!user || !(await checkPw(p, user.pass_hash))) { fail(ip); return res.status(401).json({ error: 'Username atau password salah.' }); }
  tries.delete(ip);
  setSid(req, res, makeToken(user), SESSION_DAYS * 86400);
  res.json({ user: pub(user) });
}));

app.post('/api/logout', (req, res) => { setSid(req, res, '', 0); res.json({ ok: true }); });

app.get('/api/session', auth, (req, res) => res.json({ user: pub(req.user) }));

app.get('/api/users', auth, wrap(async (req, res) => res.json(await store.listUsers())));

app.post('/api/users', auth, admin, json, wrap(async (req, res) => {
  const u = String(req.body?.u || '').trim().toLowerCase(), p = String(req.body?.p || ''),
    name = String(req.body?.name || '').trim().slice(0, 80) || u, role = req.body?.role;
  if (!validUser(u)) return res.status(400).json({ error: 'Username 3–32 karakter: huruf kecil, angka, titik, strip, atau garis bawah.' });
  if (p.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid.' });
  if (await store.getUser(u)) return res.status(409).json({ error: 'Username sudah dipakai.' });
  await store.createUser({ u, name, role, pass_hash: await hashPw(p) });
  res.json(await store.listUsers());
}));

app.delete('/api/users/:u', auth, admin, wrap(async (req, res) => {
  const u = req.params.u;
  if (u === req.user.u) return res.status(400).json({ error: 'Anda tidak dapat menghapus akun sendiri.' });
  const x = await store.getUser(u);
  if (!x) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
  if (x.role === 'Admin' && (await store.listUsers()).filter(y => y.role === 'Admin').length < 2)
    return res.status(400).json({ error: 'Minimal harus ada satu akun pimpinan.' });
  await store.deleteUser(u);
  res.json(await store.listUsers());
}));

app.post('/api/users/:u/password', auth, admin, json, wrap(async (req, res) => {
  const p = String(req.body?.p || '');
  if (p.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  if (!(await store.getUser(req.params.u))) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
  await store.setPassword(req.params.u, await hashPw(p));
  res.json({ ok: true });
}));

app.post('/api/password', auth, json, wrap(async (req, res) => {
  const o = String(req.body?.old || ''), n = String(req.body?.new || '');
  if (!(await checkPw(o, req.user.pass_hash))) return res.status(400).json({ error: 'Password lama salah.' });
  if (n.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
  await store.setPassword(req.user.u, await hashPw(n));
  const u = await store.getUser(req.user.u);
  setSid(req, res, makeToken(u), SESSION_DAYS * 86400);
  res.json({ ok: true });
}));

const cleanState = d => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const { users, me, ...rest } = d; // akun & sesi tidak pernah disimpan di dokumen data
  if (!Array.isArray(rest.reqs) || !Array.isArray(rest.notes) || !Array.isArray(rest.log) || !Number.isFinite(+rest.seq)) return null;
  rest.log = rest.log.slice(0, 5000);
  rest.notes = rest.notes.slice(0, 2000);
  return rest;
};

app.get('/api/state', auth, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.query.v && +req.query.v === await store.getVersion()) return res.status(204).end();
  res.json(await store.getState());
}));

app.put('/api/state', auth, json, wrap(async (req, res) => {
  const data = cleanState(req.body?.data), base = +req.body?.version;
  if (!data || !Number.isFinite(base)) return res.status(400).json({ error: 'Data tidak valid.' });
  const v = await store.putState(data, base);
  if (v == null) return res.status(409).json(await store.getState());
  res.json({ version: v });
}));

app.post('/api/reset', auth, admin, wrap(async (req, res) => {
  await store.reset();
  res.json(await store.getState());
}));

app.post('/api/files', auth, express.raw({ type: () => true, limit: MAX_FILE }), wrap(async (req, res) => {
  const mime = String(req.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = MIME[mime];
  if (!ext) return res.status(415).json({ error: 'Jenis berkas tidak didukung.' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Berkas kosong.' });
  let name = 'berkas.' + ext;
  try { name = decodeURIComponent(req.get('X-File-Name') || name).replace(/[\\/\r\n"]/g, '_').slice(0, 150); } catch (e) {}
  const id = crypto.randomBytes(16).toString('hex');
  await store.putFile({ id, name, mime, data: req.body, by: req.user.u });
  res.json({ url: `/api/files/${id}.${ext}`, name });
}));

app.get('/api/files/:f', auth, wrap(async (req, res) => {
  const id = String(req.params.f).split('.')[0];
  const f = /^[a-f0-9]{32}$/.test(id) && await store.getFile(id);
  if (!f) return res.status(404).send('Berkas tidak ditemukan');
  res.set({
    'Content-Type': f.mime,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name || id)}`,
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  res.send(Buffer.from(f.data));
}));

/* ---------- Integrasi LMS (data mahasiswa & pembayaran, baca-saja) ---------- */
const LMS_URL = String(process.env.LMS_API_URL || '').replace(/\/+$/, '');
const LMS_TOKEN = process.env.LMS_API_TOKEN || '';
const LMS_CACHE_MS = (+process.env.LMS_CACHE_DETIK || 120) * 1000;
let lmsCache = null, lmsPending = null;

async function fetchLms() {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(LMS_URL + '/api/keuangan/snapshot', {
      headers: { Authorization: 'Bearer ' + LMS_TOKEN, Accept: 'application/json', 'User-Agent': 'stie-keuangan/1.0' },
      signal: ctl.signal,
    });
    const txt = await r.text();
    let body = null; try { body = JSON.parse(txt); } catch (e) {}
    if (!r.ok || !body) {
      const why = r.status === 401 ? 'token LMS_API_TOKEN tidak cocok dengan KEUANGAN_API_TOKEN di LMS'
        : r.status === 503 ? 'integrasi belum diaktifkan di LMS (isi KEUANGAN_API_TOKEN di .env LMS)'
        : r.status === 404 ? 'alamat API tidak ditemukan; pastikan file integrasi sudah diunggah ke LMS'
        : r.status === 403 ? 'IP server keuangan ditolak oleh LMS (KEUANGAN_API_IP)'
        : !body ? 'LMS tidak mengirim data JSON (status ' + r.status + ')' : (body.message || 'status ' + r.status);
      const e = new Error('Gagal mengambil data dari LMS: ' + why + '.'); e.status = 502; throw e;
    }
    return { at: Date.now(), data: body };
  } catch (e) {
    if (e.status) throw e;
    const er = new Error(e.name === 'AbortError' ? 'LMS tidak merespons (lebih dari 25 detik).' : 'Tidak dapat terhubung ke LMS: ' + e.message);
    er.status = 502; throw er;
  } finally { clearTimeout(tm); }
}

app.get('/api/lms/snapshot', auth, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!LMS_URL || !LMS_TOKEN) return res.status(503).json({ error: 'Integrasi LMS belum diatur. Isi LMS_API_URL dan LMS_API_TOKEN di Railway → Variables.', setup: true });
  const fresh = req.query.refresh === '1';
  if (!lmsCache || fresh || Date.now() - lmsCache.at > LMS_CACHE_MS) {
    lmsPending = lmsPending || fetchLms().finally(() => { lmsPending = null; });
    try { lmsCache = await lmsPending; lmsDiff(lmsCache.data).catch(e => console.error('lms-notif', e.message)); }
    catch (e) {
      // LMS sedang tidak dapat dihubungi: tampilkan data terakhir bila ada.
      if (lmsCache) return res.json({ diambil: new Date(lmsCache.at).toISOString(), usang: true, peringatan: e.message, ...lmsCache.data });
      return res.status(e.status || 502).json({ error: e.message });
    }
  }
  res.json({ diambil: new Date(lmsCache.at).toISOString(), lms_url: LMS_URL, ...lmsCache.data });
}));

/* ---------- Notifikasi pembayaran dari LMS untuk pimpinan ----------
 * Server membandingkan snapshot LMS dengan kondisi terakhir yang dilihat. Pembayaran
 * baru dari mahasiswa (bukti dikirim / pembayaran diterima) dicatat sebagai "kejadian"
 * di tabel kv (bukan di data utama, agar tidak bentrok dengan pengguna yang sedang
 * menyimpan). Browser pimpinan mengambil kejadian baru dan memasukkannya ke notifikasi. */
const LMS_NOTIF_MENIT = Math.max(1, +process.env.LMS_NOTIF_MENIT || 3);
const rupiah = n => 'Rp ' + (Math.round(+n || 0)).toLocaleString('id-ID');
const blnLabel = ym => { if (!/^\d{4}-\d{2}$/.test(ym || '')) return ''; const [y, m] = ym.split('-'); return ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][+m - 1] + ' ' + y; };
let lmsDiffBusy = false;
async function lmsDiff(d) {
  if (lmsDiffBusy || !d || !Array.isArray(d.pembayaran) || !Array.isArray(d.tagihan)) return;
  lmsDiffBusy = true;
  try {
    const now = { p: {}, t: {} };
    d.pembayaran.forEach(p => { if (/^\d+$/.test(String(p.id))) now.p[p.id] = p.status; });
    d.tagihan.forEach(t => { now.t[t.id] = t.status; });
    const prev = await store.getKV('lms_seen');
    await store.setKV('lms_seen', now);
    if (!prev) return; // pertama kali: catat kondisi awal saja, tanpa notifikasi
    const mhs = new Map((d.mahasiswa || []).map(m => [m.id, m])), tg = new Map(d.tagihan.map(t => [t.id, t]));
    const siapa = (uid, t) => { const m = mhs.get(uid); const n = m ? m.nama : (t && t.nama) || 'Mahasiswa'; const npm = m ? m.npm : t && t.npm; return n + (npm ? ' (' + npm + ')' : ''); };
    const apa = (t, ke) => (t ? t.jenis : 'tagihan') + (t && t.bulan ? ' bulan ' + blnLabel(t.bulan) : '') + (ke > 1 ? ' cicilan ke-' + ke : '');
    const ev = [];
    d.pembayaran.forEach(p => {
      if (!/^\d+$/.test(String(p.id)) || p.dari_keuangan) return;
      const old = prev.p[p.id], t = tg.get(p.tagihan_id);
      if (!old && p.status === 'menunggu') ev.push({ jenis: 'bukti', user_id: p.user_id, nominal: p.nominal, m: `Bukti bayar mahasiswa: ${siapa(p.user_id, t)} mengirim bukti ${apa(t, p.ke)} sebesar ${rupiah(p.nominal)}. Menunggu verifikasi bendahara di LMS.` });
      if (p.status === 'valid' && old !== 'valid') ev.push({ jenis: 'diterima', user_id: p.user_id, nominal: p.nominal, m: `Pembayaran mahasiswa diterima: ${siapa(p.user_id, t)} membayar ${apa(t, p.ke)} sebesar ${rupiah(p.nominal)}${p.metode ? ' via ' + p.metode : ''}.` });
    });
    d.tagihan.forEach(t => {
      if (t.status === 'menunggu_verifikasi' && prev.t[t.id] && prev.t[t.id] !== 'menunggu_verifikasi')
        ev.push({ jenis: 'bukti', user_id: t.user_id, nominal: t.sisa, m: `Bukti bayar mahasiswa: ${siapa(t.user_id, t)} mengirim bukti pelunasan ${apa(t, 1)} sebesar ${rupiah(t.sisa)}. Menunggu verifikasi bendahara di LMS.` });
    });
    if (!ev.length) return;
    const box = (await store.getKV('lms_events')) || { seq: 0, list: [] };
    const at = new Date().toISOString();
    const add = ev.length > 40
      ? [{ jenis: 'ringkas', user_id: null, nominal: ev.reduce((a, e) => a + (e.jenis === 'diterima' ? +e.nominal || 0 : 0), 0), m: `Pembayaran mahasiswa diterima: ${ev.filter(e => e.jenis === 'diterima').length} pembayaran baru dan ${ev.filter(e => e.jenis === 'bukti').length} bukti bayar masuk di LMS sejak pemeriksaan terakhir.` }]
      : ev;
    add.forEach(e => box.list.push({ id: ++box.seq, at, ...e }));
    box.list = box.list.slice(-300);
    await store.setKV('lms_events', box);
    console.log(`Notifikasi LMS: ${add.length} kejadian baru.`);
  } finally { lmsDiffBusy = false; }
}
async function lmsWatch() {
  if (!LMS_URL || !LMS_TOKEN) return;
  try { lmsCache = await (lmsPending = lmsPending || fetchLms().finally(() => { lmsPending = null; })); await lmsDiff(lmsCache.data); }
  catch (e) { console.error('Pemeriksaan LMS gagal:', e.message); }
}

app.get('/api/lms/events', auth, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.user.role !== 'Admin') return res.json({ list: [] });
  const since = +req.query.since || 0, box = (await store.getKV('lms_events')) || { seq: 0, list: [] };
  res.json({ seq: box.seq, list: box.list.filter(e => e.id > since) });
}));

/* Catat / batalkan pembayaran manual di LMS (bendahara & pimpinan). */
/* Bukti bayar dikirim browser sebagai base64 -> diteruskan ke LMS sebagai multipart. */
const BUKTI_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
function bacaBukti(b) {
  if (!b || !b.data) return null;
  const type = String(b.type || '').toLowerCase();
  if (!BUKTI_MIME[type]) { const e = new Error('Bukti bayar harus berupa JPG, PNG, atau PDF.'); e.status = 422; throw e; }
  const buf = Buffer.from(String(b.data), 'base64');
  if (!buf.length) { const e = new Error('Berkas bukti kosong.'); e.status = 422; throw e; }
  if (buf.length > 5 * 1024 * 1024) { const e = new Error('Ukuran bukti bayar maksimal 5 MB.'); e.status = 422; throw e; }
  const name = String(b.name || ('bukti.' + BUKTI_MIME[type])).replace(/[\\/\r\n"]/g, '_').slice(0, 150);
  return { buf, type, name };
}
function multipart(fields, bukti) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined && v !== '') fd.append(k, String(v));
  if (bukti) fd.append('bukti', new Blob([bukti.buf], { type: bukti.type }), bukti.name);
  return fd;
}

async function postLms(path, body) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 45000);
  const isForm = body instanceof FormData;
  try {
    const r = await fetch(LMS_URL + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + LMS_TOKEN, Accept: 'application/json', 'User-Agent': 'stie-keuangan/1.0', ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
      body: isForm ? body : JSON.stringify(body), signal: ctl.signal,
    });
    let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok) {
      const first = d && d.errors ? Object.values(d.errors).flat()[0] : null;
      const e = new Error(first || (d && d.message) || (r.status === 404 ? 'Fitur pencatatan belum terpasang di LMS (perbarui file LMS).' : 'LMS menolak permintaan (status ' + r.status + ').'));
      e.status = r.status >= 500 ? 502 : 422; throw e;
    }
    lmsCache = null; // data berubah: ambil ulang snapshot berikutnya
    return d;
  } catch (e) {
    if (e.status) throw e;
    const er = new Error(e.name === 'AbortError' ? 'LMS tidak merespons.' : 'Tidak dapat terhubung ke LMS: ' + e.message); er.status = 502; throw er;
  } finally { clearTimeout(tm); }
}
const pencatat = u => `${u.name} (${u.role === 'Admin' ? 'Pimpinan' : u.role})`;

app.post('/api/lms/pembayaran', auth, json, wrap(async (req, res) => {
  if (!LMS_URL || !LMS_TOKEN) return res.status(503).json({ error: 'Integrasi LMS belum diatur.' });
  const b = req.body || {};
  const body = {
    user_id: +b.user_id, tagihan_id: b.tagihan_id ? +b.tagihan_id : null,
    jenis: b.jenis || null, keterangan: b.keterangan || null, bulan_tagihan: b.bulan_tagihan || null,
    nominal: String(b.nominal || '').replace(/\D/g, ''), tanggal_bayar: b.tanggal_bayar, metode: b.metode,
    catatan: b.catatan || null, pencatat: pencatat(req.user),
  };
  const bukti = bacaBukti(b.bukti);
  res.status(201).json(await postLms('/api/keuangan/pembayaran', bukti ? multipart(body, bukti) : body));
}));

app.post('/api/lms/pembayaran/:id/batal', auth, json, wrap(async (req, res) => {
  if (!LMS_URL || !LMS_TOKEN) return res.status(503).json({ error: 'Integrasi LMS belum diatur.' });
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Pembayaran tidak valid.' });
  res.json(await postLms('/api/keuangan/pembayaran/' + req.params.id + '/batal', { pencatat: pencatat(req.user), alasan: String(req.body?.alasan || '').slice(0, 200) || null }));
}));

app.post('/api/lms/pembayaran/:id/bukti', auth, json, wrap(async (req, res) => {
  if (!LMS_URL || !LMS_TOKEN) return res.status(503).json({ error: 'Integrasi LMS belum diatur.' });
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Pembayaran tidak valid.' });
  const bukti = bacaBukti(req.body?.bukti);
  if (!bukti) return res.status(422).json({ error: 'Pilih berkas bukti bayar.' });
  res.json(await postLms('/api/keuangan/pembayaran/' + req.params.id + '/bukti', multipart({ pencatat: pencatat(req.user) }, bukti)));
}));

/* Lihat bukti bayar yang tersimpan di LMS (diteruskan apa adanya). */
app.get('/api/lms/bukti/:jenis/:id', auth, wrap(async (req, res) => {
  if (!LMS_URL || !LMS_TOKEN) return res.status(503).send('Integrasi LMS belum diatur.');
  const { jenis, id } = req.params;
  if (!['pembayaran', 'tagihan'].includes(jenis) || !/^\d+$/.test(id)) return res.status(400).send('Permintaan tidak valid.');
  let r;
  try { r = await fetch(`${LMS_URL}/api/keuangan/bukti/${jenis}/${id}`, { headers: { Authorization: 'Bearer ' + LMS_TOKEN, 'User-Agent': 'stie-keuangan/1.0' } }); }
  catch (e) { return res.status(502).send('Tidak dapat terhubung ke LMS.'); }
  if (!r.ok) return res.status(r.status === 404 ? 404 : 502).send(r.status === 404 ? 'Bukti bayar tidak ditemukan di LMS.' : 'LMS menolak permintaan (status ' + r.status + ').');
  const type = r.headers.get('content-type') || 'application/octet-stream';
  res.set({ 'Content-Type': type, 'Content-Disposition': r.headers.get('content-disposition') || 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.from(await r.arrayBuffer()));
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Tidak ditemukan.' }));

/* ---------- Frontend ---------- */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '1h' : 0, index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Ukuran data/berkas terlalu besar.' });
  if (err.status && err.message && err.status !== 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

/* ---------- Start ---------- */
async function seedUsers() {
  if (await store.countUsers()) return;
  const def = [
    { u: 'bendahara', name: 'Desta Amelia Sari', role: 'Bendahara', p: process.env.BENDAHARA_PASSWORD || 'bendahara123' },
    { u: 'pimpinan', name: 'Dini Eka Prasasti', role: 'Admin', p: process.env.PIMPINAN_PASSWORD || 'pimpinan123' },
  ];
  for (const d of def) await store.createUser({ u: d.u, name: d.name, role: d.role, pass_hash: await hashPw(d.p) });
  console.log('Akun awal dibuat: bendahara, pimpinan. Segera ganti password setelah login pertama.');
}
async function cleanup() {
  try {
    const s = JSON.stringify((await store.getState()).data);
    const keep = new Set([...s.matchAll(/\/api\/files\/([a-f0-9]{32})/g)].map(m => m[1]));
    const n = await store.cleanupFiles(keep);
    if (n) console.log(`Membersihkan ${n} berkas yang tidak dipakai.`);
  } catch (e) { console.error('cleanup', e.message); }
}

(async () => {
  await store.init();
  await seedUsers();
  cleanup(); setInterval(cleanup, 6 * 3600e3).unref();
  if (LMS_URL && LMS_TOKEN) { setTimeout(lmsWatch, 15000).unref(); setInterval(lmsWatch, LMS_NOTIF_MENIT * 60e3).unref(); }
  app.listen(PORT, () => console.log(`Server berjalan di port ${PORT} (penyimpanan: ${store.kind})`));
})().catch(e => { console.error('Gagal memulai server:', e); process.exit(1); });
