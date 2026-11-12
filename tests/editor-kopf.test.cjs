// Editor-Kopf (Beat und Melodie): große Überschrift mit editierbarem Namen, deutlicher Umschalter Schritte | Pads,
// Anhören und Live wie Abspielen und Aufnahme im Deck, Reihen/Zeilen wachsen mit der Schubladenhöhe.
// node tests/editor-kopf.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

const VPS = [
  { name: 'Desktop', vp: { width: 1440, height: 900 }, touch: false },
  { name: 'Handy', vp: { width: 390, height: 844 }, touch: true },
];

// Schublade merken: beide Editoren starten in der Mitte (Handy-Melodie sonst oben)
const midInit = () => {
  const m = { 'pattern-drums': 0.5, 'pattern-synth': 0.5, editor: 0.5 };
  localStorage.setItem('loopwerk.sheetH', JSON.stringify({ wide: m, narrow: m }));
};

async function openEditor(page, kind) {
  await page.evaluate(() => window.loopwerk.ui.setDock(null));
  await page.waitForTimeout(250);
  await page.evaluate((k) => document.querySelector(`.ccard[data-create="${k}"]`).click(), kind);
  await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern', null, { timeout: 5000 });
  await page.waitForTimeout(700);
}

// Schublade am Griff mit der Maus auf eine Höhe ziehen (langsam, damit sie am Haltepunkt „oben“ landet)
async function dragSheet(page, dy, log = null) {
  const g = await page.evaluate(() => { const r = document.querySelector('#pattern > .sheet-grip').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 9 }; });
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(g.x, g.y + (dy * i) / steps);
    await page.waitForTimeout(40);
    if (log) log.push(await log.fn());
  }
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(900);
}

