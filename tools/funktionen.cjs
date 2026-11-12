// Funktionsliste der Oberfläche: jede Bedienfunktion mit Kennung, Beschriftung, Art und Ort je Edition und Gerät.
// Wozu: Grundlage für den Umbau (docs/umbau/uebergabe.md) und Nachweis, dass dabei keine Funktion verloren geht.
// Aufruf:   node tools/funktionen.cjs [--out docs/umbau/funktionen] [--edition a,b] [--geraet a,b]
//           node tools/funktionen.cjs --vergleich <vorher.json> [--out <pfad>]
// Beispiel: node tools/funktionen.cjs --out /tmp/nachher/funktionen --vergleich docs/umbau/funktionen.json
// Ausgabe:  <out>.json und <out>.md; mit --vergleich dazu <out>-vergleich.md.
// Exit-Code: 0 = Liste geschrieben (und im Vergleich fehlt nichts), 1 = Fehler oder im Vergleich fehlt eine Funktion.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HILFE = `Funktionsliste der Oberfläche (Loopwerk und Krachwerk, Desktop 1440x900 und Handy 390x844).

Aufruf: node tools/funktionen.cjs [Optionen]
  --out <pfad>           Zielpfad ohne Endung (Voreinstellung docs/umbau/funktionen → .json und .md)
  --edition a,b          loopwerk, krachwerk (Voreinstellung beide)
  --geraet a,b           desktop, handy (Voreinstellung beide)
  --vergleich <json>     früheren Stand vergleichen: was fehlt, was ist neu, was ist umgezogen
                         (schreibt <out>-vergleich.md; Exit 1, wenn eine Funktion irgendwo nicht mehr erreichbar ist)
  --nur-vergleich <json> wie --vergleich, aber ohne neu zu messen: vergleicht mit dem Stand unter --out
  --help                 diese Hilfe

