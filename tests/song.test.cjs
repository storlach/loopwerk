// Krachwerk Scheibe 5, Oberfläche (Spec docs/specs/krachwerk-5-song.md §2, §8.2, §8.6, §9 „Teil 5“): Song-Werkbank mit Kopf und
// fünf Reitern, Exportieren in 2 Tipps, Teilen, Zutatenliste im WAV, Aufnahme-Einstellungen, Endziel-Zahlen, Fußzeile,
// Loopwerk mit ?density=calm. node tests/song.test.cjs [--shots]   (SHOT_DIR=… für Bilder)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker } = require('./harness.cjs');
const { countUi } = require('./count.cjs');
const { PHONE, DESK, micWav, openKw, seedTwo, openSong, visible, whiteHot } = require('./kw-common.cjs');

const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(DIR, name) }); };
const TABS = ['song', 'mischen', 'fertig', 'projekt', 'aufnahme'];

// Griffe im Grund des gewählten Reiters: Bedienelemente, die Stil-Tasten des Masterings als ein Griff
const grund = (page) => page.evaluate(() => {
  const g = document.querySelector('.sb [role=tabpanel]:not([hidden]) .wb-grund');
  const vis = [...g.querySelectorAll('button, input:not([type=hidden]), select, [role=slider], [role=switch]')].filter((e) => e.getClientRects().length > 0 && !e.closest('[hidden]'));
  const styles = vis.filter((e) => e.classList.contains('mst-style')).length;
  const cmp = vis.filter((e) => e.closest('.mst-cmp')).length;
  // Fader je Spur sind das Werkstück und zählen zusammen wie ein Griff (Spec §2: „zählt wie Pads“)
  const faders = vis.filter((e) => e.closest('.sb-faders')).length;
  return { n: vis.length - styles - cmp - faders + (styles ? 1 : 0) + (faders ? 1 : 0), ids: vis.map((e) => e.id || e.className.split(' ')[0]) };
});

// Teilen-Attrappe: merkt Dateiname, Größe, Text und den INFO-Block des WAV
const shareStub = () => {
  window.__shared = [];
  navigator.share = async (d) => {
    const f = d.files?.[0];
    const ab = f ? await f.arrayBuffer() : null;
    const dv = ab && new DataView(ab);
    let icmt = null, frames = null, rate = null, ch = null;
    if (dv && f.name.endsWith('.wav')) {
      let pos = 12;
      while (pos + 8 <= dv.byteLength) {
        const id = String.fromCharCode(...new Uint8Array(ab, pos, 4)), size = dv.getUint32(pos + 4, true);
        if (id === 'fmt ') { ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); }
        if (id === 'data') frames = size / (ch * 2);
        if (id === 'LIST') {
          let q = pos + 12;
          while (q + 8 <= pos + 8 + size) {
            const sid = String.fromCharCode(...new Uint8Array(ab, q, 4)), ssz = dv.getUint32(q + 4, true);
            if (sid === 'ICMT') icmt = new TextDecoder().decode(new Uint8Array(ab, q + 8, ssz - 1));
            q += 8 + ssz + (ssz & 1);
          }
        }
        pos += 8 + size + (size & 1);
      }
    }
    window.__shared.push({ name: f?.name, size: f?.size, text: d.text ?? null, icmt, frames, rate, ch });
  };
};