async function run({ name, vp, touch }) {
  const app = await openApp({ viewport: vp, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1, init: midInit });
  const { page } = app;
  const handy = vp.width < 761;
  const tag = `${name}`;
  const patName = () => page.evaluate(() => { const ed = window.loopwerk.patternEditor; return window.loopwerk.store.project.patterns[ed.id].name; });
  try {
    await page.waitForTimeout(600);

    // ---------- Beat: Kopf ----------
    await openEditor(page, 'beat');
    const head = await page.evaluate(() => {
      const n = document.getElementById('pat-name');
      const t = document.getElementById('pat-title');
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      return { size: parseFloat(cs.fontSize), nameW: r.width, nameH: r.height, nameVisible: r.width > 40 && r.height > 10, kind: t.textContent, kindSize: parseFloat(getComputedStyle(t).fontSize), above: tr.bottom <= r.top + 2, value: n.value };
    });
    check(`${tag}: Name ist sichtbar und groß (≥ 20 px), kleine Zeile „Beat-Editor“ darüber`, head.nameVisible && head.size >= 20 && head.kind === 'Beat-Editor' && head.kindSize < head.size && head.above, JSON.stringify(head));

    const before = await patName();
    check(`${tag}: Feld zeigt den Namen des Patterns`, head.value === before, `${head.value} / ${before}`);
    await page.click('#pat-name');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Mein Groove');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
    const after = await patName();
    check(`${tag}: Enter speichert den neuen Namen`, after === 'Mein Groove', after);
    check(`${tag}: Fokus verlässt das Feld nach Enter`, await page.evaluate(() => document.activeElement?.id !== 'pat-name'));
    const names = await page.evaluate(() => ({ tab: document.getElementById('tab-editor')?.textContent || document.getElementById('tabbar').textContent, clips: window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)).length }));
    // Umbau Scheibe 4: kein Editor-Reiter mehr; der Name steht im Kopf der Karte (Feld)
    if (!handy) check(`${tag}: neuer Name steht im Kopf der Karte`, await page.evaluate(() => document.getElementById('pat-name').value) === 'Mein Groove');
    await page.evaluate(() => window.loopwerk.store.undo());
    await page.waitForTimeout(200);
    check(`${tag}: Rückgängig holt den alten Namen zurück (ein Schritt)`, (await patName()) === before && await page.evaluate(() => document.getElementById('pat-name').value) === before, await patName());

    await page.click('#pat-name');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Verworfen');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    check(`${tag}: Esc verwirft die Eingabe`, (await patName()) === before && await page.evaluate(() => document.getElementById('pat-name').value) === before && await page.evaluate(() => window.loopwerk.ui.dock) === 'pattern', await patName());
    await page.click('#pat-name');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(450);
    check(`${tag}: leerer Name wird nicht gespeichert`, (await patName()) === before);

    // ---------- Umschalter ----------
    const seg = await page.evaluate(() => [...document.querySelectorAll('#pat-view .seg')].map((b) => {
      const c = getComputedStyle(b);
      const m = c.backgroundColor.match(/[\d.]+/g).map(Number);
      return { view: b.dataset.view, h: b.getBoundingClientRect().height, pressed: b.getAttribute('aria-pressed'), bg: m, alpha: m[3] ?? 1, sum: m[0] + m[1] + m[2], ink: c.color };
    }));
    const act = seg.find((s) => s.pressed === 'true');
    const idle = seg.find((s) => s.pressed !== 'true');
    check(`${tag}: aktive Seite des Umschalters ist hell gefüllt, die andere nur Linie`, act && idle && act.sum > 600 && act.alpha > 0.9 && idle.alpha < 0.2, JSON.stringify(seg));
    check(`${tag}: Umschalter mindestens so hoch wie die Tasten (≥ 44 px)`, seg.every((s) => s.h >= 43.5), JSON.stringify(seg.map((s) => s.h)));

    // ---------- Anhören und Live wie im Deck ----------
    const keys = await page.evaluate(() => {
      const r = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); const c = getComputedStyle(e); return { w: b.width, h: b.height, br: c.borderRadius, svg: !!e.querySelector('svg'), text: e.textContent.trim() }; };
      return { play: r('pat-play'), rec: r('pat-live'), dplay: r('play-btn'), drec: r('rec-btn') };
    });
    const near = (a, b) => Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2 && a.br === b.br;
    check(`${tag}: Anhören wie Abspielen im Deck (Größe, Form, Icon statt Text)`, near(keys.play, keys.dplay) && keys.play.svg && keys.play.text === '', JSON.stringify([keys.play, keys.dplay]));
    check(`${tag}: Live wie Aufnahme im Deck (Größe, Form, Icon statt Text)`, near(keys.rec, keys.drec) && keys.rec.svg && keys.rec.text === '', JSON.stringify([keys.rec, keys.drec]));
    await page.click('#pat-play');
    await page.waitForTimeout(500);
    const playing = await page.evaluate(() => { const b = document.getElementById('pat-play'); return { on: b.classList.contains('on'), pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'), stopShown: !b.querySelector('.ico-stop').hasAttribute('hidden'), playHidden: b.querySelector('.ico-play').hasAttribute('hidden'), bg: getComputedStyle(b).backgroundColor }; });
    check(`${tag}: Anhören läuft – Stopp-Symbol, Weißglut, Beschriftung „stoppen“`, playing.on && playing.pressed === 'true' && /stoppen/.test(playing.label) && playing.stopShown && playing.playHidden && playing.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(playing));
    await page.click('#pat-play');
    await page.waitForTimeout(300);
    check(`${tag}: nochmal drücken beendet das Anhören`, await page.evaluate(() => !window.loopwerk.engine.preview && document.getElementById('pat-play').getAttribute('aria-pressed') === 'false'));
    await page.click('#pat-live');
    await page.waitForTimeout(400);
    const live = await page.evaluate(() => { const b = document.getElementById('pat-live'); return { rec: b.classList.contains('recording'), pressed: b.getAttribute('aria-pressed'), bg: getComputedStyle(b).backgroundColor, run: window.loopwerk.patternEditor.looper.running, label: b.getAttribute('aria-label') }; });
    check(`${tag}: Live aktiv – rot leuchtend wie die Aufnahme im Deck`, live.run && live.rec && live.pressed === 'true' && /^rgb\((2\d\d|1[5-9]\d), /.test(live.bg) && /stoppen/.test(live.label), JSON.stringify(live));
    await page.click('#pat-live');
    await page.waitForTimeout(300);
    check(`${tag}: Live lässt sich wieder beenden`, await page.evaluate(() => !window.loopwerk.patternEditor.looper.running && !document.getElementById('pat-live').classList.contains('recording')));

    // ---------- Reihen wachsen mit der Schublade ----------
    const cellH = () => page.evaluate(() => { const c = document.querySelector('#pat-drums .pat-cell'); const d = document.getElementById('pat-drums'); return Math.round(c.getBoundingClientRect().height * 10) / 10 + '|' + d.scrollHeight + '|' + d.clientHeight; });
    const num = (s) => parseFloat(s.split('|')[0]);
    const mid = await cellH();
    const sheetTop = () => page.evaluate(() => Math.round(document.getElementById('pattern').getBoundingClientRect().top));
    const midTop = await sheetTop();
    if (handy) {
      const vis = await page.evaluate(() => { const d = document.getElementById('pat-drums').getBoundingClientRect(); return [...document.querySelectorAll('#pat-drums .pat-row-label')].filter((l) => l.getBoundingClientRect().bottom <= d.bottom + 1).length; });
      check(`${tag}: Beat bei „Mitte“: mindestens 4 Schritt-Reihen ganz sichtbar`, vis >= 4, String(vis));
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-beat-schritte-mitte.png`) });
    // Schublade ziehen gibt es nur am Handy: am Desktop liegt der Editor als Karte in der Mitte (Umbau Scheibe 4)
    if (handy) {
    const log = [];
    log.fn = cellH;
    await dragSheet(page, -(midTop - 60), log);
    const top = await cellH();
    const topTop = await sheetTop();
    check(`${tag}: Beat-Reihen werden höher, wenn die Schublade von Mitte auf oben geht`, topTop < midTop - 40 && num(top) > num(mid) + 2, `Mitte ${mid} → oben ${top} (Rand ${midTop} → ${topTop})`);
    const [, sh, ch] = top.split('|').map(Number);
    check(`${tag}: oben passen alle Reihen ohne Scrollbalken, wo der Platz reicht (oder sie stehen auf der Mindesthöhe)`, sh <= ch + 1 || num(top) <= (handy ? 44.5 : 28.5), top);
    const rmax = Math.max(...log.map((x) => num(x)));
    check(`${tag}: Reihenhöhe bleibt nach oben begrenzt (≤ 72 px)`, rmax <= 72.5 && num(top) <= 72.5, `max ${rmax}`);
    const steps = log.map((x) => num(x));
    const jump = Math.max(...steps.slice(1).map((v, i) => Math.abs(v - steps[i])));
    check(`${tag}: beim Ziehen wachsen die Reihen ohne Sprung (≤ 20 px je Schritt)`, jump <= 20, `größter Sprung ${jump} px, ${steps.join(', ')}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-beat-schritte-oben.png`) });
    // und wieder kleiner (Verkleinern ändert die Layouthöhe erst am Ende – die Reihen schrumpfen schon beim Ziehen mit)
    const log2 = [];
    log2.fn = cellH;
    await dragSheet(page, topTop > 0 ? midTop - topTop : 300, log2);
    const back = await cellH();
    const steps2 = log2.map((x) => num(x));
    const jump2 = Math.max(...steps2.slice(1).map((v, i) => Math.abs(v - steps2[i])));
    check(`${tag}: Verkleinern: Reihen schrumpfen ohne Sprung und am Ende ohne Ruck`, jump2 <= 20 && num(back) < num(top) - 2, `oben ${top} → ${back}, Sprung ${jump2}: ${steps2.join(', ')}`);

    }

    // ---------- Pads ----------
    await page.click('#pat-view .seg[data-view="pads"]');
    await page.waitForTimeout(300);
    const padH = () => page.evaluate(() => { const p = document.querySelector('#pat-pads .pat-pad'); return Math.round(p.getBoundingClientRect().height); });
    const padMid = await padH();
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-beat-pads-mitte.png`) });
    if (handy) {
      const t1 = await sheetTop();
      await dragSheet(page, -(t1 - 60));
      const padTop = await padH();
      check(`${tag}: Pads werden höher, wenn die Schublade von Mitte auf oben geht`, padTop > padMid + 2, `${padMid} → ${padTop}`);
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-beat-pads-oben.png`) });
    check(`${tag}: Pads-Ansicht: aktive Seite „Pads“ ist gefüllt`, await page.evaluate(() => { const b = document.querySelector('#pat-view .seg[data-view="pads"]'); const m = getComputedStyle(b).backgroundColor.match(/[\d.]+/g).map(Number); return b.getAttribute('aria-pressed') === 'true' && m[0] + m[1] + m[2] > 600; }));

    // ---------- Melodie ----------
    await openEditor(page, 'melody');
    const mhead = await page.evaluate(() => { const n = document.getElementById('pat-name'); return { size: parseFloat(getComputedStyle(n).fontSize), kind: document.getElementById('pat-title').textContent, w: n.getBoundingClientRect().width, view: getComputedStyle(document.getElementById('pat-view')).display, h: n.getBoundingClientRect().height }; });
    check(`${tag}: Melodie-Editor: gleicher Kopf (Name groß, „Melodie-Editor“ darüber, kein Schritte/Pads)`, mhead.size >= 20 && mhead.kind === 'Melodie-Editor' && mhead.w > 40 && mhead.view === 'none', JSON.stringify(mhead));
    const mkeys = await page.evaluate(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { w: b.width, h: b.height }; }; return { p: r('pat-play'), l: r('pat-live'), dp: r('play-btn'), dl: r('rec-btn') }; });
    check(`${tag}: Melodie: Anhören und Live in Deck-Größe`, Math.abs(mkeys.p.w - mkeys.dp.w) <= 2 && Math.abs(mkeys.l.w - mkeys.dl.w) <= 2 && Math.abs(mkeys.l.h - mkeys.dl.h) <= 2, JSON.stringify(mkeys));
    const mname = await page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].name);
    await page.click('#pat-name');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Lead');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    check(`${tag}: Melodie: Name umbenennen und Rückgängig`, await page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].name) === 'Lead' && (await page.evaluate(() => { window.loopwerk.store.undo(); return window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].name; })) === mname);
    // Zeilenhöhe: Desktop = Canvas-Höhe / 49 Töne, Handy = Höhe der Klaviertasten
    const rowNow = () => page.evaluate(() => {
      if (window.matchMedia('(max-width: 760px)').matches) return Math.round(document.querySelector('.vkey').getBoundingClientRect().height * 10) / 10;
      return Math.round(parseFloat(document.getElementById('pat-roll').style.height) / 49 * 10) / 10;
    });
    const mrMid = await rowNow();
    const mtop = await sheetTop();
    if (handy) {
      const vis = await page.evaluate(() => { const w = document.getElementById('pat-roll-wrap').getBoundingClientRect(); return [...document.querySelectorAll('#pat-vkeys .vkey')].filter((k) => { const r = k.getBoundingClientRect(); return r.top >= w.top - 1 && r.bottom <= w.bottom + 1; }).length; });
      check(`${tag}: Melodie bei „Mitte“: mindestens 10 Notenzeilen ganz sichtbar`, vis >= 10, String(vis));
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-melodie-mitte.png`) });
    if (handy) {
      await dragSheet(page, -(mtop - 60));
      const mrTop = await rowNow();
      check(`${tag}: Melodie: Zeilen der Piano-Roll werden höher, wenn die Schublade von Mitte auf oben geht`, mrTop > mrMid + 1, `${mrMid} → ${mrTop}`);
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-melodie-oben.png`) });
    if (handy) {
      // Verkleinern: die Piano-Roll geht stufenlos mit (kein Sprung am Ende), der Tonbereich bleibt am selben Ton
      const geo = () => page.evaluate(() => { const ks = [...document.querySelectorAll('#pat-vkeys .vkey')]; const w = document.getElementById('pat-roll-wrap').getBoundingClientRect(); return { row: ks[0].getBoundingClientRect().height, lo: Number(ks[ks.length - 1].dataset.pitch), n: ks.length, visible: Math.max(0, Math.min(w.bottom, innerHeight) - w.top) }; });
      const lo0 = (await geo()).lo;
      const glog = [];
      glog.fn = geo;
      await dragSheet(page, 400, glog);
      const end = await geo();
      const seq = [...glog.map((g) => g.row), end.row];
      const rowJump = Math.max(...seq.slice(1).map((v, i) => Math.abs(v - seq[i])));
      const hs = glog.map((g) => g.n * g.row);
      check(`${tag}: Melodie: beim Verkleinern geht die Piano-Roll ohne Sprung mit (≤ 6 px Zeilenhöhe je Schritt, auch am Ende)`, rowJump <= 6 && glog.some((g) => g.row !== glog[0].row), `Sprung ${rowJump.toFixed(1)}: ${seq.map((v) => v.toFixed(1)).join(', ')}`);
      check(`${tag}: Melodie: Tonbereich bleibt erhalten (tiefster Ton gleich)`, glog.every((g) => g.lo === lo0) && end.lo === lo0, `${lo0} → ${glog.map((g) => g.lo).join(',')} → ${end.lo}`);
      check(`${tag}: Melodie: Gesamthöhe der Tasten wächst nie über die sichtbare Höhe hinaus (+ 6 px)`, glog.every((g) => g.n * g.row <= g.visible + 6 + 44), hs.map((v) => v.toFixed(0)).join(','));
    }

    // ---------- Klaviertasten leuchten beim Spielen ----------
    const keySel = handy ? '#pat-vkeys .vkey[data-pitch="64"]' : '#pat-keybed .pat-key[data-pitch="64"]';
    const glow = () => page.evaluate((sel) => { const k = document.querySelector(sel); return k ? { down: k.classList.contains('down'), sh: getComputedStyle(k).boxShadow, bg: getComputedStyle(k).backgroundColor } : null; }, keySel);
    const rest0 = await glow();
    if (handy) {
      const kb = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, keySel);
      await page.mouse.move(kb.x, kb.y);
      await page.mouse.down();
    } else {
      await page.evaluate(() => window.loopwerk.patternEditor.id);
      const kb = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height - 8 }; }, keySel);
      await page.mouse.move(kb.x, kb.y);
      await page.mouse.down();
    }
    await page.waitForTimeout(120);
    const held = await glow();
    await page.mouse.up();
    await page.waitForTimeout(500);
    const freed = await glow();
    check(`${tag}: gedrückte Klaviertaste leuchtet (Klasse, Glow, andere Farbe), nach dem Loslassen aus`, rest0 && held && freed && held.down && held.sh !== 'none' && /rgb/.test(held.sh) && held.bg !== rest0.bg && !freed.down && freed.bg === rest0.bg, JSON.stringify({ rest0, held, freed }));
    if (!handy) {
      await page.keyboard.down('d');
      await page.waitForTimeout(120);
      const viaKbd = await page.evaluate(() => [...document.querySelectorAll('#pat-keybed .pat-key.down')].length);
      await page.keyboard.up('d');
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => document.querySelectorAll('#pat-keybed .pat-key.down').length);
      check(`${tag}: Computertastatur lässt die Taste leuchten und wieder los`, viaKbd === 1 && after === 0, `${viaKbd} → ${after}`);
    }
    if (SHOTS) {
      await page.mouse.move(0, 0);
    }

    // ---------- Clip-Editor ----------
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.waitForTimeout(300);
    await page.evaluate(() => { const { store, editor } = window.loopwerk; editor.open(store.track('t4').clips[0].id); });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    await page.waitForTimeout(900);
    const ce = await page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { w: b.width, h: b.height }; };
      const n = document.getElementById('ed-name');
      const tools = [...document.querySelectorAll('#editor .ed-tool')];
      return {
        kind: document.getElementById('editor-title').textContent, size: parseFloat(getComputedStyle(n).fontSize), nameW: r(n).w,
        play: r(document.getElementById('ed-play')), dplay: r(document.getElementById('play-btn')), br: [getComputedStyle(document.getElementById('ed-play')).borderRadius, getComputedStyle(document.getElementById('play-btn')).borderRadius],
        tools: tools.length, icons: tools.every((t) => t.querySelector('svg')), minTool: Math.min(...tools.map((t) => Math.min(r(t).w, r(t).h))), labels: tools.every((t) => t.getAttribute('title') || t.textContent.trim()),
        groups: [...document.querySelectorAll('#editor .ed-cutgroup')].map((g) => g.getAttribute('aria-label')),
      };
    });
    check(`${tag}: Clip-Editor: kleine Zeile „Clip-Editor“, Name groß (≥ 20 px)`, ce.kind === 'Clip-Editor' && ce.size >= 20 && ce.nameW > 40, JSON.stringify({ k: ce.kind, s: ce.size, w: ce.nameW }));
    check(`${tag}: Clip-Editor: Anhören wie Abspielen im Deck`, Math.abs(ce.play.w - ce.dplay.w) <= 2 && Math.abs(ce.play.h - ce.dplay.h) <= 2 && ce.br[0] === ce.br[1], JSON.stringify([ce.play, ce.dplay, ce.br]));
    check(`${tag}: Clip-Editor: zehn Werkzeuge (mit Entrauschen) mit Icon und Titel${handy ? ', ≥ 44 px' : ''}`, ce.tools === 10 && ce.icons && ce.labels && JSON.stringify(ce.groups) === '["Auswahl","Säubern","Bearbeiten"]' && (!handy || ce.minTool >= 43.5), JSON.stringify(ce));
    const waveH = () => page.evaluate(() => Math.round(document.getElementById('ed-wave').getBoundingClientRect().height));
    const wMid = await waveH();
    if (handy) check(`${tag}: Clip-Editor bei „Mitte“: Wellenform mindestens 160 px hoch`, wMid >= 160, `${wMid} px`);
    if (handy) {
      const strip = await page.evaluate(() => { const c = document.querySelector('#editor .ed-cuts'); const t = [...c.querySelectorAll('.ed-tool')]; return { oneRow: new Set(t.map((x) => Math.round(x.getBoundingClientRect().top))).size === 1, scrolls: c.scrollWidth > c.clientWidth + 4, masked: getComputedStyle(c).maskImage !== 'none', over: document.documentElement.scrollWidth - innerWidth }; });
      check(`${tag}: Clip-Editor: Werkzeuge in einer wischbaren Zeile mit ausblendendem Rand`, strip.oneRow && strip.scrolls && strip.masked && strip.over <= 0, JSON.stringify(strip));
      if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-clip-mitte.png`) });
    }
    if (handy) {
    const eTop = await page.evaluate(() => Math.round(document.getElementById('editor').getBoundingClientRect().top));
    const wlog = [];
    wlog.fn = waveH;
    const g2 = await page.evaluate(() => { const r = document.querySelector('#editor > .sheet-grip').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 9 }; });
    await page.mouse.move(g2.x, g2.y);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) { await page.mouse.move(g2.x, g2.y - ((eTop - 60) * i) / 14); await page.waitForTimeout(40); wlog.push(await waveH()); }
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(900);
    const wTop = await waveH();
    const wFrac = await page.evaluate(() => { const w = document.getElementById('ed-wave').getBoundingClientRect(); const s = document.getElementById('editor').getBoundingClientRect(); const more = document.getElementById('clip-more').getBoundingClientRect(); return { waveBottom: Math.round(w.bottom), moreTop: Math.round(more.top), sheetBottom: Math.round(s.bottom) }; });
    check(`${tag}: Clip-Editor: Wellenform wird höher, wenn die Schublade von Mitte auf oben geht und füllt das Fach`, wTop > wMid + 60 && wFrac.waveBottom <= wFrac.moreTop && wlog.every((v, i) => i === 0 || v >= wlog[i - 1] - 1), `${wMid} → ${wTop}, ${JSON.stringify(wFrac)}, ${wlog.join(',')}`);
    } else {
      // Karte in der Mitte: Wellenform hat Höhe und liegt über „Mehr“
      const wf = await page.evaluate(() => ({ h: Math.round(document.getElementById('ed-wave').getBoundingClientRect().height), b: document.getElementById('ed-wave').getBoundingClientRect().bottom, m: document.getElementById('clip-more').getBoundingClientRect().top }));
      check(`${tag}: Clip-Editor (Karte): Wellenform mindestens 160 px hoch, über „Mehr“`, wf.h >= 160 && wf.b <= wf.m, JSON.stringify(wf));
    }
    const ed = await page.evaluate(() => { const c = document.getElementById('ed-wave'); return { w: c.clientWidth, h: c.clientHeight, cw: c.width, ch: c.height, dpr: window.devicePixelRatio || 1 }; });
    check(`${tag}: Clip-Editor: Zeichenfläche passt zur Größe (kein verzerrtes Bild)`, Math.abs(ed.ch - Math.round(ed.h * ed.dpr)) <= 1 && Math.abs(ed.cw - Math.round(ed.w * ed.dpr)) <= 1, JSON.stringify(ed));
    await page.click('#clip-more');
    const more = await page.evaluate(() => [...document.querySelectorAll('#editor .ed-group')].filter((g) => g.offsetParent).map((g) => g.getAttribute('aria-label')));
    check(`${tag}: Clip-Editor: „Mehr“ klappt Tonhöhe, Autotune, Rauschen, Trennen, Loop auf`, JSON.stringify(more.slice(3)) === '["Tonhöhe","Autotune","Rauschen","Trennen","Loop"]', JSON.stringify(more));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-clip-oben-mehr.png`) });
    await page.click('#clip-more');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `editor-kopf-${tag}-clip-oben.png`) });

    // ---------- Allgemein ----------
    const over = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, dock: document.getElementById('pattern').scrollWidth - document.getElementById('pattern').clientWidth }));
    check(`${tag}: kein waagrechtes Scrollen`, over.doc <= 0 && over.dock <= 1, JSON.stringify(over));
    check(`${tag}: keine Konsolenfehler`, app.errors.length === 0, app.errors.join(' | '));
  } finally {
    await app.close();
  }
}

(async () => {
  for (const v of VPS) await run(v);
  finish();
})();
