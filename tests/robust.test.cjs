// Robustheit eigener Sounds: beim Start nur Name und Länge (dekodiert erst bei Gebrauch), Clips bleiben erhalten,
// wenn der Browser einen Sound gelöscht hat („Sound fehlt“), die Projektdatei holt ihn zurück; dauerhafter Speicher wird erbeten.
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

const ready = (page) => page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 20000 });
const PERSIST_SPY = () => {
  window.__persist = 0;
  if (navigator.storage) {
    navigator.storage.persisted = async () => false;
    navigator.storage.persist = async () => { window.__persist++; return true; };
  }
};

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    await page.addInitScript(PERSIST_SPY);
    await page.reload();
    await ready(page);
    // ---------- Eigener Sound, auf einer Spur, gespeichert ----------
    const made = await page.evaluate(async () => {
      const { own, store } = window.loopwerk;
      const sr = 44100;
      const b = new AudioBuffer({ numberOfChannels: 2, length: Math.round(1.5 * sr), sampleRate: sr });
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.4 * Math.sin(2 * Math.PI * 330 * i / sr); }
      const s = await own.create({ name: 'Test-Summen', buffer: b, source: 'Test' });
      const t = store.project.tracks[0].id;
      const clipId = store.addClip(t, s.id, 0, s.lengthBeats);
      return { id: s.id, clipId, persist: window.__persist };
    });
    check('Erster eigener Sound bittet um dauerhaften Speicher', made.persist >= 1, String(made.persist));
    await page.waitForTimeout(1200); // automatisches Speichern

    // ---------- Neu laden: Sound auf Abruf ----------
    await page.reload();
    await ready(page);
    const lazy = await page.evaluate((id) => {
      const s = window.loopwerk.library.get(id);
      return { lazy: !!s?.lazy, hasOrig: !!s?.orig, dur: s?.duration, name: s?.name, clip: window.loopwerk.store.project.tracks[0].clips.some((c) => c.sampleId === id) };
    }, made.id);
    check('Nach dem Neuladen: eigener Sound steht mit Name und Länge bereit, ohne dekodiert zu sein', lazy.lazy && !lazy.hasOrig && Math.abs(lazy.dur - 1.5) < 0.01 && lazy.name === 'Test-Summen' && lazy.clip, JSON.stringify(lazy));
    const auto = await page.waitForFunction((id) => window.loopwerk.library.get(id)?.lazy === false, made.id, { timeout: 5000 }).then(() => true).catch(() => false);
    check('Liegt der Sound im Projekt, lädt die App ihn nach dem Start von selbst (bereit zum Abspielen)', auto);
    const loaded = await page.evaluate(async (id) => {
      const { library } = window.loopwerk;
      const s = await library.ensure(id);
      const d = s.buffer.getChannelData(0);
      let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
      return { lazy: !!s.lazy, origDur: s.orig?.duration, peak };
    }, made.id);
    check('Beim ersten Gebrauch wird er dekodiert und klingt', !loaded.lazy && Math.abs(loaded.origDur - 1.5) < 0.01 && loaded.peak > 0.3, JSON.stringify(loaded));
    const file = await page.evaluate(async () => window.loopwerk.own.embed(window.loopwerk.store.project));
    check('Projektdatei bettet den Sound ein', file.length === 1 && file[0].id === made.id, String(file.length));

    // ---------- Browser löscht den Sound (wie iOS nach Wochen ohne Besuch) ----------
    await page.evaluate((id) => new Promise((res, rej) => {
      const r = indexedDB.open('loopwerk', 1);
      r.onsuccess = () => { const t = r.result.transaction('sounds', 'readwrite'); t.objectStore('sounds').delete(id); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
      r.onerror = () => rej(r.error);
    }), made.id);
    await page.reload();
    await ready(page);
    await page.waitForTimeout(300);
    const gone = await page.evaluate((id) => {
      const { store, library } = window.loopwerk;
      const s = library.get(id);
      return {
        clip: store.project.tracks[0].clips.some((c) => c.sampleId === id), missing: !!s?.missing, name: s?.name,
        hint: document.getElementById('hint-text')?.textContent || document.getElementById('hint')?.textContent || '',
        shelf: !!document.querySelector(`#library .loop-item[data-sample-id="${id}"]`),
      };
    }, made.id);
    check('Fehlender Sound: der Clip bleibt im Projekt (Platzhalter „Sound fehlt“)', gone.clip && gone.missing && gone.name === 'Sound fehlt', JSON.stringify(gone));
    check('Hinweis sagt, dass ein Sound fehlt und wie man ihn zurückholt', /fehlt/.test(gone.hint) && /Projektdatei/.test(gone.hint), gone.hint);
    check('Platzhalter erscheint nicht im Regal', !gone.shelf);
    await page.waitForTimeout(1200);
    const stillSaved = await page.evaluate((id) => JSON.parse(localStorage.getItem('loopwerk.project.v1')).tracks[0].clips.some((c) => c.sampleId === id), made.id);
    check('Auch nach dem automatischen Speichern ist der Clip noch da', stillSaved);

    // ---------- Projektdatei bringt den Klang zurück ----------
    const back = await page.evaluate(async ([list, id]) => {
      const { own, library } = window.loopwerk;
      await own.restore(list);
      const s = library.get(id);
      let peak = 0; for (const v of s.buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
      return { missing: !!s.missing, name: s.name, peak };
    }, [file, made.id]);
    check('Projektdatei ersetzt den Platzhalter durch den echten Sound', !back.missing && back.name === 'Test-Summen' && back.peak > 0.3, JSON.stringify(back));

    // ---------- WAV-Kopf ----------
    const wd = await page.evaluate(async () => {
      const { wavDuration } = await import('./src/own-sounds.js');
      const { encodeWav } = await import('./src/wav.js');
      const b = new AudioBuffer({ numberOfChannels: 1, length: 22050, sampleRate: 44100 });
      return wavDuration(await encodeWav(b).arrayBuffer());
    });
    check('Länge aus dem WAV-Kopf ohne Dekodieren', Math.abs(wd - 0.5) < 1e-6, String(wd));
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
  finish();
})();