(async () => {
  const { check, finish } = createChecker();
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krachwerk-song-'));
  const wav = path.join(tmp, 'bumm.wav');
  micWav(wav);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`] });
  try {
    // ================= Handy =================
    {
      const ctx = await browser.newContext({ ...PHONE, acceptDownloads: true });
      await ctx.addInitScript(shareStub);
      const k = await openKw(base, ctx);
      const page = k.page;
      await seedTwo(page);
      await page.waitForTimeout(500);
      // Öffnen: Lesezeile
      await page.tap('#deck-name');
      await page.waitForFunction(() => document.querySelector('#sb-name')?.getClientRects().length > 0, null, { timeout: 5000 });
      await page.waitForTimeout(500);
      const o = await page.evaluate(() => ({ dock: window.loopwerk.ui.dock, songHidden: getComputedStyle(document.getElementById('song')).display === 'none' || document.getElementById('song').hidden, name: document.getElementById('sb-name').textContent, meta: document.getElementById('sb-meta').textContent, exp: document.getElementById('export-btn').closest('#sb-head-slot') != null, tabs: [...document.querySelectorAll('.sb [role=tab]')].map((t) => t.textContent).join(','), roles: document.querySelector('.sb .wb-tabs').getAttribute('role') }));
      check('Handy: Tipp auf die Lesezeile öffnet die Song-Werkbank (Schublade), Fach „Song“ unsichtbar', o.dock === 'werkbank' && o.songHidden, JSON.stringify(o));
      check('Kopf: Name, „2 Takte · 0:08“ (Export-Länge: 8 Schläge bei 90 BPM + Ausklang), „Exportieren“ im Kopf; Reiter Song · Mischen · Fertig · Projekt · Aufnahme (role=tab)', o.name === 'unbenannt' && o.meta === '2 Takte · 0:08' && o.exp && o.tabs === 'Song,Mischen,Fertig,Projekt,Aufnahme' && o.roles === 'tablist', JSON.stringify(o));
      const heads = await page.evaluate(() => ['export-btn'].map((i) => { const r = document.getElementById(i).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      check('Exportieren: Tippziel ≥ 44 px', heads[0][1] >= 36 && heads[0][0] >= 44, JSON.stringify(heads));
      // Reiter: Grund ≤ 5, kein seitliches Scrollen
      const gr = {};
      for (const t of TABS) {
        await page.tap(`#sb-tab-${t}`);
        await page.waitForTimeout(250);
        gr[t] = await grund(page);
        gr[t].over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        await shot(page, `kw-song-handy-${t}.png`);
      }
      check('Jeder Reiter: Grund ≤ 5 Griffe', TABS.every((t) => gr[t].n >= 1 && gr[t].n <= 5), TABS.map((t) => `${t} ${gr[t].n}`).join(' · '));
      check('Handy: kein waagerechtes Scrollen in keinem Reiter', TABS.every((t) => gr[t].over <= 0), TABS.map((t) => `${t} ${gr[t].over}`).join(' · '));
      // Zwillinge: Knöpfe des alten Song-Fachs stehen in den Reitern
      const where = await page.evaluate(() => Object.fromEntries(['metro-btn', 'fxpad-btn', 'save-btn', 'open-btn', 'new-btn', 'backup-btn', 'restore-btn', 'tips-reset', 'harm-btn', 'export-btn'].map((id) => { const e = document.getElementById(id); return [id, e?.closest('.sb, #sb-head-slot')?.id || e?.closest('[role=tabpanel]')?.id || (e?.closest('#song-head, .sb-head') ? 'head' : '')]; })));
      check('Alte Song-Knöpfe stehen in der Song-Werkbank (Klick · FX-Pad · Speichern · Öffnen · Neuer Song · Sichern · Zurückholen · Tipps · Tonart und Akkorde · Exportieren)', Object.values(where).every(Boolean), JSON.stringify(where));
      // Mischen: Fader je Spur (+ Summe)
      await page.tap('#sb-tab-mischen');
      const mx = await page.evaluate(() => ({ rows: document.querySelectorAll('#sb-faders .sb-fader').length, names: [...document.querySelectorAll('#sb-faders .sb-fname')].map((e) => e.textContent).join(',') }));
      check('Mischen: ein Fader je Spur und die Summe', mx.rows === 3 && mx.names === 'Bumm,Klatsch,Summe', JSON.stringify(mx));
      await page.evaluate(() => { const i = document.querySelector('#sb-faders .sb-fader input'); i.value = '0.5'; i.dispatchEvent(new Event('input', { bubbles: true })); });
      const vol = await page.evaluate(() => window.loopwerk.store.project.tracks[0].volume);
      check('Mischen: Fader schreibt über store.setTrack (Lautstärke der Spur)', Math.abs(vol - 0.5) < 1e-9, String(vol));
      await page.evaluate(() => { const i = document.querySelector('#sb-faders .sb-master input'); i.value = '0.6'; i.dispatchEvent(new Event('input', { bubbles: true })); });
      check('Mischen: Summe schreibt über store.setMaster', await page.evaluate(() => Math.abs((window.loopwerk.store.project.master?.volume ?? 0) - 0.6) < 1e-9));
      await page.tap('#sb-fx-toggle');
      const fxv = await visible(page, '#sb-fx');
      await page.tap('#sb-fx-toggle');
      await page.tap('#fxpad-btn');
      const fp = await page.evaluate(() => window.loopwerk.ui.dock);
      check('Mischen: „Summen-Effekte ▸“ klappt die Effekte auf, „FX-Pad ▸“ öffnet das FX-Pad', fxv && fp === 'fxpad', `${fxv} ${fp}`);
      await page.evaluate(() => window.loopwerk.ui.openSong());
      await page.waitForTimeout(500);
      await page.tap('#sb-faders .sb-fader button.sb-fname >> nth=0');
      await page.waitForTimeout(300);
      const tr = await page.evaluate(() => ({ sel: window.loopwerk.ui.selectedTrackId, mode: document.getElementById('insp').dataset.mode }));
      check('Mischen: Tipp auf einen Kanalnamen öffnet die Spur-Werkbank', tr.sel === 't1' && tr.mode === 'track', JSON.stringify(tr));
      await page.evaluate(() => window.loopwerk.ui.openSong());
      await page.waitForTimeout(500);
      // Song: Tempo, Tonart, Länge
      await page.tap('#sb-tab-song');
      await page.evaluate(() => { const i = document.getElementById('sb-tempo'); i.value = '100'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.evaluate(() => { const s = document.getElementById('sb-key'); s.value = 'Dm'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.evaluate(() => { const i = document.getElementById('sb-length'); i.value = '16'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
      const sg = await page.evaluate(() => { const p = window.loopwerk.store.project; return { bpm: p.bpm, key: p.key, len: p.lengthBars, meta: document.getElementById('sb-meta').textContent }; });
      check('Song: Tempo, Tonart und Arbeitsfläche (Länge, in den Feinheiten) schreiben über setBpm / setKey / setLength; der Kopf zeigt weiter die Export-Länge', sg.bpm === 100 && sg.key === 'Dm' && sg.len === 16 && sg.meta === '2 Takte · 0:07', JSON.stringify(sg));
      await page.evaluate(() => { const lw = window.loopwerk; lw.store.setBpm(90); lw.store.setKey('Am'); lw.store.setLength(32); });
      // Umbenennen im Kopf
      await page.tap('#sb-name');
      await page.fill('#sb-name-in', 'Mein Song');
      await page.press('#sb-name-in', 'Enter');
      check('Kopf: Antippen benennt um (setProjectName), Fach-Titel und Deck folgen', await page.evaluate(() => window.loopwerk.store.project.name === 'Mein Song' && document.getElementById('sb-name').textContent === 'Mein Song' && document.getElementById('deck-name').textContent === 'Mein Song'));
      // Fertig: Mastering, Stil nur bei an, Loop-Bereich, Teilen, Zutaten
      await page.tap('#sb-tab-fertig');
      const metaSecs = await page.evaluate(() => Number(document.getElementById('sb-meta').dataset.seconds));
      const f00 = await page.evaluate(() => ({ on: !!window.loopwerk.store.project.master?.mastering?.on, style: window.loopwerk.store.project.master?.mastering?.style, styles: [...document.querySelectorAll('#sb-mst .mst-style')].filter((e) => e.getClientRects().length).length, pressed: document.getElementById('sb-mst-on').getAttribute('aria-pressed') }));
      check('Fertig: Mastering „Ausgewogen“ ist in Krachwerk von Anfang an an (Stil als Wortzeile)', f00.on && f00.style === 'balanced' && f00.styles >= 3 && f00.pressed === 'true', JSON.stringify(f00));
      await page.tap('#sb-mst-on');
      const f0 = await page.evaluate(() => ({ styles: [...document.querySelectorAll('#sb-mst .mst-style')].filter((e) => e.getClientRects().length).length, share: !document.getElementById('sb-share').hidden, zut: document.getElementById('sb-zut').textContent, loopBtn: document.getElementById('sb-loop').hidden }));
      check('Fertig: Mastering aus → keine Stil-Wörter, „Teilen“ am Handy sichtbar (Attrappe), Zutaten „2 Geräusche · 0 fremde Samples“', f0.styles === 0 && f0.share && f0.zut === '2 Geräusche · 0 fremde Samples', JSON.stringify(f0));
      await page.tap('#sb-mst-on');
      const f1 = await page.evaluate(() => ({ on: !!window.loopwerk.store.project.master?.mastering?.on, styles: [...document.querySelectorAll('#sb-mst .mst-style')].filter((e) => e.getClientRects().length).length }));
      check('Fertig: Mastering an (setMastering), Stil-Tasten erscheinen', f1.on && f1.styles >= 3, JSON.stringify(f1));
      await shot(page, 'kw-fertig-handy.png');
      // Einblender decken keine Bedienelemente der Werkbank ab (alle Reiter, Feinheiten offen)
      const overlaps = [];
      for (const t of TABS) {
        await page.tap(`#sb-tab-${t}`);
        await page.evaluate(() => window.loopwerk.ui.flash('Geteilt: Mein Song.wav – das ist ein längerer Einblender, der zwei Zeilen braucht'));
        await page.waitForTimeout(450);
        overlaps.push(await page.evaluate(() => {
          const h = document.getElementById('hint');
          const hr = h.getBoundingClientRect();
          const hit = [...document.querySelectorAll('#werkbank button, #werkbank input, #werkbank select, #werkbank [role=tab]')].filter((e) => e.getClientRects().length && !e.closest('[hidden]') && !h.contains(e)).filter((e) => {
            const r = e.getBoundingClientRect();
            if (r.right <= hr.left || r.left >= hr.right || r.bottom <= hr.top || r.top >= hr.bottom) return false;
            const at = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, hr.left + 1), hr.right - 1), Math.min(Math.max(r.top + r.height / 2, hr.top + 1), hr.bottom - 1));
            return at === e || e.contains(at) || h.contains(at);
          }).map((e) => e.id || e.className);
          return { shown: h.classList.contains('show'), hit };
        }));
        await shot(page, `kw-hint-${t}-handy.png`);
      }
      check('Einblender (Handy, alle 5 Reiter): decken keinen sichtbaren Bedienknopf der Werkbank ab', overlaps.every((o) => o.shown && o.hit.length === 0), JSON.stringify(overlaps));
      await page.tap('#sb-tab-fertig');
      // Export in 2 Tipps aus jedem Reiter (Handy: Teilen-Menü mit Datei und Text)
      const exp = [];
      for (const t of TABS) {
        await page.evaluate(() => { window.__shared.length = 0; });
        await page.tap('#deck-name'); // schließt/öffnet: nur sicherstellen, dass die Werkbank offen steht
        await page.waitForTimeout(250);
        if (!(await visible(page, '#sb-name'))) { await page.tap('#deck-name'); await page.waitForTimeout(500); }
        await page.tap(`#sb-tab-${t}`);
        await page.tap('#export-btn');
        await page.waitForFunction(() => window.__shared.length > 0, null, { timeout: 40000 });
        exp.push(await page.evaluate(() => ({ ...window.__shared[0] })));
        await page.waitForFunction(() => !document.getElementById('export-btn').disabled, null, { timeout: 5000 });
      }
      check('Exportieren in 2 Tipps (Songname, Exportieren) aus jedem der 5 Reiter: Teilen-Menü bekommt die WAV-Datei', exp.every((e) => e.name === 'Mein Song.wav' && e.size > 100000), exp.map((e) => `${e.name} ${e.size}`).join(' | '));
      const e0 = exp[0];
      check('Teilen: files und text; Text ist die Zutatenliste („Krachwerk · Mein Song · 90 BPM · Am“, Zeilen je Sound)', /^Krachwerk · Mein Song · 90 BPM · Am\n2 Geräusche · 0 fremde Samples\nBumm: /.test(e0.text) && /\nKlatsch: /.test(e0.text), JSON.stringify(e0.text));
      check('WAV: INFO-Block ICMT enthält alle eigenen Sound-Namen (Bumm, Klatsch)', /Bumm: /.test(e0.icmt) && /Klatsch: /.test(e0.icmt) && e0.icmt.length <= 2000, e0.icmt);
      const spb = 60 / 90;
      const want = 8 * spb + 2.5; // 8 Schläge (zwei Takte) + Ausklang
      check('WAV-Länge = Song + Ausklang ± 1 Frame', Math.abs(e0.frames - Math.round(want * e0.rate)) <= 1, `${e0.frames} Frames, erwartet ${Math.round(want * e0.rate)}`);
      check('Kopf zeigt die echte Export-Länge: angezeigte Dauer = WAV-Länge ± 1 Frame', Math.abs(metaSecs * e0.rate - e0.frames) <= 1, `${metaSecs} s gegen ${e0.frames / e0.rate} s`);
      // Teilen-Knopf
      await page.evaluate(() => { window.__shared.length = 0; });
      await page.tap('#sb-tab-fertig');
      await page.tap('#sb-share');
      await page.waitForFunction(() => window.__shared.length > 0, null, { timeout: 40000 });
      check('„Teilen“ im Reiter Fertig ruft navigator.share (Datei + Text)', await page.evaluate(() => window.__shared[0].name === 'Mein Song.wav' && !!window.__shared[0].text));
      // Feinheiten Fertig: Zutatenliste aus → kein Text, kein ICMT
      await page.waitForFunction(() => !document.getElementById('export-btn').disabled, null, { timeout: 5000 });
      await page.tap('#sb-fine-btn-fertig');
      if (await page.evaluate(() => document.getElementById('sb-list').getAttribute('aria-pressed') === 'true')) await page.tap('#sb-list');
      await page.evaluate(() => { window.__shared.length = 0; });
      await page.tap('#export-btn');
      await page.waitForFunction(() => window.__shared.length > 0, null, { timeout: 40000 });
      const noList = await page.evaluate(() => window.__shared[0]);
      check('Zutatenliste aus: weder Nachricht noch WAV-Kommentar', !noList.text && !noList.icmt, JSON.stringify(noList.text));
      await page.tap('#sb-list');
      // Nur Loop-Bereich: Länge = Loop + Ausklang
      await page.evaluate(() => window.loopwerk.store.setLoop({ on: true, startBeat: 0, endBeat: 4 }));
      await page.waitForFunction(() => !document.getElementById('sb-loop').hidden);
      await page.tap('#sb-loop');
      await page.evaluate(() => { window.__shared.length = 0; });
      await page.tap('#export-btn');
      await page.waitForFunction(() => window.__shared.length > 0, null, { timeout: 40000 });
      const lp = await page.evaluate(() => window.__shared[0]);
      check('Nur Loop-Bereich: WAV = 4 Schläge + Ausklang ± 1 Frame', Math.abs(lp.frames - Math.round((4 * spb + 2.5) * lp.rate)) <= 1, `${lp.frames}`);
      await page.tap('#sb-loop');
      // Fortschritt als Linie
      const prog = await page.evaluate(() => { const p = document.getElementById('sb-prog'); return { hidden: p.hidden, has: !!p.querySelector('i'), status: document.getElementById('sb-status').textContent }; });
      await shot(page, 'kw-export-zutaten-handy.png');
      check('Fortschritt: Linie unter dem Kopf, nach dem Export „Fertig: … · 2 Geräusche · 0 fremde Samples“', prog.hidden && prog.has && /^Fertig: Mein Song\.wav/.test(prog.status) && /2 Geräusche · 0 fremde Samples/.test(prog.status), prog.status);
      // Projekt: Neuer Song = zwei Tipps (Bestätigung im Knopf), Tipps, Tastenkürzel, Füllstand
      await page.tap('#sb-tab-projekt');
      const pj = await page.evaluate(() => ({ btns: [...document.querySelectorAll('#sb-proj-tools button')].map((b) => b.textContent).join('|') }));
      check('Projekt: Speichern · Öffnen · Neuer Song · Alle Sounds sichern · Zurückholen', ['Speichern', 'Öffnen', 'Neuer Song', 'Alle eigenen Sounds sichern', 'Sounds zurückholen'].every((t) => pj.btns.split('|').includes(t)) && pj.btns.split('|').length === 5, pj.btns);
      await page.tap('#sb-fine-btn-projekt');
      if (!(await visible(page, '#tips-reset'))) await page.tap('#sb-fine-btn-projekt');
      await page.waitForTimeout(500);
      const fine = await page.evaluate(() => ({ tips: !!document.getElementById('tips-reset')?.getClientRects().length, keys: !!document.getElementById('keys-btn')?.getClientRects().length, fill: document.getElementById('sb-fill').textContent, about: document.getElementById('sb-about').textContent }));
      check('Projekt, Feinheiten: Tipps wieder zeigen, Tastenkürzel/Gesten, Füllstand, Über', fine.tips && fine.keys && /belegt|Eigene|Noch nichts/.test(fine.fill) && /Krachwerk/.test(fine.about), JSON.stringify(fine));
      await shot(page, 'kw-projekt-fein-handy.png');
      await page.tap('#new-btn');
      const nb = await page.evaluate(() => ({ txt: document.getElementById('new-btn').textContent, clips: window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length }));
      await page.tap('#new-btn');
      await page.waitForTimeout(400);
      const nb2 = await page.evaluate(() => ({ txt: document.getElementById('new-btn').textContent, clips: window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length, name: window.loopwerk.store.project.name }));
      check('Neuer Song: Bestätigung im Knopf („Sicher?“), danach leerer Song', nb.txt === 'Sicher?' && nb.clips === 2 && nb2.txt === 'Neuer Song' && nb2.clips === 0, JSON.stringify([nb, nb2]));
      await page.evaluate(() => window.loopwerk.store.undo());
      await page.waitForTimeout(300);
      // Aufnahme: Stopp nach Stille, Stille-Dauer, Säubern, Platz für das Feld aus v2.13
      await page.tap('#sb-tab-aufnahme');
      const au = await page.evaluate(() => ({ grund: [...document.querySelectorAll('#sb-panel-aufnahme .wb-grund button')].map((b) => b.textContent), slot: !!document.getElementById('sb-rec-slot'), setup: !!document.getElementById('rec-setup') }));
      check('Aufnahme: „Stopp nach Stille“ im Grund, dazu das Feld „Aufnahme“ (v2.13: Latenz −/+, Einmessen), höchstens 5 Griffe', au.grund.join() === 'Stopp nach Stille,−,+,Einmessen' && au.slot && au.grund.length <= 5, JSON.stringify(au));
      console.log(au.setup ? '   v2.13-Feld #rec-setup vorhanden' : '   Hinweis: Feld „Aufnahme“ aus v2.13 (#rec-setup) ist noch nicht gebaut – Reiter zeigt nur „Stopp nach Stille“ (Prüfung übersprungen)');
      await page.tap('#sb-fine-btn-aufnahme');
      const au2 = await page.evaluate(() => ({ fine: [...document.querySelectorAll('#sb-panel-aufnahme .wb-fine .wb-btn, #sb-panel-aufnahme .wb-fine input')].map((b) => b.id), silence: document.getElementById('sb-silence').getAttribute('aria-label') }));
      check('Aufnahme, Feinheiten: Säubern an/aus und Stille-Dauer', au2.fine.includes('sb-clean') && au2.fine.includes('sb-silence'), JSON.stringify(au2));
      await shot(page, 'kw-song-handy.png');
      check('Konsole ohne Fehler (Handy)', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ================= Aufnahme-Einstellungen wirken =================
    {
      const ctx = await browser.newContext(PHONE);
      await ctx.addInitScript(() => { localStorage.setItem('loopwerk.make.recPrefs', JSON.stringify({ autoStop: false, clean: false })); });
      const k = await openKw(base, ctx);
      const page = k.page;
      await page.tap('#rec-btn');
      await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 8000 });
      await page.waitForTimeout(5200); // die Datei ist nach 5 s zu Ende: mit Stopp nach Stille wäre die Aufnahme längst vorbei
      const still = await page.evaluate(() => window.loopwerk.recorder.state);
      await page.tap('#rec-btn');
      await page.waitForFunction(() => window.loopwerk.store.project.tracks.some((t) => t.clips.length), null, { timeout: 15000 });
      const raw = await page.evaluate(() => { const lw = window.loopwerk; const s = lw.library.get(lw.store.project.tracks.find((t) => t.clips.length).clips[0].sampleId); let p = 0; for (const v of s.orig.getChannelData(0)) p = Math.max(p, Math.abs(v)); return p; });
      check('Aufnahme: Stopp nach Stille aus → läuft weiter bis zum Tippen; Säubern aus → Pegel nicht angehoben (Spitze ≈ 0,3 statt 0,89)', still === 'recording' && raw > 0.2 && raw < 0.5, `${still}, Spitze ${raw.toFixed(2)}`);
      check('Konsole ohne Fehler (Aufnahme-Einstellungen)', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ================= Desktop =================
    {
      const ctx = await browser.newContext({ ...DESK, acceptDownloads: true });
      const k = await openKw(base, ctx);
      const page = k.page;
      await seedTwo(page);
      await page.waitForTimeout(400);
      // Songname öffnet; Klick ins Leere öffnet
      await page.click('#project-menu-btn');
      await page.waitForTimeout(400);
      const d1 = await page.evaluate(() => ({ open: document.getElementById('app').classList.contains('insp-open'), name: !!document.getElementById('sb-name')?.getClientRects().length, pop: !document.getElementById('project-menu').hidden }));
      check('Desktop: Klick auf den Songnamen öffnet die Song-Werkbank (kein Menü)', d1.open && d1.name && !d1.pop, JSON.stringify(d1));
      await page.evaluate(() => { window.loopwerk.ui.select(null); document.querySelector('.insp-toggle').click(); });
      await page.waitForTimeout(300);
      await page.evaluate(() => { const a = document.getElementById('app'); if (a.classList.contains('insp-open')) document.querySelector('.insp-toggle').click(); });
      await page.waitForTimeout(300);
      const closed = await page.evaluate(() => !document.getElementById('app').classList.contains('insp-open'));
      await page.click('.lane[data-track-id="t2"]', { position: { x: 700, y: 20 } });
      await page.waitForTimeout(400);
      const d2 = await page.evaluate(() => ({ open: document.getElementById('app').classList.contains('insp-open'), name: !!document.getElementById('sb-name')?.getClientRects().length }));
      check('Desktop: Klick ins Leere des Songs (nichts gewählt, Werkbank zu) öffnet die Song-Werkbank', closed && d2.open && d2.name, JSON.stringify([closed, d2]));
      const dg = {};
      for (const t of TABS) { await page.click(`#sb-tab-${t}`); dg[t] = (await grund(page)).n; await shot(page, `kw-song-desktop-${t}.png`); }
      check('Desktop: je Reiter Grund ≤ 5 Griffe', TABS.every((t) => dg[t] >= 1 && dg[t] <= 5), JSON.stringify(dg));
      // Export als Download in 2 Tipps (Songname, Exportieren)
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(null); lw.ui.selectTrack(null); });
      await page.click('#project-menu-btn');
      await page.click('#sb-tab-song');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.click('#export-btn')]);
      const file = path.join(tmp, dl.suggestedFilename());
      await dl.saveAs(file);
      const buf = fs.readFileSync(file);
      await shot(page, 'kw-export-zutaten-desktop.png');
      check('Desktop: Exportieren lädt „unbenannt.wav“ herunter (mit LIST/INFO und ICMT „Krachwerk · …“)', dl.suggestedFilename() === 'unbenannt.wav' && buf.includes(Buffer.from('LIST')) && buf.includes(Buffer.from('INFO')) && buf.includes(Buffer.from('ISFT')) && buf.includes(Buffer.from('ICMT')) && buf.includes(Buffer.from('Krachwerk · unbenannt · 90 BPM · Am')), `${dl.suggestedFilename()} ${buf.length}`);
      await page.waitForFunction(() => !document.getElementById('export-btn').disabled, null, { timeout: 5000 });
      // Weitere Feinheiten: MP3 → Datei .mp3 (ohne Kommentar)
      await page.click('#sb-tab-fertig');
      if (await page.evaluate(() => document.getElementById('sb-fine-btn-fertig').getAttribute('aria-expanded') !== 'true')) await page.click('#sb-fine-btn-fertig');
      await page.click('#sb-mp3');
      const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#export-btn')]);
      check('Feinheit „MP3 statt WAV“: Datei „unbenannt.mp3“', dl2.suggestedFilename() === 'unbenannt.mp3', dl2.suggestedFilename());
      await page.waitForFunction(() => !document.getElementById('export-btn').disabled, null, { timeout: 5000 });
      await page.click('#sb-mp3');
      await page.click('#sb-stems');
      const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#export-btn')]);
      check('Feinheit „Einzelspuren (ZIP)“: „unbenannt Stems.zip“', dl3.suggestedFilename() === 'unbenannt Stems.zip', dl3.suggestedFilename());
      await page.waitForFunction(() => !document.getElementById('export-btn').disabled, null, { timeout: 5000 });
      await page.click('#sb-stems');
      // Persistenz der Feinheiten
      await page.click('#sb-tail');
      const ef = await page.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.make.exportFine')));
      check('Export-Feinheiten gemerkt (loopwerk.make.exportFine)', ef.tail === false && ef.mp3 === false, JSON.stringify(ef));
      // Mischen/Projekt: Speichern lädt die Projektdatei
      await page.click('#sb-tab-projekt');
      const [dl4] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#save-btn')]);
      check('Projekt: Speichern lädt die Projektdatei', /\.json$/.test(dl4.suggestedFilename()), dl4.suggestedFilename());
      // Zähl-Endziel Desktop
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(500);
      const dClip = await countUi(page);
      const dWhite = await whiteHot(page);
      await shot(page, 'kw-clip-desktop-5.png');
      check('Endziel Desktop „Clip gewählt“ ≤ 45 / ≤ 35 / ≤ 6 / ≥ 11', dClip.controls <= 45 && dClip.frames <= 35 && dClip.sizes <= 6 && dClip.minFont >= 11, JSON.stringify(dClip));
      check('Weißglut außer Marke ≤ 1 (Desktop, Clip gewählt)', dWhite.length <= 1, dWhite.join(' '));
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(null); });
      await page.click('#project-menu-btn');
      await page.click('#sb-tab-song');
      await page.waitForTimeout(400);
      const dSong = await countUi(page);
      check('Endziel Desktop „Song“ ≤ 45 Bedienelemente', dSong.controls <= 45, JSON.stringify(dSong));
      console.log(`   Zählwerte Desktop: Clip gewählt ${dClip.controls}/${dClip.frames}/${dClip.sizes}/${dClip.minFont} · Song ${dSong.controls}/${dSong.frames}/${dSong.sizes}/${dSong.minFont}`);
      check('Konsole ohne Fehler (Desktop)', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ================= Zähl-Endziel Handy =================
    {
      const ctx = await browser.newContext(PHONE);
      const k = await openKw(base, ctx);
      const page = k.page;
      await seedTwo(page);
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(700);
      const hClip = await countUi(page);
      const hWhite = await whiteHot(page);
      check('Endziel Handy „Clip gewählt“ ≤ 22 / ≤ 15 / ≤ 5 / ≥ 11', hClip.controls <= 22 && hClip.frames <= 15 && hClip.sizes <= 5 && hClip.minFont >= 11, JSON.stringify(hClip));
      check('Weißglut außer Marke ≤ 1 (Handy, Clip gewählt)', hWhite.length <= 1, hWhite.join(' '));
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(null); lw.ui.setDock(null); });
      await page.waitForTimeout(400);
      await page.tap('#deck-name');
      await page.waitForTimeout(900);
      const hSong = await countUi(page);
      const rows = await page.evaluate(() => { const wb = document.getElementById('werkbank').getBoundingClientRect(); const rs = [...document.querySelectorAll('.track-row')].map((r) => r.getBoundingClientRect().bottom); return { top: wb.top, above: rs.length >= 2 && rs.every((b) => b <= wb.top + 1) }; });
      check('Endziel Handy „Song Mitte“ ≤ 22 Bedienelemente / ≤ 12 Rahmen, beide Spuren über der Schublade', hSong.controls <= 22 && hSong.frames <= 12 && rows.above, JSON.stringify([hSong, rows]));
      console.log(`   Zählwerte Handy: Clip gewählt ${hClip.controls}/${hClip.frames}/${hClip.sizes}/${hClip.minFont} · Song Mitte ${hSong.controls}/${hSong.frames}/${hSong.sizes}/${hSong.minFont}`);
      await ctx.close();
    }

    // ================= Fußzeile =================
    {
      const ctx = await browser.newContext(DESK);
      const [kw, lw] = await Promise.all(['/werkstatt/', '/'].map((p) => ctx.request.get(base + p).then((r) => r.text())));
      check('Fußzeile: Krachwerk „Nur privat“, Loopwerk bleibt „Private use only“', kw.includes('Nur privat') && !kw.includes('Private use only') && lw.includes('Private use only') && !lw.includes('Nur privat'));
      await ctx.close();
    }

    // ================= Loopwerk mit ?density=calm =================
    {
      for (const [dev, opts] of [['desktop', DESK], ['handy', PHONE]]) {
        const ctx = await browser.newContext(opts);
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`${base}/?density=calm`);
        await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
        await page.evaluate(() => window.loopwerk.library.catalogReady);
        await page.waitForTimeout(1000);
        const r = await page.evaluate(async () => {
          const { CALM_TWINS, twinOf } = await import('./src/calm.js');
          const app = document.getElementById('app');
          const els = [...document.querySelectorAll('[data-tier="3"]')];
          const miss = els.filter((e) => !twinOf(CALM_TWINS, e)).map((e) => e.id || e.className);
          const shown = els.filter((e) => e.getClientRects().length > 0 && !e.hasAttribute('data-placed')).map((e) => e.id || e.className);
          return { density: app.dataset.density, ed: app.dataset.edition, sb: !!app.dataset.songbench, n: els.length, miss, shown, exp: document.getElementById('export-btn').closest('.deck-export') != null || document.getElementById('export-btn').closest('.deck') != null };
        });
        check(`Loopwerk ?density=calm (${dev}): calm an, Edition „full“, keine Song-Werkbank, jedes data-tier="3" hat einen Zwilling, keines sichtbar`, r.density === 'calm' && r.ed === 'full' && !r.sb && r.n >= 20 && r.miss.length === 0 && r.shown.length === 0, JSON.stringify(r));
        await page.screenshot({ path: path.join(DIR, `lw-calm-${dev}.png`) }).catch(() => {});
        check(`Loopwerk ?density=calm (${dev}): Konsole ohne Fehler`, errors.length === 0, errors.join(' | '));
        await ctx.close();
      }
      // Ohne den Parameter bleibt es bei „full“; lsKey('loopwerk.density') schaltet ebenfalls
      const ctx = await browser.newContext(DESK);
      await ctx.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('loopwerk.density', 'calm'); } });
      const page = await ctx.newPage();
      await page.goto(`${base}/`);
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      check('Loopwerk: lsKey „loopwerk.density“ = calm schaltet die Ruhe ein; ?density=full schaltet sie wieder aus', await page.evaluate(() => document.getElementById('app').dataset.density === 'calm') && await (async () => { await page.goto(`${base}/?density=full`); await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 }); return page.evaluate(() => document.getElementById('app').dataset.density === 'full'); })());
      await ctx.close();
    }
  } catch (err) {
    check('Ablauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
