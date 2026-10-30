// Version 2.1: Mehrfachauswahl, Clip-Laufzeit, Spurgruppen, reaktive Grafik, Wunsch-Agent.
// node tests/v21.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  let app = await openApp({ viewport: { width: 1536, height: 960 } });
  let { page } = app;
  const S = () => page.evaluate(() => window.loopwerk.store.project);
  const box = (sel) => page.locator(sel).boundingBox();
  try {
    // ---------- Mehrfachauswahl ----------
    // Rahmen über die Spuren Drums..Bass in Takt 5–8 ziehen (leere Stelle als Start)
    const lane1 = await box('.lane[data-track-id="t1"]');
    const lane3 = await box('.lane[data-track-id="t3"]');
    const ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.mouse.move(lane1.x + 2 * ppb, lane1.y + 6);
    await page.mouse.down();
    await page.mouse.move(lane3.x + 20 * ppb, lane3.y + lane3.height - 6, { steps: 8 });
    await page.mouse.up();
    let sel = await page.evaluate(() => window.loopwerk.ui.selectedIds().sort());
    check('Rahmen aufziehen wählt alle berührten Clips (Drums, Bass)', JSON.stringify(sel) === '["c1","c3"]', JSON.stringify(sel));
    check('Alle ausgewählten Clips sind markiert', await page.evaluate(() => document.querySelectorAll('.clip.selected').length) === 2);
    // Umschalt-Klick nimmt einen heraus und fügt einen hinzu
    const pad = await box('.clip[data-clip-id="c4"]');
    await page.keyboard.down('Shift');
    await page.mouse.click(pad.x + 40, pad.y + pad.height - 8);
    const bass = await box('.clip[data-clip-id="c3"]');
    await page.mouse.click(bass.x + 40, bass.y + bass.height - 8);
    await page.keyboard.up('Shift');
    sel = await page.evaluate(() => window.loopwerk.ui.selectedIds().sort());
    check('Umschalt-Klick: hinzufügen (Pad) und herausnehmen (Bass)', JSON.stringify(sel) === '["c1","c4"]', JSON.stringify(sel));
    // Zusammen verschieben: einen Takt nach rechts
    const before = await page.evaluate(() => Object.fromEntries(window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => [c.id, [t.id, c.startBeat]]))));
    const drums = await box('.clip[data-clip-id="c1"]');
    await page.mouse.move(drums.x + 40, drums.y + drums.height - 8);
    await page.mouse.down();
    await page.mouse.move(drums.x + 40 + 4 * ppb, drums.y + drums.height - 8, { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => Object.fromEntries(window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => [c.id, [t.id, c.startBeat]]))));
    check('Ausgewählte Clips gemeinsam verschieben (Abstände bleiben)', ['c1', 'c4'].every((id) => after[id][1] === before[id][1] + 4 && after[id][0] === before[id][0]) && after.c3[1] === before.c3[1], JSON.stringify({ before, after }));
    await page.keyboard.press('Control+z');
    const undone = await page.evaluate(() => Object.fromEntries(window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => [c.id, [t.id, c.startBeat]]))));
    check('Ein Rückgängig-Schritt holt alle zurück', JSON.stringify(undone) === JSON.stringify(before));
    // Löschen und Duplizieren für die ganze Auswahl
    await page.evaluate(() => window.loopwerk.ui.selectMany(['c7', 'c8']));
    await page.keyboard.press('Control+d');
    const fx = await page.evaluate(() => window.loopwerk.store.track('t7').clips.map((c) => [c.sampleId, c.startBeat]));
    check('Strg+D dupliziert die Auswahl als Block dahinter', JSON.stringify(fx) === '[["fx-riser",8],["fx-crash",16],["fx-riser",20],["fx-crash",28]]' || fx.length === 4, JSON.stringify(fx));
    await page.keyboard.press('Delete');
    check('Entf löscht alle ausgewählten Clips', await page.evaluate(() => window.loopwerk.store.track('t7').clips.length) === 2);
    await page.keyboard.press('Control+a');
    check('Strg+A wählt alle Clips', await page.evaluate(() => window.loopwerk.ui.selectedIds().length === window.loopwerk.store.project.tracks.reduce((n, t) => n + t.clips.length, 0)));
    await page.keyboard.press('Escape');
    check('Esc hebt die Auswahl auf', await page.evaluate(() => window.loopwerk.ui.selectedIds().length === 0));
    // Klick ohne Ziehen auf freie Fläche bleibt ein Klick (hebt Auswahl auf, kein Rahmen)
    await page.evaluate(() => window.loopwerk.ui.selectMany(['c1', 'c3']));
    await page.mouse.click(lane1.x + 1.5 * ppb, lane1.y + lane1.height / 2);
    check('Klick ins Leere hebt die Mehrfachauswahl auf', await page.evaluate(() => window.loopwerk.ui.selectedIds().length === 0));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v21-auswahl.png') });

    // ---------- Laufzeit: doppelt so lang, gleiche Tonhöhe ----------
    const run = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const m = await import('./src/model.js');
      const sr = 44100;
      // 1 s Ton 440 Hz (2 Schläge bei 120 BPM), dann 1 s Stille: ein One-Shot
      const b = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < sr; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr); }
      library.register({ id: 'run-tone', name: 'Ton', category: 'fx', kind: 'oneshot', lengthBeats: 4, bpm: 120, buffer: b });
      const s = new m.Store(m.createEmptyProject(), { sampleBeats: (id) => library.get(id).lengthBeats });
      s.project.lengthBars = 4;
      const id = s.addClip('t1', 'run-tone', 0, 4);
      s.setClipStretch(id, 2);
      const clip = s.findClip(id).clip;
      await library.ensureProject(s.project);
      const d = (await renderProject(s.project, library, { limiter: false, toBeat: 16 })).getChannelData(0);
      // hörbare Dauer und Frequenz (Nulldurchgänge in der Mitte des Tons)
      let last = 0;
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.05) last = i;
      let zc = 0;
      const a = Math.round(0.5 * sr);
      const z = Math.round(1.0 * sr);
      for (let i = a + 1; i < z; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) zc++;
      return { len: clip.lengthBeats, stretch: clip.stretch, seconds: Math.round((last / sr) * 100) / 100, hz: Math.round(zc / 2 / ((z - a) / sr)) };
    });
    check('Laufzeit ×2: Clip doppelt so lang', run.len === 8 && run.stretch === 2, JSON.stringify(run));
    check('Laufzeit ×2: der Ton klingt doppelt so lang (≈2 s)', run.seconds > 1.85 && run.seconds < 2.15, JSON.stringify(run));
    check('Laufzeit ×2: Tonhöhe bleibt (440 Hz)', Math.abs(run.hz - 440) <= 4, JSON.stringify(run));
    // Bedienung im Inspektor
    await page.evaluate(() => window.loopwerk.ui.select('c4'));
    const len0 = await page.evaluate(() => window.loopwerk.store.findClip('c4').clip.lengthBeats);
    await page.click('#insp-run-up');
    await page.click('[data-run="2"]');
    const st = await page.evaluate(() => { const c = window.loopwerk.store.findClip('c4').clip; return { s: c.stretch, len: c.lengthBeats, out: document.getElementById('insp-run-out').textContent }; });
    check('Inspektor: Laufzeit ×2 macht den Clip doppelt so lang, Anzeige stimmt', st.s === 2 && Math.abs(st.len - Math.min(len0 * 2, 128)) < 1e-6 && /×2/.test(st.out), JSON.stringify({ len0, st }));
    await page.waitForFunction(() => !!window.loopwerk.library.stretched('chords-pad', 2), null, { timeout: 20000 });
    check('Gedehnte Fassung wird im Hintergrund gerechnet', true);
    check('Clip zeigt die Laufzeit im Etikett', /×2/.test(await page.locator('.clip[data-clip-id="c4"] .clip-label').textContent()));
    await page.click('[data-run="1"]');
    check('Laufzeit ×1 stellt die Originallänge wieder her', await page.evaluate(() => window.loopwerk.store.findClip('c4').clip.lengthBeats) === len0);
    // ---------- Spurgruppen ----------
    await page.keyboard.press('Escape');
    await page.click('.track-row:has(.lane[data-track-id="t1"]) .tbtn-menu');
    const items = await page.locator('.track-menu-item').allTextContents();
    check('Spurmenü bietet „Gruppe bilden“', items.some((x) => /^Gruppe bilden/.test(x)), items.join(' | '));
    await page.locator('.track-menu-item', { hasText: 'Gruppe bilden' }).click();
    let gs = await page.evaluate(() => ({ groups: window.loopwerk.store.project.groups, t1: window.loopwerk.store.track('t1').groupId }));
    check('Gruppe angelegt, Spur ist Mitglied', gs.groups?.length === 1 && gs.t1 === gs.groups[0].id, JSON.stringify(gs));
    const gid = gs.groups[0].id;
    // zweite Spur über das Menü dazu
    await page.click('.track-row:has(.lane[data-track-id="t2"]) .tbtn-menu');
    await page.locator('.track-menu-item', { hasText: 'hinzufügen' }).first().click();
    check('Zweite Spur in die Gruppe aufgenommen', await page.evaluate((g) => window.loopwerk.store.project.tracks.filter((t) => t.groupId === g).length, gid) === 2);
    check('Gruppenkopf steht über den Mitgliedern', await page.evaluate(() => {
      const kids = [...document.querySelector('.rows').children];
      const gi = kids.findIndex((n) => n.classList.contains('group-row'));
      return gi >= 0 && kids[gi + 1].querySelector('.lane')?.dataset.trackId === 't1' && kids[gi + 2].querySelector('.lane')?.dataset.trackId === 't2';
    }));
    // einklappen: Mitglieder verschwinden, Übersicht erscheint
    const h0 = await page.evaluate(() => document.querySelector('.rows').offsetHeight);
    await page.click('.group-toggle');
    await page.waitForTimeout(80);
    const col = await page.evaluate(() => ({
      hidden: [...document.querySelectorAll('.track-row.in-group')].every((r) => r.hidden),
      h: document.querySelector('.rows').offsetHeight,
      sum: (() => { const c = document.querySelector('.group-sum'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })(),
      exp: document.querySelector('.group-toggle').getAttribute('aria-expanded'),
    }));
    check('Eingeklappt: Mitglieder verborgen, Spuren rücken nach oben', col.hidden && col.h < h0 - 60, JSON.stringify({ h0, ...col }));
    check('Eingeklappt: Übersicht zeigt die Clips der Gruppe', col.sum > 50 && col.exp === 'false', JSON.stringify(col));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v21-gruppe.png') });
    // Gruppe stumm: Mitglieder schweigen im Render, andere Spuren nicht
    await page.click('.group-row .tbtn-mute');
    const silent = await page.evaluate(async (g) => {
      const { store, library, renderProject } = window.loopwerk;
      const p = JSON.parse(JSON.stringify(store.project));
      const only = (keep) => { const q = JSON.parse(JSON.stringify(p)); q.tracks = q.tracks.filter(keep); return q; };
      const rms = async (q) => { const d = (await renderProject(q, library, { limiter: false, toBeat: 16 })).getChannelData(0); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); };
      return { group: await rms(only((t) => t.groupId === g)), rest: await rms(only((t) => t.groupId !== g)), cls: [...document.querySelectorAll('.track-row.in-group')].every((r) => r.classList.contains('silent')) };
    }, gid);
    check('Gruppe stumm: Mitglieder klingen nicht, die übrigen schon', silent.group < 1e-4 && silent.rest > 0.005 && silent.cls, JSON.stringify(silent));
    await page.click('.group-row .tbtn-mute');
    await page.click('.group-toggle');
    check('Aufklappen zeigt die Mitglieder wieder', await page.evaluate(() => [...document.querySelectorAll('.track-row.in-group')].every((r) => !r.hidden)));
    // auflösen über das Gruppenmenü, ein Rückgängig holt sie zurück
    await page.click('.group-row .tbtn-menu');
    await page.locator('.track-menu-item', { hasText: 'Gruppe auflösen' }).click();
    check('Gruppe auflösen entfernt Kopf und Zugehörigkeit', await page.evaluate(() => !document.querySelector('.group-row') && !window.loopwerk.store.project.tracks.some((t) => t.groupId) && !(window.loopwerk.store.project.groups || []).length));
    await page.keyboard.press('Control+z');
    check('Rückgängig stellt die Gruppe wieder her', await page.evaluate(() => !!document.querySelector('.group-row') && window.loopwerk.store.project.tracks.filter((t) => t.groupId).length === 2));
    // ---------- Licht aus der Musik ----------
    await page.evaluate(() => { const s = window.loopwerk.store; s.project.tracks.forEach((t) => { if (t.groupId) delete t.groupId; }); s.project.groups = []; });
    check('Ohne Wiedergabe kein Licht', await page.evaluate(() => !window.loopwerk.glow.state.shown && document.querySelector('.beam').hidden));
    // Nur die Drums klingen: alles gelb, sonst nichts
    await page.evaluate(() => { const s = window.loopwerk.store; s.setTrack('t1', { solo: true }); window.loopwerk.engine.setPosition(16); });
    await page.click('#play-btn');
    await page.waitForTimeout(1800);
    let gl = await page.evaluate(() => window.loopwerk.glow.state);
    const others = Object.entries(gl.levels).filter(([c]) => c !== 'drums').reduce((n, [, v]) => n + v, 0);
    check('Nur Drums klingen: Licht nur in der Drum-Farbe', gl.shown && gl.levels.drums > 0.02 && others < 0.002, JSON.stringify(gl));
    check('Umgebungslicht folgt der Lautstärke', gl.amp > 0.2, JSON.stringify(gl));
    check('Funken fliegen an der Marke', gl.sparks > 0, JSON.stringify(gl));
    const beamPos = await page.evaluate(() => {
      const b = document.querySelector('.beam').getBoundingClientRect();
      const p = document.querySelector('.playhead').getBoundingClientRect();
      return { d: Math.abs(b.left + 150 - p.left - p.width / 2) };
    });
    check('Leuchten sitzt direkt an der Marke', beamPos.d < 12, JSON.stringify(beamPos));
    check('Licht kostet wenig Rechenzeit (< 4 ms je Bild)', gl.cost < 4, gl.cost.toFixed(2) + ' ms');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v21-licht.png') });
    await page.evaluate(() => window.loopwerk.store.setTrack('t1', { solo: false }));
    await page.waitForTimeout(900);
    gl = await page.evaluate(() => window.loopwerk.glow.state);
    check('Kommen andere Spuren dazu, mischen sich ihre Farben ein', Object.entries(gl.levels).filter(([c, v]) => c !== 'drums' && v > 0.01).length >= 1, JSON.stringify(gl.levels));
    await page.click('#play-btn');
    await page.waitForTimeout(2500);
    check('Nach dem Stopp klingt das Licht aus und schaltet ab', await page.evaluate(() => !window.loopwerk.glow.state.shown));
    // ---------- Wunsch-Agent ----------
    const rules = await page.evaluate(async () => {
      const { planByRules } = await import('./src/wish.js');
      const { store, library } = window.loopwerk;
      const a = planByRules('Bau mir einen Techno-Track', store.project, library);
      const b = planByRules('Hall auf den Bass', store.project, library);
      const c = planByRules('ohne Drums ab Takt 9', store.project, library);
      const d = planByRules('130 bpm und 48 Takte lang', store.project, library);
      return { a, b, c, d };
    });
    check('Regeln: „Techno-Track“ setzt Tempo und baut Fläche, Beat, Bass, Melodie auf', rules.a.actions.some((x) => x.do === 'tempo' && x.bpm === 130) && rules.a.actions.filter((x) => x.do === 'add').length >= 4, JSON.stringify(rules.a));
    check('Regeln: „Hall auf den Bass“ schaltet Hall auf der Bass-Spur ein, ohne neuen Sound', rules.b.actions.length >= 1 && rules.b.actions.every((x) => x.do === 'effect' && x.effect === 'hall'), JSON.stringify(rules.b));
    check('Regeln: „ohne Drums ab Takt 9“ entfernt nur ab Takt 9', rules.c.actions.length >= 1 && rules.c.actions.every((x) => x.do === 'remove' && x.fromBar === 9), JSON.stringify(rules.c));
    check('Regeln: Tempo und Länge aus Zahlen', rules.d.actions.some((x) => x.do === 'tempo' && x.bpm === 130) && rules.d.actions.some((x) => x.do === 'length' && x.bars === 48), JSON.stringify(rules.d));
    // über das Feld unter „Erstellen“, ohne Claude: Regeln
    await page.click('#ltab-create');
    const before2 = await page.evaluate(() => JSON.stringify(window.loopwerk.store.project));
    const nClips = await page.evaluate(() => window.loopwerk.store.project.tracks.reduce((n, t) => n + t.clips.length, 0));
    await page.fill('#wish-input', 'Techno-Beat ab Takt 9 bis 12, Pad mit Hall');
    await page.press('#wish-input', 'Enter');
    await page.waitForFunction(() => !document.getElementById('wish-form').classList.contains('busy'));
    const w1 = await page.evaluate(() => {
      const p = window.loopwerk.store.project;
      const added = p.tracks.flatMap((t) => t.clips.map((c) => ({ t: t.id, c, cat: window.loopwerk.library.get(c.sampleId)?.category, hall: t.fx?.hall?.on })));
      return { n: added.length, drums: added.filter((x) => x.cat === 'drums' && x.c.startBeat === 32 && x.c.lengthBeats === 16).length, hall: added.some((x) => x.cat === 'chords' && x.hall), state: document.getElementById('wish-state').textContent, hint: document.getElementById('hint')?.textContent };
    });
    check('Wunsch-Feld: Beat in Takt 9–12 eingesetzt, Pad bekommt Hall', w1.n > nClips && w1.drums >= 1 && w1.hall, JSON.stringify(w1));
    check('Wunsch-Feld meldet, was passiert ist', /Regeln/.test(w1.state) && /Rückgängig/.test(w1.hint || ''), JSON.stringify(w1));
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.loopwerk.store.undo());
    check('Ein Rückgängig nimmt den ganzen Wunsch zurück', await page.evaluate((b) => JSON.stringify(window.loopwerk.store.project) === b, before2));
    // mit Claude (nachgebildet): Plan wird geprüft, Ungültiges übersprungen
    const wc = await page.evaluate(async () => {
      const { runWish } = await import('./src/wish.js');
      const ai = await import('./src/ai.js');
      ai.resetClaude();
      window.claude = { use: async () => ({ json: async (prompt) => { window.__prompt = prompt; return { summary: 'Tempo 99, Bass ab Takt 3, Echo darauf', actions: [
        { do: 'tempo', bpm: 99 }, { do: 'add', sound: 'bass-sub', track: 'neu', fromBar: 3, toBar: 6 }, { do: 'effect', track: '@bass-sub', effect: 'echo', params: { mix: 0.4, quatsch: 3 } },
        { do: 'add', sound: 'gibt-es-nicht' }, { do: 'explode' } ] }; } }) };
      const { store, library } = window.loopwerk;
      const undo0 = store.undoStack.length;
      const r = await runWish('mach was mit Bass', { store, library });
      const t = store.project.tracks.findLast((x) => x.clips.some((c) => c.sampleId === 'bass-sub'));
      return { by: r.by, done: r.done.length, skipped: r.skipped.length, bpm: store.project.bpm, clip: t?.clips.find((c) => c.sampleId === 'bass-sub'), echo: t?.fx?.echo, steps: store.undoStack.length - undo0, prompt: /bass-sub/.test(window.__prompt) && /Wunsch: „mach was mit Bass“/.test(window.__prompt) };
    });
    check('Claude plant: Tempo, Bass auf neuer Spur in Takt 3–6, Echo auf genau dieser Spur', wc.by === 'claude' && wc.bpm === 99 && wc.clip?.startBeat === 8 && wc.clip?.lengthBeats === 16 && wc.echo?.on && wc.echo.mix === 0.4, JSON.stringify(wc));
    check('Ungültige Bausteine werden übersprungen, alles ist ein Schritt', wc.done === 3 && wc.skipped === 2 && wc.steps === 1 && wc.prompt, JSON.stringify(wc));
    // ---------- Nur dunkel ----------
    await page.emulateMedia({ colorScheme: 'light' });
    const dk = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme }));
    check('Auch bei hellem System bleibt Loopwerk dunkel', dk.bg === 'rgb(22, 23, 26)' && dk.scheme === 'dark', JSON.stringify(dk));
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
