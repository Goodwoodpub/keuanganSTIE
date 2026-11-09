/* ===== Pembayaran Mahasiswa (data dari LMS, baca-saja) ===== */
/* Tabel ringkas: teks boleh turun baris, baris dapat diklik (tanpa geser kanan-kiri). */
document.head.insertAdjacentHTML('beforeend', `<style>
.lmt{table-layout:auto}.lmt th,.lmt td{white-space:normal;padding:10px 8px;vertical-align:middle;line-height:1.35}
.lmt th.n,.lmt td.n{text-align:right;white-space:nowrap}.lmt .bd{white-space:nowrap}
.lmt td small,.lmt td .sm{display:block;font-size:12px;color:var(--mu);margin-top:2px}
.lmt tr.ck{cursor:pointer}.lmt tr.ck:hover td{background:#f1f5fd}
.lmt td.go{width:22px;padding-left:0;padding-right:4px;color:var(--mu)}.lmt td.go svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2}
.lmt.yr th,.lmt.yr td{padding:7px 3px}.lmt.yr td.nm{padding-left:8px;min-width:150px}
.lmf{border:1px solid var(--bd);border-radius:12px;padding:16px;margin-top:14px;background:#fbfcfe}
@media(max-width:700px){.lmt .hm{display:none}}
</style>`);
const LM = { d: null, err: null, setup: false, loading: false, tab: 'ring', q: '', st: '', ang: '', pr: '', per: '', dari: '', sampai: '', uq: '' };
IC.mhs = '<svg viewBox="0 0 24 24"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6"/></svg>';
SUBT.mhs = 'Data mahasiswa, tagihan, dan uang masuk dari LMS';
SUBT.mhsd = 'Status tagihan dan riwayat pembayaran mahasiswa';

const LST = {
  lunas: ['Lunas', 's-Selesai'],
  nunggak: ['Menunggak', 's-Ditolak'],
  menunggu: ['Menunggu verifikasi', 's-Menunggu-verifikasi'],
  sebagian: ['Dibayar sebagian', 's-Dalam-pertanggungjawaban'],
  belum: ['Belum bayar', 's-Perlu-revisi'],
  kosong: ['Tidak ada tagihan', ''],
};
const lGo = id => `class=ck onclick="go('mhsd',${id})" title="Klik untuk melihat detail"`;
const lChev = () => `<td class=go>${SV.chev}</td>`;
const lMhsCell = (m, extra = '') => `<b>${esc(m.nama)}</b><small>${esc(m.npm || 'NPM -')}${m.prodi ? ' · ' + esc(m.prodi) : ''}${m.angkatan ? ' · 20' + esc(m.angkatan) : ''}${m.status_akademik && m.status_akademik != 'aktif' ? ' · ' + esc(m.status_akademik_label) : ''}${extra}</small>`;
const lBadge = k => `<span class="bd ${LST[k][1]}">${LST[k][0]}</span>`;
const lTgl = s => s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const lDay = s => String(s || '').slice(0, 10);
const lIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const lPerKey = t => t.tahun_ajaran ? t.tahun_ajaran + '-' + (t.periode || '') : '';

async function lmsLoad(force) {
  if (LM.loading) return;
  LM.loading = true; LM.err = null;
  if (force && $('lmsBtn')) { $('lmsBtn').disabled = true; $('lmsBtn').textContent = 'Memuat…'; }
  try {
    const d = await API.get('/api/lms/snapshot' + (force ? '?refresh=1' : ''));
    lmsIndex(d); LM.d = d; LM.setup = false;
  } catch (e) { LM.err = e.message; LM.setup = !!(e.data && e.data.setup); }
  LM.loading = false;
  if (['mhs', 'mhsd'].includes(v)) draw();
}

function lmsIndex(d) {
  const by = (L, k) => { const m = new Map(); L.forEach(x => { const id = x[k]; if (!m.has(id)) m.set(id, []); m.get(id).push(x); }); return m; };
  d.tByUser = by(d.tagihan, 'user_id');
  d.pByTagihan = by(d.pembayaran, 'tagihan_id');
  d.tById = new Map(d.tagihan.map(t => [t.id, t]));
  d.mById = new Map(d.mahasiswa.map(m => [m.id, m]));
  d.periodes = [...new Map(d.tagihan.filter(t => t.tahun_ajaran).map(t => [lPerKey(t), t.periode_label])).entries()].sort((a, b) => b[0].localeCompare(a[0]));
  d.angkatan = [...new Set(d.mahasiswa.map(m => m.angkatan).filter(Boolean))].sort().reverse();
  d.prodi = [...new Set(d.mahasiswa.map(m => m.prodi).filter(Boolean))].sort();
}

/* Tagihan dalam periode terpilih */
const lTag = list => (list || []).filter(t => !LM.per || lPerKey(t) === LM.per);
/* Ringkasan status satu mahasiswa */
function lSum(m) {
  const d = LM.d, T = lTag(d.tByUser.get(m.id));
  const total = T.reduce((a, t) => a + t.nominal, 0), dibayar = T.reduce((a, t) => a + t.dibayar, 0), sisa = T.reduce((a, t) => a + t.sisa, 0);
  const tunggu = T.some(t => t.status === 'menunggu_verifikasi' || (d.pByTagihan.get(t.id) || []).some(p => p.status === 'menunggu'));
  const telat = T.some(t => t.terlambat && t.sisa > 0);
  const st = !T.length ? 'kosong' : sisa <= 0 ? 'lunas' : telat ? 'nunggak' : tunggu ? 'menunggu' : dibayar > 0 ? 'sebagian' : 'belum';
  return { T, total, dibayar, sisa, st, telat, tunggu };
}
const lMhs = () => {
  const q = LM.q.trim().toLowerCase();
  return LM.d.mahasiswa.filter(m => (!LM.ang || m.angkatan === LM.ang) && (!LM.pr || m.prodi === LM.pr)
    && (!q || (m.nama + ' ' + (m.npm || '')).toLowerCase().includes(q))).map(m => ({ m, s: lSum(m) }))
    .filter(x => !LM.st || x.s.st === LM.st);
};
/* Uang masuk = pembayaran valid */
const lMasuk = (dari, sampai) => LM.d.pembayaran.filter(p => p.status === 'valid' && (!dari || lDay(p.tanggal) >= dari) && (!sampai || lDay(p.tanggal) <= sampai))
  .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));

/* ---------- Halaman utama ---------- */
function mhsv() {
  if (!LM.d && !LM.err) { lmsLoad(); return `<div class=box><div class=empty>${IC.mhs}<b>Mengambil data dari LMS…</b><small>Mohon tunggu sebentar.</small></div></div>`; }
  if (!LM.d) return lmsErr();
  const d = LM.d, tab = (k, t) => `<button class="${LM.tab == k ? 'on' : ''}" onclick="LM.tab='${k}';draw()">${t}</button>`;
  const info = `<div class=box style="padding:14px 18px"><div class=lh style="margin:0;align-items:center"><div><b>Terhubung ke LMS</b><small class=mu style="display:block">Data diperbarui ${new Date(d.diambil).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}${d.usang ? ' · <span style="color:var(--red)">LMS sedang tidak dapat dihubungi, menampilkan data terakhir</span>' : ''}. Verifikasi pembayaran tetap dilakukan di LMS.</small></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn o" id=lmsBtn onclick="lmsLoad(true)">Muat Ulang Data</button>${d.lms_url ? `<a class="btn o" href="${esc(d.lms_url)}/kelola-tagihan" target=_blank rel=noopener>Buka LMS</a>` : ''}</div></div></div>`;
  return info + `<div class=tabs style="display:inline-flex;margin:4px 0 14px">${tab('ring', 'Ringkasan')}${tab('mhs', 'Status Mahasiswa')}${tab('bulan', 'Cek Per Bulan')}${tab('masuk', 'Uang Masuk')}</div>`
    + (LM.tab == 'mhs' ? lTabMhs() : LM.tab == 'bulan' ? lTabBulan() : LM.tab == 'masuk' ? lTabMasuk() : lTabRing());
}