Das Skript geht die Szenen aus tools/shots.cjs durch und öffnet dazu Menüs und Fächer (Projekt-Menü, Aufnahme-Feld,
Kürzel-Liste, Erstellen, Spur-Menü, FX-Pad, Tempo, Song). Eine Funktion gilt als erreichbar, wenn sie in mindestens
einem dieser Zustände zu sehen ist (auch nach Scrollen in ihrer Liste). Tastenkürzel und Gesten kommen aus der
Kürzel-Liste der Seite; Kürzel, die nur im Code stehen, ergänzt die Tabelle NUR_IM_CODE (geprüft gegen src/main.js).
Exit-Code: 0 = geschrieben und nichts fehlt, 1 = Fehler oder im Vergleich fehlt etwas.`;

const ROOT = path.join(__dirname, '..');

function args() {
  const a = process.argv.slice(2);
  if (a.includes('--help') || a.includes('-h')) { console.log(HILFE); process.exit(0); }
  const o = { out: 'docs/umbau/funktionen' };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (!a[i].startsWith('--') || !['out', 'edition', 'geraet', 'vergleich', 'nur-vergleich'].includes(k)) fail(`Unbekannte Option ${a[i]} (siehe --help)`);
    o[k] = a[++i];
    if (o[k] == null) fail(`--${k} braucht einen Wert`);
  }
  const list = (v, all, name) => {
    const l = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : all;
    const bad = l.filter((x) => !all.includes(x));
    if (bad.length) fail(`${name}: unbekannt ${bad.join(', ')} (erlaubt: ${all.join(', ')})`);
    return l;
  };
  o.editionen = list(o.edition, ['loopwerk', 'krachwerk'], '--edition');
  o.geraete = list(o.geraet, ['desktop', 'handy'], '--geraet');
  o.out = path.resolve(o.out);
  return o;
}
function fail(msg) { console.error('Fehler: ' + msg); process.exit(1); }

// Kürzel, die im Code stehen, aber nicht in der Kürzel-Liste der Seite. probe: muss in src/main.js vorkommen.
const NUR_IM_CODE = [
  { taste: 'Strg+Y', wirkung: 'Wiederholen (wie Strg+⇧+Z)', probe: /mod && key === 'y'/ },
  { taste: 'Rücktaste', wirkung: 'Clip löschen (wie Entf)', probe: /e\.key === 'Backspace'/ },
  { taste: 'F / ⇧+F', wirkung: 'Festhalten: Auswahl, Loop oder gewählte Spur (Umschalt: nur in die Kiste); nur Krachwerk', probe: /key === 'f' && bounce/ },
  { taste: 'Alt+↑ / Alt+↓', wirkung: 'Take-Clip: voriger bzw. nächster Take', probe: /stepTake\(store, library, ui\.selectedClipId/ },
];

// ---- läuft im Browser: alle Bedienelemente mit Kennung, Beschriftung, Art, Ort, Sichtbarkeit ----
function sammeln() {
  const vw = innerWidth, vh = innerHeight;
  const CONTROLS = 'button, input:not([type=hidden]):not([type=file]), select, textarea, a[href], [role=button], [role=slider], [role=tab], [role=option], [role=menuitem], [role=switch], [role=checkbox], [draggable=true]:not(.clip), [contenteditable=true]';
  // innerster Treffer gewinnt
  const ORTE = [
    ['.side .insp-for-datei', 'Reiter Datei'], ['.side .insp-for-mixer', 'Reiter Mixer'], ['.side-tabs', 'Deck (Reiter rechts)'], ['#side-datei', 'Reiter Datei'], ['#side-datei-foot', 'Reiter Datei'], ['#side-mixer', 'Reiter Mixer'],
    ['#project-menu', 'Projekt-Menü'], ['#rec-pop', 'Aufnahme-Feld am ●'], ['#keys-pop', 'Kürzel- und Gesten-Liste'],
    ['#link-pop', 'Feld „Aus dem Netz holen“'], ['.track-menu', 'Spur-Menü ⋯'], ['.chord-pop', 'Akkord-Feld'], ['.key-pop', 'Tonart-Feld'],
    ['.auto-keys', 'Kurven-Feld'], ['.tip', 'Tipp'], ['#hint', 'Einblender'], ['#clip-float', 'Werkzeug am Clip'], ['#clipbar', 'Clipleiste'],
    ['.wb', 'Werkbank'], ['#starter', 'Song-Starter'], ['#create-panel', 'Erstellen'], ['#shelf-sticky', 'Regal (Suchzeile)'],
    ['#insp-song-tools', 'Inspektor Song (Werkzeuge)'], ['.insp-sec.insp-clip', 'Inspektor Clip'], ['.insp-sec.insp-track', 'Inspektor Spur'],
    ['.insp-sec.insp-song', 'Inspektor Song'], ['.insp-sec', 'Inspektor Song'], ['#insp', 'Inspektor'],
    ['#arr-pills', 'Pillen über den Spuren'], ['#arr-bar', 'Arranger-Leiste'], ['.track-head', 'Spurkopf'], ['.ruler', 'Lineal'], ['#arr-wrap', 'Arranger'],
    ['#mixer', 'Fach Mixer'], ['#editor', 'Fach Editor (Sample-Editor)'], ['#pattern', 'Fach Editor (Beat/Melodie)'], ['#export', 'Fach Export'],
    ['#fxpad', 'Fach FX-Pad'], ['#tempo', 'Fach Tempo'], ['#song', 'Fach Song'], ['#werkbank', 'Werkbank'], ['#tabbar', 'Fachleiste'],
    ['.side-sounds > .shelf', 'Reiter Sounds'], ['.shelf', 'Regal'], ['.deck', 'Deck'], ['.arranger', 'Arranger'],
  ];
  // Wiederholte Dinge (je Spur, je Sound, je Schritt): eine Funktion, nicht hundert
  const REIHE = '[data-sample-id], [data-clip-id], [data-track-id], [data-strip-id], .track-head, .track-row, .loop-row, .fxl-item, .pat-row, .pat-cell, .pad, .take-row';
  const ZUSTAND = /^(active|on|off|sel|selected|open|armed|playing|disabled|muted|solo|current|is-.*|has-.*|busy|done|hot|dim|empty|live|cat-.*|c-.*|placed)$/;
  const FEST = ['data-create', 'data-left', 'data-len', 'data-sort', 'data-speed', 'data-input', 'data-style', 'data-view', 'data-mode', 'data-tab', 'data-act', 'data-fx', 'data-tool', 'data-dock', 'data-part'];

  const rendered = (el) => {
    if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') return false;
    // das Element selbst darf durchsichtig sein (Eingabefeld unter seinem Drehknopf), seine Umgebung nicht
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (Number(getComputedStyle(p).opacity) === 0) return false;
    return true;
  };
  const imBild = (r) => r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  const treffer = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(x, y);
    if (!hit) return false;
    if (hit === el || el.contains(hit) || hit.contains(el) || hit.closest('label')?.contains(el)) return true;
    const haus = el.parentElement; // Regler unter seiner Zierfläche (Drehknopf) im selben kleinen Gehäuse
    return !!haus && haus.children.length <= 4 && haus.contains(hit);
  };
  // 'sichtbar' = im Bild und nicht verdeckt; 'scrollen' = in einer sichtbaren Liste, nach Scrollen zu sehen
  const sicht = (el) => {
    if (!rendered(el)) return null;
    const r = el.getBoundingClientRect();
    // in der Karte (#side) kann ein Bedienelement im Bild liegen, aber vom Rand des rollenden Bereichs abgeschnitten sein: dann zählt das Rollen
    if (imBild(r)) { if (treffer(el)) return 'sichtbar'; if (!el.closest('.side')) return null; }
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const rollt = /(auto|scroll)/.test(cs.overflowX + cs.overflowY) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1);
      if (rollt) { const pr = p.getBoundingClientRect(); return imBild(pr) && treffer(p) ? 'scrollen' : null; }
    }
    return null;
  };
  const kurz = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  // Text aus den Textknoten (innerText hinge von Großschreibung per CSS und von der Sichtbarkeit ab)
  const worte = (el) => { const t = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (n.textContent.trim() && !n.parentElement.closest('svg')) t.push(n.textContent.trim()); return t.join(' '); };
  const out = [];
  for (const el of document.querySelectorAll(CONTROLS)) {
    if (el.closest('[data-off]')) continue; // Fläche in dieser Edition aus
    let ort = 'Seite', p = el;
    outer: for (; p && p !== document.documentElement; p = p.parentElement) for (const [sel, name] of ORTE) if (p.matches(sel)) { ort = name; break outer; }
    const pfad = [];
    for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) if (q.id && q.id !== 'app') pfad.unshift(q.id);
    const tag = el.tagName.toLowerCase();
    const art = el.getAttribute('role') || (tag === 'input' ? `input:${el.type}` : tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : el.draggable ? 'ziehbar' : tag);
    const text = kurz(tag === 'select' || tag === 'textarea' ? '' : worte(el));
    const title = kurz(el.getAttribute('title'));
    const aria = kurz(el.getAttribute('aria-label'));
    const feld = kurz(el.labels?.[0]?.innerText || el.getAttribute('placeholder') || '');
    const name = aria || title || text || feld;
    const reihe = !!el.closest(REIHE);
    let kennung;
    if (el.id && !/\d{3,}/.test(el.id)) kennung = '#' + (reihe ? el.id.replace(/-(t|g|bus)\d+\b/, '-$1#') : el.id); // je Spur: eine Funktion
    else {
      const cls = [...el.classList].filter((c) => !ZUSTAND.test(c)).sort().join('.');
      const data = FEST.filter((a) => el.hasAttribute(a)).map((a) => `[${a}=${el.getAttribute(a)}]`).join('');
      const anker = pfad.length ? '#' + pfad[pfad.length - 1].replace(/^shelf-items-.*/, 'library') : ORTE.find(([s]) => el.closest(s))?.[0] || '';
      kennung = `${anker} ${tag}${cls ? '.' + cls : ''}${data}`.trim();
      // ohne festes Merkmal unterscheidet die Beschriftung (Ziffern und Namen in Reihen zählen nicht)
      if (!data && !reihe && name) kennung += ` „${name.replace(/\d+([.,]\d+)?/g, '#')}“`;
      else if (!data && reihe) { const n = (text.length <= 3 ? text : '') || ''; if (n) kennung += ` „${n.replace(/\d+/g, '#')}“`; }
    }
    const s = sicht(el);
    // Aufklapper: was das Skript von sich aus öffnet (zugeklappte Bereiche, nicht gewählte Reiter)
    const auf = !!s && !el.disabled && !el.closest('.deck, #tabbar, .track-head, .loop-row, .ltab, .side-tabs, #hint, .tip') && (el.getAttribute('aria-expanded') === 'false' || (el.getAttribute('role') === 'tab' && el.getAttribute('aria-selected') === 'false') || el.matches('#pat-sing-btn, #cb-levels, #select-btn'));
    if (auf && !el.dataset.fnAuf) el.dataset.fnAuf = String(window.__fnAuf = (window.__fnAuf || 0) + 1);
    out.push({ kennung, text, title, aria, feld, art, ort, pfad: pfad.join(' > '), sicht: s, aus: !!el.disabled, auf: auf ? el.dataset.fnAuf : null });
  }
  return out;
}

// Kürzel und Gesten aus der Liste der Seite (#keys-pop)
function kuerzelLesen() {
  const lies = (sel) => [...document.querySelectorAll(`#keys-pop ${sel} dt`)].filter((dt) => !dt.hasAttribute('data-off')).map((dt) => {
    const teile = [...dt.childNodes].map((n) => (n.nodeType === 3 ? n.textContent.trim() : n.classList?.contains('key-or') ? ' / ' : n.textContent.trim())).filter(Boolean);
    let taste = '';
    for (const t of teile) taste += t === ' / ' ? ' / ' : (taste && !taste.endsWith(' / ') ? '+' : '') + t;
    return { taste, wirkung: (dt.nextElementSibling?.textContent || '').replace(/\s+/g, ' ').trim() };
  });
  return { tasten: lies('.for-mouse'), gesten: lies('.for-touch') };
}

