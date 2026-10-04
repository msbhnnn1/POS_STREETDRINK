/* Kasir POS - Sinkron Google Sheets (dimuat setelah app.js) */
(() => {
  const $g = id => document.getElementById(id);
  const G = () => S.gs || (S.gs = { url: '', token: '', auto: true, img: true, synced: [], mh: '', last: 0 });
  const _save = save;                       // simpan lokal tanpa memicu sinkron
  let busy = false, dirty = false, timer = null;

  const ok = () => !!(G().url && G().token);
  const status = (t, c) => { const e = $g('gss'); if (e) { e.className = c || 'mu'; e.textContent = t; } };
  const master = () => ({ set: { name: S.set.name }, stock: S.stock, menu: S.menu.map(({ photo, ...m }) => m) });
  async function call(body) {
    const g = G();
    const r = await fetch(g.url, { method: 'POST', body: JSON.stringify({ ...body, token: g.token }) }); // text/plain: tanpa preflight CORS
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Gagal');
    return j;
  }
  const pay = t => ({ ...t, receipt: G().img ? t.receipt : '', proof: G().img ? t.proof : '' });

  async function sync(force) {
    if (!ok()) return;
    if (busy) { dirty = true; return; }
    busy = true;
    const g = G();
    try {
      const ids = new Set(S.trx.map(t => t.id)), syn = new Set(g.synced);
      const nw = force ? S.trx.slice() : S.trx.filter(t => !syn.has(t.id));
      const del = force ? [] : g.synced.filter(i => !ids.has(i));
      const mj = JSON.stringify(master());
      if (!nw.length && !del.length && !force && mj === g.mh) { status('✔ Tersinkron' + (g.last ? ' · ' + new Date(g.last).toLocaleTimeString('id-ID') : ''), 'ok'); return; }
      status('⏳ Mengirim ke Google Sheets…');
      for (let i = 0; i < nw.length; i += 5) {
        const c = nw.slice(i, i + 5);
        for (const t of c) await ensureRc(t);          // pastikan nota JPG ada
        await call({ trx: c.map(pay) });
        c.forEach(t => syn.add(t.id));
      }
      const b = {};
      if (del.length) b.del = del;
      if (force || mj !== g.mh) b.master = JSON.parse(mj);
      if (b.del || b.master) await call(b);
      del.forEach(i => syn.delete(i));
      g.synced = [...syn]; g.mh = mj; g.last = Date.now(); _save();
      status('✔ Tersinkron · ' + new Date(g.last).toLocaleTimeString('id-ID'), 'ok');
    } catch (e) {
      status('⚠ Gagal sinkron: ' + (e.message === 'Failed to fetch' ? 'tidak bisa menjangkau Google' : e.message) + ' (akan dicoba lagi otomatis)', 'bad');
    } finally {
      busy = false;
      if (dirty) { dirty = false; sched(); }
    }
  }
  function sched() { clearTimeout(timer); if (G().auto && ok()) timer = setTimeout(() => sync(), 2500); }
  save = function () { _save(); sched(); };       // setiap data berubah -> jadwalkan sinkron

  async function pull() {
    const g = G();
    try {
      status('⏳ Mengambil data dari Sheet…');
      const j = await (await fetch(g.url + '?action=load&token=' + encodeURIComponent(g.token))).json();
      if (!j.ok) throw new Error(j.error);
      status('Data diterima. Konfirmasi untuk menerapkan.');
      dlg('Ambil data dari Sheet?', `<p>Stok, menu & nama toko di perangkat ini diganti dengan data Sheet. Transaksi (${j.trx.length}) yang belum ada akan ditambahkan.</p>`, () => {
        if (j.master) {
          const ph = {}; S.menu.forEach(m => ph[m.id] = m.photo);
          S.stock = j.master.stock; S.menu = j.master.menu.map(m => ({ ...m, photo: ph[m.id] || '' }));
          S.set.name = j.master.set.name || S.set.name;
        }
        const have = new Set(S.trx.map(t => t.id));
        j.trx.forEach(t => { if (!have.has(t.id)) S.trx.push(t); });
        S.trx.sort((a, b) => a.ts - b.ts);
        g.synced = [...new Set([...g.synced, ...j.trx.map(t => t.id)])]; g.mh = JSON.stringify(master());
        _save(); hdr(); rCart(); warn(); toast('Data dari Sheet diterapkan ✔'); status('✔ Data dari Sheet diterapkan', 'ok');
      }, 'Terapkan');
    } catch (e) { status('⚠ ' + e.message, 'bad'); }
  }

  // ---- UI ----
  const g0 = G();
  $g('gsu').value = g0.url; $g('gst').value = g0.token; $g('gsa').checked = g0.auto; $g('gsi').checked = g0.img;
  ['gsa', 'gsi'].forEach(id => $g(id).onchange = () => { G().auto = $g('gsa').checked; G().img = $g('gsi').checked; _save(); });
  const nice = m => m === 'Failed to fetch' ? 'tidak bisa menjangkau server Google. Cek URL (harus berakhiran /exec), internet, dan akses "Anyone"' : m;
  const say = (t, c) => { status(t, c); toast(t); };
  $g('gsb1').onclick = async function () {
    const b = this, g = G(); g.url = $g('gsu').value.trim(); g.token = $g('gst').value.trim(); _save();
    if (!ok()) return say('⚠ Isi URL Web App dan token dulu', 'bad');
    b.disabled = true; b.textContent = '⏳ Menghubungkan…'; status('⏳ Menguji koneksi…'); toast('⏳ Menguji koneksi…');
    try {
      const j = await (await fetch(g.url + '?token=' + encodeURIComponent(g.token))).json();
      if (!j.ok) throw new Error(j.error);
      say('✔ Terhubung ke Google Sheets', 'ok'); sync();
    } catch (e) { say('⚠ Gagal terhubung: ' + nice(e.message), 'bad'); }
    finally { b.disabled = false; b.textContent = 'Simpan & tes koneksi'; }
  };
  $g('gsb2').onclick = () => ok() ? (toast('⏳ Mengirim semua data…'), sync(true)) : say('⚠ Hubungkan dulu (isi URL & token)', 'bad');
  $g('gsb3').onclick = () => ok() ? (toast('⏳ Mengambil data…'), pull()) : say('⚠ Hubungkan dulu (isi URL & token)', 'bad');
  addEventListener('online', () => sync());
  setInterval(() => { if (G().auto && ok()) sync(); }, 60000);
  status(ok() ? (g0.last ? 'Terakhir sinkron: ' + new Date(g0.last).toLocaleString('id-ID') : 'Belum pernah sinkron') : 'Belum terhubung');
  if (ok()) sched();
  window.__gs = true;   // penanda: sheets.js berhasil dimuat
})();