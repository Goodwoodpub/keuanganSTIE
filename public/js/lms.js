/* ===== Pembayaran Mahasiswa (data dari LMS, baca-saja) ===== */
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
  return info + `<div class=tabs style="display:inline-flex;margin:4px 0 14px">${tab('ring', 'Ringkasan')}${tab('mhs', 'Status Mahasiswa')}${tab('masuk', 'Uang Masuk')}</div>`
    + (LM.tab == 'mhs' ? lTabMhs() : LM.tab == 'masuk' ? lTabMasuk() : lTabRing());
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
  <div class=box><div class=bh><h4>Mahasiswa menunggak (sisa terbesar)</h4><a class=lnk2 onclick="LM.tab='mhs';LM.st='nunggak';draw()">Lihat semua →</a></div>${tg.length ? `<div class=tw><table><tr><th>NPM</th><th>Nama</th><th>Prodi</th><th>Sisa tagihan</th><th></th></tr>${tg.map(({ m, s }) => `<tr><td>${esc(m.npm || '-')}</td><td>${esc(m.nama)}</td><td>${esc(m.prodi || '-')}</td><td>${Rp(s.sisa)}</td><td><button class="btn o" onclick="go('mhsd',${m.id})">Buka</button></td></tr>`).join('')}</table></div>` : `<div class=empty>${IC.audit}<b>Tidak ada mahasiswa yang menunggak</b></div>`}</div>`;
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
  <div class=tw><table><tr><th>NPM</th><th>Nama</th><th>Prodi</th><th>Angkatan</th><th>Total tagihan</th><th>Dibayar</th><th>Sisa</th><th>Status</th><th></th></tr>${L.map(({ m, s }) => `<tr><td>${esc(m.npm || '-')}</td><td>${esc(m.nama)}${m.status_akademik != 'aktif' ? ` <small class=mu>(${esc(m.status_akademik_label)})</small>` : ''}</td><td>${esc(m.prodi || '-')}</td><td>${m.angkatan ? '20' + esc(m.angkatan) : '-'}</td><td>${Rp(s.total)}</td><td>${Rp(s.dibayar)}</td><td>${Rp(s.sisa)}</td><td>${lBadge(s.st)}</td><td><button class="btn o" onclick="go('mhsd',${m.id})">Buka</button></td></tr>`).join('') || '<tr><td colspan=9>Tidak ada mahasiswa yang cocok dengan filter.</td></tr>'}</table></div>`;
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
  <div class=tw><table><tr><th>Tanggal</th><th>NPM</th><th>Nama</th><th>Tagihan</th><th>Pembayaran ke</th><th>Metode</th><th>Nominal</th><th></th></tr>${L.map(({ p, t, m }) => `<tr><td>${lTgl(p.tanggal)}</td><td>${esc(m ? m.npm : t.npm || '-')}</td><td>${esc(m ? m.nama : t.nama || '-')}</td><td>${esc(t.jenis || '-')}${t.periode_label ? ` <small class=mu>${esc(t.periode_label)}</small>` : ''}</td><td>${p.ke || 1}</td><td>${esc(p.metode || '-')}</td><td>${Rp(p.nominal)}</td><td>${m ? `<button class="btn o" onclick="go('mhsd',${m.id})">Buka</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=8>Belum ada uang masuk pada rentang ini.</td></tr>'}${L.length ? `<tr class=trt><td colspan=6>Total</td><td>${Rp(tot)}</td><td></td></tr>` : ''}</table></div>`;
}

/* ---------- Detail mahasiswa ---------- */
function mhsdv() {
  if (!LM.d) return mhsv();
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
  <div class=box><div class=rzh><div><h3>Tagihan</h3><small>Status setiap tagihan sesuai data terakhir di LMS.</small></div></div>
  ${T.length ? T.map(t => `<div class=txc style="margin-top:12px"><div class=txb style="width:100%"><div class=txt><div><b>${esc(t.jenis)}</b>${t.keterangan ? `<div class=mu>${esc(t.keterangan)}</div>` : ''}<div class=meta><span>${NI.rc}${esc(t.nomor_invoice)}</span>${t.periode_label ? `<span>${NI.cal}${esc(t.periode_label)}</span>` : ''}<span>${NI.tag}${esc(t.skema)}</span><span>${NI.cal}Jatuh tempo ${fmtD(t.jatuh_tempo_berikutnya || t.deadline)}</span>${t.kwitansi ? `<span>${NI.pdf}Kwitansi ${esc(t.kwitansi)}</span>` : ''}</div></div><div style="text-align:right"><div class=amt>${Rp(t.nominal)}</div>${tBadge(t)}</div></div>
    <div class=prog style="margin-top:12px"><i style="width:${t.persen}%"></i></div><small class=pl>Dibayar ${Rp(t.dibayar)} (${t.persen}%) · sisa ${Rp(t.sisa)}${t.potongan ? ` · potongan ${Rp(t.potongan)}` : ''}</small>
    ${t.angsuran && t.angsuran.length ? `<div class=tw style="margin-top:10px"><table><tr><th>Angsuran</th><th>Jatuh tempo</th><th>Nominal</th><th>Status</th></tr>${t.angsuran.map(a => `<tr><td>Ke-${a.ke}</td><td>${fmtD(a.jatuh_tempo)}</td><td>${Rp(a.nominal)}</td><td><span class="bd ${(aSt[a.status] || ['', ''])[1]}">${(aSt[a.status] || [a.status])[0]}</span></td></tr>`).join('')}</table></div>` : ''}</div></div>`).join('') : `<div class=empty style="margin-top:12px">${IC.list}<b>Belum ada tagihan untuk mahasiswa ini</b></div>`}</div>
  <div class=box><h4>Riwayat pembayaran</h4><div class=tw><table><tr><th>Tanggal</th><th>Tagihan</th><th>Ke</th><th>Metode</th><th>Nominal</th><th>Status</th><th>Catatan</th></tr>${P.map(({ p, t }) => `<tr><td>${lTgl(p.tanggal)}</td><td>${esc(t.jenis)}${t.periode_label ? ` <small class=mu>${esc(t.periode_label)}</small>` : ''}</td><td>${p.ke || 1}</td><td>${esc(p.metode || '-')}</td><td>${Rp(p.nominal)}</td><td>${pBadge(p.status)}</td><td>${esc(p.catatan || '')}</td></tr>`).join('') || '<tr><td colspan=7>Belum ada pembayaran.</td></tr>'}</table></div></div>`;
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