// ---- Zustände zusätzlich zu den Szenen aus shots.cjs: Menüs und Fächer öffnen ----
const klick = (page, sel) => page.evaluate((s) => { const n = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length && !x.disabled); if (n) n.click(); return !!n; }, sel);
function zustaende(S) {
  const dock = (name) => async (page) => {
    await S.ruhe(page);
    const ok = await page.evaluate((n) => { try { window.loopwerk.ui.setDock(n); } catch { return false; } return window.loopwerk.ui.dock === n; }, name);
    await page.waitForTimeout(900);
    return ok ? null : `Fach „${name}“ ging nicht auf`;
  };
  const feld = (sel, was) => async (page) => {
    await S.ruhe(page);
    if (!(await klick(page, sel))) return `${was}: Knopf hier nicht zu sehen`;
    await page.waitForTimeout(600);
    return null;
  };
  const reiter = (id) => async (page) => {
    await S.ruhe(page);
    // ein Klick auf den gewählten Reiter klappt die Karte zu: nur klicken, wenn er nicht gewählt ist
    const da = await page.evaluate((i) => { const b = document.getElementById(`side-tab-${i}`); if (!b || !b.getClientRects().length) return false; if (b.getAttribute('aria-selected') !== 'true') b.click(); return true; }, id);
    if (!da) return 'nur Aufräumen';
    await page.waitForTimeout(600);
    return null;
  };
  return {
    ...S.SZENE,
    'projekt-menue': feld('#project-menu-btn', 'Projekt-Menü'),
    'aufnahme-feld': feld('#rec-more', 'Aufnahme-Feld'),
    kuerzel: feld('#keys-btn', 'Kürzel-Liste'),
    async regal(page) { await S.ruhe(page); await klick(page, '#tab-sounds'); await page.waitForTimeout(900); return null; },
    async erstellen(page) {
      await S.ruhe(page);
      await klick(page, '#tab-sounds');
      await page.waitForTimeout(600);
      if (!(await klick(page, '#ltab-create, #shelf-new'))) return 'Erstellen: kein Einstieg zu sehen';
      await page.waitForTimeout(700);
      return null;
    },
    async 'erstellen-zu'(page) { // „+ Neu“ ist ein Umschalter: zurück auf Sounds, damit die folgenden Szenen stimmen
      await page.evaluate(() => { const b = document.getElementById('shelf-new'); if (b?.getAttribute('aria-pressed') === 'true') b.click(); else document.getElementById('ltab-sounds')?.click(); });
      return 'nur Aufräumen';
    },
    async spur(page) {
      await S.ruhe(page);
      // alle Effekte der ersten Spur an, damit ihre Regler zu sehen sind
      await page.evaluate(async () => {
        const lw = window.loopwerk;
        const t = lw.store.project.tracks[0];
        try { const { EFFECT_IDS } = await import('./src/effects.js'); for (const fx of EFFECT_IDS) lw.store.setTrackFx(t.id, fx, { on: true }); } catch { /* dann ohne Regler */ }
        lw.ui.selectTrack(t.id);
      });
      await page.waitForTimeout(700);
      return null;
    },
    // Layout „reiter“ (nur Loopwerk-Desktop): je Reiter ein Zustand; anderswo gibt es die Reiter nicht
    'reiter-datei': reiter('datei'),
    'reiter-mixer': reiter('mixer'),
    'reiter-sounds': reiter('sounds'),
    'spur-menue': feld('.track-head .tbtn-menu', 'Spur-Menü'),
    fxpad: dock('fxpad'),
    tempo: dock('tempo'),
    'song-fach': dock('song'),
  };
}
const ABLAUF = ['start', 'projekt-menue', 'aufnahme-feld', 'kuerzel', 'regal', 'erstellen', 'erstellen-zu', 'song', 'reiter-datei', 'reiter-mixer', 'reiter-sounds', 'clip', 'spur', 'spur-menue', 'clip-editor', 'werkbank', 'mixer', 'mastering', 'export', 'fxpad', 'tempo', 'song-fach', 'beat', 'melodie'];

