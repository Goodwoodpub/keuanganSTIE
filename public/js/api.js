/* Penghubung frontend <-> server. Menggantikan localStorage. */
const API = (() => {
  const bar = (msg, bad) => {
    const b = document.getElementById('netbar'); if (!b) return;
    clearTimeout(bar.t);
    if (!msg) { b.className = ''; return; }
    b.textContent = msg; b.className = 'on' + (bad ? ' bad' : '');
    if (!bad) bar.t = setTimeout(() => { b.className = ''; }, 1800);
  };
  async function call(method, url, body, opt = {}) {
    const h = { 'X-Requested-With': 'fetch', ...(opt.headers || {}) };
    let b = body;
    if (body !== undefined && !(body instanceof Blob)) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    let r;
    try { r = await fetch(url, { method, headers: h, body: b, credentials: 'same-origin', cache: 'no-store' }); }
    catch (e) { const er = new Error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'); er.net = true; throw er; }
    if (r.status === 204) return null;
    const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
    if (!r.ok) {
      const er = new Error((data && data.error) || ('Kesalahan server (' + r.status + ')'));
      er.status = r.status; er.data = data;
      if (r.status === 401 && !opt.quiet && window.onSessionExpired) window.onSessionExpired();
      throw er;
    }
    return data;
  }

  let version = 0, busy = false, again = false, onConflict = null, onSaved = null;
  /* Simpan state ke server secara berurutan (tidak tumpang tindih). */
  async function flush(getState) {
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        bar('Menyimpan…');
        try {
          const r = await call('PUT', '/api/state', { version, data: getState() });
          version = r.version; bar('Tersimpan');
          onSaved && onSaved();
        } catch (e) {
          if (e.status === 409 && e.data) { version = e.data.version; bar(''); onConflict && onConflict(e.data.data); again = false; }
          else if (e.status === 401) { bar(''); again = false; }
          else { bar('Gagal menyimpan: ' + e.message, true); throw e; }
        }
      } while (again);
    } finally { busy = false; }
  }

  return {
    bar,
    get: u => call('GET', u),
    post: (u, b) => call('POST', u, b ?? {}),
    del: u => call('DELETE', u),
    session: () => call('GET', '/api/session', undefined, { quiet: true }),
    login: (u, p) => call('POST', '/api/login', { u, p }, { quiet: true }),
    logout: () => call('POST', '/api/logout', {}),
    async loadState() { const r = await call('GET', '/api/state'); version = r.version; return r.data; },
    async poll() { if (busy) return null; const r = await call('GET', '/api/state?v=' + version, undefined, { quiet: true }); if (!r || busy) return null; version = r.version; return r.data; },
    setVersion: v => { version = v; },
    save: getState => flush(getState).catch(() => {}),
    get busy() { return busy; },
    onConflict: f => { onConflict = f; },
    onSaved: f => { onSaved = f; },
    /* Unggah berkas -> mengembalikan URL berkas di server. */
    async upload(blob, name) {
      bar('Mengunggah berkas…');
      try {
        const r = await call('POST', '/api/files', blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(name || 'berkas') } });
        bar(''); return r.url;
      } catch (e) { bar('Unggah gagal: ' + e.message, true); throw e; }
    },
  };
})();
