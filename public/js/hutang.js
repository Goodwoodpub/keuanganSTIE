/* ===== Hutang ke Owner (dana talangan) =====
 * Mencatat kebutuhan STIE yang memakai uang owner terlebih dahulu, lalu
 * pengembaliannya (bisa dicicil), supaya tidak terlupa. Khusus akun pimpinan.
 * Data: S.hut = { seq, L: [ {id, date, from, desc, cat, amt, due, ref, note,
 *        bukti:[{name,url}], pay:[{id,date,amt,method,note,bukti:[]}], by, at} ] }
 */
IC.hutang = '<svg viewBox="0 0 24 24"><path d="M4 7h16v12H4z"/><path d="M4 7l2-3h12l2 3M8 12h4M8 15h7"/><circle cx="16.5" cy="12.5" r="1"/></svg>';
SUBT.hutang = 'Dana talangan owner yang harus dikembalikan STIE';
const HU = { f: 'aktif', q: '', form: null, pay: null, open: null };
const hutD = () => { S.hut = S.hut || {}; S.hut.L = S.hut.L || []; return S.hut; };
const hBayar = h => (h.pay || []).reduce((s, p) => s + +p.amt, 0);
const hSisa = h => Math.max(0, +h.amt - hBayar(h));
const hLunas = h => hSisa(h) <= 0;
const hHari = h => h.due ? Math.round((new Date(h.due + 'T00:00') - new Date(today() + 'T00:00')) / 864e5) : null;
const hStatus = h => {
  if (hLunas(h)) return ['Lunas', 's-Selesai'];
  const d = hHari(h);
  if (d != null && d < 0) return ['Lewat jatuh tempo', 's-Ditolak'];
  if (d != null && d <= 7) return ['Segera jatuh tempo', 's-Perlu'];
  return [hBayar(h) ? 'Dibayar sebagian' : 'Belum dikembalikan', 's-Menunggu'];
};
const hPerlu = () => hutD().L.filter(h => !hLunas(h) && h.due && hHari(h) <= 7);
const hFileBaca = async el => {
  const out = [];
  for (const f of [...(el && el.files || [])]) {
    if (!/\.(jpe?g|png|webp|pdf)$/i.test(f.name)) throw new Error(f.name + ': harus JPG, PNG, WEBP, atau PDF.');
    if (f.size > 8e6) throw new Error(f.name + ': maksimal 8 MB.');
    out.push({ name: f.name, url: /\.pdf$/i.test(f.name) ? await rd(f) : await shrink(f) });
  }
  return out;
};
const hFiles = (L, judul) => (L || []).length ? `<span class=hfl>${L.map((x, j) => `<a onclick='viewFile(${JSON.stringify(L.map(y => y.url))},${j},${JSON.stringify(judul)},${JSON.stringify(L.map(y => y.name))})'>${SV.clip} ${esc(x.name || 'bukti ' + (j + 1))}</a>`).join('')}</span>` : '';