async function messen(o) {
  const { chromium } = require('playwright');
  const { start } = require('../tests/serve.cjs');
  const S = require('./shots.cjs');
  const Z = zustaende(S);
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const fn = new Map(); // kennung → Eintrag
  const kombis = [];
  const uebersprungen = [];
  const kuerzel = {};
  try {
    for (const ed of o.editionen) for (const dev of o.geraete) {
      const kombi = `${ed}-${dev}`;
      kombis.push(kombi);
      const ctx = await browser.newContext({ ...S.GERAETE[dev] });
      const page = await ctx.newPage();
      page.setDefaultTimeout(60000);
      await page.goto(ed === 'krachwerk' ? `${base}/werkstatt/` : `${base}/`);
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 60000 });
      if (ed === 'loopwerk') await page.evaluate(() => window.loopwerk.library.catalogReady);
      await page.waitForTimeout(1200);
      kuerzel[kombi] = await page.evaluate(kuerzelLesen);
      for (const sz of ABLAUF) {
        let grund;
        try { grund = await Z[sz](page, ed, dev); } catch (e) { grund = `Fehler: ${e.message.split('\n')[0]}`; }
        if (grund) { if (grund !== 'nur Aufräumen') uebersprungen.push(`${kombi}-${sz}: ${grund}`); continue; }
        const zahl = new Map();
        const merken = (liste, wo) => {
          for (const e of liste) {
            let f = fn.get(e.kennung);
            if (!f) fn.set(e.kennung, f = { kennung: e.kennung, beschriftung: '', titel: '', aria: '', feld: '', art: e.art, anzahl: 1, wo: {} });
            for (const [k, v] of [['beschriftung', e.text], ['titel', e.title], ['aria', e.aria], ['feld', e.feld]]) if (!f[k] && v) f[k] = v;
            const w = f.wo[kombi] ||= { erreichbar: false, orte: [], szenen: [], imDom: [] };
            if (!w.imDom.includes(e.ort)) w.imDom.push(e.ort);
            if (e.sicht) {
              w.erreichbar = true;
              if (!w.orte.includes(e.ort)) w.orte.push(e.ort);
              if (!w.szenen.includes(wo)) w.szenen.push(wo);
              zahl.set(e.kennung, (zahl.get(e.kennung) || 0) + 1);
            }
          }
          for (const [k, n] of zahl) fn.get(k).anzahl = Math.max(fn.get(k).anzahl, n);
          zahl.clear();
        };
        // Aufklapper je einmal öffnen, einsammeln, wieder schließen (je Kennung nur einmal, zwei Ebenen tief)
        const offen = new Set();
        const runde = async (wo, tiefe, schon = new Set()) => {
          const liste = await page.evaluate(sammeln);
          merken(liste, wo);
          if (tiefe > 3) return;
          const hier = new Set(liste.map((e) => e.auf).filter(Boolean));
          for (const e of liste) {
            if (!e.auf || schon.has(e.auf) || offen.has(e.kennung)) continue; // Geschwister öffnet die Ebene darüber
            offen.add(e.kennung);
            const ging = await page.evaluate((n) => { const el = document.querySelector(`[data-fn-auf="${n}"]`); if (!el || !el.getClientRects().length || el.disabled) return false; el.click(); return true; }, e.auf);
            if (!ging) continue;
            await page.waitForTimeout(350);
            await runde(`${wo} › ${e.text || e.aria || e.kennung}`, tiefe + 1, new Set([...schon, ...hier]));
            await page.evaluate((n) => { const el = document.querySelector(`[data-fn-auf="${n}"]`); if (el && (el.getAttribute('aria-expanded') === 'true' || el.getAttribute('aria-pressed') === 'true')) el.click(); }, e.auf).catch(() => {});
            await page.waitForTimeout(150);
          }
        };
        await runde(sz, 1);
        await page.keyboard.press('Escape').catch(() => {});
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const nurCode = NUR_IM_CODE.map((k) => ({ taste: k.taste, wirkung: k.wirkung, imCode: k.probe.test(main) }));
  let commit = '';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* ohne Git */ }
  const funktionen = [...fn.values()].sort((a, b) => a.kennung.localeCompare(b.kennung, 'de'));
  // szenen: nur die Grundszene, in der die Funktion zu sehen ist (das Aufgeklappte dahinter bläht die Datei nur auf)
  for (const f of funktionen) for (const w of Object.values(f.wo)) { w.orte.sort(); w.imDom.sort(); w.szenen = [...new Set(w.szenen.map((x) => x.split(' › ')[0]))]; }
  return { commit, kombis, funktionen, kuerzel, nurCode, uebersprungen };
}

