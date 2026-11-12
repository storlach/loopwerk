// Umbau Scheibe 4 und 5 (Layout „reiter“, Desktop): Clip-Editor als Karte in der Mitte, Kopfzeile über den Spuren, Fachleiste entfällt.
// Prüft: Doppelklick öffnet Sample-Editor und Pattern-Editor als Karte (role=dialog, Fokus hinein), ✕ / Esc / Klick auf die abgedunkelte Fläche
// schließen und der Fokus kehrt zurück, Abspielen und Leertaste laufen weiter, Einflug (mit reduzierter Bewegung ohne Verschieben),
// Karte rechts zeigt bei gewähltem Clip nichts, Werkzeuge (Teilen, Duplizieren, Löschen) und Tempo in der Kopfzeile, „Tastenkürzel“ in Datei.
const { openApp, createChecker, createCard } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  const lw = (fn, arg) => page.evaluate(fn, arg);
  const overlayShown = () => lw(() => { const o = document.getElementById('clip-overlay'); return !!o && !o.hidden && o.getClientRects().length > 0; });
  try {
    // ---------- Kopfzeile über den Spuren ----------
    const bar0 = await lw(() => ({
      tools: document.getElementById('arr-bar-tools').getClientRects().length > 0,
      tempoIn: !!document.getElementById('bpm-input').closest('#arr-bar'), tempoVisible: !!document.getElementById('bpm-input').offsetParent,
      keyInDeck: !!document.getElementById('key-sel').offsetParent,
      zoom: ['zoom-in', 'zoom-out', 'zoomy-in', 'zoomy-out'].some((id) => document.getElementById(id).offsetParent),
      tabbar: getComputedStyle(document.getElementById('tabbar')).display,
      keysInDatei: !!document.getElementById('keys-btn').closest('#side-datei-liste'),
    }));
    check('Ohne Auswahl: keine Werkzeuge in der Kopfzeile', !bar0.tools, JSON.stringify(bar0));
    check('Tempo steht in der Kopfzeile über den Spuren, Tonart nicht mehr im Deck', bar0.tempoIn && bar0.tempoVisible && !bar0.keyInDeck, JSON.stringify(bar0));
    check('Zoom-Knöpfe und Fachleiste entfallen, Tastenkürzel liegen in Datei', !bar0.zoom && bar0.tabbar === 'none' && bar0.keysInDatei, JSON.stringify(bar0));

    // ---------- Clip wählen: Werkzeuge in der Kopfzeile, nichts in der Karte ----------
    const clip = page.locator('.clip').nth(1);
    const cid = await clip.getAttribute('data-clip-id');
    await clip.click({ position: { x: 40, y: 30 } });
    const sel = await lw(() => ({
      tools: ['split-btn', 'dup-btn', 'del-btn'].every((id) => document.getElementById(id).closest('#arr-bar-tools') && document.getElementById(id).offsetParent),
      card: !!document.querySelector('#side .insp-clip')?.offsetParent, edit: !!document.getElementById('edit-btn').offsetParent, editorTab: !!document.getElementById('editor-tab').offsetParent,
      sideInsp: !!document.getElementById('insp').offsetParent,
    }));
    check('Clip gewählt: Teilen, Duplizieren, Löschen stehen in der Kopfzeile', sel.tools, JSON.stringify(sel));
    check('Clip gewählt: die Karte zeigt nichts, kein „Bearbeiten“, kein Editor-Reiter', !sel.card && !sel.edit && !sel.editorTab && !sel.sideInsp, JSON.stringify(sel));
    check('Karte ist nicht offen, solange man den Clip nur wählt', !(await overlayShown()));
    // Teilen aus der Kopfzeile wirkt
    const n0 = await lw(() => window.loopwerk.store.project.tracks.reduce((n, t) => n + t.clips.length, 0));
    await page.click('#dup-btn');
    check('Duplizieren in der Kopfzeile dupliziert den Clip', await lw(() => window.loopwerk.store.project.tracks.reduce((n, t) => n + t.clips.length, 0)) === n0 + 1);
    await page.keyboard.press('Control+z');

    // ---------- Doppelklick: Sample-Editor als Karte ----------
    await page.evaluate(() => window.loopwerk.engine.play());
    await clip.click({ position: { x: 40, y: 30 } });
    await clip.dblclick({ position: { x: 40, y: 30 } });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor' || window.loopwerk.ui.dock === 'pattern', null, { timeout: 10000 });
    await page.waitForTimeout(350);
    const o1 = await lw(() => {
      const card = document.getElementById('ov-card');
      const r = card.getBoundingClientRect();
      const lab = document.getElementById(card.getAttribute('aria-labelledby'));
      return {
        dock: window.loopwerk.ui.dock, shown: !document.getElementById('clip-overlay').hidden, role: card.getAttribute('role'), modal: card.getAttribute('aria-modal'), label: lab?.textContent,
        focusIn: card.contains(document.activeElement), centered: Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 40, w: r.width,
        clipSec: !!document.querySelector('#clip-overlay .insp-clip')?.offsetParent, name: document.querySelector('#clip-overlay :is(#ed-name, #pat-name)')?.offsetParent != null,
        playing: window.loopwerk.engine.playing, editBtn: !!document.getElementById('edit-btn').offsetParent,
      };
    });
    check('Doppelklick öffnet den Editor als Karte in der Mitte (dialog, aria-label, Fokus in der Karte)', o1.shown && o1.role === 'dialog' && o1.modal === 'true' && !!o1.label && o1.focusIn && o1.centered, JSON.stringify(o1));
    check('Karte zeigt Name und die Clip-Einstellungen in der rechten Spalte', o1.clipSec && o1.name, JSON.stringify(o1));
    check('Abspielen läuft weiter, kein „Bearbeiten“-Knopf', o1.playing && !o1.editBtn, JSON.stringify(o1));
    await page.keyboard.press('Space');
    check('Leertaste hält an, solange die Karte offen ist', await lw(() => !window.loopwerk.engine.playing));
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    check('Leertaste startet wieder', await lw(() => window.loopwerk.engine.playing));
    await page.evaluate(() => window.loopwerk.engine.pause());
    // Tab bleibt in der Karte
    const tabbed = await lw(async () => {
      const card = document.getElementById('ov-card');
      const seen = new Set();
      for (let i = 0; i < 80; i++) {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        const ok = card.contains(document.activeElement);
        seen.add(ok);
        if (!ok) break;
        (document.activeElement.nextElementSibling ?? document.activeElement).focus?.();
      }
      return [...seen];
    });
    check('Tab-Schleife bleibt in der Karte', tabbed.length === 1 && tabbed[0] === true, JSON.stringify(tabbed));

    // ---------- Schließen: Esc, ✕, Klick daneben; Fokus kehrt zurück ----------
    await page.keyboard.press('Escape');
    check('Esc schließt die Karte, der Fokus ist nicht mehr in ihr', !(await overlayShown()) && await lw(() => window.loopwerk.ui.dock === null && !document.getElementById('ov-card').contains(document.activeElement)));
    await lw((id) => window.loopwerk.ui.select(id), cid);
    await clip.dblclick({ position: { x: 40, y: 30 } });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    await page.waitForTimeout(300);
    await page.click('#ed-cancel');
    check('✕ (Abbrechen) schließt die Karte, nichts wird übernommen', !(await overlayShown()) && await lw(() => window.loopwerk.ui.dock === null));
    await clip.dblclick({ position: { x: 40, y: 30 } });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    await page.waitForTimeout(300);
    await page.mouse.click(40, 700);
    check('Klick auf die abgedunkelte Fläche schließt die Karte', !(await overlayShown()) && await lw(() => window.loopwerk.ui.dock === null));
    check('Nach dem Schließen ist der Clip noch gewählt, Werkzeuge in der Kopfzeile bleiben', await lw((id) => window.loopwerk.ui.selectedClipId === id && !!document.getElementById('arr-bar-tools').offsetParent, cid));

    // ---------- Bewegung: Einflug, mit reduzierter Bewegung ohne Verschieben ----------
    const anim = async () => {
      await clip.dblclick({ position: { x: 40, y: 30 } });
      await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
      const a = await lw(() => { const cs = getComputedStyle(document.getElementById('ov-card')); return { name: cs.animationName, dur: parseFloat(cs.animationDuration) }; });
      await page.keyboard.press('Escape');
      return a;
    };
    const a1 = await anim();
    check('Einflug: Animation 180–240 ms', a1.name === 'ov-in' && a1.dur >= 0.18 && a1.dur <= 0.24, JSON.stringify(a1));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const a2 = await anim();
    check('Reduzierte Bewegung: nur Einblenden (kurz, ohne Verschieben)', a2.name === 'ov-fade' && a2.dur <= 0.15, JSON.stringify(a2));
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // ---------- Beat: „Beat bauen“ landet in derselben Karte ----------
    await createCard(page, 'beat');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    await page.waitForTimeout(400);
    const o2 = await lw(() => ({ shown: !document.getElementById('clip-overlay').hidden, inCard: !!document.getElementById('pattern').closest('#ov-card'), clipSec: !!document.querySelector('#pattern .insp-clip')?.offsetParent, close: !!document.getElementById('ov-close').offsetParent, label: document.getElementById('pat-title').textContent }));
    check('„Beat bauen“ öffnet den Pattern-Editor in der Karte, mit ✕ und Clip-Einstellungen', o2.shown && o2.inCard && o2.clipSec && o2.close && /Beat/.test(o2.label), JSON.stringify(o2));
    await page.click('#ov-close');
    check('✕ schließt den Pattern-Editor', !(await overlayShown()) && await lw(() => window.loopwerk.ui.dock === null));

    // ---------- Handy: alles wieder an seinem alten Platz ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mob = await lw(() => ({
      editorHome: !document.getElementById('editor').closest('#clip-overlay'), patternHome: !document.getElementById('pattern').closest('#clip-overlay'), clipSecHome: !!document.querySelector('#insp .insp-clip'),
      tempoHome: !!document.getElementById('bpm-input').closest('.lcd'),
    }));
    check('Schmal (Handy-Breite): Editoren, Clip-Abschnitt und Tempo-Feld sind wieder an ihren alten Plätzen', mob.editorHome && mob.patternHome && mob.clipSecHome && mob.tempoHome, JSON.stringify(mob));
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