function hutv() {
  if (me().role !== 'Admin') return `<div class=box><div class=empty>${IC.hutang}<b>Khusus pimpinan</b><small>Halaman ini hanya dapat dibuka oleh akun pimpinan.</small></div></div>`;
  const L = hutD().L, aktif = L.filter(h => !hLunas(h));
  const tot = L.reduce((s, h) => s + +h.amt, 0), kembali = L.reduce((s, h) => s + hBayar(h), 0), sisa = aktif.reduce((s, h) => s + hSisa(h), 0);
  const lewat = aktif.filter(h => h.due && hHari(h) < 0), dekat = aktif.filter(h => h.due && hHari(h) >= 0).sort((a, b) => a.due.localeCompare(b.due))[0];
  const K = [['Sisa hutang ke owner', Rp(sisa), `${aktif.length} catatan belum lunas`, 'hutang'], ['Total dana talangan', Rp(tot), `${L.length} catatan`, 'new'], ['Sudah dikembalikan', Rp(kembali), tot ? Math.round(kembali / tot * 100) + '% dari total' : '-', 'audit'], ['Jatuh tempo terdekat', dekat ? fmtD(dekat.due) : (lewat.length ? 'Terlewat' : '-'), dekat ? `${Rp(hSisa(dekat))} · ${esc(dekat.desc)}` : lewat.length ? `${lewat.length} catatan lewat jatuh tempo` : 'tidak ada', 'rep']];
  const q = HU.q.trim().toLowerCase();
  const V = L.filter(h => (HU.f === 'semua' || (HU.f === 'aktif' ? !hLunas(h) : hLunas(h))) && (!q || (h.desc + ' ' + h.from + ' ' + (h.ref || '') + ' ' + (h.note || '')).toLowerCase().includes(q)))
    .sort((a, b) => (hLunas(a) - hLunas(b)) || ((a.due || '9999') .localeCompare(b.due || '9999')) || b.id - a.id);
  const tab = (k, t, n) => `<button class="${HU.f == k ? 'on' : ''}" onclick="HU.f='${k}';draw()">${t}${n != null ? ` <small style="opacity:.7">${n}</small>` : ''}</button>`;
  return `${lewat.length ? `<div class="aps bad" style="margin:0 0 16px">⚠ <b>${lewat.length} hutang ke owner sudah lewat jatuh tempo</b> (sisa ${Rp(lewat.reduce((s, h) => s + hSisa(h), 0))}). Segera kembalikan atau perbarui tanggal jatuh temponya.</div>` : ''}
  <div class=kpis>${K.map(([a, b, c, i]) => `<div class=kpi><div class=kh><span>${a}</span><i class=ci>${IC[i]}</i></div><b>${b}</b><small>${c}</small></div>`).join('')}</div>
  ${HU.form ? hFormHtml() : ''}${HU.pay ? hPayHtml() : ''}
  <div class=box><div class=lh style="margin:0 0 14px;align-items:center;flex-wrap:wrap;gap:10px"><div class=tabs style="display:inline-flex">${tab('aktif', 'Belum lunas', aktif.length)}${tab('lunas', 'Lunas', L.length - aktif.length)}${tab('semua', 'Semua')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class=srch style="min-width:220px">${SV.srch}<input value="${esc(HU.q)}" placeholder="Cari keperluan / owner" oninput="HU.q=this.value;clearTimeout(window._ht);window._ht=setTimeout(()=>{draw();const i=document.querySelector('.srch input');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},250)"></div><button class="btn o" onclick="hCsv()" ${L.length ? '' : 'disabled'}>Ekspor Excel</button><button class=btn onclick="hForm()">+ Catat Dana Talangan</button></div></div>
  ${V.length ? `<div class=hls>${V.map(hCard).join('')}</div>` : `<div class=empty>${IC.hutang}<b>${L.length ? 'Tidak ada catatan pada filter ini' : 'Belum ada hutang ke owner'}</b><small>${L.length ? 'Ganti filter atau kata kunci pencarian.' : 'Catat setiap kebutuhan STIE yang memakai uang owner terlebih dahulu, supaya pengembaliannya tidak terlupa.'}</small></div>`}</div>`;
}
function hCard(h) {
  const [st, cls] = hStatus(h), s = hSisa(h), b = hBayar(h), p = h.amt ? Math.min(100, b / h.amt * 100) : 0, d = hHari(h), op = HU.open === h.id;
  return `<div class="hcd${hLunas(h) ? ' lunas' : d != null && d < 0 ? ' lewat' : ''}">
  <div class=hct onclick="HU.open=HU.open===${h.id}?null:${h.id};draw()">
    <div class=hcm><b>${esc(h.desc)}</b><small>${fmtD(h.date)} · dari ${esc(h.from || 'Owner')}${h.cat ? ' · ' + esc(h.cat) : ''}${h.ref ? ' · ' + esc(h.ref) : ''}</small>
      <div class=hpg><i style="width:${p}%"></i></div><small>Dikembalikan ${Rp(b)} dari ${Rp(h.amt)}${h.due ? ` · jatuh tempo ${fmtD(h.due)}${!hLunas(h) && d != null ? (d < 0 ? ` (<b style="color:#b42318">terlambat ${-d} hari</b>)` : d === 0 ? ' (<b>hari ini</b>)' : ` (${d} hari lagi)`) : ''}` : ''}</small></div>
    <div class=hcr><small>Sisa</small><b>${Rp(s)}</b><span class="bd ${cls}">${st}</span></div></div>
  ${op ? `<div class=hdx>
    ${h.note ? `<p class=mu style="margin:0 0 8px">${esc(h.note)}</p>` : ''}${h.bukti && h.bukti.length ? `<div style="margin-bottom:10px"><small class=mu>Bukti penggunaan dana:</small> ${hFiles(h.bukti, 'Bukti dana talangan')}</div>` : ''}
    <h5>Riwayat pengembalian</h5>${(h.pay || []).length ? `<div class=tw><table><tr><th>Tanggal</th><th class=n>Nominal</th><th>Metode</th><th>Catatan / bukti</th><th></th></tr>${h.pay.map(x => `<tr><td>${fmtD(x.date)}</td><td class=n>${Rp(x.amt)}</td><td>${esc(x.method || '-')}</td><td>${esc(x.note || '')} ${hFiles(x.bukti, 'Bukti pengembalian')}</td><td style="text-align:right"><button class="btn o" style="padding:4px 10px;font-size:12px;color:var(--red)" onclick="hPayDel(${h.id},${x.id})">Hapus</button></td></tr>`).join('')}</table></div>` : '<p class=mu style="margin:0">Belum ada pengembalian.</p>'}
    <div class=hda>${!hLunas(h) ? `<button class=btn onclick="hPay(${h.id})">+ Catat Pengembalian</button>` : ''}<button class="btn o" onclick="hForm(${h.id})">Ubah</button><button class="btn o" style="color:var(--red)" onclick="hDel(${h.id})">Hapus</button></div></div>` : ''}</div>`;
}

