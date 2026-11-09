/* ===== Kas Kecil (petty cash) =====
 * Bendahara menerima kas kecil (biasanya mingguan) dari pimpinan, lalu mencatat
 * setiap belanja kecil beserta notanya. Laporan per minggu / per bulan:
 * saldo awal, penerimaan, pengeluaran, saldo akhir, rekap kategori, cetak PDF.
 * Data disimpan di S.kas (ikut tersimpan di server bersama data lain).
 */
IC.kas = '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 12h18M12 11v3"/></svg>';
SUBT.kas = 'Kas kecil dan dana reimburse yang dipegang bendahara';
const KK = { mode: 'minggu', ref: '', form: null, q: '', w: 'kas' };
/* Dua dompet bendahara: kas kecil (S.kas) dan dana reimburse (S.kasR). */
const KW = { kas: 'Kas Kecil', rbf: 'Dana Reimburse' };
const kasW = w => { const key = w === 'rbf' ? 'kasR' : 'kas'; const k = S[key] = S[key] || {}; k.tx = k.tx || []; k.cek = k.cek || {}; if (k.maks == null) k.maks = 500000; return k; };
const kasD = () => kasW(KK.w);
const WL = () => KW[KK.w].toLowerCase(), WLc = () => KW[KK.w];
const kSaldoW = w => kasW(w).tx.reduce((a, x) => a + (x.t === 'in' ? +x.amt : -x.amt), 0);
const kIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const kDate = s => new Date(s + 'T00:00');
const kSenin = s => { const d = kDate(s), w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return kIso(d); };
const kTambahHari = (s, n) => { const d = kDate(s); d.setDate(d.getDate() + n); return kIso(d); };
const kTglPendek = s => kDate(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
/* Periode aktif: {dari, sampai, label, key} */
function kPeriode() {
  const ref = KK.ref || today();
  if (KK.mode === 'bulan') {
    const ym = ref.slice(0, 7), d = kDate(ym + '-01'), akhir = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { dari: ym + '-01', sampai: kIso(akhir), label: mLabel(ym), key: ym };
  }
  const s = kSenin(ref), e = kTambahHari(s, 6);
  return { dari: s, sampai: e, label: `Minggu ${kTglPendek(s)} – ${kDate(e).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`, key: 'W' + s };
}
const kGeser = n => { const p = kPeriode(); if (KK.mode === 'bulan') { const d = kDate(p.dari); d.setMonth(d.getMonth() + n); KK.ref = kIso(d); } else KK.ref = kTambahHari(p.dari, 7 * n); draw(); };
const kUrut = L => L.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
const kSaldo = (sampai) => kasD().tx.filter(x => !sampai || x.date <= sampai).reduce((a, x) => a + (x.t === 'in' ? +x.amt : -x.amt), 0);
function kData(p) {
  const all = kUrut(kasD().tx), awal = all.filter(x => x.date < p.dari).reduce((a, x) => a + (x.t === 'in' ? +x.amt : -x.amt), 0);
  const L = all.filter(x => x.date >= p.dari && x.date <= p.sampai);
  let run = awal; const R = L.map(x => { run += x.t === 'in' ? +x.amt : -x.amt; return { ...x, saldo: run }; });
  const masuk = L.filter(x => x.t === 'in').reduce((a, x) => a + +x.amt, 0), keluar = L.filter(x => x.t === 'out').reduce((a, x) => a + +x.amt, 0);
  const cat = {}; L.filter(x => x.t === 'out').forEach(x => { const c = x.cat || 'Lainnya'; cat[c] = (cat[c] || 0) + +x.amt; });
  const tanpaNota = L.filter(x => x.t === 'out' && !x.link && !(x.nota || []).length).length;
  return { awal, R, masuk, keluar, akhir: awal + masuk - keluar, cat, tanpaNota };
}
/* Minggu (key 'W<senin>') yang sudah diperiksa pimpinan -> transaksinya terkunci. */
const kTerkunci = x => !!kasD().cek['W' + kSenin(x.date)];

function kasv() {
  const k = kasD(), m = me(), adm = m.role === 'Admin', p = kPeriode(), d = kData(p), saldo = kSaldo();
  const cek = KK.mode === 'minggu' ? k.cek[p.key] : null;
  const wt = (w2, t) => `<button class="${KK.w == w2 ? 'on' : ''}" onclick="if(KK.w!=='${w2}'){KK.w='${w2}';KK.form=null;window._kfade=1;draw()}">${t} <small style="opacity:.75;margin-left:8px;font-weight:500">${Rp(kSaldoW(w2))}</small></button>`;
  const K = [[`Saldo ${WL()} saat ini`, Rp(saldo), saldo < 0 ? 'Saldo minus, periksa catatan' : 'per hari ini', 'kas'], ['Penerimaan', Rp(d.masuk), p.label, 'new'], ['Pengeluaran', Rp(d.keluar), `${d.R.filter(x => x.t === 'out').length} transaksi`, 'rep'], ['Saldo akhir periode', Rp(d.akhir), `saldo awal ${Rp(d.awal)}`, 'audit']];
  const mx = Math.max(1, ...Object.values(d.cat));
  const tab = (k2, t) => `<button class="${KK.mode == k2 ? 'on' : ''}" onclick="KK.mode='${k2}';draw()">${t}</button>`;
  return `<div class="tabs kwt" style="display:inline-flex;margin:0 0 14px">${wt('kas', 'Kas Kecil')}${wt('rbf', 'Dana Reimburse')}</div>
  <div class=kpis>${K.map(([a, b, c, i]) => `<div class=kpi><div class=kh><span>${a}</span><i class=ci>${IC[i]}</i></div><b>${b}</b><small>${c}</small></div>`).join('')}</div>
  <div class=box style="padding:14px 18px"><div class=lh style="margin:0;align-items:center;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class=tabs style="display:inline-flex">${tab('minggu', 'Mingguan')}${tab('bulan', 'Bulanan')}</div>
      <div style="display:flex;gap:6px;align-items:center"><button class="btn o" onclick="kGeser(-1)" title="Sebelumnya">‹</button><b style="min-width:220px;text-align:center">${esc(p.label)}</b><button class="btn o" onclick="kGeser(1)" title="Berikutnya">›</button>${(KK.ref && KK.ref !== today()) ? `<button class="btn o" onclick="KK.ref='';draw()">Hari ini</button>` : ''}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${m.role === 'Bendahara' ? `<button class=btn onclick="kForm('out')">+ Catat Pengeluaran</button>` : ''}<button class="btn ${m.role === 'Bendahara' ? 'o' : ''}" onclick="kForm('in')">+ ${adm ? 'Serahkan ' + WLc() : 'Catat Penerimaan'}</button><button class="btn o" onclick="kCetak()">Cetak Laporan</button><button class="btn o" onclick="kCsv()" ${d.R.length ? '' : 'disabled'}>Ekspor Excel</button></div></div>
    ${KK.mode === 'minggu' ? `<div class="aps ${cek ? 'ok' : 'warn'}" style="margin:12px 0 0;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span>${cek ? `Laporan minggu ini <b>sudah diperiksa</b> oleh ${esc(cek.by)} pada ${esc(cek.at)}. Transaksi minggu ini terkunci.` : `Laporan minggu ini <b>belum diperiksa</b> pimpinan.${d.tanpaNota ? ` ${d.tanpaNota} pengeluaran belum ada notanya.` : ''}`}</span>${adm ? (cek ? `<button class="btn o" onclick="kCek(false)">Batalkan pemeriksaan</button>` : `<button class=btn onclick="kCek(true)" ${d.R.length ? '' : 'disabled'}>Tandai sudah diperiksa</button>`) : ''}</div>` : ''}
  </div>
  ${KK.w === 'rbf' ? kSisaBox(saldo, adm) : ''}
  ${KK.form ? kFormHtml() : ''}
  <div class=g2b><div class=box><h4>Transaksi ${esc(p.label)}</h4>${d.R.length || d.awal ? `<div class=tw><table class=lmt><tr><th>Tanggal</th><th>Uraian</th><th class=n>Masuk</th><th class=n>Keluar</th><th class=n>Saldo</th><th></th></tr>
    <tr><td></td><td><i class=mu>Saldo awal</i></td><td></td><td></td><td class=n><b>${Rp(d.awal)}</b></td><td></td></tr>
    ${d.R.map(x => `<tr><td style="white-space:nowrap">${kTglPendek(x.date)}</td><td style="min-width:200px"><b>${esc(x.desc)}</b><small>${x.t === 'in' ? (x.link ? 'Dialokasikan dari dana reimburse' : 'Penerimaan ' + WL()) : esc(x.cat || '')}${x.req ? ` · <a onclick="kReq('${esc(x.req)}')" style="cursor:pointer">${esc(x.req)}</a>` : ''}${x.shop ? ' · ' + esc(x.shop) : ''} · dicatat ${esc(x.by)}</small>${x.note ? `<small>${esc(x.note)}</small>` : ''}${x.link ? '' : (x.nota || []).length ? `<small>${x.nota.map((u, i) => `<a href="${esc(u)}" onclick="event.preventDefault();kLihat(${x.id},${i})">Nota ${i + 1}</a>`).join(' · ')}</small>` : (x.t === 'out' ? '<small style="color:var(--red)">Belum ada nota</small>' : '')}</td><td class=n>${x.t === 'in' ? Rp(x.amt) : ''}</td><td class=n>${x.t === 'out' ? Rp(x.amt) : ''}</td><td class=n>${Rp(x.saldo)}</td><td style="text-align:right;white-space:nowrap">${kBolehUbah(x) ? `<div style="display:flex;flex-direction:column;gap:4px;align-items:stretch"><button class="btn o" style="padding:4px 10px;font-size:12px" onclick="kForm('${x.t}',${x.id})">Ubah</button><button class="btn o" style="padding:4px 10px;font-size:12px;color:var(--red)" onclick="kHapus(${x.id})">Hapus</button></div>` : x.link && !kTerkunci(x) && me().role === 'Bendahara' ? `<button class="btn o" style="padding:4px 10px;font-size:12px;color:var(--red)" onclick="kHapusLink('${x.link}')">Batalkan</button>` : (kTerkunci(x) ? '<small class=mu>terkunci</small>' : '')}</td></tr>`).join('')}
    <tr class=trt><td colspan=2>Jumlah</td><td class=n>${Rp(d.masuk)}</td><td class=n>${Rp(d.keluar)}</td><td class=n>${Rp(d.akhir)}</td><td></td></tr></table></div>` : `<div class=empty>${IC.kas}<b>Belum ada transaksi ${WL()}</b><small>${m.role === 'Bendahara' ? (KK.w === 'rbf' ? 'Catat dana reimburse yang diterima dari pimpinan. Reimburse yang memakai dana ini otomatis tercatat setelah disetujui.' : 'Catat penerimaan kas kecil dari pimpinan, lalu catat setiap belanja kecil.') : 'Serahkan ' + WL() + ' ke bendahara untuk mulai mencatat.'}</small></div>`}</div>
  <div class=box><h4>Pengeluaran per kategori</h4>${Object.keys(d.cat).length ? Object.entries(d.cat).sort((a, b) => b[1] - a[1]).map(([c, a]) => `<div class=bar2r><div class=bl><span>${esc(c)}</span><b>${Rp(a)}</b></div><div class=trk><i style="width:${Math.max(3, a / mx * 100)}%"></i></div></div>`).join('') : '<p class=mu>Belum ada pengeluaran pada periode ini.</p>'}
    ${KK.w === 'rbf' ? '' : `<div class=desc style="margin-top:16px"><small>Batas belanja kas kecil</small><p>${Rp(k.maks)} per transaksi. Belanja di atas batas ini sebaiknya diajukan lewat <b>Request Dana</b>.${adm ? ` <a class=lnk2 onclick="kAturMaks()">Ubah batas</a>` : ''}</p></div>`}</div></div>`;
}
const kLihat = (id, i) => { const x = kasD().tx.find(y => y.id === id); if (x) viewFile(x.nota, i, x.desc + ' · ' + Rp(x.amt), x.nota.map((_, j) => 'nota-' + (j + 1))); };
const kReq = no => { const r = S.reqs.find(y => y.no === no); if (r) go('det', r.id); };
const kBolehUbah = x => !x.req && !x.link && !kTerkunci(x) && (me().role === 'Admin' ? x.t === 'in' && x.uid === S.me : x.uid === S.me);

/* ---------- Form ---------- */
function kForm(t, id) {
  const x = id ? kasD().tx.find(y => y.id === id) : null;
  KK.form = { t, id: x ? x.id : null, nota: x ? (x.nota || []).slice() : [] };
  draw(); setTimeout(() => { const f = $('kkf'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = f.querySelector('input:not([type=date])'); if (i) i.focus(); } }, 60);
}
function kFormHtml() {
  const f = KK.form, x = f.id ? kasD().tx.find(y => y.id === f.id) : {}, out = f.t === 'out', adm = me().role === 'Admin';
  return `<div class=box id=kkf><h4 style="margin-top:0">${f.id ? 'Ubah' : out ? 'Catat pengeluaran ' + WL() : adm ? 'Serahkan ' + WL() + ' ke bendahara' : 'Catat penerimaan ' + WL()}</h4>
  <p class=mu style="margin:-6px 0 10px;font-size:13px">${out ? 'Untuk belanja kecil (ATK, konsumsi ringan, fotokopi, dsb). Lampirkan foto nota bila ada.' : 'Uang ' + WL() + ' yang diserahkan pimpinan ke bendahara, mis. jatah mingguan.'} Saldo saat ini: <b>${Rp(kSaldo())}</b>.</p>
  <div class=g2><div><label class=req>Tanggal</label><input type=date id=kkD value="${x.date || today()}" max="${today()}"></div>
    <div><label class=req>${out ? 'Barang / keperluan' : 'Keterangan'}</label><input id=kkU maxlength=150 value="${esc(x.desc || (out ? '' : WLc() + ' ' + kPeriode().label.replace(/^Minggu/, 'minggu')))}" placeholder="${out ? 'Contoh: Kertas HVS 2 rim' : 'Contoh: ' + WLc() + ' minggu ke-2 November'}"></div>
    ${out ? `<div><label class=req>Kategori</label><select id=kkC>${CATS.map(c => `<option ${c === (x.cat || 'ATK dan perlengkapan kantor') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div><div><label>Toko / penerima</label><input id=kkS maxlength=100 value="${esc(x.shop || '')}" placeholder="Contoh: Toko Maju Jaya"></div>` : ''}
    <div><label class=req>Nominal</label><div class=pre><span>Rp</span><input id=kkN class=rp inputmode=numeric autocomplete=off value="${x.amt ? fm(x.amt) : ''}" placeholder="${out ? '45.000' : '1.000.000'}"></div></div>
    <div><label>Catatan (opsional)</label><input id=kkK maxlength=200 value="${esc(x.note || '')}"></div></div>
  ${out ? `<label>Foto / scan nota</label><div class=drop onclick="if(!event.target.closest('.fnm'))$('kkF').click()"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg><b>Klik untuk melampirkan nota</b><small>JPG, PNG, WEBP, atau PDF · bisa lebih dari satu</small><input id=kkF type=file hidden multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onchange="kFile()"><div class=fnm>${kChip()}</div></div>` : ''}
  <div id=kkE class=ape role=alert></div>
  <div class=fbar style="margin-top:14px"><small>Dicatat oleh ${esc(me().name)}.</small><div><button class="btn o" onclick="KK.form=null;draw()">Batal</button><button class=btn id=kkOk onclick="kSimpan()">Simpan</button></div></div></div>`;
}
const kChip = () => (KK.form.nota || []).map((u, i) => `<div class=fchip><span>${NI.pdf}</span><div><b>Nota ${i + 1}</b><small><a href="${esc(u)}" onclick="event.preventDefault();event.stopPropagation();viewFile(KK.form.nota,${i},'Nota kas kecil')">lihat</a></small></div><button type=button onclick="event.stopPropagation();KK.form.nota.splice(${i},1);this.closest('.fnm').innerHTML=kChip()" aria-label="Hapus nota">${NI.x}</button></div>`).join('');
async function kFile() {
  const el = $('kkF'), F = [...el.files]; el.value = '';
  for (const f of F) {
    if (!/\.(jpe?g|png|webp|pdf)$/i.test(f.name) || f.size > 8 * 1024 * 1024) { $('kkE').textContent = f.name + ': harus JPG/PNG/WEBP/PDF maks 8 MB.'; continue; }
    try { KK.form.nota.push(/\.pdf$/i.test(f.name) ? await rd(f) : await shrink(f)); } catch (e) { $('kkE').textContent = e.message; }
  }
  const b = document.querySelector('#kkf .fnm'); if (b) b.innerHTML = kChip();
}
async function kSimpan() {
  const f = KK.form, k = kasD(), out = f.t === 'out', e = $('kkE'), err = s => { e.textContent = s; };
  const date = $('kkD').value, desc = $('kkU').value.trim(), amt = num('kkN');
  if (!date) return err('Isi tanggal.');
  if (date > today()) return err('Tanggal tidak boleh di masa depan.');
  if (!desc) return err(out ? 'Isi barang / keperluan.' : 'Isi keterangan.');
  if (!(amt >= 100)) return err('Isi nominal.');
  const lama = f.id ? k.tx.find(y => y.id === f.id) : null;
  if (lama && kTerkunci(lama)) return err('Minggu transaksi ini sudah diperiksa pimpinan, sehingga tidak dapat diubah.');
  if (kasD().cek['W' + kSenin(date)]) return err('Minggu pada tanggal tersebut sudah diperiksa pimpinan. Pilih tanggal lain atau minta pimpinan membatalkan pemeriksaan.');
  if (out) {
    const saldoTgl = kSaldo(date) + (lama && lama.t === 'out' && lama.date <= date ? +lama.amt : 0);
    const saldoKini = kSaldo() + (lama && lama.t === 'out' ? +lama.amt : 0);
    if (amt > Math.min(saldoTgl, saldoKini)) return err(`Saldo ${WL()} tidak cukup (tersedia ${Rp(Math.max(0, Math.min(saldoTgl, saldoKini)))}). Catat penerimaan kas kecil terlebih dahulu.`);
    if (KK.w === 'kas' && amt > k.maks && !await ask({ tone: 'warn', title: 'Melebihi batas kas kecil', msg: `Nominal ${Rp(amt)} di atas batas kas kecil ${Rp(k.maks)} per transaksi. Belanja sebesar ini sebaiknya diajukan lewat Request Dana. Tetap catat sebagai kas kecil?`, ok: 'Tetap catat', no: 'Periksa lagi' })) return;
  }
  const data = { t: f.t, date, desc, amt, note: $('kkK').value.trim(), cat: out ? $('kkC').value : null, shop: out ? $('kkS').value.trim() : '', nota: out ? f.nota.slice() : [] };
  if (lama) { Object.assign(lama, data, { edit: now() }); log(`Ubah ${out ? 'pengeluaran' : 'penerimaan'} ${WL()}: ${desc} ${Rp(amt)}`); }
  else {
    k.seq = (k.seq || 0) + 1;
    k.tx.push({ id: k.seq, ...data, uid: S.me, by: me().name, at: now() });
    log(`${out ? 'Pengeluaran' : 'Penerimaan'} ${WL()}: ${desc} ${Rp(amt)}`);
    if (!out) note(me().role === 'Admin' ? 'Bendahara' : 'Admin', `${WLc()} ${Rp(amt)} ${me().role === 'Admin' ? 'diserahkan pimpinan' : 'diterima bendahara'}: ${desc}`);
  }
  KK.form = null; KK.ref = date; save(); draw();
}
async function kHapus(id) {
  const k = kasD(), x = k.tx.find(y => y.id === id); if (!x || !kBolehUbah(x)) return;
  if (x.t === 'in' && kSaldo() - x.amt < 0) return alert('Penerimaan ini tidak dapat dihapus karena saldo ' + WL() + ' akan menjadi minus. Hapus atau ubah pengeluarannya terlebih dahulu.');
  if (!await ask({ tone: 'bad', title: 'Hapus transaksi ' + WL() + '?', msg: 'Transaksi akan dihapus dari catatan ' + WL() + '.', rows: [['Tanggal', fmtD(x.date)], ['Uraian', x.desc], ['Nominal', Rp(x.amt)]], ok: 'Hapus', no: 'Batal' })) return;
  k.tx = k.tx.filter(y => y.id !== id); log(`Hapus transaksi ${WL()}: ${x.desc} ${Rp(x.amt)}`); save(); draw();
}
async function kCek(ya) {
  const p = kPeriode(), k = kasD();
  if (ya) {
    if (!await ask({ tone: 'warn', title: 'Tandai laporan sudah diperiksa?', msg: `Laporan ${WL()} ${p.label} dinyatakan sudah diperiksa. Transaksi minggu ini akan terkunci dan tidak dapat diubah bendahara.`, ok: 'Tandai diperiksa', no: 'Batal' })) return;
    k.cek[p.key] = { by: me().name, at: now() }; log(`Periksa laporan ${WL()} ${p.label}`); note('Bendahara', `Laporan ${WL()} ${p.label} sudah diperiksa pimpinan.`);
  } else {
    if (!await ask({ tone: 'warn', title: 'Batalkan pemeriksaan?', msg: 'Transaksi minggu ini akan dapat diubah kembali oleh bendahara.', ok: 'Batalkan pemeriksaan', no: 'Kembali' })) return;
    delete k.cek[p.key]; log(`Batalkan pemeriksaan laporan ${WL()} ${p.label}`);
  }
  save(); draw();
}
async function kAturMaks() {
  const v = await ask({ tone: 'warn', title: 'Batas belanja kas kecil', msg: 'Nominal maksimal per transaksi yang wajar dibayar dari kas kecil. Di atas batas ini sistem memberi peringatan.', input: { label: 'Batas per transaksi', rp: true, value: fm(kasD().maks), err: 'Isi nominal.' }, ok: 'Simpan', no: 'Batal' });
  const n = +String(v || '').replace(/\D/g, ''); if (!n) return;
  kasD().maks = n; log(`Ubah batas kas kecil menjadi ${Rp(n)}`); save(); draw();
}

/* ---------- Ekspor & cetak ---------- */
function kCsv() {
  const p = kPeriode(), d = kData(p), q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const L = [['Tanggal', 'Jenis', 'Uraian', 'Kategori', 'Toko/penerima', 'Masuk', 'Keluar', 'Saldo', 'Nota', 'Dicatat oleh'].map(q).join(','), ['', '', 'Saldo awal', '', '', '', '', d.awal, '', ''].map(q).join(',')]
    .concat(d.R.map(x => [x.date, x.t === 'in' ? 'Penerimaan' : 'Pengeluaran', x.desc, x.cat || '', x.shop || '', x.t === 'in' ? x.amt : '', x.t === 'out' ? x.amt : '', x.saldo, (x.nota || []).length, x.by].map(q).join(',')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\n')], { type: 'text/csv' })); a.download = (KK.w === 'rbf' ? 'dana-reimburse-' : 'kas-kecil-') + p.key.replace(/^W/, 'minggu-') + '.csv'; a.click();
}
function kCetak() {
  const p = kPeriode(), d = kData(p), cek = kasD().cek[p.key], bend = S.users.find(u => u.role === 'Bendahara'), pim = S.users.find(u => u.role === 'Admin');
  const nota = d.R.filter(x => x.t === 'out' && !x.link).flatMap(x => (x.nota || []).filter(isImg).map(u => ({ x, u })));
  const hd = `<div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #16213e;padding-bottom:10px;margin-bottom:16px"><img src="${LOGO}" style="width:58px;height:58px;object-fit:contain"><div><b style="font-size:17px">STIE KRAKATAU</b><div style="font-size:12px;color:#555">Laporan ${WLc()} · ${esc(p.label)}</div></div></div>`;
  $('pv').innerHTML = `<div class=tb><button class=btn onclick="print()">Unduh / Cetak PDF</button><button class="btn o" onclick="$('pv').style.display='none'">Tutup</button> <small>Pilih "Simpan sebagai PDF" pada dialog cetak.</small></div>
  <div class=pg>${hd}<h2 style="text-align:center;margin:6px 0 2px">LAPORAN ${WLc().toUpperCase()}</h2><p style="text-align:center;margin:0 0 16px">Periode: ${fmtD(p.dari)} s.d. ${fmtD(p.sampai)}</p>
  <h3>Ringkasan</h3><table><tr><td>Saldo awal</td><td style="text-align:right;white-space:nowrap">${Rp(d.awal)}</td></tr><tr><td>Penerimaan ${WL()}</td><td style="text-align:right;white-space:nowrap">${Rp(d.masuk)}</td></tr><tr><td>Pengeluaran</td><td style="text-align:right;white-space:nowrap">${Rp(d.keluar)}</td></tr><tr><th style="text-align:left">Saldo akhir</th><th style="text-align:right;white-space:nowrap">${Rp(d.akhir)}</th></tr></table>
  <h3>Rincian Transaksi</h3><table><tr><th>No</th><th>Tanggal</th><th>Uraian</th><th>Kategori</th><th>Masuk</th><th>Keluar</th><th>Saldo</th></tr><tr><td></td><td></td><td><i>Saldo awal</i></td><td></td><td></td><td></td><td style="text-align:right;white-space:nowrap">${Rp(d.awal)}</td></tr>
  ${d.R.map((x, i) => `<tr><td>${i + 1}</td><td>${fmtD(x.date)}</td><td>${esc(x.desc)}${x.shop ? ' (' + esc(x.shop) + ')' : ''}</td><td>${x.t === 'in' ? 'Penerimaan' : esc(x.cat)}</td><td style="text-align:right;white-space:nowrap">${x.t === 'in' ? Rp(x.amt) : ''}</td><td style="text-align:right;white-space:nowrap">${x.t === 'out' ? Rp(x.amt) : ''}</td><td style="text-align:right;white-space:nowrap">${Rp(x.saldo)}</td></tr>`).join('') || '<tr><td colspan=7>Tidak ada transaksi.</td></tr>'}
  <tr><th colspan=4 style="text-align:left">Jumlah</th><th style="text-align:right;white-space:nowrap">${Rp(d.masuk)}</th><th style="text-align:right;white-space:nowrap">${Rp(d.keluar)}</th><th style="text-align:right;white-space:nowrap">${Rp(d.akhir)}</th></tr></table>
  ${Object.keys(d.cat).length ? `<h3>Rekap Pengeluaran per Kategori</h3><table><tr><th>Kategori</th><th>Jumlah</th></tr>${Object.entries(d.cat).sort((a, b) => b[1] - a[1]).map(([c, a]) => `<tr><td>${esc(c)}</td><td style="text-align:right;white-space:nowrap">${Rp(a)}</td></tr>`).join('')}</table>` : ''}
  ${cek ? `<p style="font-size:12px;color:#555">Diperiksa oleh ${esc(cek.by)} pada ${esc(cek.at)}.</p>` : ''}
  <table style="margin-top:28px;border:0"><tr><td style="border:0;text-align:center;width:50%">Dibuat oleh,<br>Bendahara<br><br><br><br><b>${esc(bend ? bend.name : '....................')}</b></td><td style="border:0;text-align:center">Mengetahui,<br>Pimpinan<br><br><br><br><b>${esc(pim ? pim.name : '....................')}</b></td></tr></table></div>
  ${nota.length ? `<div class=pg>${hd}<h3>Lampiran Nota (${nota.length})</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${nota.map(({ x, u }) => `<div style="border:1px solid #ddd;padding:8px;break-inside:avoid"><img src="${esc(u)}" style="width:100%;max-height:330px;object-fit:contain"><small>${fmtD(x.date)} · ${esc(x.desc)} · ${Rp(x.amt)}</small></div>`).join('')}</div></div>` : ''}`;
  $('pv').style.display = 'block'; window.scrollTo(0, 0);
}

/* ---------- Sisa dana reimburse: kembalikan ke pimpinan / alokasikan ke kas kecil ---------- */
function kSisaBox(saldo, adm) {
  const p = kPeriode(), d = kData(p);
  return `<div class=box style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:${saldo > 0 ? '#f4f9f5' : '#fff'}">
    <div><b>Sisa dana reimburse: ${Rp(saldo)}</b><small class=mu style="display:block;margin-top:2px">${saldo > 0 ? 'Sisa dana bisa dikembalikan ke pimpinan atau dialokasikan ke kas kecil.' : 'Tidak ada sisa dana reimburse saat ini.'}${KK.mode === 'minggu' ? ` Periode ini: masuk ${Rp(d.masuk)}, keluar ${Rp(d.keluar)}.` : ''}</small></div>
    ${me().role === 'Bendahara' || adm ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn o" onclick="kSisa('ret')" ${saldo > 0 ? '' : 'disabled'}>Kembalikan ke pimpinan</button><button class=btn onclick="kSisa('alok')" ${saldo > 0 ? '' : 'disabled'}>Alokasikan ke kas kecil</button></div>` : ''}</div>`;
}
async function kSisa(jenis) {
  const saldo = kSaldoW('rbf'); if (!(saldo > 0)) return;
  const al = jenis === 'alok';
  const v = await ask({ tone: 'warn', title: al ? 'Alokasikan ke kas kecil' : 'Kembalikan ke pimpinan', msg: al ? 'Sisa dana reimburse dipindahkan menjadi saldo kas kecil.' : 'Sisa dana reimburse dikembalikan ke pimpinan dan keluar dari catatan bendahara.', input: { label: 'Nominal (maks ' + Rp(saldo) + ')', rp: true, value: fm(saldo), err: 'Isi nominal.' }, ok: al ? 'Alokasikan' : 'Kembalikan', no: 'Batal' });
  if (!v) return;
  const n = +String(v).replace(/\D/g, '');
  if (!(n > 0) || n > saldo) return alert('Nominal harus antara Rp 1 dan ' + Rp(saldo) + '.');
  const date = today(), lk = 'L' + Date.now().toString(36), base = { date, amt: n, note: '', shop: '', nota: [], uid: S.me, by: me().name, at: now(), link: lk };
  if (kasW('rbf').cek['W' + kSenin(date)] || (al && kasW('kas').cek['W' + kSenin(date)])) return alert('Laporan minggu ini sudah diperiksa pimpinan, sehingga tidak dapat menambah transaksi. Minta pimpinan membatalkan pemeriksaan terlebih dahulu.');
  const R1 = kasW('rbf'); R1.seq = (R1.seq || 0) + 1;
  R1.tx.push({ id: R1.seq, t: 'out', desc: al ? 'Alokasi sisa dana reimburse ke kas kecil' : 'Pengembalian sisa dana reimburse ke pimpinan', cat: al ? 'Dialokasikan ke kas kecil' : 'Dikembalikan ke pimpinan', ...base });
  if (al) { const K2 = kasW('kas'); K2.seq = (K2.seq || 0) + 1; K2.tx.push({ id: K2.seq, t: 'in', desc: 'Alokasi dari sisa dana reimburse', cat: null, ...base }); }
  log(`${al ? 'Alokasi sisa dana reimburse ke kas kecil' : 'Pengembalian sisa dana reimburse ke pimpinan'}: ${Rp(n)}`);
  note(me().role === 'Admin' ? 'Bendahara' : 'Admin', `${al ? 'Sisa dana reimburse dialokasikan ke kas kecil' : 'Sisa dana reimburse dikembalikan ke pimpinan'}: ${Rp(n)}`);
  save(); draw();
}
async function kHapusLink(lk) {
  const a1 = kasW('rbf').tx.find(x => x.link === lk), a2 = kasW('kas').tx.find(x => x.link === lk);
  if (!a1) return;
  if (a2 && kSaldoW('kas') - a2.amt < 0) return alert('Tidak dapat dibatalkan karena saldo kas kecil akan menjadi minus.');
  if (!await ask({ tone: 'bad', title: 'Batalkan transaksi ini?', msg: a2 ? 'Alokasi ke kas kecil dibatalkan; dana kembali menjadi sisa dana reimburse.' : 'Pengembalian ke pimpinan dibatalkan; dana kembali menjadi sisa dana reimburse.', rows: [['Nominal', Rp(a1.amt)], ['Tanggal', fmtD(a1.date)]], ok: 'Batalkan', no: 'Kembali' })) return;
  kasW('rbf').tx = kasW('rbf').tx.filter(x => x.link !== lk); kasW('kas').tx = kasW('kas').tx.filter(x => x.link !== lk);
  log(`Batalkan ${a2 ? 'alokasi' : 'pengembalian'} sisa dana reimburse ${Rp(a1.amt)}`); save(); draw();
}