// ---- Ausgabe ----
const name = (f) => f.beschriftung || f.aria || f.titel || f.feld || '(ohne Beschriftung)';
const zelle = (f, k) => { const w = f.wo[k]; return !w ? '–' : w.erreichbar ? w.orte.join(' · ') : `(versteckt: ${w.imDom.join(' · ')})`; };
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const KURZ = { 'loopwerk-desktop': 'Loopwerk Desktop', 'loopwerk-handy': 'Loopwerk Handy', 'krachwerk-desktop': 'Krachwerk Desktop', 'krachwerk-handy': 'Krachwerk Handy' };

function markdown(d) {
  const K = d.kombis;
  const L = [];
  L.push('# Funktionsliste der Oberfläche', '');
  L.push(`Erzeugt von \`tools/funktionen.cjs\`${d.commit ? ` (Stand ${d.commit})` : ''}. Nicht von Hand ändern, sondern neu erzeugen.`, '');
  L.push('Eine Zeile ist eine Bedienfunktion. Die Spalten je Gerät nennen den Ort, an dem sie zu sehen ist. „(versteckt: …)“ heißt: Das Element steht dort im Aufbau der Seite, war aber in keinem geprüften Zustand zu sehen. „–“ heißt: gibt es dort nicht. „×n“ heißt: wiederholt sich (je Spur, je Sound, je Schritt).', '');
  L.push('## Überblick', '', '| | ' + K.map((k) => KURZ[k]).join(' | ') + ' |', '|---|' + K.map(() => '---:').join('|') + '|');
  L.push('| erreichbare Funktionen | ' + K.map((k) => d.funktionen.filter((f) => f.wo[k]?.erreichbar).length).join(' | ') + ' |');
  L.push('| versteckt (nur im Aufbau der Seite) | ' + K.map((k) => d.funktionen.filter((f) => f.wo[k] && !f.wo[k].erreichbar).length).join(' | ') + ' |', '');
  L.push(`Funktionen insgesamt: ${d.funktionen.length}.`, '');

  // nach Ort gruppieren: erster Ort der ersten Kombination, in der die Funktion erreichbar ist
  const gruppe = (f) => { for (const k of K) if (f.wo[k]?.erreichbar) return f.wo[k].orte[0]; return 'Nirgends zu sehen'; };
  const gruppen = new Map();
  for (const f of d.funktionen) { const g = gruppe(f); if (!gruppen.has(g)) gruppen.set(g, []); gruppen.get(g).push(f); }
  L.push('## Funktionen nach heutigem Ort', '');
  for (const g of [...gruppen.keys()].sort((a, b) => (a === 'Nirgends zu sehen') - (b === 'Nirgends zu sehen') || a.localeCompare(b, 'de'))) {
    const fs_ = gruppen.get(g);
    L.push(`### ${g} (${fs_.length})`, '', '| Funktion | Kennung | Art | ' + K.map((k) => KURZ[k]).join(' | ') + ' |', '|---|---|---|' + K.map(() => '---').join('|') + '|');
    for (const f of fs_) {
      const hinweis = [f.titel, f.aria].filter((x) => x && x !== name(f))[0];
      L.push(`| ${esc(name(f))}${f.anzahl > 1 ? ` ×${f.anzahl}` : ''}${hinweis ? `<br><small>${esc(hinweis)}</small>` : ''} | \`${esc(f.kennung)}\` | ${f.art} | ${K.map((k) => esc(zelle(f, k))).join(' | ')} |`);
    }
    L.push('');
  }
  // Unterschiede je Gerät
  for (const ed of ['loopwerk', 'krachwerk']) {
    const a = `${ed}-desktop`, b = `${ed}-handy`;
    if (!K.includes(a) || !K.includes(b)) continue;
    const zeile = (f) => `- ${name(f)} (\`${f.kennung}\`)`;
    const nurA = d.funktionen.filter((f) => f.wo[a]?.erreichbar && !f.wo[b]?.erreichbar);
    const nurB = d.funktionen.filter((f) => f.wo[b]?.erreichbar && !f.wo[a]?.erreichbar);
    const anders = d.funktionen.filter((f) => f.wo[a]?.erreichbar && f.wo[b]?.erreichbar && f.wo[a].orte.join() !== f.wo[b].orte.join());
    L.push(`## ${ed === 'loopwerk' ? 'Loopwerk' : 'Krachwerk'}: Desktop und Handy im Vergleich`, '');
    L.push(`### Nur am Desktop zu sehen (${nurA.length})`, '', ...nurA.map((f) => `${zeile(f)}: ${f.wo[a].orte.join(' · ')}`), '');
    L.push(`### Nur am Handy zu sehen (${nurB.length})`, '', ...nurB.map((f) => `${zeile(f)}: ${f.wo[b].orte.join(' · ')}`), '');
    L.push(`### An anderem Ort (${anders.length})`, '', '| Funktion | Desktop | Handy |', '|---|---|---|', ...anders.map((f) => `| ${esc(name(f))} (\`${esc(f.kennung)}\`) | ${esc(f.wo[a].orte.join(' · '))} | ${esc(f.wo[b].orte.join(' · '))} |`), '');
  }
  // Kürzel und Gesten (nicht im Aufbau der Seite als Knopf)
  const k0 = d.kuerzel[K.find((k) => k.endsWith('desktop')) || K[0]];
  L.push('## Tastenkürzel', '', 'Aus der Kürzel-Liste der Seite (`#keys-pop`).', '', '| Taste | Wirkung |', '|---|---|', ...k0.tasten.map((t) => `| ${esc(t.taste)} | ${esc(t.wirkung)} |`), '');
  L.push('Nur im Code, nicht in der Liste (`src/main.js`):', '', '| Taste | Wirkung | im Code gefunden |', '|---|---|---|', ...d.nurCode.map((t) => `| ${esc(t.taste)} | ${esc(t.wirkung)} | ${t.imCode ? 'ja' : 'NEIN – prüfen'} |`), '');
  L.push('## Gesten', '', 'Aus der Gesten-Liste der Seite (`#keys-pop`).', '', '| Geste | Wirkung |', '|---|---|', ...k0.gesten.map((t) => `| ${esc(t.taste)} | ${esc(t.wirkung)} |`), '');
  const ab = K.filter((k) => JSON.stringify(d.kuerzel[k]) !== JSON.stringify(k0));
  if (ab.length) L.push(`Abweichende Listen: ${ab.map((k) => KURZ[k]).join(', ')} (siehe JSON, Schlüssel \`kuerzel\`).`, '');
  if (d.uebersprungen.length) L.push('## Nicht hergestellte Zustände', '', ...d.uebersprungen.map((u) => `- ${u}`), '');
  return L.join('\n');
}