function lmsErr() {
  return `<div class=box><div class=empty>${IC.mhs}<b>${LM.setup ? 'Integrasi LMS belum diatur' : 'Data LMS belum dapat dimuat'}</b><small>${esc(LM.err)}</small></div>
  ${LM.setup ? `<div class=desc style="margin-top:14px"><small>Cara mengaktifkan</small><p>1. Di LMS, isi <b>KEUANGAN_API_TOKEN</b> pada file .env.<br>2. Di Railway (aplikasi keuangan) → Variables, isi <b>LMS_API_URL</b> (mis. https://lms.stiekrakatau.ac.id) dan <b>LMS_API_TOKEN</b> dengan token yang sama.<br>3. Muat ulang halaman ini.</p></div>` : ''}
  <p style="text-align:center;margin-top:14px"><button class=btn onclick="LM.err=null;lmsLoad(true);draw()">Coba Lagi</button></p></div>`;
}

const lPerSel = () => `<div><label>Periode tagihan</label><select onchange="LM.per=this.value;draw()"><option value="">Semua periode</option>${LM.d.periodes.map(([k, l]) => `<option value="${esc(k)}" ${k == LM.per ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;

function lTabRing() {
  const d = LM.d, all = d.mahasiswa.map(m => ({ m, s: lSum(m) })), T = lTag(d.tagihan);
  const tot = T.reduce((a, t) => a + t.nominal, 0), byr = T.reduce((a, t) => a + t.dibayar, 0), sisa = T.reduce((a, t) => a + t.sisa, 0);
  const now = new Date(), bln = lIso(new Date(now.getFullYear(), now.getMonth(), 1)), mIn = lMasuk(bln, lIso(now)), mInT = mIn.reduce((a, p) => a + p.nominal, 0);
  const cnt = k => all.filter(x => x.s.st == k).length, pct = tot ? Math.round(byr / tot * 100) : 0;
  const K = [['Total tagihan', Rp(tot), `${T.length} tagihan · ${LM.per ? 'periode terpilih' : 'semua periode'}`, 'list'], ['Sudah dibayar', Rp(byr), `${pct}% dari total tagihan`, 'audit'], ['Belum dibayar (piutang)', Rp(sisa), `${cnt('nunggak')} mahasiswa menunggak`, 'rep'], ['Uang masuk bulan ini', Rp(mInT), `${mIn.length} transaksi`, 'new']];
  // per bulan (12 bulan terakhir)
  const bm = {}; for (let i = 11; i >= 0; i--) { const x = new Date(now.getFullYear(), now.getMonth() - i, 1); bm[lIso(x).slice(0, 7)] = 0; }
  lMasuk().forEach(p => { const k = lDay(p.tanggal).slice(0, 7); if (k in bm) bm[k] += p.nominal; });
  const mx = Math.max(1, ...Object.values(bm));
  const bulan = Object.entries(bm).map(([k, a]) => `<div class=bar2r><div class=bl><span>${mLabel(k)}</span><b>${Rp(a)}</b></div><div class=trk><i style="width:${a ? Math.max(3, a / mx * 100) : 0}%"></i></div></div>`).join('');
  const jn = {}; lMasuk().forEach(p => { const t = d.tById.get(p.tagihan_id); if (!t || (LM.per && lPerKey(t) !== LM.per)) return; jn[t.jenis] = (jn[t.jenis] || 0) + p.nominal; });
  const mxj = Math.max(1, ...Object.values(jn));
  const tg = all.filter(x => x.s.st == 'nunggak').sort((a, b) => b.s.sisa - a.s.sisa).slice(0, 8);
  return `<div class=box style="padding:14px 18px"><div class=g2 style="margin:0">${lPerSel()}</div></div>
  <div class=kpis>${K.map(([a, b, c, k]) => `<div class=kpi><div class=kh><span>${a}</span><i class=ci>${IC[k]}</i></div><b>${b}</b><small>${c}</small></div>`).join('')}</div>
  <div class=attn><span class=al>Mahasiswa</span>${['lunas', 'sebagian', 'menunggu', 'belum', 'nunggak', 'kosong'].map(k => `<div class="ai ${cnt(k) && k != 'lunas' && k != 'kosong' ? 'on' : ''}" onclick="LM.tab='mhs';LM.st='${k}';draw()"><b>${cnt(k)}</b><span>${LST[k][0]}</span></div>`).join('')}</div>
  <div class=g2b><div class=box><h4>Uang masuk per bulan</h4>${bulan}</div><div class=box><h4>Uang masuk per jenis tagihan</h4>${Object.keys(jn).length ? Object.entries(jn).sort((a, b) => b[1] - a[1]).map(([k, a]) => `<div class=bar2r><div class=bl><span>${esc(k)}</span><b>${Rp(a)}</b></div><div class=trk><i style="width:${Math.max(3, a / mxj * 100)}%"></i></div></div>`).join('') : `<div class=empty>${IC.rep}<b>Belum ada pembayaran</b></div>`}</div></div>
  <div class=box><div class=bh><h4>Mahasiswa menunggak (sisa terbesar)</h4><a class=lnk2 onclick="LM.tab='mhs';LM.st='nunggak';draw()">Lihat semua →</a></div>${tg.length ? `<div class=tw><table class=lmt><tr><th>Mahasiswa</th><th class=n>Sisa tagihan</th><th></th></tr>${tg.map(({ m, s }) => `<tr ${lGo(m.id)}><td>${lMhsCell(m)}</td><td class=n>${Rp(s.sisa)}</td>${lChev()}</tr>`).join('')}</table></div>` : `<div class=empty>${IC.audit}<b>Tidak ada mahasiswa yang menunggak</b></div>`}</div>`;
}

function lTabMhs() {
  const d = LM.d, sel = (k, lbl, opts) => `<div><label>${lbl}</label><select onchange="LM.${k}=this.value;lRefMhs()"><option value="">Semua</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${v == LM[k] ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  return `<div class=box><div class=g2 style="margin-top:0;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><div><label>Cari nama / NPM</label><input value="${esc(LM.q)}" placeholder="Ketik nama atau NPM" oninput="LM.q=this.value;clearTimeout(window._lt);window._lt=setTimeout(lRefMhs,200)"></div>
  ${sel('st', 'Status pembayaran', Object.entries(LST).map(([k, v]) => [k, v[0]]))}${sel('ang', 'Angkatan', d.angkatan.map(a => [a, '20' + a]))}${sel('pr', 'Program studi', d.prodi.map(p => [p, p]))}
  <div><label>Periode tagihan</label><select onchange="LM.per=this.value;lRefMhs()"><option value="">Semua periode</option>${d.periodes.map(([k, l]) => `<option value="${esc(k)}" ${k == LM.per ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
  <div id=lmsL>${lRowsMhs()}</div></div>`;
}
function lRefMhs() { const e = $('lmsL'); if (e) e.innerHTML = lRowsMhs(); }
function lRowsMhs() {
  const L = lMhs().sort((a, b) => (a.m.npm || '').localeCompare(b.m.npm || '')); window._lmsRows = L;
  const s = k => L.reduce((a, x) => a + x.s[k], 0);
  return `<div class=lh style="margin:14px 0 8px;align-items:center"><small class=mu>${L.length} mahasiswa · tagihan ${Rp(s('total'))} · dibayar ${Rp(s('dibayar'))} · sisa ${Rp(s('sisa'))}</small><button class="btn o" onclick="lCsvMhs()" ${L.length ? '' : 'disabled'}>Ekspor Excel (CSV)</button></div>
  <div class=tw><table class=lmt><tr><th>Mahasiswa</th><th class="n hm">Total tagihan</th><th class=n>Dibayar</th><th class=n>Sisa</th><th>Status</th><th></th></tr>${L.map(({ m, s }) => `<tr ${lGo(m.id)}><td>${lMhsCell(m)}</td><td class="n hm">${Rp(s.total)}</td><td class=n>${Rp(s.dibayar)}</td><td class=n>${Rp(s.sisa)}</td><td>${lBadge(s.st)}</td>${lChev()}</tr>`).join('') || '<tr><td colspan=6>Tidak ada mahasiswa yang cocok dengan filter.</td></tr>'}</table></div>
  <small class=mu style="display:block;margin-top:8px">Klik baris untuk melihat detail tagihan, riwayat pembayaran, atau mencatat pembayaran manual.</small>`;
}

function lTabMasuk() {
  const now = new Date();
  if (!LM.dari && !LM.sampai) { LM.dari = lIso(new Date(now.getFullYear(), now.getMonth(), 1)); LM.sampai = lIso(now); }
  const pre = [['Hari ini', lIso(now), lIso(now)], ['Bulan ini', lIso(new Date(now.getFullYear(), now.getMonth(), 1)), lIso(now)], ['Tahun ini', now.getFullYear() + '-01-01', lIso(now)], ['Semua', '', '']];
  return `<div class=box><div class=g2 style="margin-top:0;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><div><label>Dari tanggal</label><input type=date value="${LM.dari}" onchange="LM.dari=this.value;lRefMasuk()"></div><div><label>Sampai tanggal</label><input type=date value="${LM.sampai}" onchange="LM.sampai=this.value;lRefMasuk()"></div><div><label>Cari nama / NPM</label><input value="${esc(LM.uq)}" placeholder="Ketik nama atau NPM" oninput="LM.uq=this.value;clearTimeout(window._lt);window._lt=setTimeout(lRefMasuk,200)"></div></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${pre.map(([t, a, b]) => `<button class="btn o" onclick="LM.dari='${a}';LM.sampai='${b}';${b ? '' : "LM.dari='';LM.sampai='0';"}draw()">${t}</button>`).join('')}</div>
  <div id=lmsM>${lRowsMasuk()}</div></div>`;
}
function lRefMasuk() { const e = $('lmsM'); if (e) e.innerHTML = lRowsMasuk(); }
function lRowsMasuk() {
  const d = LM.d, q = LM.uq.trim().toLowerCase(), all = LM.sampai === '0';
  const L = lMasuk(all ? '' : LM.dari, all ? '' : LM.sampai).map(p => ({ p, t: d.tById.get(p.tagihan_id) || {}, m: d.mById.get(p.user_id) }))
    .filter(x => !q || ((x.m ? x.m.nama + ' ' + x.m.npm : (x.t.nama || '') + ' ' + (x.t.npm || ''))).toLowerCase().includes(q));
  window._lmsMasuk = L;
  const tot = L.reduce((a, x) => a + x.p.nominal, 0), mt = {}; L.forEach(x => { const k = x.p.metode || 'Lainnya'; mt[k] = (mt[k] || 0) + x.p.nominal; });
  return `<div class=kpis style="margin-top:16px">${[['Total uang masuk', Rp(tot), all ? 'semua tanggal' : `${fmtD(LM.dari)} – ${fmtD(LM.sampai)}`, 'new'], ['Jumlah transaksi', L.length, `${new Set(L.map(x => x.p.user_id)).size} pembayar`, 'list'], ['Rata-rata per transaksi', Rp(L.length ? Math.round(tot / L.length) : 0), 'pembayaran tervalidasi', 'rep']].map(([a, b, c, k]) => `<div class=kpi><div class=kh><span>${a}</span><i class=ci>${IC[k]}</i></div><b>${b}</b><small>${c}</small></div>`).join('')}</div>
  ${Object.keys(mt).length ? `<div class=mu style="margin:4px 0 10px;font-size:13px">Per metode: ${Object.entries(mt).sort((a, b) => b[1] - a[1]).map(([k, a]) => `<b>${esc(k)}</b> ${Rp(a)}`).join(' · ')}</div>` : ''}
  <div class=lh style="margin:6px 0 8px;justify-content:flex-end"><button class="btn o" onclick="lCsvMasuk()" ${L.length ? '' : 'disabled'}>Ekspor Excel (CSV)</button></div>
  <div class=tw><table class=lmt><tr><th>Tanggal</th><th>Mahasiswa</th><th>Tagihan</th><th class=hm>Metode</th><th class=n>Nominal</th><th></th></tr>${L.map(({ p, t, m }) => `<tr ${m ? lGo(m.id) : ''}><td style="white-space:nowrap">${lTgl(p.tanggal)}</td><td>${m ? `<b>${esc(m.nama)}</b><small>${esc(m.npm || '-')}</small>` : `<b>${esc(t.nama || '-')}</b><small>${esc(t.npm || '')} · arsip/tanpa akun</small>`}</td><td>${esc(t.jenis || '-')}<small>${t.jenis && lBlnT(t) ? 'Bulan ' + esc(mLabel(lBlnT(t))) : esc(t.periode_label || '')}${(p.ke || 1) > 1 ? ' · pembayaran ke-' + p.ke : ''}</small></td><td class=hm>${esc(p.metode || '-')}${p.dari_keuangan ? '<small>dicatat manual</small>' : ''}</td><td class=n>${Rp(p.nominal)}</td>${m ? lChev() : '<td></td>'}</tr>`).join('') || '<tr><td colspan=6>Belum ada uang masuk pada rentang ini.</td></tr>'}${L.length ? `<tr class=trt><td colspan=4>Total</td><td class=n>${Rp(tot)}</td><td></td></tr>` : ''}</table></div>`;
}

/* ---------- Detail mahasiswa ---------- */
function mhsdv() {
  if (!LM.d) return mhsv();
  if (LM.formFor !== cur) { LM.form = false; LM.formFor = cur; }
  const d = LM.d, m = d.mById.get(cur);
  if (!m) return `<div class=box><div class=empty>${IC.mhs}<b>Mahasiswa tidak ditemukan</b></div><p style="text-align:center"><button class="btn o" onclick="go('mhs')">Kembali</button></p></div>`;
  const T = (d.tByUser.get(m.id) || []).slice().sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat)) || b.id - a.id);
  const P = T.flatMap(t => (d.pByTagihan.get(t.id) || []).map(p => ({ p, t }))).sort((a, b) => String(b.p.tanggal).localeCompare(String(a.p.tanggal)));
  const tot = T.reduce((a, t) => a + t.nominal, 0), byr = T.reduce((a, t) => a + t.dibayar, 0), sisa = T.reduce((a, t) => a + t.sisa, 0);
  const sAll = (() => { const s = LM.per; LM.per = ''; const r = lSum(m); LM.per = s; return r; })();
  const pBadge = s => `<span class="bd ${s == 'valid' ? 's-Selesai' : s == 'menunggu' ? 's-Menunggu-verifikasi' : s == 'ditolak' ? 's-Ditolak' : ''}">${{ valid: 'Valid', menunggu: 'Menunggu verifikasi', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' }[s] || esc(s)}</span>`;
  const tBadge = t => lBadge(t.sisa <= 0 ? 'lunas' : t.terlambat ? 'nunggak' : t.status == 'menunggu_verifikasi' ? 'menunggu' : t.dibayar > 0 ? 'sebagian' : 'belum');
  const aSt = { lunas: ['Lunas', 's-Selesai'], sebagian: ['Sebagian', 's-Dalam-pertanggungjawaban'], terlambat: ['Terlambat', 's-Ditolak'], belum: ['Belum', 's-Perlu-revisi'] };
  return `<div class=box><div class=dtop><button class="btn o bk" onclick="go('mhs')">${SV.back} Kembali</button>${lBadge(sAll.st)}</div>
  <div class=dti><small class=mu>${esc(m.npm || 'NPM belum diisi')}</small><h3>${esc(m.nama)}</h3><div class=dtt>${esc(m.prodi || '-')} · ${esc(m.jenjang || '')}${m.angkatan ? ' · Angkatan 20' + esc(m.angkatan) : ''} · ${esc(m.status_akademik_label)}</div></div>
  <div class=amts><div class=am><small>Total tagihan</small><b>${Rp(tot)}</b><em>${T.length} tagihan</em></div><div class=am><small>Sudah dibayar</small><b>${Rp(byr)}</b>${tot ? `<em>${Math.round(byr / tot * 100)}% dari total</em>` : ''}</div><div class=am><small>Sisa tagihan</small><b>${Rp(sisa)}</b>${sAll.telat ? '<em style="color:var(--red)">Ada yang lewat jatuh tempo</em>' : ''}</div></div>
  ${sAll.tunggu ? `<div class="aps warn" style="margin:12px 0">Ada pembayaran yang menunggu verifikasi di LMS.</div>` : ''}</div>
  ${lPerBulanMhs(m)}
  <div class=box><div class=rzh><div><h3>Tagihan</h3><small>Status setiap tagihan sesuai data terakhir di LMS.</small></div></div>
  ${T.length ? T.map(t => `<div class=txc style="margin-top:12px"><div class=txb style="width:100%"><div class=txt><div><b>${esc(t.jenis)}</b>${t.keterangan ? `<div class=mu>${esc(t.keterangan)}</div>` : ''}<div class=meta><span>${NI.rc}${esc(t.nomor_invoice)}</span>${lBlnT(t) ? `<span>${NI.cal}Bulan ${esc(mLabel(lBlnT(t)))}</span>` : ''}${t.periode_label ? `<span>${NI.cal}${esc(t.periode_label)}</span>` : ''}<span>${NI.tag}${esc(t.skema)}</span><span>${NI.cal}Jatuh tempo ${fmtD(t.jatuh_tempo_berikutnya || t.deadline)}</span>${t.kwitansi ? `<span>${NI.pdf}Kwitansi ${esc(t.kwitansi)}</span>` : ''}${t.ada_bukti ? `<span><a href="/api/lms/bukti/tagihan/${t.id}" target=_blank rel=noopener>${NI.eye}Bukti dari mahasiswa</a></span>` : ''}</div></div><div style="text-align:right"><div class=amt>${Rp(t.nominal)}</div>${tBadge(t)}</div></div>
    <div class=prog style="margin-top:12px"><i style="width:${t.persen}%"></i></div><small class=pl>Dibayar ${Rp(t.dibayar)} (${t.persen}%) · sisa ${Rp(t.sisa)}${t.potongan ? ` · potongan ${Rp(t.potongan)}` : ''}</small>
    ${t.angsuran && t.angsuran.length ? `<div class=tw style="margin-top:10px"><table class=lmt><tr><th>Angsuran</th><th>Untuk bulan</th><th>Jatuh tempo</th><th>Nominal</th><th>Status</th></tr>${t.angsuran.map(a => `<tr><td>Ke-${a.ke}</td><td>${esc(mLabel(lBlnA(a)))}</td><td>${fmtD(a.jatuh_tempo)}</td><td>${Rp(a.nominal)}</td><td><span class="bd ${(aSt[a.status] || ['', ''])[1]}">${(aSt[a.status] || [a.status])[0]}</span></td></tr>`).join('')}</table></div>` : ''}</div></div>`).join('') : `<div class=empty style="margin-top:12px">${IC.list}<b>Belum ada tagihan untuk mahasiswa ini</b></div>`}</div>
  <div class=box><div class=bh><h4>Riwayat pembayaran</h4>${LM.form ? '' : `<button class=btn onclick="LM.form=true;draw();setTimeout(()=>{const f=$('lmf');if(f)f.scrollIntoView({behavior:'smooth',block:'center'})},50)">+ Catat Pembayaran Manual</button>`}</div>
  ${LM.form ? lFormBayar(m, T) : ''}
  <div class=tw><table class=lmt><tr><th>Tanggal</th><th>Tagihan</th><th class=hm>Metode</th><th class=n>Nominal</th><th>Status</th><th></th></tr>${P.map(({ p, t }) => `<tr><td style="white-space:nowrap">${lTgl(p.tanggal)}</td><td>${esc(t.jenis)}<small>${lBlnT(t) ? 'Bulan ' + esc(mLabel(lBlnT(t))) : esc(t.periode_label || '')}${(p.ke || 1) > 1 ? ' · ke-' + p.ke : ''}</small>${p.catatan ? `<small>${esc(p.catatan)}</small>` : ''}</td><td class=hm>${esc(p.metode || '-')}</td><td class=n>${Rp(p.nominal)}</td><td>${pBadge(p.status)}</td><td style="text-align:right;white-space:nowrap">${lAksiBukti(p, t)}${p.dari_keuangan && p.status == 'valid' ? ` <button class="btn o" style="padding:6px 10px;font-size:12.5px" onclick="lBatal('${esc(p.id)}',${p.nominal})">Batalkan</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=6>Belum ada pembayaran.</td></tr>'}</table></div></div>`;
}

/* ---------- Ekspor CSV ---------- */
function lCsv(name, head, rows) {
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"', L = [head.map(q).join(',')].concat(rows.map(r => r.map(q).join(',')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\n')], { type: 'text/csv' })); a.download = name; a.click();
}
function lCsvMhs() {
  lCsv('status-pembayaran-mahasiswa.csv', ['NPM', 'Nama', 'Prodi', 'Angkatan', 'Status akademik', 'Total tagihan', 'Dibayar', 'Sisa', 'Status pembayaran'],
    (window._lmsRows || []).map(({ m, s }) => [m.npm, m.nama, m.prodi, m.angkatan ? '20' + m.angkatan : '', m.status_akademik_label, s.total, s.dibayar, s.sisa, LST[s.st][0]]));
}
function lCsvMasuk() {
  lCsv('uang-masuk-mahasiswa.csv', ['Tanggal', 'NPM', 'Nama', 'Jenis tagihan', 'Periode', 'Pembayaran ke', 'Metode', 'Nominal'],
    (window._lmsMasuk || []).map(({ p, t, m }) => [lDay(p.tanggal), m ? m.npm : t.npm, m ? m.nama : t.nama, t.jenis, t.periode_label, p.ke || 1, p.metode, p.nominal]));
}

/* ---------- Cek per bulan: siapa yang sudah / belum bayar pada bulan tertentu ---------- */
const BST = {
  sudah: ['Sudah bayar', 's-Selesai'],
  sebagian: ['Bayar sebagian', 's-Dalam-pertanggungjawaban'],
  belum: ['Belum bayar', 's-Ditolak'],
  luar: ['Bayar tagihan lain', 's-Selesai'],
  tidak: ['Tidak ada tagihan bulan ini', ''],
};
LM.bln = ''; LM.bst = 'aktif'; LM.bq = '';
const lBln = () => LM.bln || lIso(new Date()).slice(0, 7);
/* Bulan tagihan (dari LMS); data lama tanpa bulan memakai bulan jatuh tempo. */
const lBlnT = t => t.bulan || String(t.deadline || '').slice(0, 7);
const lBlnA = a => a.bulan || String(a.jatuh_tempo || '').slice(0, 7);
const lBlnPendek = ym => new Date(ym + '-01T00:00').toLocaleDateString('id-ID', { month: 'short' });
function lBulanMhs(m, ym) {
  const d = LM.d, T = d.tByUser.get(m.id) || [], items = [];
  T.forEach(t => {
    if (t.angsuran && t.angsuran.length) t.angsuran.filter(a => lBlnA(a) === ym).forEach(a => items.push({ t, ket: 'Angsuran ke-' + a.ke, nominal: a.nominal, tempo: a.jatuh_tempo, lunas: a.status === 'lunas', sebagian: a.status === 'sebagian' }));
    else if (lBlnT(t) === ym) items.push({ t, ket: 'Tagihan penuh', nominal: t.nominal, tempo: t.deadline, lunas: t.sisa <= 0, sebagian: t.dibayar > 0 && t.sisa > 0 });
  });
  const bayar = T.flatMap(t => (d.pByTagihan.get(t.id) || []).filter(p => p.status === 'valid' && lDay(p.tanggal).slice(0, 7) === ym).map(p => ({ p, t })));
  const tunggu = T.some(t => (d.pByTagihan.get(t.id) || []).some(p => p.status === 'menunggu'));
  const wajib = items.reduce((a, x) => a + x.nominal, 0), dibayar = bayar.reduce((a, x) => a + x.p.nominal, 0);
  const st = items.length ? (items.every(x => x.lunas) ? 'sudah' : items.some(x => x.lunas || x.sebagian) ? 'sebagian' : 'belum') : dibayar > 0 ? 'luar' : 'tidak';
  return { items, bayar, wajib, dibayar, st, tunggu };
}
LM.bmode = 'bulan'; LM.thn = '';
function lTabBulan() {
  const mode = `<div style="margin:0 0 12px"><div class=tabs style="display:inline-flex"><button class="${LM.bmode == 'bulan' ? 'on' : ''}" onclick="LM.bmode='bulan';draw()">Per bulan</button><button class="${LM.bmode == 'tahun' ? 'on' : ''}" onclick="LM.bmode='tahun';draw()">Rekap setahun</button></div></div>`;
  return mode + (LM.bmode == 'tahun' ? lTabTahun() : lTabBulan1());
}
function lTabBulan1() {
  const d = LM.d, ym = lBln(), sel = (k, lbl, opts, all = 'Semua') => `<div><label>${lbl}</label><select onchange="LM.${k}=this.value;lRefBulan()">${all ? `<option value="">${all}</option>` : ''}${opts.map(([v, t]) => `<option value="${esc(v)}" ${v == LM[k] ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  const geser = n => { const [y, mo] = ym.split('-').map(Number); return lIso(new Date(y, mo - 1 + n, 1)).slice(0, 7); };
  return `<div class=box><div class=lh style="margin:0 0 6px;align-items:flex-end"><div><label style="margin-top:0">Bulan yang dicek</label><div style="display:flex;gap:8px;align-items:center"><button class="btn o" onclick="LM.bln='${geser(-1)}';draw()" title="Bulan sebelumnya">‹</button><input type=month value="${ym}" style="width:190px" onchange="if(this.value){LM.bln=this.value;draw()}"><button class="btn o" onclick="LM.bln='${geser(1)}';draw()" title="Bulan berikutnya">›</button></div></div><small class=mu style="max-width:520px">Menampilkan tagihan/angsuran <b>untuk bulan</b> ${mLabel(ym)} (sesuai bulan yang dipilih bendahara saat membuat tagihan di LMS) dan pembayaran yang <b>diterima</b> di bulan itu.</small></div>
  <div class=g2 style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><div><label>Cari nama / NPM</label><input value="${esc(LM.bq)}" placeholder="Ketik nama atau NPM" oninput="LM.bq=this.value;clearTimeout(window._lt);window._lt=setTimeout(lRefBulan,200)"></div>
  ${sel('bst', 'Tampilkan', [['aktif', 'Wajib bayar / membayar bulan ini'], ...Object.entries(BST).map(([k, v]) => [k, v[0]]), ['', 'Semua mahasiswa']], '')}${sel('ang', 'Angkatan', d.angkatan.map(a => [a, '20' + a]))}${sel('pr', 'Program studi', d.prodi.map(p => [p, p]))}</div>
  <div id=lmsB>${lRowsBulan()}</div></div>`;
}
function lRefBulan() { const e = $('lmsB'); if (e) e.innerHTML = lRowsBulan(); }
function lRowsBulan() {
  const d = LM.d, ym = lBln(), q = LM.bq.trim().toLowerCase();
  const all = d.mahasiswa.filter(m => (!LM.ang || m.angkatan === LM.ang) && (!LM.pr || m.prodi === LM.pr) && (!q || (m.nama + ' ' + (m.npm || '')).toLowerCase().includes(q)))
    .map(m => ({ m, b: lBulanMhs(m, ym) }));
  const L = all.filter(x => LM.bst === '' ? true : LM.bst === 'aktif' ? x.b.st !== 'tidak' : x.b.st === LM.bst).sort((a, b) => (a.m.npm || '').localeCompare(b.m.npm || ''));
  window._lmsBulan = L;
  const c = k => all.filter(x => x.b.st === k).length, wj = all.filter(x => x.b.items.length);
  const wajib = wj.reduce((a, x) => a + x.b.wajib, 0), masuk = all.reduce((a, x) => a + x.b.dibayar, 0);
  const K = [['Wajib bayar', wj.length + ' mahasiswa', `kewajiban ${Rp(wajib)}`, 'list'], ['Sudah bayar', c('sudah'), `${wj.length ? Math.round(c('sudah') / wj.length * 100) : 0}% dari yang wajib bayar`, 'audit'], ['Belum / sebagian', c('belum') + c('sebagian'), `${c('belum')} belum sama sekali · ${c('sebagian')} sebagian`, 'rep'], ['Uang masuk ' + mLabel(ym), Rp(masuk), `${all.reduce((a, x) => a + x.b.bayar.length, 0)} transaksi`, 'new']];
  const chip = k => `<div class="ai ${LM.bst == k ? 'on' : ''}" onclick="LM.bst='${k}';draw()"><b>${c(k)}</b><span>${BST[k][0]}</span></div>`;
  return `<div class=kpis style="margin-top:16px">${K.map(([a, b, cc, k]) => `<div class=kpi><div class=kh><span>${a}</span><i class=ci>${IC[k]}</i></div><b>${b}</b><small>${cc}</small></div>`).join('')}</div>
  <div class=attn><span class=al>${esc(mLabel(ym))}</span>${['sudah', 'sebagian', 'belum', 'luar'].map(chip).join('')}</div>
  <div class=lh style="margin:4px 0 8px;align-items:center"><small class=mu>${L.length} mahasiswa ditampilkan</small><button class="btn o" onclick="lCsvBulan()" ${L.length ? '' : 'disabled'}>Ekspor Excel (CSV)</button></div>
  <div class=tw><table class=lmt><tr><th>Mahasiswa</th><th class=hm>Tagihan bulan ini</th><th class=n>Kewajiban</th><th class=n>Dibayar bulan ini</th><th>Status</th><th></th></tr>${L.map(({ m, b }) => `<tr ${lGo(m.id)}><td>${lMhsCell(m)}</td><td class=hm style="font-size:12.5px">${b.items.map(x => `${esc(x.t.jenis)} · ${esc(x.ket)} <span class=mu>(jatuh tempo ${fmtD(x.tempo)})</span>`).join('<br>') || '<span class=mu>-</span>'}</td><td class=n>${b.items.length ? Rp(b.wajib) : '-'}</td><td class=n>${b.dibayar ? Rp(b.dibayar) : '-'}${b.bayar.length ? `<small>${b.bayar.map(x => lTgl(x.p.tanggal) + ' · ' + esc(x.p.metode || '-')).join('<br>')}</small>` : ''}</td><td><span class="bd ${BST[b.st][1]}">${BST[b.st][0]}</span>${b.st === 'belum' && b.dibayar ? '<div class=mu style="font-size:12px;margin-top:4px">Uang masuk untuk tunggakan lama</div>' : ''}${b.tunggu && b.st !== 'sudah' ? '<div class=mu style="font-size:12px;margin-top:4px">Ada bukti menunggu verifikasi</div>' : ''}</td>${lChev()}</tr>`).join('') || `<tr><td colspan=6>Tidak ada mahasiswa yang cocok untuk ${esc(mLabel(ym))}.</td></tr>`}</table></div>`;
}
function lCsvBulan() {
  lCsv('cek-pembayaran-' + lBln() + '.csv', ['Bulan', 'NPM', 'Nama', 'Prodi', 'Angkatan', 'Tagihan bulan ini', 'Kewajiban', 'Dibayar bulan ini', 'Status'],
    (window._lmsBulan || []).map(({ m, b }) => [lBln(), m.npm, m.nama, m.prodi, m.angkatan ? '20' + m.angkatan : '', b.items.map(x => x.t.jenis + ' - ' + x.ket + ' (jatuh tempo ' + x.tempo + ')').join('; '), b.wajib, b.dibayar, BST[b.st][0]]));
}

/* ---------- Rekap setahun: mahasiswa × 12 bulan ---------- */
const lThn = () => LM.thn || String(new Date().getFullYear());
const lTahunList = () => { const ys = new Set([String(new Date().getFullYear())]); LM.d.tagihan.forEach(t => { const b = lBlnT(t); if (b) ys.add(b.slice(0, 4)); (t.angsuran || []).forEach(a => { const x = lBlnA(a); if (x) ys.add(x.slice(0, 4)); }); }); return [...ys].sort().reverse(); };
const CELL = {
  sudah: ['✓', '#dcf5e7', '#15703f', 'Sudah bayar'],
  sebagian: ['½', '#dbe7fb', '#1e3a8a', 'Bayar sebagian'],
  belum: ['✗', '#fde3e1', '#b3261e', 'Belum bayar'],
  nanti: ['○', '#f1f4f9', '#64748b', 'Belum bayar (bulan belum lewat)'],
  kosong: ['', 'transparent', '#cbd5e1', 'Tidak ada tagihan'],
};
function lCell(b, ym) {
  if (!b.items.length) return 'kosong';
  if (b.st === 'sudah' || b.st === 'sebagian') return b.st;
  return ym > lIso(new Date()).slice(0, 7) ? 'nanti' : 'belum';
}
function lTabTahun() {
  const d = LM.d, y = lThn(), sel = (k, lbl, opts) => `<div><label>${lbl}</label><select onchange="LM.${k}=this.value;lRefTahun()"><option value="">Semua</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${v == LM[k] ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  return `<div class=box><div class=g2 style="margin-top:0;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><div><label>Tahun</label><select onchange="LM.thn=this.value;draw()">${lTahunList().map(t => `<option ${t == y ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <div><label>Cari nama / NPM</label><input value="${esc(LM.bq)}" placeholder="Ketik nama atau NPM" oninput="LM.bq=this.value;clearTimeout(window._lt);window._lt=setTimeout(lRefTahun,200)"></div>${sel('ang', 'Angkatan', d.angkatan.map(a => [a, '20' + a]))}${sel('pr', 'Program studi', d.prodi.map(p => [p, p]))}</div>
  <div style="display:flex;gap:14px;flex-wrap:wrap;margin:14px 0 4px;font-size:12.5px;color:var(--mu)">${['sudah', 'sebagian', 'belum', 'nanti'].map(k => `<span><b style="display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:${CELL[k][1]};color:${CELL[k][2]};margin-right:5px">${CELL[k][0]}</b>${CELL[k][3]}</span>`).join('')}<span>Kosong = tidak ada tagihan di bulan itu</span></div>
  <div id=lmsT>${lRowsTahun()}</div></div>`;
}
function lRefTahun() { const e = $('lmsT'); if (e) e.innerHTML = lRowsTahun(); }
function lRowsTahun() {
  const d = LM.d, y = lThn(), q = LM.bq.trim().toLowerCase(), M = Array.from({ length: 12 }, (_, i) => y + '-' + String(i + 1).padStart(2, '0'));
  const L = d.mahasiswa.filter(m => (!LM.ang || m.angkatan === LM.ang) && (!LM.pr || m.prodi === LM.pr) && (!q || (m.nama + ' ' + (m.npm || '')).toLowerCase().includes(q)))
    .map(m => { const B = M.map(ym => lBulanMhs(m, ym)); return { m, B, C: B.map((b, i) => lCell(b, M[i])) }; })
    .filter(x => x.C.some(c => c !== 'kosong')).sort((a, b) => (a.m.npm || '').localeCompare(b.m.npm || ''));
  window._lmsTahun = { y, M, L };
  if (!L.length) return `<div class=empty style="margin-top:12px">${IC.lpjm}<b>Belum ada tagihan bulanan di tahun ${esc(y)}</b><small>Tagihan muncul di sini setelah bendahara membuat tagihan dengan pilihan "Tagihan untuk bulan" di LMS.</small></div>`;
  const tot = M.map((_, i) => ({ s: L.filter(x => x.C[i] === 'sudah').length, w: L.filter(x => x.C[i] !== 'kosong').length }));
  const td = (c, b, ym, id) => `<td style="text-align:center"><button type=button onclick="LM.bln='${ym}';LM.bmode='bulan';go('mhsd',${id})" title="${esc(mLabel(ym))}: ${CELL[c][3]}${b.items.length ? ' · tagihan ' + Rp(b.wajib) : ''}${b.dibayar ? ' · dibayar ' + Rp(b.dibayar) : ''}" style="width:26px;height:26px;border:0;border-radius:7px;background:${CELL[c][1]};color:${CELL[c][2]};font-weight:800;cursor:pointer">${CELL[c][0]}</button></td>`;
  return `<div class=lh style="margin:10px 0 8px;align-items:center"><small class=mu>${L.length} mahasiswa dengan tagihan di ${esc(y)} · arahkan kursor ke kotak untuk detail, klik untuk membuka mahasiswa</small><button class="btn o" onclick="lCsvTahun()">Ekspor Excel (CSV)</button></div>
  <div class=tw><table class="lmt yr"><tr><th style="padding-left:8px">Mahasiswa</th>${M.map(ym => `<th style="text-align:center">${lBlnPendek(ym)}</th>`).join('')}<th class=n>Lunas</th></tr>
  ${L.map(({ m, B, C }) => `<tr><td class=nm><b>${esc(m.nama)}</b><small>${esc(m.npm || '-')}</small></td>${C.map((c, i) => td(c, B[i], M[i], m.id)).join('')}<td class=n>${C.filter(c => c === 'sudah').length}/${C.filter(c => c !== 'kosong').length}</td></tr>`).join('')}
  <tr class=trt><td style="text-align:left">Sudah bayar</td>${tot.map(t => `<td style="text-align:center;font-size:12px;padding:10px 2px">${t.w ? t.s + '/' + t.w : ''}</td>`).join('')}<td></td></tr></table></div>`;
}
function lCsvTahun() {
  const { y, M, L } = window._lmsTahun || {}; if (!L) return;
  lCsv('rekap-pembayaran-' + y + '.csv', ['NPM', 'Nama', 'Prodi', 'Angkatan', ...M.map(mLabel), 'Bulan lunas', 'Bulan bertagihan'],
    L.map(({ m, C }) => [m.npm, m.nama, m.prodi, m.angkatan ? '20' + m.angkatan : '', ...C.map(c => c === 'kosong' ? '' : CELL[c][3]), C.filter(c => c === 'sudah').length, C.filter(c => c !== 'kosong').length]));
}

/* Detail mahasiswa: status per bulan tagihan */
function lPerBulanMhs(m) {
  const T = LM.d.tByUser.get(m.id) || [], set = new Set();
  T.forEach(t => { if (t.angsuran && t.angsuran.length) t.angsuran.forEach(a => set.add(lBlnA(a))); else set.add(lBlnT(t)); });
  const M = [...set].filter(Boolean).sort();
  if (!M.length) return '';
  return `<div class=box><h4>Pembayaran per bulan</h4><small class=mu>Status setiap bulan tagihan. Klik bulan untuk membuka daftar Cek Per Bulan.</small>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">${M.map(ym => { const b = lBulanMhs(m, ym), c = lCell(b, ym); return `<button type=button onclick="LM.tab='bulan';LM.bmode='bulan';LM.bln='${ym}';go('mhs')" title="${CELL[c][3]} · tagihan ${Rp(b.wajib)}" style="border:1px solid var(--bd);border-radius:10px;background:${CELL[c][1] === 'transparent' ? '#fff' : CELL[c][1]};color:${CELL[c][2]};padding:8px 12px;text-align:left;cursor:pointer;min-width:118px"><b style="display:block;font-size:13px">${CELL[c][0]} ${esc(mLabel(ym))}</b><small style="font-size:11.5px">${CELL[c][3]} · ${Rp(b.wajib)}</small></button>`; }).join('')}</div></div>`;
}

/* ---------- Catat pembayaran manual (tersimpan di LMS) ---------- */
function lFormBayar(m, T) {
  const d = LM.d, open = T.filter(t => t.sisa > 0), today = lIso(new Date());
  const jenis = (d.jenis_tagihan && d.jenis_tagihan.length ? d.jenis_tagihan : ['UKT / SPP Semester', 'Uang Pangkal', 'Praktikum', 'Lainnya']);
  const metode = (d.metode && d.metode.length ? d.metode : ['Transfer Bank', 'Tunai', 'Virtual Account', 'QRIS', 'Lainnya']);
  return `<div class=lmf id=lmf><h4 style="margin-top:0">Catat pembayaran yang sudah diterima</h4>
  <p class=mu style="margin:-4px 0 10px;font-size:13px">Untuk pembayaran ${esc(m.nama)} yang sudah diterima tetapi belum tercatat. Data langsung tersimpan di LMS (ikut membuka akses perkuliahan bila tagihan terbayar) dan masuk laporan uang masuk sesuai tanggal bayar.</p>
  <label>Pembayaran untuk</label><select id=fbT onchange="lFbSync()"><option value="">Tagihan baru (belum ada tagihannya di LMS)</option>${open.map(t => `<option value="${t.id}" data-sisa="${t.sisa}">${esc(t.jenis)}${lBlnT(t) ? ' · bulan ' + esc(mLabel(lBlnT(t))) : ''} · sisa ${Rp(t.sisa)}</option>`).join('')}</select>
  <div id=fbBaru class=g2 style="margin-top:4px"><div><label class=req>Jenis tagihan</label><select id=fbJ>${jenis.map(j => `<option>${esc(j)}</option>`).join('')}</select></div><div><label>Keterangan (opsional)</label><input id=fbK maxlength=255 placeholder="Contoh: SPP Maret 2026"></div><div><label>Untuk bulan (opsional)</label><input id=fbB type=month></div></div>
  <div class=g2 style="margin-top:4px"><div><label class=req>Nominal dibayar</label><div class=pre><span>Rp</span><input id=fbN class=rp inputmode=numeric autocomplete=off placeholder="1.500.000"></div><small class=mu id=fbS></small></div><div><label class=req>Tanggal bayar</label><input id=fbD type=date value="${today}" max="${today}"></div><div><label class=req>Metode</label><select id=fbM>${metode.map(x => `<option>${esc(x)}</option>`).join('')}</select></div><div><label>Catatan / no. bukti (opsional)</label><input id=fbC maxlength=300 placeholder="Contoh: kwitansi kertas no. 0123"></div></div>
  <label>Bukti bayar / invoice (opsional)</label>
  <div class=drop id=fbDrop onclick="if(!event.target.closest('.fnm'))$('fbF').click()" ondragover="event.preventDefault();this.classList.add('ov')" ondragleave="this.classList.remove('ov')" ondrop="event.preventDefault();this.classList.remove('ov');$('fbF').files=event.dataTransfer.files;lFbFile()"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg><b>Klik atau seret foto/scan bukti ke sini</b><small>JPG, PNG, atau PDF · maks 5 MB · disimpan di LMS</small><input id=fbF type=file hidden accept=".jpg,.jpeg,.png,.pdf" onchange="lFbFile()"><div class=fnm></div></div>
  <div id=fbE class=ape role=alert></div>
  <div class=fbar style="margin-top:14px"><small>Pencatat: ${esc(me().name)} · tercatat di LMS dan audit log.</small><div><button class="btn o" onclick="LM.form=false;draw()">Batal</button><button class=btn id=fbOk onclick="lSimpanBayar(${m.id})">Simpan ke LMS</button></div></div></div>`;
}
function lFbSync() {
  const s = $('fbT'), baru = !s.value, o = s.selectedOptions[0];
  $('fbBaru').style.display = baru ? '' : 'none';
  $('fbS').textContent = baru ? '' : 'Maksimal ' + Rp(+o.dataset.sisa) + ' (sisa tagihan)';
  if (!baru && !num('fbN')) $('fbN').value = fm(+o.dataset.sisa);
}
async function lSimpanBayar(uid) {
  const e = $('fbE'), b = $('fbOk'), tid = $('fbT').value, n = num('fbN'), tg = $('fbD').value, err = m => { e.textContent = m; return false; };
  e.textContent = '';
  if (!(n >= 1000)) return err('Isi nominal minimal Rp 1.000.');
  if (!tg) return err('Isi tanggal bayar.');
  if (tg > lIso(new Date())) return err('Tanggal bayar tidak boleh di masa depan.');
  if (tid) { const o = $('fbT').selectedOptions[0]; if (n > +o.dataset.sisa) return err('Nominal melebihi sisa tagihan (' + Rp(+o.dataset.sisa) + ').'); }
  const fb = $('fbF').files[0];
  if (fb && !lOkBukti(fb)) return err('Bukti bayar harus JPG, PNG, atau PDF dengan ukuran maksimal 5 MB.');
  const m = LM.d.mById.get(uid), body = { user_id: uid, tagihan_id: tid || null, jenis: tid ? null : $('fbJ').value, keterangan: tid ? null : $('fbK').value.trim(), bulan_tagihan: tid ? null : $('fbB').value || null, nominal: n, tanggal_bayar: tg, metode: $('fbM').value, catatan: $('fbC').value.trim() };
  if (!await ask({ tone: 'warn', title: 'Simpan pembayaran ke LMS?', msg: 'Pembayaran ini langsung tercatat sebagai pembayaran valid di LMS.', rows: [['Mahasiswa', m.nama + (m.npm ? ' (' + m.npm + ')' : '')], ['Untuk', tid ? $('fbT').selectedOptions[0].textContent : 'Tagihan baru: ' + body.jenis + (body.bulan_tagihan ? ' · ' + mLabel(body.bulan_tagihan) : '')], ['Nominal', Rp(n)], ['Tanggal bayar', fmtD(tg)], ['Metode', body.metode], ['Bukti bayar', fb ? fb.name : 'Tidak dilampirkan']], ok: 'Simpan ke LMS', no: 'Periksa lagi' })) return;
  b.disabled = true; b.textContent = fb ? 'Mengunggah…' : 'Menyimpan…';
  try {
    if (fb) body.bukti = await lBacaBukti(fb);
    const r = await API.post('/api/lms/pembayaran', body);
    log(`Catat pembayaran manual ${Rp(n)} untuk ${m.nama}${m.npm ? ' (' + m.npm + ')' : ''} ke LMS`); save();
    LM.form = false; await lmsLoad(true); alert(r.message || 'Pembayaran tersimpan.');
  } catch (x) { if (b.isConnected) { b.disabled = false; b.textContent = 'Simpan ke LMS'; } e.textContent = x.message; }
}
async function lBatal(id, nominal) {
  const v = await ask({ tone: 'bad', title: 'Batalkan pembayaran ini?', msg: 'Pembayaran yang dicatat manual akan dibatalkan di LMS dan status tagihan dihitung ulang. Tagihan yang dibuat khusus untuk catatan ini ikut dihapus.', rows: [['Nominal', Rp(nominal)]], input: { label: 'Alasan pembatalan', hint: 'Contoh: salah input nominal', err: 'Tulis alasan pembatalan.' }, ok: 'Batalkan Pembayaran', no: 'Kembali' });
  if (!v) return;
  try { const r = await API.post('/api/lms/pembayaran/' + encodeURIComponent(id) + '/batal', { alasan: v }); log(`Batalkan pembayaran manual ${Rp(nominal)} di LMS: ${v}`); save(); await lmsLoad(true); alert(r.message || 'Pembayaran dibatalkan.'); }
  catch (x) { alert(x.message); }
}

/* ---------- Bukti bayar ---------- */
const lOkBukti = f => /\.(jpe?g|png|pdf)$/i.test(f.name) && f.size <= 5 * 1024 * 1024;
function lFbFile() {
  const el = $('fbF'), f = el.files[0], bx = el.parentNode.querySelector('.fnm');
  if ($('fbE')) $('fbE').textContent = '';
  if (!f) { bx.innerHTML = ''; return; }
  const bad = !lOkBukti(f);
  bx.innerHTML = `<div class="fchip${bad ? ' bad' : ''}"><span>${NI.pdf}</span><div><b>${esc(f.name)}</b><small>${(f.size / 1024).toFixed(0)} KB${bad ? ' · harus JPG/PNG/PDF maks 5 MB' : ''}</small></div><button type=button onclick="event.stopPropagation();$('fbF').value='';lFbFile()" aria-label="Hapus berkas">${NI.x}</button></div>`;
}
/* Berkas -> base64. Foto besar diperkecil (tetap terbaca) agar unggahan cepat. */
function lBacaBukti(f) {
  const kirim = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok({ name: f.name.replace(/\.(png|jpe?g)$/i, m => blob.type === 'image/jpeg' ? '.jpg' : m), type: blob.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : /\.png$/i.test(f.name) ? 'image/png' : 'image/jpeg'), data: String(r.result).split(',')[1] }); r.onerror = () => no(new Error('Berkas tidak dapat dibaca.')); r.readAsDataURL(blob); });
  if (!/^image\//.test(f.type) || f.size < 1.5e6) return kirim(f);
  return new Promise(ok => { const i = new Image(); i.onload = () => { const k = Math.min(1, 2000 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * k); c.height = Math.round(i.height * k); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(i.src); c.toBlob(b => ok(kirim(b || f)), 'image/jpeg', .85); }; i.onerror = () => ok(kirim(f)); i.src = URL.createObjectURL(f); });
}
function lAksiBukti(p, t) {
  const sb = 'style="padding:6px 10px;font-size:12.5px"';
  if (p.ada_bukti && /^\d+$/.test(p.id)) return `<a class="btn o" ${sb} href="/api/lms/bukti/pembayaran/${p.id}" target=_blank rel=noopener>Lihat bukti</a>${p.dari_keuangan && p.status == 'valid' ? ` <button class="btn o" ${sb} onclick="lUnggah('${esc(p.id)}')" title="Ganti bukti">Ganti</button>` : ''}`;
  if (t.ada_bukti) return `<a class="btn o" ${sb} href="/api/lms/bukti/tagihan/${t.id}" target=_blank rel=noopener>Lihat bukti</a>`;
  if (p.dari_keuangan && p.status == 'valid') return `<button class="btn o" ${sb} onclick="lUnggah('${esc(p.id)}')">Unggah bukti</button>`;
  return '';
}
function lUnggah(id) {
  const i = Object.assign(document.createElement('input'), { type: 'file', accept: '.jpg,.jpeg,.png,.pdf' });
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    if (!lOkBukti(f)) return alert('Bukti bayar harus JPG, PNG, atau PDF dengan ukuran maksimal 5 MB.');
    try { API.bar('Mengunggah bukti…'); const r = await API.post('/api/lms/pembayaran/' + encodeURIComponent(id) + '/bukti', { bukti: await lBacaBukti(f) }); API.bar(''); log('Unggah bukti bayar ke LMS (pembayaran #' + id + ')'); save(); await lmsLoad(true); alert(r.message || 'Bukti tersimpan.'); }
    catch (x) { API.bar(''); alert(x.message); }
  };
  i.click();
}