/* ---------- Form dana talangan ---------- */
function hForm(id) { HU.pay = null; const h = id ? hutD().L.find(x => x.id === id) : null; HU.form = { id: h ? h.id : null, bukti: h ? (h.bukti || []).slice() : [] }; draw(); setTimeout(() => { const f = $('huf'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('huU').focus(); } }, 60); }
function hFormHtml() {
  const f = HU.form, h = f.id ? hutD().L.find(x => x.id === f.id) : {};
  const reqs = S.reqs.filter(r => r.status !== 'Ditolak').slice(0, 60);
  return `<div class=box id=huf><h4 style="margin-top:0">${f.id ? 'Ubah catatan dana talangan' : 'Catat dana talangan dari owner'}</h4>
  <p class=mu style="margin:-6px 0 10px;font-size:13px">Untuk kebutuhan STIE yang dibayar dulu memakai uang owner dan nantinya harus dikembalikan.</p>
  <div class=g2><div><label class=req>Keperluan</label><input id=huU maxlength=150 value="${esc(h.desc || '')}" placeholder="Contoh: Pembayaran listrik kampus November"></div>
  <div><label class=req>Nominal</label><div class=pre><span>Rp</span><input id=huN class=rp inputmode=numeric value="${h.amt ? fm(h.amt) : ''}" placeholder="0"></div></div>
  <div><label class=req>Tanggal dana dipakai</label><input type=date id=huD value="${h.date || today()}" max="${today()}"></div>
  <div><label>Target pengembalian (jatuh tempo)</label><input type=date id=huT value="${h.due || ''}"></div>
  <div><label>Dana dari</label><input id=huF maxlength=80 value="${esc(h.from || 'Owner')}" placeholder="Owner"></div>
  <div><label>Kategori</label><select id=huC><option value="">-</option>${CATS.map(c => `<option ${c === h.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
  <div><label>Terkait request (opsional)</label><select id=huR><option value="">Tidak terkait</option>${reqs.map(r => `<option value="${esc(r.no)}" ${r.no === h.ref ? 'selected' : ''}>${esc(r.no)} · ${esc(r.title)}</option>`).join('')}</select></div>
  <div><label>Catatan</label><input id=huK maxlength=200 value="${esc(h.note || '')}" placeholder="Opsional"></div></div>
  <label>Bukti penggunaan dana (opsional)</label><input id=huB type=file multiple accept=".jpg,.jpeg,.png,.webp,.pdf" style="padding:9px">${f.bukti.length ? `<small class=mu>Sudah terlampir: ${f.bukti.map(x => esc(x.name)).join(', ')}</small>` : ''}
  <div id=huE class=ape role=alert></div>
  <div class=fbar style="margin-top:14px"><small>Dicatat oleh ${esc(me().name)}.</small><div><button class="btn o" onclick="HU.form=null;draw()">Batal</button><button class=btn onclick="hSimpan()">Simpan</button></div></div></div>`;
}
async function hSimpan() {
  const f = HU.form, e = $('huE'), err = s => { e.textContent = s; };
  const desc = $('huU').value.trim(), amt = num('huN'), date = $('huD').value, due = $('huT').value;
  if (!desc) return err('Isi keperluan.');
  if (!(amt > 0)) return err('Isi nominal.');
  if (!date) return err('Isi tanggal dana dipakai.');
  if (due && due < date) return err('Target pengembalian tidak boleh sebelum tanggal dana dipakai.');
  let bk; try { bk = await hFileBaca($('huB')); } catch (x) { return err(x.message); }
  const k = hutD(), data = { desc, amt, date, due: due || null, from: $('huF').value.trim() || 'Owner', cat: $('huC').value || null, ref: $('huR').value || null, note: $('huK').value.trim(), bukti: f.bukti.concat(bk) };
  if (f.id) {
    const h = k.L.find(x => x.id === f.id); if (!h) return;
    if (amt < hBayar(h)) return err(`Nominal tidak boleh lebih kecil dari yang sudah dikembalikan (${Rp(hBayar(h))}).`);
    Object.assign(h, data, { edit: now() }); log(`Ubah catatan hutang ke owner: ${desc} ${Rp(amt)}`);
  } else {
    k.seq = (k.seq || 0) + 1;
    k.L.push({ id: k.seq, ...data, pay: [], by: me().name, at: now() });
    log(`Catat dana talangan owner: ${desc} ${Rp(amt)}`);
    HU.open = k.seq; HU.f = 'aktif';
  }
  HU.form = null; save(); draw();
}
async function hDel(id) {
  const k = hutD(), h = k.L.find(x => x.id === id); if (!h) return;
  if (!await ask({ tone: 'bad', title: 'Hapus catatan hutang?', msg: 'Catatan dana talangan beserta riwayat pengembaliannya akan dihapus permanen.', rows: [['Keperluan', h.desc], ['Nominal', Rp(h.amt)], ['Sudah dikembalikan', Rp(hBayar(h))]], ok: 'Hapus', no: 'Batal' })) return;
  k.L = k.L.filter(x => x.id !== id); log(`Hapus catatan hutang ke owner: ${h.desc} ${Rp(h.amt)}`); save(); draw();
}

/* ---------- Pengembalian ---------- */
function hPay(id) { HU.form = null; HU.pay = { id }; draw(); setTimeout(() => { const f = $('hup'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('hpN').focus(); } }, 60); }
function hPayHtml() {
  const h = hutD().L.find(x => x.id === HU.pay.id); if (!h) return '';
  return `<div class=box id=hup><h4 style="margin-top:0">Catat pengembalian ke ${esc(h.from || 'owner')}</h4>
  <p class=mu style="margin:-6px 0 10px;font-size:13px">${esc(h.desc)} · sisa hutang <b>${Rp(hSisa(h))}</b> dari ${Rp(h.amt)}. Boleh dicicil.</p>
  <div class=g2><div><label class=req>Nominal dikembalikan</label><div class=pre><span>Rp</span><input id=hpN class=rp inputmode=numeric value="${fm(hSisa(h))}"></div></div>
  <div><label class=req>Tanggal</label><input type=date id=hpD value="${today()}" max="${today()}"></div>
  <div><label>Metode</label><select id=hpM>${['Transfer', 'Tunai', 'Potong pendapatan'].map(o => `<option>${o}</option>`).join('')}</select></div>
  <div><label>Catatan</label><input id=hpK maxlength=200 placeholder="Opsional"></div></div>
  <label>Bukti pengembalian (opsional)</label><input id=hpB type=file multiple accept=".jpg,.jpeg,.png,.webp,.pdf" style="padding:9px">
  <div id=hpE class=ape role=alert></div>
  <div class=fbar style="margin-top:14px"><small>Dicatat oleh ${esc(me().name)}.</small><div><button class="btn o" onclick="HU.pay=null;draw()">Batal</button><button class=btn onclick="hPaySimpan()">Simpan Pengembalian</button></div></div></div>`;
}
async function hPaySimpan() {
  const k = hutD(), h = k.L.find(x => x.id === HU.pay.id), e = $('hpE'); if (!h) return;
  const amt = num('hpN'), date = $('hpD').value, sisa = hSisa(h);
  if (!(amt > 0)) return e.textContent = 'Isi nominal.';
  if (amt > sisa) return e.textContent = `Melebihi sisa hutang (${Rp(sisa)}).`;
  if (!date) return e.textContent = 'Isi tanggal.';
  let bk; try { bk = await hFileBaca($('hpB')); } catch (x) { return e.textContent = x.message; }
  const h2 = hutD().L.find(x => x.id === h.id); if (!h2) return;
  h2.pay = h2.pay || []; h2.pseq = (h2.pseq || 0) + 1;
  h2.pay.push({ id: h2.pseq, date, amt, method: $('hpM').value, note: $('hpK').value.trim(), bukti: bk, by: me().name, at: now() });
  log(`Pengembalian dana talangan owner: ${h2.desc} ${Rp(amt)}${hLunas(h2) ? ' (lunas)' : ''}`);
  HU.pay = null; HU.open = h2.id; save(); draw();
}
async function hPayDel(id, pid) {
  const h = hutD().L.find(x => x.id === id), p = h && (h.pay || []).find(x => x.id === pid); if (!p) return;
  if (!await ask({ tone: 'bad', title: 'Hapus pengembalian?', msg: 'Catatan pengembalian ini dihapus dan sisa hutang bertambah kembali.', rows: [['Tanggal', fmtD(p.date)], ['Nominal', Rp(p.amt)]], ok: 'Hapus', no: 'Batal' })) return;
  h.pay = h.pay.filter(x => x.id !== pid); log(`Hapus pengembalian dana talangan: ${h.desc} ${Rp(p.amt)}`); save(); draw();
}

/* ---------- Ekspor ---------- */
function hCsv() {
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const rows = [['Tanggal', 'Keperluan', 'Dana dari', 'Kategori', 'Terkait request', 'Nominal', 'Sudah dikembalikan', 'Sisa', 'Jatuh tempo', 'Status', 'Catatan'].map(q).join(',')]
    .concat(hutD().L.map(h => [h.date, h.desc, h.from, h.cat || '', h.ref || '', h.amt, hBayar(h), hSisa(h), h.due || '', hStatus(h)[0], h.note || ''].map(q).join(',')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv' })); a.download = 'hutang-ke-owner-' + today() + '.csv'; a.click();
}

/* ---------- Pengingat di dashboard pimpinan ---------- */
const _dashAsli = dash;
dash = function () {
  const html = _dashAsli.apply(this, arguments);
  if (me().role !== 'Admin') return html;
  const P = hPerlu(), lw = P.filter(h => hHari(h) < 0);
  if (!P.length) return html;
  return `<div class="aps ${lw.length ? 'bad' : 'warn'}" style="margin:0 0 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><span>${lw.length ? `⚠ <b>${lw.length} hutang ke owner lewat jatuh tempo</b>` : `<b>${P.length} hutang ke owner jatuh tempo dalam 7 hari</b>`} · sisa ${Rp(P.reduce((s, h) => s + hSisa(h), 0))}</span><button class="btn o" onclick="HU.f='aktif';go('hutang')">Lihat hutang</button></div>` + html;
};

document.head.insertAdjacentHTML('beforeend', `<style>
.hls{display:flex;flex-direction:column;gap:10px}
.hcd{border:1px solid #e2e8f0;border-radius:14px;background:#fff;overflow:hidden}
.hcd.lewat{border-color:#f3b7b0}
.hcd.lunas{opacity:.85}
.hct{display:flex;gap:16px;align-items:center;padding:14px 16px;cursor:pointer}
.hct:hover{background:#f8fafd}
.hcm{flex:1;min-width:0}
.hcm>b{font-size:15px}
.hcm small{display:block;color:var(--mu);font-size:12.5px;margin-top:3px}
.hpg{height:6px;border-radius:99px;background:#e6ecf5;overflow:hidden;margin:9px 0 2px;max-width:420px}
.hpg i{display:block;height:100%;background:#16a34a;border-radius:99px}
.hcr{text-align:right;flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.hcr small{color:var(--mu);font-size:11.5px;text-transform:uppercase;letter-spacing:.05em}
.hcr b{font-size:18px}
.hdx{border-top:1px solid #edf1f7;padding:14px 16px;background:#fbfcfe}
.hdx h5{margin:4px 0 8px;font-size:13px;color:var(--pr)}
.hda{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.hfl{display:inline-flex;flex-wrap:wrap;gap:8px}
.hfl a{cursor:pointer;color:var(--pr);font-weight:600;font-size:12.5px;display:inline-flex;align-items:center;gap:3px}
.hfl a svg{width:13px;height:13px}
@media(max-width:700px){.hct{flex-direction:column;align-items:stretch}.hcr{align-items:flex-start;text-align:left}}
</style>`);