function vergleichen(vor, nach) {
  const A = new Map(vor.funktionen.map((f) => [f.kennung, f]));
  const B = new Map(nach.funktionen.map((f) => [f.kennung, f]));
  const K = nach.kombis.filter((k) => vor.kombis.includes(k));
  const fehlt = [], neu = [], umgezogen = [];
  for (const [k, f] of A) for (const c of K) {
    if (!f.wo[c]?.erreichbar) continue;
    const g = B.get(k)?.wo[c];
    if (!g?.erreichbar) fehlt.push({ f, c, jetzt: !B.has(k) ? 'Kennung gibt es nicht mehr' : g ? `versteckt in ${g.imDom.join(' · ')}` : 'hier nicht mehr vorhanden' });
    else if (g.orte.join() !== f.wo[c].orte.join()) umgezogen.push({ f, c, von: f.wo[c].orte.join(' · '), nach: g.orte.join(' · ') });
  }
  for (const [k, f] of B) for (const c of K) if (f.wo[c]?.erreichbar && !A.get(k)?.wo[c]?.erreichbar) neu.push({ f, c });
  const tasten = (d) => new Set(Object.values(d.kuerzel).flatMap((x) => [...x.tasten, ...x.gesten].map((t) => `${t.taste} → ${t.wirkung}`)));
  const tA = tasten(vor), tB = tasten(nach);
  const kFehlt = [...tA].filter((t) => !tB.has(t));
  const L = ['# Funktionsvergleich', '', `Vorher: ${vor.commit || '?'} · Nachher: ${nach.commit || '?'} · geprüft: ${K.map((k) => KURZ[k]).join(', ')}`, ''];
  L.push(`## Fehlt (${fehlt.length})`, '', fehlt.length ? 'Vorher zu sehen, jetzt nicht mehr. Das darf nach Regel 1 nicht sein (oder die Kennung hat sich geändert).' : 'Nichts. Jede vorher erreichbare Funktion ist weiter erreichbar.', '');
  for (const x of fehlt) L.push(`- **${name(x.f)}** (\`${x.f.kennung}\`) · ${KURZ[x.c]} · vorher: ${x.f.wo[x.c].orte.join(' · ')} · jetzt: ${x.jetzt}`);
  L.push('', `## Kürzel und Gesten, die fehlen (${kFehlt.length})`, '', ...kFehlt.map((t) => `- ${t}`), '');
  L.push(`## Umgezogen (${umgezogen.length})`, '', '| Funktion | Gerät | vorher | jetzt |', '|---|---|---|---|', ...umgezogen.map((x) => `| ${esc(name(x.f))} (\`${esc(x.f.kennung)}\`) | ${KURZ[x.c]} | ${esc(x.von)} | ${esc(x.nach)} |`), '');
  L.push(`## Neu zu sehen (${neu.length})`, '', ...neu.map((x) => `- ${name(x.f)} (\`${x.f.kennung}\`) · ${KURZ[x.c]} · ${x.f.wo[x.c].orte.join(' · ')}`), '');
  return { text: L.join('\n'), fehlt: fehlt.length + kFehlt.length, umgezogen: umgezogen.length, neu: neu.length };
}

