// Umbau Scheibe 3 (Layout „reiter“, Desktop): Mixer als Zeilen neben den Spuren, Karte für Effekte der Spur und der Summe.
// Prüft: jede Mixer-Zeile liegt genau auf der Höhe ihrer Spur (Start, nach senkrechtem Rollen, bei anderer Spurhöhe, nach Umsortieren, Hinzufügen,
// Löschen, mit eingeklappter Gruppe); Summe, Hall- und Echo-Bus unter den Spuren; Klick auf die Kurzinfo öffnet die Karte (Titel = Spurname, ✕/Esc zu),
// Effekt schalten in der Karte, Spur wählen öffnet sie nicht; Summen-Karte mit Mastering, Busse, Master; kein Fach „Mixer“ mehr, FX-Pad im Kopf der
// Spalte; Pegel zeichnen nur bei sichtbarer Spalte; Handy unverändert (Fach unten).
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  const lw = (fn, arg) => page.evaluate(fn, arg);
  // Versatz zwischen Spur und Mixer-Zeile (Oberkante, Höhe) für alle sichtbaren Spuren
  const offsets = () => lw(() => {
    const out = [];
    for (const t of window.loopwerk.store.project.tracks) {
      const lane = document.querySelector(`.lane[data-track-id="${t.id}"]`);
      const slot = document.querySelector(`.mix-slot[data-track-id="${t.id}"]`);
      const strip = slot?.querySelector('.strip');
      if (!lane || !slot || !lane.closest('.track-row').offsetParent) continue;
      const a = lane.getBoundingClientRect();
      const b = slot.getBoundingClientRect();
      out.push({ id: t.id, dTop: Math.round((b.top - a.top) * 10) / 10, dH: Math.round((b.height - a.height) * 10) / 10, strip: !!strip && strip.getBoundingClientRect().height > 0 });
    }
    return out;
  });
  const aligned = async (name) => {
    const o = await offsets();
    check(name, o.length > 0 && o.every((x) => Math.abs(x.dTop) <= 0.6 && Math.abs(x.dH) <= 0.6 && x.strip), `${o.length} Zeilen, schlechteste ${JSON.stringify(o.reduce((w, x) => (Math.abs(x.dTop) + Math.abs(x.dH) > Math.abs(w.dTop || 0) + Math.abs(w.dH || 0) ? x : w), {}))}`);
  };
  try {
    await page.click('#demo-btn'); // Beispiel-Song
    await page.waitForTimeout(600);
    await page.click('#side-tab-mixer');
    await page.waitForTimeout(400);

    // ---------- Aufbau ----------
    const base = await lw(() => ({
      mixerBtn: !!document.getElementById('mixer-btn').offsetParent, dock: !!document.getElementById('mixer').offsetParent,
      fxpadIn: !!document.getElementById('fxpad-btn').closest('#mix-head') && !!document.getElementById('fxpad-btn').offsetParent,
      busRows: [...document.querySelectorAll('#mix-bus .strip')].map((s) => s.dataset.stripId),
      hint: !!document.querySelector('.side-mixer-hint'), sideShown: !!document.getElementById('side').offsetParent,
      n: document.querySelectorAll('.mix-slot .strip').length, tracks: window.loopwerk.store.project.tracks.length,
    }));
    check('Kein Mixer-Fach und kein „Mixer“-Knopf, keine Karte ohne Klick', !base.mixerBtn && !base.dock && !base.sideShown && !base.hint, JSON.stringify(base));
    check('Jede Spur hat ihre Zeile; Summe, Hall-Bus, Echo-Bus darunter; FX-Pad im Kopf der Spalte', base.n === base.tracks && base.fxpadIn && JSON.stringify(base.busRows) === '["__master","__bus:hall","__bus:echo"]', JSON.stringify(base));
    await aligned('Zeilen liegen auf der Höhe ihrer Spuren');
    const colBox = await lw(() => { const r = document.querySelector('.mix-slot').getBoundingClientRect(); const sc = document.getElementById('arr-scroll').getBoundingClientRect(); return { right: Math.round(sc.right - r.right), w: Math.round(r.width) }; });
    check('Spalte sitzt rechts am Rand des Arrangers', colBox.right <= 2 && colBox.w >= 280, JSON.stringify(colBox));
    // Bedienelemente und Kennungen wie im Mischpult
    const ctl = await lw(() => {
      const t = window.loopwerk.store.project.tracks[0].id;
      const ids = [`fader-${t}`, `pan-${t}`, `send-${t}-hall`, `send-${t}-echo`, 'fader-__master', 'fader-bus-hall', 'fader-bus-echo'];
      return { ids: ids.filter((i) => !document.getElementById(i)), ms: !!document.querySelector(`.mix-slot[data-track-id="${t}"] .tbtn-mute`) && !!document.querySelector(`.mix-slot[data-track-id="${t}"] .tbtn-solo`), lock: !!document.querySelector('.mix-slot .strip-pan-wrap .auto-lock') };
    });
    check('Lautstärke, Panorama, Sends, M/S, Summe und Busse haben ihre Kennungen, Kurven-Schloss ist da', ctl.ids.length === 0 && ctl.ms && ctl.lock, JSON.stringify(ctl));
    // Lautstärke der Zeile und Regler im Spurkopf zeigen denselben Wert
    await lw(() => { const t = window.loopwerk.store.project.tracks[1].id; const i = document.getElementById(`fader-${t}`); i.value = '0.35'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    const same = await lw(() => { const t = window.loopwerk.store.project.tracks[1]; return [t.volume, Number(document.getElementById(`vol-${t.id}`).value), Number(document.getElementById(`fader-${t.id}`).value)]; });
    check('Fader der Zeile und Regler im Spurkopf zeigen denselben Wert', same[0] === 0.35 && same[1] === 0.35 && same[2] === 0.35, JSON.stringify(same));

    // ---------- Deckung bei Rollen, Spurhöhe, Umsortieren, Hinzufügen, Löschen, Gruppen ----------
    await lw(() => { for (let i = 0; i < 9; i++) window.loopwerk.store.addTrack(); });
    await page.waitForTimeout(300);
    await lw(() => { document.getElementById('arr-scroll').scrollTop = 230; });
    await page.waitForTimeout(250);
    await aligned('Nach senkrechtem Rollen weiter deckungsgleich');
    await lw(() => { document.getElementById('arr-scroll').scrollTop = 0; });
    for (const z of [0.5, 0.4, 1.6, 2.5]) {
      await lw((v) => window.loopwerk.arranger.zoomYTo(v), z);
      await page.waitForTimeout(250);
      await aligned(`Spurhöhe ${z}: deckungsgleich`);
      const comp = await lw(() => { const s = document.querySelector('.mix-slot .strip'); const vis = (sel) => { const n = s.querySelector(sel); return !!n && n.getClientRects().length > 0; }; return { sum: vis('.strip-sum'), fader: vis('.strip-fader'), m: vis('.tbtn-mute'), s: vis('.tbtn-solo'), pan: vis('.strip-pan-wrap'), sends: vis('.strip-sends'), h: Math.round(s.getBoundingClientRect().height) }; });
      check(`Spurhöhe ${z}: Kurzinfo, Lautstärke, M und S bleiben, Panorama und Sends nur bei ausreichender Höhe`, comp.sum && comp.fader && comp.m && comp.s && (z >= 1 ? comp.pan && comp.sends : z > 0.5 || (!comp.pan && !comp.sends)), JSON.stringify(comp));
    }
    await lw(() => window.loopwerk.arranger.zoomYTo(1));
    await page.waitForTimeout(250);
    await lw(() => { const s = window.loopwerk.store; s.moveTrack(s.project.tracks[0].id, 4); });
    await page.waitForTimeout(250);
    await aligned('Nach Umsortieren deckungsgleich');
    const order = await lw(() => [...document.querySelectorAll('.mix-slot')].map((n) => n.dataset.trackId).join() === [...document.querySelectorAll('.lane[data-track-id]')].map((n) => n.dataset.trackId).join());
    check('Reihenfolge der Zeilen folgt der Reihenfolge der Spuren', order);
    await lw(() => { const s = window.loopwerk.store; s.removeTrack(s.project.tracks[2].id); });
    await page.waitForTimeout(250);
    await aligned('Nach Löschen einer Spur deckungsgleich');
    check('Gelöschte Spur lässt keine Zeile zurück', await lw(() => document.querySelectorAll('.mix-slot .strip').length === window.loopwerk.store.project.tracks.length));
    await lw(() => { const s = window.loopwerk.store; s.groupTracks([s.project.tracks[3].id, s.project.tracks[4].id], 'Gruppe'); });
    await page.waitForTimeout(250);
    await aligned('Mit Gruppe deckungsgleich');
    await lw(() => { const s = window.loopwerk.store; s.setGroup(s.project.groups[0].id, { collapsed: true }); });
    await page.waitForTimeout(250);
    await aligned('Mit eingeklappter Gruppe deckungsgleich (verborgene Spuren zählen nicht)');
    await lw(() => { const s = window.loopwerk.store; s.setGroup(s.project.groups[0].id, { collapsed: false }); });
    await page.waitForTimeout(200);
    await lw(() => window.loopwerk.ui.selectTrack(window.loopwerk.store.project.tracks[0].id));
    await lw(() => window.loopwerk.arranger.autoLanes?.toggle?.(window.loopwerk.store.project.tracks[0].id));
    await page.waitForTimeout(250);
    await aligned('Mit offener Kurvenzeile deckungsgleich');
    await lw(() => window.loopwerk.arranger.autoLanes?.toggle?.(window.loopwerk.store.project.tracks[0].id));
    await lw(() => { const s = window.loopwerk.store; while (s.project.tracks.length > 6) s.removeTrack(s.project.tracks.at(-1).id); window.loopwerk.ui.selectTrack(null); });
    await page.waitForTimeout(300);

    // ---------- Karte: Spur ----------
    const tid = await lw(() => window.loopwerk.store.project.tracks[0].id);
    const tname = await lw((id) => window.loopwerk.store.track(id).name, tid);
    check('Spur wählen (Spurkopf) hebt die Zeile hervor und öffnet die Karte nicht', await (async () => {
      await page.click(`.track-row:has(.lane[data-track-id="${tid}"]) .track-head .track-name`);
      await page.waitForTimeout(250);
      return lw((id) => ({ card: !!document.getElementById('side').offsetParent, sel: document.querySelector(`.mix-slot[data-track-id="${id}"] .strip`).classList.contains('selected'), tab: document.getElementById('app').dataset.side }), tid).then((r) => (r.sel && !r.card && r.tab === 'mixer') || (console.log(JSON.stringify(r)), false));
    })());
    await page.click(`.mix-slot[data-track-id="${tid}"] .strip-sum`);
    await page.waitForTimeout(300);
    const card = await lw(() => ({ shown: !!document.getElementById('side').offsetParent, title: document.getElementById('mixcard-title').textContent, mode: document.getElementById('app').dataset.mixcard, fx: !!document.getElementById('fx-eq-on')?.offsetParent, vol: !!document.getElementById('insp-vol')?.offsetParent, pan: !!document.getElementById('insp-pan')?.offsetParent, sends: !!document.getElementById('insp-send-hall')?.offsetParent && !!document.getElementById('insp-send-echo')?.offsetParent, order: !!document.getElementById('fx-eq-on')?.closest('.fxl')?.querySelector('.fxl-head [class*="grip"], .fxl-head .grip'), arm: !!document.querySelector('#side .insp-track [id*="arm"], #side .insp-track .rec-arm-row'), mst: !!document.getElementById('insp-mst-on')?.offsetParent }));
    check('Klick auf die Kurzinfo öffnet die Karte der Spur: Titel = Spurname, Effekte, Lautstärke, Panorama, Sends', card.shown && card.title === tname && card.mode === 'spur' && card.fx && card.vol && card.pan && card.sends && !card.mst, JSON.stringify(card));
    // Ausgangslage: EQ aus (das Beispiel schaltet ihn bei manchen Spuren ein), dann in der Karte einschalten
    await lw((id) => window.loopwerk.store.setTrackFx(id, 'eq', { on: false }), tid);
    const n0 = await lw((id) => document.querySelector(`.mix-slot[data-track-id="${id}"] .strip-sum`).textContent, tid);
    await page.click('#fx-eq-on');
    await page.waitForTimeout(200);
    const eq = await lw((id) => ({ on: window.loopwerk.store.track(id).fx?.eq?.on, sum: document.querySelector(`.mix-slot[data-track-id="${id}"] .strip-sum`).textContent }), tid);
    check('Effekt in der Karte schalten wirkt, die Kurzinfo der Zeile zählt mit', eq.on === true && eq.sum !== n0 && /Effekt/.test(eq.sum), JSON.stringify({ n0, ...eq }));
    await page.fill('#fx-eq-low', '3');
    check('Regler eines Effekts in der Karte wirken', await lw((id) => window.loopwerk.store.track(id).fx.eq.low === 3, tid));
    const fxGrip = await lw(() => document.querySelectorAll('#side .insp-track .fxl-head').length);
    check('Alle sieben Effekte stehen mit Kopf (Reihenfolge ziehbar) in der Karte', fxGrip === 7, String(fxGrip));
    // Zeile einer anderen Spur wechselt die Karte
    const tid2 = await lw(() => window.loopwerk.store.project.tracks[2].id);
    await page.click(`.track-row:has(.lane[data-track-id="${tid2}"]) .track-head .track-name`);
    await page.waitForTimeout(250);
    check('Andere Spur wählen (Spurkopf): die offene Karte zeigt deren Spur', await lw((n) => document.getElementById('mixcard-title').textContent === n, await lw((id) => window.loopwerk.store.track(id).name, tid2)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Esc schließt die Karte (die Spalte bleibt)', await lw(() => !document.getElementById('side').offsetParent && !!document.querySelector('.mix-slot .strip').offsetParent && !document.getElementById('app').dataset.mixcard));
    await page.click(`.mix-slot[data-track-id="${tid}"] .strip-sum`);
    await page.waitForTimeout(200);
    await page.click('#mixcard-close');
    check('✕ schließt die Karte', await lw(() => !document.getElementById('side').offsetParent));

    // ---------- Karte: Summe ----------
    await page.click('#mix-bus .strip[data-strip-id="__master"] .strip-sum');
    await page.waitForTimeout(300);
    const sum = await lw(() => ({ title: document.getElementById('mixcard-title').textContent, mode: document.getElementById('app').dataset.mixcard, mst: !!document.getElementById('insp-mst-on')?.offsetParent, styles: document.querySelectorAll('#side .mst-style').length, vol: !!document.getElementById('insp-master-vol')?.offsetParent, fx: !!document.getElementById('fx-hall-on')?.offsetParent, busHead: [...document.querySelectorAll('#side .insp-grp-buses .insp-sub, #side .insp-grp-master .insp-sub')].map((n) => n.textContent), track: !!document.querySelector('#side .insp-track')?.offsetParent, name: !!document.querySelector('#side .insp-grp-song')?.offsetParent }));
    check('Summen-Karte: Mastering, Busse, Master (Lautstärke, Effekte)', sum.title === 'Summe' && sum.mode === 'summe' && sum.mst && sum.styles >= 4 && sum.vol && sum.fx && sum.busHead.join() === 'Busse,Master' && !sum.track && !sum.name, JSON.stringify(sum));
    await page.fill('#insp-master-vol', '0.5');
    check('Master-Lautstärke in der Summen-Karte wirkt', await lw(() => Math.abs(window.loopwerk.store.project.master.volume - 0.5) < 1e-6));
    await page.keyboard.press('Escape');
    // Bus-Zeile: Lautstärke wirkt, Klick öffnet die Summe
    await lw(() => window.loopwerk.store.setSend(window.loopwerk.store.project.tracks[0].id, 'hall', 0.4));
    await page.waitForTimeout(200);
    await page.click('#mix-bus .strip[data-strip-id="__bus:hall"] .strip-name');
    await page.waitForTimeout(250);
    check('Hall-Bus: Klick öffnet die Summen-Karte, Einstellungen des Busses sind da', await lw(() => document.getElementById('app').dataset.mixcard === 'summe' && !!document.getElementById('insp-bus-hall-volume')?.offsetParent));
    await page.keyboard.press('Escape');
    // Mastering und Master-Lautstärke wohnen nicht mehr in Datei
    await page.click('#side-tab-datei');
    await page.waitForTimeout(250);
    const datei = await lw(() => {
      const vis = (id) => !!document.getElementById(id)?.offsetParent;
      const top = (id) => document.getElementById(id)?.getBoundingClientRect().top ?? 0;
      return { mst: vis('insp-mst-on'), mvol: vis('insp-master-vol'), tempo: vis('insp-tempo'), key: vis('insp-key'), len: vis('insp-length'), nameTop: top('project-name'), tempoTop: top('insp-tempo'), openTop: top('open-btn'), exportTop: top('export-btn'), demoTop: top('demo-btn'), keysTop: top('keys-btn'), tipsTop: top('tips-reset'), neuTop: top('starter'), infoTop: top('pop-about'), exportBottom: document.getElementById('export-btn').getBoundingClientRect().bottom };
    });
    check('Datei: Mastering und Master-Lautstärke ausgezogen, Name, Tempo, Tonart, Länge da', !datei.mst && !datei.mvol && datei.tempo && datei.key && datei.len, JSON.stringify(datei));
    check('Datei: Reihenfolge Name · Tempo · Befehle (Öffnen, Exportieren, Beispiel, Tastenkürzel, Tipps) · Neuer Song · Info', datei.nameTop < datei.tempoTop && datei.tempoTop < datei.openTop && datei.openTop < datei.exportTop && datei.exportTop < datei.demoTop && datei.demoTop < datei.keysTop && datei.keysTop < datei.tipsTop && datei.tipsTop < datei.neuTop && datei.neuTop < datei.infoTop, JSON.stringify(datei));
    check('Datei: Befehle bis Exportieren ohne Rollen sichtbar (1440×900)', datei.exportBottom < 880, String(datei.exportBottom));
    await page.click('#side-tab-mixer');
    await page.waitForTimeout(200);

    // ---------- FX-Pad und Pegel ----------
    await page.click('#fxpad-btn');
    await page.waitForTimeout(500);
    check('FX-Pad öffnet als Fach unten (Knopf im Kopf der Spalte)', await lw(() => window.loopwerk.ui.dock === 'fxpad' && !document.getElementById('fxpad').hidden));
    await lw(() => window.loopwerk.ui.setDock(null));
    await lw(() => window.loopwerk.ui.setDock('mixer'));
    await page.waitForTimeout(200);
    check('ui.setDock(\'mixer\') zeigt den Reiter Mixer statt eines Fachs', await lw(() => window.loopwerk.ui.dock === null && document.getElementById('app').dataset.side === 'mixer' && !document.getElementById('mixer').offsetParent));
    await lw(() => { window.loopwerk.store.project.loop.on = false; window.loopwerk.engine.play(); });
    await page.waitForTimeout(1500);
    const meters = await lw(() => [...document.querySelectorAll('.mix-slot .strip-meter')].filter((c) => { const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) return true; return false; }).length);
    check('Beim Abspielen zeichnen die Pegel der Zeilen', meters > 0, String(meters));
    await lw(() => window.loopwerk.engine.pause());
    // Reiter Sounds: Spalte weg, der ganze Arranger ist frei; die Pegel ruhen
    await page.click('#side-tab-sounds');
    await page.waitForTimeout(250);
    const free = await lw(() => ({ slot: !!document.querySelector('.mix-slot').offsetParent, w: Math.round(document.querySelector('.arr-grid').getBoundingClientRect().width), reserve: getComputedStyle(document.getElementById('arr-scroll')).paddingRight }));
    check('Ohne Mixer-Reiter keine Spalte', !free.slot, JSON.stringify(free));
    await page.click('#side-tab-sounds'); // Karte zu
    await page.waitForTimeout(250);
    const closed = await lw(() => ({ slot: !!document.querySelector('.mix-slot').offsetParent, pad: getComputedStyle(document.getElementById('arr-scroll')).paddingRight, mix: getComputedStyle(document.getElementById('app')).getPropertyValue('--mix-w').trim() }));
    check('Karte zu: kein Rand, keine Spalte, der ganze Arranger ist frei', !closed.slot && closed.pad === '0px', JSON.stringify(closed));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack || e.message);
  }
  check('Keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  await app.close();

  // ---------- Handy: unverändert ----------
  const ph = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    await ph.page.waitForTimeout(300);
    const m = await ph.page.evaluate(() => ({ slot: !!document.querySelector('.mix-slot')?.offsetParent, head: !!document.getElementById('mix-head')?.offsetParent, btn: !!document.getElementById('mixer-btn').offsetParent || true }));
    check('Handy: keine Mixer-Spalte neben den Spuren', !m.slot && !m.head, JSON.stringify(m));
    await ph.page.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await ph.page.waitForTimeout(500);
    const d = await ph.page.evaluate(() => ({ dock: !document.getElementById('mixer').hidden, strips: document.querySelectorAll('#mixer-strips > .strip').length, tracks: window.loopwerk.store.project.tracks.length }));
    check('Handy: Mixer bleibt das Fach unten mit allen Kanalzügen', d.dock && d.strips >= d.tracks, JSON.stringify(d));
  } catch (e) {
    check('Handy lief ohne Ausnahme', false, e.stack || e.message);
  }
  await ph.close();
  finish();
})();