async function main() {
  const o = args();
  let d;
  if (o['nur-vergleich']) {
    if (!fs.existsSync(o.out + '.json')) fail(`${o.out}.json fehlt (erst ohne --nur-vergleich messen)`);
    d = JSON.parse(fs.readFileSync(o.out + '.json', 'utf8'));
  } else {
    d = await messen(o);
    fs.mkdirSync(path.dirname(o.out), { recursive: true });
    fs.writeFileSync(o.out + '.json', JSON.stringify(d, null, 1) + '\n');
    fs.writeFileSync(o.out + '.md', markdown(d) + '\n');
    console.log(`${d.funktionen.length} Funktionen → ${path.relative(process.cwd(), o.out)}.json und .md`);
    for (const k of d.kombis) console.log(`  ${KURZ[k]}: ${d.funktionen.filter((f) => f.wo[k]?.erreichbar).length} erreichbar, ${d.funktionen.filter((f) => f.wo[k] && !f.wo[k].erreichbar).length} versteckt`);
    if (d.uebersprungen.length) { console.log('Nicht hergestellt:'); for (const u of d.uebersprungen) console.log('  ' + u); }
    const weg = d.nurCode.filter((k) => !k.imCode);
    if (weg.length) console.log(`Achtung: Kürzel nicht mehr im Code gefunden: ${weg.map((k) => k.taste).join(', ')} (NUR_IM_CODE prüfen)`);
  }
  const ref = o.vergleich || o['nur-vergleich'];
  if (ref) {
    if (!fs.existsSync(ref)) fail(`${ref} fehlt`);
    const v = vergleichen(JSON.parse(fs.readFileSync(ref, 'utf8')), d);
    fs.writeFileSync(o.out + '-vergleich.md', v.text + '\n');
    console.log(`Vergleich: ${v.fehlt} fehlt, ${v.umgezogen} umgezogen, ${v.neu} neu → ${path.relative(process.cwd(), o.out)}-vergleich.md`);
    process.exit(v.fehlt ? 1 : 0);
  }
}

main().catch((e) => { console.error('Fehler: ' + (e.stack || e.message)); process.exit(1); });
