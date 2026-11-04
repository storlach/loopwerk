// Loopwerk → Figma: baut in der offenen Datei das Design-System „Phosphor“ als editierbare Figma-Datei.
// Variablen (Farben, Maße, Schriften), Text- und Effekt-Stile, Komponenten nach Atomic Design
// (Atoms → Molecules → Organisms, jeweils verknüpfte Instanzen) und die Screens wie in der App.
// Reines JavaScript ohne Build-Schritt und ohne import. Werte: index.html (:root) und die gemessene Oberfläche,
// uneinheitliche Werte sind auf saubere Skalen gezogen (Tabelle im README).
'use strict';

const VERSION = '2.8';

// ---------------------------------------------------------------- Tokens

const CAT_HEX = { drums: '#FFC53D', bass: '#4A8CFF', chords: '#2EE5A3', synth: '#B494FF', fx: '#FF7F45', own: '#FF62A5' };
const CATS = ['Drums', 'Bass', 'Chords', 'Synth', 'FX', 'Own'];
const CAT_KEY = { Drums: 'drums', Bass: 'bass', Chords: 'chords', Synth: 'synth', FX: 'fx', Own: 'own' };
const CAT_DE = { Drums: 'Drums', Bass: 'Bass', Chords: 'Akkorde', Synth: 'Synth', FX: 'FX', Own: 'Eigene' };

// [Name, Wert (#hex | rgba(r,g,b,a) | {alias}), Beschreibung]
/** @type {Array<[string, any, string]>} */
const COLORS = [
  ['color/surface/bg', '#16171A', 'Seitengrund (--bg). Still ist schwarz.'],
  ['color/surface/panel', 'rgba(22,23,27,0.42)', 'Regal, Arranger, Inspektor (--panel), durchscheinend'],
  ['color/surface/deck', 'rgba(18,19,22,0.62)', 'Deck und Fachleiste (--deck)'],
  ['color/surface/head', 'rgba(16,17,20,0.9)', 'Spurköpfe (--head-bg)'],
  ['color/surface/lane', '#131417', 'Spurfläche (--lane), Werkzeug-Knöpfe am Handy'],
  ['color/surface/lane-alt', '#17181B', 'Spurfläche im Wechsel (--lane-alt)'],
  ['color/surface/deck-2', '#222328', 'Einblender (--deck-2)'],
  ['color/surface/sheet', '#1A1B1F', 'Schubladen und Aufklappfelder (--sheet-bg)'],
  ['color/surface/well', '#0E0F12', 'Mulde: Suchfeld, Eingaben (--well)'],
  ['color/surface/clip', 'rgba(14,15,18,0.86)', 'Clip-Körper (--clip-body)'],
  ['color/surface/clip-selected', 'rgba(22,22,26,0.92)', 'Clip-Körper, ausgewählt'],
  ['color/surface/ruler', 'rgba(26,27,31,0.62)', 'Lineal und Ecke (Schublade zu 62 %)'],
  ['color/surface/raised', 'rgba(242,242,240,0.04)', 'Kopf der Clip-Karte im Inspektor'],
  ['color/surface/strip', 'rgba(255,255,255,0.015)', 'Kanalzug im Mixer'],
  ['color/surface/bus', 'rgba(26,27,31,0.88)', 'Rückkanal Hall-/Echo-Bus'],
  ['color/surface/master', 'rgba(47,48,52,0.91)', 'Master-Kanalzug'],
  ['color/text/ink', '#F2F2F0', 'Schrift und Linien (--ink)'],
  ['color/text/muted', '#9898A1', 'Nebenschrift (--muted)'],
  ['color/text/disabled', '#4E4E56', 'Deaktiviert (war fest im CSS, jetzt Token)'],
  ['color/text/on-accent', '#030304', 'Schrift auf Weißglut (--accent-ink)'],
  ['color/glow/white-22', 'rgba(255,255,255,0.22)', 'Äußerer Schein (beam-glow)'],
  ['color/glow/white-35', 'rgba(255,255,255,0.35)', 'Schein der Marke'],
  ['color/glow/white-38', 'rgba(255,255,255,0.38)', 'Schrift-Schein (--glow-ink)'],
  ['color/glow/white-55', 'rgba(255,255,255,0.55)', 'Mittlerer Schein (beam-glow), aktive Haarlinie'],
  ['color/line/line', '#2A2B30', 'Haarlinien, Ränder (--line)'],
  ['color/line/key', '#34343A', 'Tastenrahmen (--key-line)'],
  ['color/line/knob', '#3A3A40', 'Drehknopf-Rand (--knob-edge), Griff der Schublade'],
  ['color/line/active', { alias: 'color/glow/white-55' }, 'Aktive Haarlinie (gewählt, Loop an, Linse)'],
  ['color/line/grid-bar', 'rgba(255,255,255,0.07)', 'Taktlinie (--grid-bar)'],
  ['color/line/grid-beat', 'rgba(255,255,255,0.028)', 'Schlaglinie (--grid-beat)'],
  ['color/line/row', 'rgba(255,255,255,0.05)', 'Trennlinie zwischen Spuren'],
  ['color/line/playhead', 'rgba(255,255,255,0.6)', 'Abspiellinie (still)'],
  ['color/line/trim', 'rgba(255,255,255,0.7)', 'Kante zum Kürzen am Clip'],
  ['color/overlay/white-02', 'rgba(255,255,255,0.02)', 'Hauch (Gruppen, Schritt im Wechsel)'],
  ['color/overlay/white-04', 'rgba(255,255,255,0.04)', 'Gedrückt, gewählte Regal-Zeile, Stumm'],
  ['color/overlay/white-12', 'rgba(255,255,255,0.12)', 'Schraffur-Ersatz'],
  ['color/shadow/black-50', 'rgba(0,0,0,0.5)', 'Schatten der Schublade'],
  ['color/shadow/black-100', '#000000', 'Schatten Einblender, Clip oben'],
  ['color/state/beam', '#FFFFFF', 'Weißglut: Licht, aktive Fläche (--beam)'],
  ['color/state/amber', { alias: 'color/state/beam' }, 'Aktiv (--amber, seit Phosphor Weiß)'],
  ['color/state/focus', { alias: 'color/state/beam' }, 'Fokusrahmen (--focus)'],
  ['color/state/danger', '#FF6B6B', 'Löschen (--danger)'],
  ['color/meter/ok', { alias: 'color/text/ink' }, 'Pegel normal (--meter-ok)'],
  ['color/meter/warm', '#FFC53D', 'Pegel warm (--meter-warm)'],
  ['color/meter/hot', '#FF4D4D', 'Pegel heiß (--meter-hot)'],
  ['color/meter/off', '#24252A', 'Pegel-Stufe aus (--meter-off)'],
  ['color/state/rec', { alias: 'color/meter/hot' }, 'Aufnahme (Rot nur für Aufnahme und Löschen)'],
  ['color/led/off', '#2A2A30', 'LED aus (--led-off)'],
  ['color/piano/white', '#FDFDFB', 'Weiße Klaviertaste (--key-white)'],
  ['color/piano/white-ink', '#5B6475', 'Schrift auf weißer Taste'],
  ['color/piano/black', '#1D2330', 'Schwarze Klaviertaste (--key-black)'],
  ['color/piano/black-ink', '#B9C2D3', 'Schrift auf schwarzer Taste'],
];
for (const k of Object.keys(CAT_HEX)) COLORS.push(['color/cat/' + k, CAT_HEX[k], 'Kategorie ' + k + ' (--cat-' + k + '): was klingt, leuchtet']);
for (const k of Object.keys(CAT_HEX)) COLORS.push(['color/cat-edge/' + k, hexA(CAT_HEX[k], 0.3), 'Clip-Kante ' + k + ' (30 %)']);
for (const k of Object.keys(CAT_HEX)) COLORS.push(['color/cat-glow/' + k, hexA(CAT_HEX[k], 0.45), 'Äußerer Schein ' + k + ' (--glow-cat, 45 %)']);

const SPACE = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48];
// [Name, Wert, Beschreibung, Scopes]
/** @type {Array<[string, number, string, VariableScope[]]>} */
const FLOATS = [];
for (const s of SPACE) FLOATS.push(['space/' + s, s, 'Abstand ' + s + ' px (4er-Skala, 2 nur für Haarlinien-Abstände)', ['GAP', 'WIDTH_HEIGHT']]);
FLOATS.push(
  ['radius/xs', 2, 'Kleinteile: Farbfeld, Schritt, Griffe', ['CORNER_RADIUS']],
  ['radius/s', 3, 'Inhalte: Tasten, Clips, Felder (--radius)', ['CORNER_RADIUS']],
  ['radius/l', 14, 'Behälter: Suche, Schublade, Einblender (--radius-lg)', ['CORNER_RADIUS']],
  ['radius/pill', 999, 'Pille, Kreis (Linse, Schalter)', ['CORNER_RADIUS']],
  ['stroke/hair', 1, 'Haarlinie', ['STROKE_FLOAT', 'WIDTH_HEIGHT']],
  ['stroke/focus', 1.5, 'Kategorie-Rahmen, Auswahl', ['STROKE_FLOAT']],
  ['stroke/bold', 2, 'Lichtstrich, Unterstrich, Fokus', ['STROKE_FLOAT', 'WIDTH_HEIGHT']],
  ['stroke/icon', 1.5, 'Linie der Icons', ['STROKE_FLOAT']]
);
/** @type {Array<[string, number, string]>} */
const SIZES = [
  ['icon-s', 12, 'Kleines Icon (Pfeil)'], ['icon', 16, 'Icon in Tasten'], ['icon-m', 20, 'Icon in der Fachleiste am Handy'], ['icon-l', 24, 'Icon-Raster'],
  ['touch', 44, 'Kleinste Tippfläche am Handy'], ['key-xs', 20, 'Taste XS (M/S im Spurkopf)'], ['key-s', 28, 'Taste S (Arranger-Leiste)'],
  ['key', 36, 'Taste M (Deck)'], ['key-l', 44, 'Taste L (Handy)'], ['pill-s', 36, 'Pille S'], ['pill', 44, 'Pille M'], ['pill-l', 52, 'Pille L (Speichern/Exportieren)'],
  ['lens', 44, 'Spielen-Linse'], ['lens-l', 48, 'Linse groß'], ['find', 34, 'Knopf im Suchfeld'],
  ['track-h', 58, 'Spurhöhe Desktop (--track-h)'], ['track-h-phone', 70, 'Spurhöhe Handy'], ['track-head', 176, 'Spurkopf-Breite Desktop'],
  ['track-head-phone', 136, 'Spurkopf-Breite Handy'], ['deck', 60, 'Deck-Höhe'], ['tabbar', 42, 'Fachleiste Desktop'], ['tabbar-phone', 60, 'Fachleiste Handy'],
  ['ruler', 30, 'Lineal Desktop'], ['ruler-phone', 44, 'Lineal Handy'], ['bar', 96, 'Taktbreite bei Grundzoom'], ['shelf', 272, 'Regal-Breite'],
  ['inspector', 300, 'Inspektor-Breite'], ['strip', 86, 'Kanalzug Desktop'], ['strip-phone', 100, 'Kanalzug Handy'], ['strip-master', 112, 'Master-Kanalzug'],
  ['toggle-w', 32, 'Schalter Breite'], ['toggle-h', 18, 'Schalter Höhe'], ['toggle-w-l', 44, 'Schalter groß Breite'], ['toggle-h-l', 26, 'Schalter groß Höhe'],
  ['knob-s', 26, 'Drehknopf S'], ['knob', 34, 'Drehknopf M'], ['knob-l', 40, 'Drehknopf L'], ['led', 8, 'Lichtpunkt'], ['swatch', 10, 'Farbfeld'],
  ['grip', 12, 'Clip-Griff'], ['step-w', 32, 'Schritt Breite'], ['step-h', 24, 'Schritt Höhe'], ['input', 44, 'Eingabefeld'], ['check', 16, 'Auswahlkreis/-kästchen'],
];
for (const s of SIZES) FLOATS.push(['size/' + s[0], s[1], s[2], ['WIDTH_HEIGHT']]);
const FONT_SIZES = [10, 11, 12, 13, 14, 16, 20, 24, 28];
for (const s of FONT_SIZES) FLOATS.push(['font/size/' + s, s, 'Schriftgröße ' + s + ' px', ['FONT_SIZE']]);

// Text-Stile: [Name, Familie, Gewicht, Größe, Zeilenhöhe %, Laufweite %, Großbuchstaben, Beschreibung]
/** @type {Array<[string, string, number, number, number, number, boolean, string]>} */
const TEXT_STYLES = [
  ['Display/XL', 'display', 300, 28, 115, -2, false, 'Song-Titel im Inspektor'],
  ['Display/L', 'display', 300, 24, 110, -2, false, 'Titel „Assets“ im Regal'],
  ['Display/Brand', 'display', 300, 20, 100, -2, false, 'Wortmarke „Loop“'],
  ['Display/Brand Bold', 'display', 700, 20, 100, -2, false, 'Wortmarke „werk“'],
  ['Display/Name', 'display', 600, 20, 100, 0, false, 'Projektname im Song-Fach'],
  ['Display/Caps L', 'display', 600, 12, 100, 10, true, 'Regal-Reiter Suchen/Erstellen'],
  ['Display/Caps', 'display', 600, 11, 130, 8, true, 'Regal-Gruppe, Zwischentitel, Werkzeug-Knöpfe'],
  ['Body/M', 'body', 400, 14, 140, 0, false, 'Grundtext, Regal-Zeilen'],
  ['Body/M Medium', 'body', 500, 13, 130, 0, false, 'Projekt-Menü, Einblender, Optionen'],
  ['Body/Strong L', 'body', 600, 14, 120, 0, false, 'Name im Inspektor-Kopf'],
  ['Body/Strong', 'body', 600, 13, 120, 0, false, 'Spurname, Effektname, Kanalname'],
  ['Body/Strong S', 'body', 600, 11, 150, 0, false, 'Clipname'],
  ['Body/S', 'body', 400, 12, 140, 0, false, 'Beschriftungen im Inspektor'],
  ['Body/XS', 'body', 400, 11, 140, 0, false, 'Meta-Zeilen, Effekt-Zusammenfassung'],
  ['Mono/Key L', 'mono', 500, 11, 100, 8, true, 'Tasten am Handy (mindestens 11 px)'],
  ['Mono/Key', 'mono', 500, 10, 100, 8, true, 'Tasten, Reiter, Segmente'],
  ['Mono/Label L', 'mono', 500, 11, 130, 12, true, 'Anzeige-Beschriftung am Handy'],
  ['Mono/Label', 'mono', 500, 10, 130, 12, true, 'Anzeige-Beschriftung (Takt, Tempo, Clip …)'],
  ['Mono/Value', 'mono', 500, 12, 120, 0, false, 'Werte im Inspektor (dB, %)'],
  ['Mono/Small L', 'mono', 400, 11, 100, 0, false, 'Taktzahlen am Handy'],
  ['Mono/Small', 'mono', 400, 10, 100, 0, false, 'Taktzahlen, Pegelwerte, Längen'],
  ['LCD/L', 'mono', 200, 24, 105, -3, false, 'Display-Ziffern im Deck (dünn)'],
  ['LCD/M', 'mono', 300, 20, 120, 0, false, 'Tempo und Tonart im Inspektor'],
];

const FONT_WANT = { display: 'Funnel Display', body: 'Funnel Sans', mono: 'Azeret Mono' };
const FONT_FALLBACK = { display: ['Inter', 'Roboto'], body: ['Inter', 'Roboto'], mono: ['Roboto Mono', 'JetBrains Mono', 'IBM Plex Mono', 'Source Code Pro', 'Inter'] };
const WEIGHT_STYLES = {
  200: ['ExtraLight', 'Extra Light', 'UltraLight', 'Thin', 'Light', 'Regular'],
  300: ['Light', 'ExtraLight', 'Extra Light', 'Regular'],
  400: ['Regular', 'Book', 'Normal'],
  500: ['Medium', 'Regular'],
  600: ['SemiBold', 'Semi Bold', 'Semibold', 'DemiBold', 'Demi Bold', 'Bold', 'Medium'],
  700: ['Bold', 'SemiBold', 'Semi Bold', 'ExtraBold', 'Black'],
};

// ---------------------------------------------------------------- Laufzeit

/** @type {Record<string, Variable>} */ const V = {};
/** @type {Record<string, RGBA>} */ const RAW = {};
/** @type {Record<string, number>} */ const NUM = {};
/** @type {Record<string, {style: TextStyle, font: FontName}>} */ const TS = {};
/** @type {Record<string, EffectStyle>} */ const ES = {};
/** @type {Record<string, ComponentNode|ComponentSetNode>} */ const C = {};
const stats = { components: 0, variants: 0, instances: 0, texts: 0, bindFails: 0, variables: 0 };
/** @type {string[]} */ const warnings = [];
const RUN = { suffix: '', stylePrefix: '', fontNote: '' };

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
/** @returns {RGBA} */
function parseColor(s) {
  if (s[0] === '#') {
    const n = parseInt(s.slice(1, 7), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
  }
  const p = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',').map(Number);
  return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p[3] };
}
function warn(msg) { if (warnings.length < 200) warnings.push(msg); }

// ---------------------------------------------------------------- Variablen und Stile

async function createVariables() {
  const sfx = RUN.suffix;
  const cColor = figma.variables.createVariableCollection('Phosphor' + sfx);
  cColor.renameMode(cColor.modes[0].modeId, 'Dunkel');
  const mColor = cColor.modes[0].modeId;
  for (const def of COLORS) {
    const name = def[0], val = def[1], desc = def[2];
    const v = figma.variables.createVariable(name, cColor, 'COLOR');
    v.description = desc;
    v.scopes = ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'];
    if (typeof val === 'object') {
      const target = V[val.alias];
      if (!target) throw new Error('Alias-Ziel fehlt: ' + val.alias);
      v.setValueForMode(mColor, figma.variables.createVariableAlias(target));
      RAW[name] = RAW[val.alias];
    } else {
      const c = parseColor(val);
      v.setValueForMode(mColor, c);
      RAW[name] = c;
    }
    V[name] = v;
    stats.variables++;
  }
  const cSize = figma.variables.createVariableCollection('Maße' + sfx);
  cSize.renameMode(cSize.modes[0].modeId, 'Standard');
  const mSize = cSize.modes[0].modeId;
  for (const def of FLOATS) {
    const v = figma.variables.createVariable(def[0], cSize, 'FLOAT');
    v.description = def[2];
    v.scopes = def[3];
    v.setValueForMode(mSize, def[1]);
    V[def[0]] = v;
    NUM[def[0]] = def[1];
    stats.variables++;
  }
  return { cColor, cSize, mSize };
}

async function createFontVariables(fonts) {
  const c = figma.variables.createVariableCollection('Schrift' + RUN.suffix);
  c.renameMode(c.modes[0].modeId, 'Standard');
  const m = c.modes[0].modeId;
  const desc = { display: 'Titel und Wortmarke (Funnel Display)', body: 'Inhalte (Funnel Sans)', mono: 'Anzeigen und Beschriftungen (Azeret Mono)' };
  for (const k of ['display', 'body', 'mono']) {
    const v = figma.variables.createVariable('font/family/' + k, c, 'STRING');
    v.description = desc[k] + (fonts[k].family !== FONT_WANT[k] ? ' – Ersatz: ' + fonts[k].family : '');
    v.scopes = ['FONT_FAMILY'];
    v.setValueForMode(m, fonts[k].family);
    V['font/family/' + k] = v;
    stats.variables++;
  }
}

async function resolveFonts() {
  const list = await figma.listAvailableFontsAsync();
  /** @type {Record<string, string[]>} */
  const fam = {};
  for (const f of list) {
    if (!fam[f.fontName.family]) fam[f.fontName.family] = [];
    fam[f.fontName.family].push(f.fontName.style);
  }
  /** @type {Record<string, {family: string, styles: string[]}>} */
  const out = {};
  const missing = [];
  for (const k of ['display', 'body', 'mono']) {
    let family = fam[FONT_WANT[k]] ? FONT_WANT[k] : null;
    if (!family) {
      family = FONT_FALLBACK[k].filter((f) => fam[f])[0] || (list.length ? list[0].fontName.family : 'Inter');
      missing.push(FONT_WANT[k] + ' → ' + family);
    }
    out[k] = { family, styles: fam[family] || ['Regular'] };
  }
  return { fonts: out, missing };
}

function pickStyle(styles, weight) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
  const have = styles.map(norm);
  for (const want of WEIGHT_STYLES[weight] || ['Regular']) {
    const i = have.indexOf(norm(want));
    if (i >= 0) return styles[i];
  }
  const reg = have.indexOf('regular');
  return reg >= 0 ? styles[reg] : styles[0];
}

async function createTextStyles(fonts) {
  /** @type {Record<string, boolean>} */
  const loaded = {};
  const load = async (fn) => {
    const key = fn.family + '/' + fn.style;
    if (loaded[key]) return;
    await figma.loadFontAsync(fn);
    loaded[key] = true;
  };
  try { await load({ family: 'Inter', style: 'Regular' }); } catch (e) { /* Inter fehlt: egal, wir setzen die Schrift vor dem Text */ }
  for (const d of TEXT_STYLES) {
    const f = fonts[d[1]];
    const font = { family: f.family, style: pickStyle(f.styles, d[2]) };
    await load(font);
    const s = figma.createTextStyle();
    s.name = RUN.stylePrefix + d[0];
    s.description = d[7];
    s.fontName = font;
    s.fontSize = d[3];
    s.lineHeight = { unit: 'PERCENT', value: d[4] };
    s.letterSpacing = { unit: 'PERCENT', value: d[5] };
    s.textCase = d[6] ? 'UPPER' : 'ORIGINAL';
    bindStyle(s, 'fontSize', 'font/size/' + d[3]);
    bindStyle(s, 'fontFamily', 'font/family/' + d[1]);
    TS[d[0]] = { style: s, font };
  }
}
function bindStyle(s, field, varName) {
  try { s.setBoundVariable(field, V[varName]); } catch (e) { stats.bindFails++; warn('Stil ' + s.name + ': ' + field + ' nicht gebunden'); }
}

/** @returns {DropShadowEffect} */
function shadow(x, y, r, colorVar, spread) {
  const c = RAW[colorVar];
  /** @type {DropShadowEffect} */
  const e = { type: 'DROP_SHADOW', color: { r: c.r, g: c.g, b: c.b, a: c.a }, offset: { x, y }, radius: r, spread: spread || 0, visible: true, blendMode: 'NORMAL', showShadowBehindNode: false };
  try { return /** @type {DropShadowEffect} */ (figma.variables.setBoundVariableForEffect(e, 'color', V[colorVar])); } catch (err) { stats.bindFails++; return e; }
}

async function createEffectStyles() {
  const mk = (name, desc, effects) => {
    const s = figma.createEffectStyle();
    s.name = RUN.stylePrefix + name;
    s.description = desc;
    s.effects = effects;
    ES[name] = s;
  };
  mk('Glow/Beam', 'Weißglut mit Schein (--beam-glow): Spielen-Linse, Lichtstrich', [shadow(0, 0, 3, 'color/state/beam'), shadow(0, 0, 10, 'color/glow/white-55'), shadow(0, 0, 26, 'color/glow/white-22')]);
  mk('Glow/Ink', 'Schrift-Schein aktiver Tasten (--glow-ink)', [shadow(0, 0, 14, 'color/glow/white-38')]);
  for (const cat of CATS) {
    const k = CAT_KEY[cat];
    mk('Glow/Cat/' + cat, 'Licht in der Kategoriefarbe (--glow-cat): Spurpunkt, gesetzte Schritte', [shadow(0, 0, 6, 'color/cat/' + k), shadow(0, 0, 18, 'color/cat-glow/' + k)]);
  }
  mk('Shadow/Sheet', 'Schublade (--sheet-shadow)', [shadow(0, -1, 0, 'color/line/line'), shadow(0, -10, 26, 'color/shadow/black-50')]);
  mk('Shadow/Popover', 'Einblender, Tipp, Aufklappfeld', [shadow(0, 10, 30, 'color/shadow/black-100')]);
  mk('Shadow/Lift', 'Clip liegt oben', [shadow(0, 2, 12, 'color/shadow/black-100')]);
  /** @type {BlurEffect} */
  const blur = /** @type {any} */ ({ type: 'BACKGROUND_BLUR', blurType: 'NORMAL', radius: 10, visible: true });
  const glassDesc = 'Weichzeichner der Fenster (--glass: blur 10 px; Sättigung lässt Figma weg)';
  try { mk('Blur/Glass', glassDesc, [blur]); } catch (e) {
    // ältere Figma-Versionen kennen blurType noch nicht
    mk('Blur/Glass', glassDesc, [/** @type {any} */ ({ type: 'BACKGROUND_BLUR', radius: 10, visible: true })]);
  }
}

// ---------------------------------------------------------------- Bausteine der Erzeugung

/** @returns {SolidPaint} */
function P(name) {
  const v = V[name];
  if (!v) throw new Error('Farbvariable fehlt: ' + name);
  const c = RAW[name];
  /** @type {SolidPaint} */
  const base = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
  return figma.variables.setBoundVariableForPaint(base, 'color', v);
}
function num(name) {
  if (!(name in NUM)) throw new Error('Maß fehlt: ' + name);
  return NUM[name];
}
/** @param {any} node */
function bindF(node, field, varName) {
  const v = V[varName];
  if (!v) throw new Error('Variable fehlt: ' + varName);
  try { node.setBoundVariable(field, v); } catch (e) { stats.bindFails++; warn((node.name || node.type) + ': ' + field + ' → ' + varName + ' (' + (e && e.message) + ')'); }
}
function spaceVar(n) {
  if (SPACE.indexOf(n) < 0) throw new Error('Abstand nicht in der Skala: ' + n);
  return 'space/' + n;
}
/** @param {any} node */
function setGap(node, n) {
  if (!n) { node.itemSpacing = 0; return; }
  bindF(node, 'itemSpacing', spaceVar(n));
}
/** @param {any} node */
function setPad(node, p) {
  const a = typeof p === 'number' ? [p, p, p, p] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p;
  const f = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
  for (let i = 0; i < 4; i++) {
    if (a[i]) bindF(node, f[i], spaceVar(a[i]));
    else node[f[i]] = 0;
  }
}
/** @param {any} node @param {string} key @param {string[]} [corners] */
function setRadius(node, key, corners) {
  const all = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
  for (const f of corners || all) bindF(node, f, 'radius/' + key);
}
/** @param {any} node */
function sizeVar(node, wVar, hVar) {
  node.resize(wVar ? num(wVar) : node.width, hVar ? num(hVar) : node.height);
  if (wVar) bindF(node, 'width', wVar);
  if (hVar) bindF(node, 'height', hVar);
}
/** @param {any} node */
function setFill(node, names) {
  if (!names) { node.fills = []; return; }
  node.fills = (Array.isArray(names) ? names : [names]).map(P);
}
/** Kontur: o = {w: Variable, align, sides: [t,r,b,l] (0/1), dash} @param {any} node */
function setStroke(node, name, o) {
  o = o || {};
  if (!name) { node.strokes = []; return; }
  node.strokes = [P(name)];
  node.strokeAlign = o.align || 'INSIDE';
  const w = o.w || 'stroke/hair';
  if (o.sides) {
    const f = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'];
    for (let i = 0; i < 4; i++) {
      if (o.sides[i]) bindF(node, f[i], w);
      else node[f[i]] = 0;
    }
  } else {
    bindF(node, 'strokeWeight', w);
  }
  if (o.dash) node.dashPattern = o.dash;
}

/**
 * Gestaltet einen Frame/eine Komponente.
 * o: dir 'H'|'V', gap, p (Abstände), align, cross, w, h, wv/hv (Größen-Variablen), fill, stroke, sw, sides, r, rc, clip, wrap
 * @param {any} f
 * @param {any} o
 */
function box(f, o) {
  o = o || {};
  f.fills = [];
  f.clipsContent = !!o.clip;
  if (o.dir) {
    f.layoutMode = o.dir === 'H' ? 'HORIZONTAL' : 'VERTICAL';
    if (o.wrap) f.layoutWrap = 'WRAP';
    setGap(f, o.gap || 0);
    setPad(f, o.p || 0);
    f.primaryAxisAlignItems = o.align || 'MIN';
    f.counterAxisAlignItems = o.cross || 'MIN';
  }
  if (o.w != null || o.h != null || o.wv || o.hv) {
    f.resize(o.wv ? num(o.wv) : o.w != null ? o.w : f.width, o.hv ? num(o.hv) : o.h != null ? o.h : f.height);
  }
  if (o.dir) {
    f.layoutSizingHorizontal = o.w != null || o.wv ? 'FIXED' : 'HUG';
    f.layoutSizingVertical = o.h != null || o.hv ? 'FIXED' : 'HUG';
  }
  if (o.wv) bindF(f, 'width', o.wv);
  if (o.hv) bindF(f, 'height', o.hv);
  setFill(f, o.fill);
  setStroke(f, o.stroke, { w: o.sw, sides: o.sides, dash: o.dash });
  if (o.r) setRadius(f, o.r, o.rc);
  if (o.opacity != null) f.opacity = o.opacity;
  return f;
}
/** @returns {FrameNode} */
function F(name, o) {
  const f = figma.createFrame();
  f.name = name;
  box(f, o);
  return f;
}
/**
 * Hängt ein Kind an und setzt Größe im Auto-Layout: o.w/o.h 'FILL'|'HUG'|'FIXED', o.abs (absolut), o.x/o.y, o.cx/o.cy (Constraints)
 * @param {any} parent @param {any} child @param {any} [o]
 */
function add(parent, child, o) {
  parent.appendChild(child);
  o = o || {};
  if (o.abs) {
    child.layoutPositioning = 'ABSOLUTE';
    child.x = o.x || 0;
    child.y = o.y || 0;
    child.constraints = { horizontal: o.cx || 'MIN', vertical: o.cy || 'MIN' };
    return child;
  }
  if (o.w) child.layoutSizingHorizontal = o.w;
  if (o.h) child.layoutSizingVertical = o.h;
  if (o.grow) child.layoutGrow = 1;
  return child;
}
/** Hintergrund-Instanz über die ganze Fläche, hinter dem Inhalt @param {any} frame @param {any} bg */
function backdrop(frame, bg) {
  frame.insertChild(0, bg);
  bg.layoutPositioning = 'ABSOLUTE';
  bg.x = 0;
  bg.y = 0;
  bg.resize(frame.width, frame.height);
  bg.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
}

/** @returns {Promise<TextNode>} */
async function T(name, chars, styleName, color, o) {
  o = o || {};
  const s = TS[styleName];
  if (!s) throw new Error('Text-Stil fehlt: ' + styleName);
  const t = figma.createText();
  t.name = name;
  t.fontName = s.font;
  await t.setTextStyleIdAsync(s.style.id);
  t.characters = chars;
  t.fills = [P(color)];
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.glow) await t.setEffectStyleIdAsync(ES['Glow/Ink'].id);
  if (o.strike) t.textDecoration = 'STRIKETHROUGH';
  stats.texts++;
  return t;
}
/** Text füllt die Breite und kürzt mit … @param {TextNode} t */
function truncate(t) {
  t.layoutSizingHorizontal = 'FILL';
  try { t.textTruncation = 'ENDING'; t.maxLines = 1; } catch (e) { warn('Kürzen nicht möglich: ' + t.name); }
}
async function fx(node, name) {
  await node.setEffectStyleIdAsync(ES[name].id);
}

/** Instanz einer Komponente (Variante über Eigenschaften), optional Properties setzen @returns {InstanceNode} */
function I(name, variant, props, layerName) {
  const t = C[name];
  if (!t) throw new Error('Komponente fehlt: ' + name);
  /** @type {ComponentNode} */
  let comp;
  if (t.type === 'COMPONENT_SET') comp = pickVariant(t, variant || {});
  else comp = t;
  const i = comp.createInstance();
  i.name = layerName || name.split('/').pop();
  if (props) setProps(i, props);
  stats.instances++;
  return i;
}
/** @param {ComponentSetNode} set @returns {ComponentNode} */
function pickVariant(set, want) {
  const def = set.defaultVariant.variantProperties || {};
  const full = Object.assign({}, def, want);
  for (const ch of set.children) {
    const vp = /** @type {ComponentNode} */ (ch).variantProperties || {};
    if (Object.keys(full).every((k) => vp[k] === full[k])) return /** @type {ComponentNode} */ (ch);
  }
  throw new Error('Variante fehlt: ' + set.name + ' ' + JSON.stringify(want));
}
/** Properties setzen: Schlüssel ohne #-Kennung; Komponenten für Instance-Swap direkt übergeben @param {InstanceNode} inst */
function setProps(inst, props) {
  const keys = Object.keys(inst.componentProperties);
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (const k of Object.keys(props)) {
    const full = keys.filter((x) => x === k || x.split('#')[0] === k)[0];
    if (!full) throw new Error('Property fehlt: ' + k + ' an ' + inst.name + ' (' + keys.join(', ') + ')');
    const val = props[k];
    out[full] = val && typeof val === 'object' ? val.id : val;
  }
  inst.setProperties(out);
  return inst;
}
/** Verschachtelte Instanz per Ebenenname @returns {InstanceNode} */
function sub(inst, layerName) {
  const n = inst.findOne((x) => x.type === 'INSTANCE' && x.name === layerName);
  if (!n) throw new Error('Ebene fehlt: ' + layerName + ' in ' + inst.name);
  return /** @type {InstanceNode} */ (n);
}
/** Icon-Instanz einfärben (Ebenen „Form“) @param {InstanceNode} inst */
function tint(inst, color) {
  for (const n of inst.findAll((x) => x.name === 'Form')) {
    const g = /** @type {any} */ (n);
    if (g.strokes && g.strokes.length) g.strokes = [P(color)];
    if (g.fills && g.fills.length) g.fills = [P(color)];
  }
}
/** Icon-Instanz in Größe (Variable) @returns {InstanceNode} */
function icon(name, sizeV, color, layerName) {
  const i = I('Atom/Icon/' + name, null, null, layerName || 'Icon');
  sizeVar(i, sizeV || 'size/icon', sizeV || 'size/icon');
  if (color) tint(i, color);
  return i;
}
/** Quadratische Taste (nur Icon) @param {InstanceNode} inst */
function square(inst, sizeV) {
  inst.resize(num(sizeV), num(sizeV));
  bindF(inst, 'width', sizeV);
  const pad = { 'size/key-xs': 4, 'size/key-s': 4, 'size/key': 8, 'size/key-l': 12 }[sizeV] || 4;
  bindF(inst, 'paddingLeft', spaceVar(pad));
  bindF(inst, 'paddingRight', spaceVar(pad));
}
/** Verschachtelte Instanz in der Breite füllen lassen (Override) @param {InstanceNode} n */
function fillW(n) {
  try { n.layoutSizingHorizontal = 'FILL'; } catch (e) { warn('Füllen nicht möglich: ' + n.name); }
}
function exposed(inst) {
  try { inst.isExposedInstance = true; } catch (e) { warn('Nicht freigelegt: ' + inst.name); }
}

// ---------------------------------------------------------------- Seiten, Sektionen, Platzierung

/** @type {PageNode} */ let PAGE;
/** @type {SectionNode} */ let SECTION;
const SEC = { pageY: 0, x: 0, y: 0, rowH: 0, maxX: 0 };
const SEC_PAD = 48, SEC_TOP = 96, SEC_GAP = 48, SEC_MAXW = 1800;

function beginSection(title) {
  const s = figma.createSection();
  s.name = title;
  s.fills = [P('color/surface/bg')];
  PAGE.appendChild(s);
  s.x = 0;
  s.y = SEC.pageY;
  SECTION = s;
  SEC.x = SEC_PAD; SEC.y = SEC_TOP; SEC.rowH = 0; SEC.maxX = 0;
  return s;
}
function place(node) {
  if (SEC.x > SEC_PAD && SEC.x + node.width > SEC_MAXW) {
    SEC.x = SEC_PAD;
    SEC.y += SEC.rowH + SEC_GAP;
    SEC.rowH = 0;
  }
  node.x = SEC.x;
  node.y = SEC.y;
  SEC.x += node.width + SEC_GAP;
  SEC.rowH = Math.max(SEC.rowH, node.height);
  SEC.maxX = Math.max(SEC.maxX, node.x + node.width);
}
function endSection() {
  SECTION.resizeWithoutConstraints(Math.max(SEC.maxX + SEC_PAD, 480), SEC.y + SEC.rowH + SEC_PAD);
  SEC.pageY += SECTION.height + 160;
}
async function usePage(page) {
  PAGE = page;
  SEC.pageY = 0;
  await figma.setCurrentPageAsync(page);
}

function cartesian(axes) {
  let out = [{}];
  for (const a of axes) {
    const next = [];
    for (const o of out) for (const v of a[1]) { const c = Object.assign({}, o); c[a[0]] = v; next.push(c); }
    out = next;
  }
  return out;
}

/**
 * Komponente oder Component Set bauen.
 * axes: [['State', ['Default', 'Active']], …] – letzte Achse = Spalten, übrige = Zeilen
 * props: [{name, type: 'TEXT'|'BOOLEAN'|'INSTANCE_SWAP', def, pref?}] – build ruft ref(node, 'characters'|'visible'|'mainComponent', propName)
 * @param {string} name @param {string} desc @param {any[]} axes @param {any[]} props
 * @param {(c: ComponentNode, v: any, ref: (node: SceneNode, field: string, prop: string) => void) => Promise<void>} build
 * @param {(v: any) => boolean} [skip]
 */
async function component(name, desc, axes, props, build, skip) {
  const combos = cartesian(axes).filter((v) => !skip || !skip(v));
  /** @type {{node: any, field: string, prop: string}[]} */
  const refs = [];
  /** @type {ComponentNode[]} */
  const comps = [];
  for (const v of combos) {
    const c = figma.createComponent();
    c.fills = [];
    c.name = axes.length ? axes.map((a) => a[0] + '=' + v[a[0]]).join(', ') : name;
    SECTION.appendChild(c);
    await build(c, v, (node, field, prop) => refs.push({ node, field, prop }));
    comps.push(c);
    stats.variants++;
  }
  /** @type {ComponentNode|ComponentSetNode} */
  let target;
  if (axes.length) {
    const set = figma.combineAsVariants(comps, SECTION);
    set.name = name;
    set.fills = [];
    set.strokes = [];
    arrange(set, comps, combos, axes);
    target = set;
  } else {
    target = comps[0];
  }
  target.description = desc;
  /** @type {Record<string, string>} */
  const full = {};
  for (const p of props || []) {
    if (p.type === 'INSTANCE_SWAP') {
      const opts = p.pref ? { preferredValues: p.pref.map(prefOf) } : undefined;
      full[p.name] = target.addComponentProperty(p.name, 'INSTANCE_SWAP', p.def.id, opts);
    } else {
      full[p.name] = target.addComponentProperty(p.name, p.type, p.def);
    }
  }
  /** @type {Map<any, any>} */
  const byNode = new Map();
  for (const r of refs) {
    if (!full[r.prop]) throw new Error('Property nicht definiert: ' + r.prop + ' in ' + name);
    const o = byNode.get(r.node) || {};
    o[r.field] = full[r.prop];
    byNode.set(r.node, o);
  }
  byNode.forEach((o, node) => { node.componentPropertyReferences = o; });
  C[name] = target;
  stats.components++;
  place(target);
  return target;
}
/** @returns {InstanceSwapPreferredValue} */
function prefOf(c) {
  return { type: c.type === 'COMPONENT_SET' ? 'COMPONENT_SET' : 'COMPONENT', key: c.key };
}
/** @param {ComponentSetNode} set */
function arrange(set, comps, combos, axes) {
  const pad = 24, gap = 24;
  const rowKey = (v) => axes.slice(0, -1).map((a) => v[a[0]]).join('|');
  let x = pad, y = pad, rowH = 0, maxX = 0, row = null;
  comps.forEach((c, i) => {
    const k = rowKey(combos[i]);
    if (row !== null && (k !== row || x + c.width > 1600)) { y += rowH + gap; x = pad; rowH = 0; }
    row = k;
    c.x = x; c.y = y;
    x += c.width + gap;
    rowH = Math.max(rowH, c.height);
    maxX = Math.max(maxX, c.x + c.width);
  });
  set.resizeWithoutConstraints(maxX + pad, y + rowH + pad);
}

// ---------------------------------------------------------------- Icons (24er-Raster)

function starPath() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 3.8 : 8.6;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push((12 + r * Math.cos(a)).toFixed(2) + ' ' + (12.6 + r * Math.sin(a)).toFixed(2));
  }
  return 'M ' + pts.join(' L ') + ' Z';
}
// Formen: s = Linie, f = Fläche, es/ef = Ellipse (Linie/Fläche) [x, y, w, h], c = Farbe
const ICONS = [
  ['Play', 'Abspielen', [{ f: 'M 7 4.5 L 19 12 L 7 19.5 Z' }]],
  ['Stop', 'Stopp (Balken wie in der App)', [{ f: 'M 6.5 5 L 10 5 L 10 19 L 6.5 19 Z M 14 5 L 17.5 5 L 17.5 19 L 14 19 Z' }]],
  ['Rec', 'Aufnahme – immer Rot', [{ ef: [5, 5, 14, 14], c: 'color/state/rec' }]],
  ['Home', 'Zurück an den Anfang', [{ f: 'M 5 4 L 7.5 4 L 7.5 20 L 5 20 Z M 20 4 L 20 20 L 9.5 12 Z' }]],
  ['Undo', 'Rückgängig', [{ s: 'M 9 4 L 4 9 L 9 14 M 4 9 L 14 9 C 17.3 9 20 11.7 20 15 C 20 18.3 17.3 21 14 21 L 11 21' }]],
  ['Redo', 'Wiederholen', [{ s: 'M 15 4 L 20 9 L 15 14 M 20 9 L 10 9 C 6.7 9 4 11.7 4 15 C 4 18.3 6.7 21 10 21 L 13 21' }]],
  ['Loop', 'Loop-Bereich wiederholen', [{ s: 'M 4 12 L 4 10 C 4 8.3 5.3 7 7 7 L 18 7 M 15 4 L 18 7 L 15 10 M 20 12 L 20 14 C 20 15.7 18.7 17 17 17 L 6 17 M 9 14 L 6 17 L 9 20' }]],
  ['Metronome', 'Klick (Metronom)', [{ s: 'M 9 3.5 L 15 3.5 L 19 20.5 L 5 20.5 Z M 12 16 L 16.5 7 M 6 16 L 18 16' }]],
  ['Chevron Down', 'Aufklappen', [{ s: 'M 6 9 L 12 15 L 18 9' }]],
  ['Chevron Right', 'Zugeklappt / weiter', [{ s: 'M 9 6 L 15 12 L 9 18' }]],
  ['Caret', 'Auswahl-Pfeil', [{ f: 'M 7 10 L 17 10 L 12 15.5 Z' }]],
  ['Plus', 'Hinzufügen, vergrößern', [{ s: 'M 12 5 L 12 19 M 5 12 L 19 12' }]],
  ['Minus', 'Verkleinern', [{ s: 'M 5 12 L 19 12' }]],
  ['Star', 'Favorit', [{ s: starPath() }]],
  ['Search', 'Suchen (Lupe)', [{ es: [4, 4, 12, 12] }, { s: 'M 14.5 14.5 L 20 20' }]],
  ['Sliders', 'Regler / Filter (Länge und Ordnen)', [{ s: 'M 4 8 L 12.5 8 M 18.5 8 L 20 8 M 4 16 L 5.5 16 M 11.5 16 L 20 16' }, { es: [12.5, 5, 6, 6] }, { es: [5.5, 13, 6, 6] }]],
  ['Close', 'Schließen, zurücksetzen (×)', [{ s: 'M 6 6 L 18 18 M 18 6 L 6 18' }]],
  ['Scissors', 'Teilen (Schere)', [{ es: [3.5, 3.5, 6, 6] }, { es: [3.5, 14.5, 6, 6] }, { s: 'M 8.8 8.8 L 20 18 M 8.8 15.2 L 20 6' }]],
  ['Copy', 'Duplizieren (Kopie)', [{ s: 'M 8.5 8.5 L 20 8.5 L 20 20 L 8.5 20 Z M 4 15.5 L 4 4 L 15.5 4' }]],
  ['Trash', 'Löschen', [{ s: 'M 4 6.5 L 20 6.5 M 9.5 6.5 L 9.5 4 L 14.5 4 L 14.5 6.5 M 6 6.5 L 7 20 L 17 20 L 18 6.5 M 10 10.5 L 10 16 M 14 10.5 L 14 16' }]],
  ['Notes', 'Sounds (Noten)', [{ s: 'M 9 18 L 9 5.5 L 19 3.5 L 19 16' }, { ef: [4, 15.5, 5, 5] }, { ef: [14, 13.5, 5, 5] }]],
  ['Mixer', 'Mixer', [{ s: 'M 6 4 L 6 20 M 12 4 L 12 20 M 18 4 L 18 20 M 3.5 14 L 8.5 14 M 9.5 8 L 14.5 8 M 15.5 16 L 20.5 16' }]],
  ['Editor', 'Editor (Welle)', [{ s: 'M 3 12 L 6 12 L 8.5 6 L 11.5 18 L 14 9 L 16 15 L 18 12 L 21 12' }]],
  ['Song', 'Song-Fach', [{ s: 'M 4 6.5 L 14 6.5 M 4 12 L 20 12 M 4 17.5 L 17 17.5' }]],
  ['More', 'Mehr (…)', [{ ef: [4.75, 10.75, 2.5, 2.5] }, { ef: [10.75, 10.75, 2.5, 2.5] }, { ef: [16.75, 10.75, 2.5, 2.5] }]],
  ['Pencil', 'Bearbeiten', [{ s: 'M 4.5 19.5 L 5.5 15 L 15.5 5 L 19 8.5 L 9 18.5 Z M 13.5 7 L 17 10.5' }]],
  ['Levels', 'Pegel', [{ s: 'M 5 19 L 5 15 M 9.7 19 L 9.7 12 M 14.3 19 L 14.3 8.5 M 19 19 L 19 5' }]],
  ['FX-Pad', 'Effekt-Pad', [{ s: 'M 5 5 L 19 5 L 19 19 L 5 19 Z' }, { ef: [10, 10, 4, 4] }]],
];

/** Pfad auf Ursprung verschieben (Figma misst Vektoren ab ihrer Ecke), gibt Versatz zurück */
function normPath(d) {
  const tok = d.trim().split(/\s+/);
  let minX = Infinity, minY = Infinity, isX = true;
  for (const t of tok) {
    if (/^[A-Za-z]$/.test(t)) { isX = true; continue; }
    const n = parseFloat(t);
    if (isX) minX = Math.min(minX, n); else minY = Math.min(minY, n);
    isX = !isX;
  }
  isX = true;
  const out = tok.map((t) => {
    if (/^[A-Za-z]$/.test(t)) { isX = true; return t; }
    const n = parseFloat(t) - (isX ? minX : minY);
    isX = !isX;
    return String(Math.round(n * 100) / 100);
  });
  return { data: out.join(' '), x: minX, y: minY };
}

async function buildIcon(def) {
  const name = def[0], desc = def[1], shapes = def[2];
  await component('Atom/Icon/' + name, 'Icon „' + desc + '“ – 24-px-Raster, Linie 1,5 px (stroke/icon). In Tasten 16 px (size/icon).', [], [], async (c) => {
    box(c, { wv: 'size/icon-l', hv: 'size/icon-l' });
    for (const sh of shapes) {
      /** @type {VectorNode|EllipseNode} */
      let n;
      let x = 0, y = 0;
      if (sh.s || sh.f) {
        const v = figma.createVector();
        const np = normPath(sh.s || sh.f);
        v.vectorPaths = [{ windingRule: sh.s ? 'NONE' : 'NONZERO', data: np.data }];
        x = np.x; y = np.y;
        n = v;
      } else {
        const e = figma.createEllipse();
        const r = sh.es || sh.ef;
        e.resize(r[2], r[3]);
        x = r[0]; y = r[1];
        n = e;
      }
      n.name = 'Form';
      if (sh.s || sh.es) {
        n.fills = [];
        n.strokes = [P(sh.c || 'color/text/ink')];
        n.strokeAlign = 'CENTER';
        bindF(n, 'strokeWeight', 'stroke/icon');
        if (n.type === 'VECTOR') { n.strokeCap = 'ROUND'; n.strokeJoin = 'ROUND'; }
      } else {
        n.fills = [P(sh.c || 'color/text/ink')];
        n.strokes = [];
      }
      c.appendChild(n);
      n.x = x; n.y = y;
      n.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    }
  });
}

// ---------------------------------------------------------------- Atoms

const KEY_SIZES = {
  XS: { h: 'size/key-xs', px: 8, gap: 4, icon: 'size/icon-s', text: 'Mono/Key' },
  S: { h: 'size/key-s', px: 8, gap: 8, icon: 'size/icon', text: 'Mono/Key' },
  M: { h: 'size/key', px: 12, gap: 8, icon: 'size/icon', text: 'Mono/Key' },
  L: { h: 'size/key-l', px: 16, gap: 8, icon: 'size/icon', text: 'Mono/Key L' },
};
const KEY_STATES = {
  Default: { stroke: 'color/line/key', ink: 'color/text/ink' },
  Active: { stroke: 'color/line/active', ink: 'color/text/ink', glow: true },
  Primary: { fill: 'color/text/ink', ink: 'color/text/on-accent', tint: true },
  Muted: { fill: 'color/overlay/white-04', stroke: 'color/text/muted', ink: 'color/text/ink' },
  Disabled: { stroke: 'color/line/key', ink: 'color/text/disabled', tint: true },
  Rec: { stroke: 'color/state/rec', ink: 'color/state/rec', tint: true },
};
function iconPrefs() { return ICONS.map((d) => C['Atom/Icon/' + d[0]]); }

/** Taste oder Pille: Icon · Beschriftung · Pfeil */
async function buttonLike(name, desc, sizes, states, radiusKey) {
  await component(name, desc, [['Size', Object.keys(sizes)], ['State', Object.keys(states)]], [
    { name: 'Label', type: 'TEXT', def: 'Taste' },
    { name: 'Show Label', type: 'BOOLEAN', def: true },
    { name: 'Show Icon', type: 'BOOLEAN', def: false },
    { name: 'Icon', type: 'INSTANCE_SWAP', def: C['Atom/Icon/Play'], pref: iconPrefs() },
    { name: 'Show Chevron', type: 'BOOLEAN', def: false },
  ], async (c, v, ref) => {
    const s = sizes[v.Size], st = states[v.State];
    box(c, { dir: 'H', gap: s.gap, p: [0, s.px, 0, s.px], align: 'CENTER', cross: 'CENTER', hv: s.h, r: radiusKey, fill: st.fill, stroke: st.stroke });
    const ic = icon('Play', s.icon, st.tint ? st.ink : null);
    add(c, ic);
    ic.visible = false;
    ref(ic, 'visible', 'Show Icon');
    ref(ic, 'mainComponent', 'Icon');
    const t = await T('Beschriftung', 'Taste', s.text, st.ink, { glow: st.glow });
    add(c, t);
    ref(t, 'characters', 'Label');
    ref(t, 'visible', 'Show Label');
    const ch = icon('Caret', 'size/icon-s', st.tint ? st.ink : 'color/text/muted', 'Pfeil');
    add(c, ch);
    ch.visible = false;
    ref(ch, 'visible', 'Show Chevron');
  });
}

function wavePeaks(cat, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let a;
    if (cat === 'Drums') a = 0.18 + 0.82 * Math.exp(-(i % 10) / 1.6);
    else if (cat === 'Bass') a = 0.5 + 0.35 * Math.abs(Math.sin(i * 0.55)) + 0.1 * Math.sin(i * 2.3);
    else if (cat === 'Chords') a = 0.55 + 0.25 * Math.sin(i * 0.19) + 0.12 * Math.sin(i * 1.7);
    else if (cat === 'Synth') a = 0.15 + 0.7 * Math.exp(-(i % 5) / 1.4);
    else if (cat === 'FX') a = 0.05 + 0.9 * Math.pow(i / n, 2.2);
    else a = 0.25 + 0.5 * Math.abs(Math.sin(i * 0.31)) * (0.6 + 0.4 * Math.sin(i * 0.07));
    out.push(Math.max(0.04, Math.min(1, a)));
  }
  return out;
}

async function buildAtoms() {
  figma.notify('Loopwerk: Atoms …', { timeout: 1500 });
  beginSection('Icons');
  for (const d of ICONS) await buildIcon(d);
  endSection();

  beginSection('Licht und Marken');
  await component('Atom/LED', 'Lichtpunkt bzw. Farbfeld in der Kategoriefarbe; Punkt mit Schein (Spurpunkt).', [['Shape', ['Dot', 'Square']], ['Category', CATS.concat(['Off'])]], [], async (c, v) => {
    const dot = v.Shape === 'Dot';
    const color = v.Category === 'Off' ? 'color/led/off' : 'color/cat/' + CAT_KEY[v.Category];
    box(c, { wv: dot ? 'size/led' : 'size/swatch', hv: dot ? 'size/led' : 'size/swatch', r: dot ? 'pill' : 'xs', fill: color });
    if (dot && v.Category !== 'Off') await fx(c, 'Glow/Cat/' + v.Category);
  });
  await component('Atom/Divider', 'Trennlinie: Haarlinie, Tastenlinie, Takt-/Schlaglinie, Spurtrenner.', [['Orientation', ['Horizontal', 'Vertical']], ['Tone', ['Line', 'Key', 'Grid-Bar', 'Grid-Beat', 'Row']]], [], async (c, v) => {
    const H = v.Orientation === 'Horizontal';
    const color = { Line: 'color/line/line', Key: 'color/line/key', 'Grid-Bar': 'color/line/grid-bar', 'Grid-Beat': 'color/line/grid-beat', Row: 'color/line/row' }[v.Tone];
    box(c, { w: H ? 120 : null, h: H ? null : 28, wv: H ? null : 'stroke/hair', hv: H ? 'stroke/hair' : null, fill: color });
  });
  await component('Atom/Beam', 'Lichtstrich (aktiver Reiter, Master-Kanal) mit Schein.', [], [], async (c) => {
    box(c, { w: 18, hv: 'stroke/bold', r: 'pill', fill: 'color/state/beam' });
    await fx(c, 'Glow/Beam');
  });
  await component('Atom/Waveform', 'Wellenform als 1-px-Lichtstriche im 3-px-Raster, Farbe der Kategorie. Skaliert mit (Constraints).', [['Category', CATS]], [], async (c, v) => {
    box(c, { w: 240, h: 34, opacity: 0.6 });
    const peaks = wavePeaks(v.Category, 80);
    peaks.forEach((a, i) => {
      const r = figma.createRectangle();
      r.name = 'Strich';
      const h = Math.max(1, Math.round(a * 34));
      r.resize(1, h);
      r.x = i * 3;
      r.y = Math.round((34 - h) / 2);
      r.fills = [P('color/cat/' + CAT_KEY[v.Category])];
      r.strokes = [];
      c.appendChild(r);
      r.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    });
  });
  await component('Atom/Playhead Grip', 'Griff der Abspielmarke im Lineal: Kappe mit Kerbe.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    box(c, { w: D ? 14 : 18, h: D ? 20 : 24, fill: 'color/state/beam' });
    setRadius(c, 's', ['topLeftRadius', 'topRightRadius']);
    setRadius(c, 'pill', ['bottomLeftRadius', 'bottomRightRadius']);
    await fx(c, 'Glow/Ink');
    const k = figma.createRectangle();
    k.name = 'Kerbe';
    k.resize(2, 8);
    k.fills = [P('color/text/on-accent')];
    k.strokes = [];
    k.opacity = 0.55;
    c.appendChild(k);
    k.x = (c.width - 2) / 2;
    k.y = 5;
    k.constraints = { horizontal: 'CENTER', vertical: 'MIN' };
  });
  await component('Atom/Playhead Line', 'Abspiellinie über den Spuren (leise, hell erst beim Spielen).', [], [], async (c) => {
    box(c, { wv: 'stroke/hair', h: 400, fill: 'color/line/playhead' });
  });
  await component('Atom/Clip Grip', 'Griffe am ausgewählten Clip: Ein-/Ausblenden (Quadrat), Lautstärke (Kreis), Kürzen (Kante).', [['Type', ['Fade', 'Volume', 'Trim']], ['Category', CATS]], [], async (c, v) => {
    if (v.Type === 'Trim') {
      box(c, { wv: 'stroke/bold', h: 20, r: 'pill', fill: 'color/line/trim' });
      return;
    }
    box(c, { wv: 'size/grip', hv: 'size/grip', r: v.Type === 'Volume' ? 'pill' : 'xs', fill: 'color/cat/' + CAT_KEY[v.Category], stroke: 'color/surface/bg', sw: 'stroke/bold' });
    await fx(c, 'Shadow/Lift');
  });
  await component('Atom/Selection Marks', 'Schnittmarken an den Ecken des ausgewählten Clips (dehnt sich mit).', [], [], async (c) => {
    box(c, { w: 108, h: 60 });
    const L = 8, t = 1.5;
    const corners = [[0, 0, 'MIN', 'MIN'], [1, 0, 'MAX', 'MIN'], [0, 1, 'MIN', 'MAX'], [1, 1, 'MAX', 'MAX']];
    for (const k of corners) {
      for (const horiz of [true, false]) {
        const r = figma.createRectangle();
        r.name = 'Marke';
        r.resize(horiz ? L : t, horiz ? t : L);
        r.fills = [P('color/text/ink')];
        r.strokes = [];
        c.appendChild(r);
        r.x = k[0] ? 108 - r.width : 0;
        r.y = k[1] ? 60 - r.height : 0;
        r.constraints = { horizontal: /** @type {any} */ (k[2]), vertical: /** @type {any} */ (k[3]) };
      }
    }
  });
  await component('Atom/Sheet Grip', 'Griff der Schublade (Handy groß und gut zu fassen).', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    box(c, { dir: 'H', align: 'CENTER', cross: 'CENTER', w: 240, h: D ? 18 : 24 });
    const r = figma.createRectangle();
    r.name = 'Griff';
    r.resize(D ? 36 : 64, D ? 3 : 5);
    r.fills = [P(D ? 'color/line/knob' : 'color/text/muted')];
    r.strokes = [];
    setRadius(r, 'pill');
    add(c, r);
  });
  await component('Atom/Brand', 'Wortmarke: Lichtstriche in den Kategoriefarben + „Loop“ dünn, „werk“ fett.', [], [{ name: 'Show Name', type: 'BOOLEAN', def: true }], async (c, v, ref) => {
    box(c, { dir: 'H', gap: 12, cross: 'CENTER' });
    const bars = F('Lichtstriche', { dir: 'H', gap: 4, cross: 'MAX', h: 22 });
    const hs = [14, 22, 17, 20, 11];
    ['drums', 'bass', 'chords', 'synth', 'own'].forEach((k, i) => {
      const r = figma.createRectangle();
      r.name = 'Strich ' + k;
      r.resize(2, hs[i]);
      r.fills = [P('color/cat/' + k)];
      r.strokes = [];
      r.opacity = 0.55;
      setRadius(r, 'xs');
      add(bars, r);
    });
    add(c, bars);
    const name = F('Name', { dir: 'H', cross: 'MAX' });
    add(name, await T('Loop', 'Loop', 'Display/Brand', 'color/text/ink'));
    add(name, await T('werk', 'werk', 'Display/Brand Bold', 'color/text/ink'));
    add(c, name);
    ref(name, 'visible', 'Show Name');
  });
  await component('Atom/Step', 'Schritt im Beat-Raster: leer = Haarlinie, gesetzt = Licht in der Spurfarbe.', [['State', ['Off', 'On']], ['Category', CATS]], [], async (c, v) => {
    const on = v.State === 'On';
    box(c, { wv: 'size/step-w', hv: 'size/step-h', r: 'xs', fill: on ? 'color/cat/' + CAT_KEY[v.Category] : null, stroke: on ? null : 'color/line/line' });
    if (on) await fx(c, 'Glow/Cat/' + v.Category);
  });
  endSection();

  beginSection('Tasten');
  await buttonLike('Atom/Key', 'Taste mit Haarlinie (.key, .tbtn, .dbtn). Aktiv = helle Linie mit Schrift-Schein, Primary = Weißglut (Export), Muted = Stumm, Rec = Aufnahme läuft. Nur Icon: Show Label aus und quadratisch ziehen.', KEY_SIZES, KEY_STATES, 's');
  await buttonLike('Atom/Pill', 'Pille (Handy: Raster, Klick, Loop; Speichern/Exportieren als Primary).', {
    S: { h: 'size/pill-s', px: 16, gap: 8, icon: 'size/icon', text: 'Mono/Key L' },
    M: { h: 'size/pill', px: 16, gap: 8, icon: 'size/icon', text: 'Mono/Key L' },
    L: { h: 'size/pill-l', px: 24, gap: 8, icon: 'size/icon', text: 'Mono/Key L' },
  }, { Default: KEY_STATES.Default, Active: KEY_STATES.Active, Primary: KEY_STATES.Primary, Disabled: KEY_STATES.Disabled }, 'pill');

  await component('Atom/Icon Button', 'Runder bzw. abgerundeter Icon-Knopf. Circle = Spielen-Linse (aktiv: Weißglut mit Schein), Rounded = Knöpfe im Suchfeld. Ghost ohne Rahmen.', [
    ['Shape', ['Circle', 'Rounded']], ['Size', ['S', 'M', 'L']], ['State', ['Default', 'Ghost', 'Active', 'Disabled', 'Rec']],
  ], [{ name: 'Icon', type: 'INSTANCE_SWAP', def: C['Atom/Icon/Play'], pref: iconPrefs() }], async (c, v, ref) => {
    const sz = { S: 'size/find', M: 'size/lens', L: 'size/lens-l' }[v.Size];
    const st = {
      Default: { stroke: v.Shape === 'Circle' ? 'color/line/active' : 'color/line/key' },
      Ghost: { tint: 'color/text/muted' },
      Active: { fill: 'color/state/beam', tint: 'color/text/on-accent', glow: true },
      Disabled: { stroke: 'color/line/key', tint: 'color/text/disabled' },
      Rec: { stroke: 'color/state/rec', tint: 'color/state/rec' },
    }[v.State];
    box(c, { dir: 'H', align: 'CENTER', cross: 'CENTER', wv: sz, hv: sz, r: v.Shape === 'Circle' ? 'pill' : 'l', fill: st.fill, stroke: st.stroke });
    if (st.glow) await fx(c, 'Glow/Beam');
    const ic = icon('Play', 'size/icon', st.tint);
    add(c, ic);
    ref(ic, 'mainComponent', 'Icon');
  });

  await component('Atom/Text Button', 'Knopf nur aus Schrift (+ Spur, Summe, Harmonie, Tastenkürzel).', [['State', ['Default', 'Active', 'Disabled']]], [
    { name: 'Label', type: 'TEXT', def: 'Text' },
    { name: 'Show Icon', type: 'BOOLEAN', def: false },
    { name: 'Icon', type: 'INSTANCE_SWAP', def: C['Atom/Icon/Plus'], pref: iconPrefs() },
    { name: 'Show Chevron', type: 'BOOLEAN', def: false },
  ], async (c, v, ref) => {
    const ink = { Default: 'color/text/muted', Active: 'color/text/ink', Disabled: 'color/text/disabled' }[v.State];
    box(c, { dir: 'H', gap: 4, p: [0, 4, 0, 4], cross: 'CENTER', hv: 'size/key-s' });
    const ic = icon('Plus', 'size/icon-s', ink);
    add(c, ic);
    ic.visible = false;
    ref(ic, 'visible', 'Show Icon');
    ref(ic, 'mainComponent', 'Icon');
    const t = await T('Beschriftung', 'Text', 'Mono/Key', ink, { glow: v.State === 'Active' });
    add(c, t);
    ref(t, 'characters', 'Label');
    const ch = icon('Chevron Down', 'size/icon-s', ink, 'Pfeil');
    add(c, ch);
    ch.visible = false;
    ref(ch, 'visible', 'Show Chevron');
  });

  await component('Atom/Underline Tab', 'Reiter mit Unterstrich (Regal: Suchen | Erstellen).', [['State', ['Default', 'Active']]], [{ name: 'Label', type: 'TEXT', def: 'Reiter' }], async (c, v, ref) => {
    const on = v.State === 'Active';
    box(c, { dir: 'H', p: [0, 8, 0, 8], align: 'CENTER', cross: 'CENTER', h: 32, stroke: on ? 'color/text/ink' : null, sw: 'stroke/bold', sides: [0, 0, 1, 0] });
    const t = await T('Beschriftung', 'Reiter', 'Display/Caps L', on ? 'color/text/ink' : 'color/text/muted');
    add(c, t);
    ref(t, 'characters', 'Label');
  });

  await component('Atom/Dropdown', 'Auswahlfeld (Projekt-Menü, Kit). Text kürzt mit …', [['Size', ['S', 'M', 'L']], ['State', ['Default', 'Disabled']]], [{ name: 'Value', type: 'TEXT', def: 'Auswahl' }], async (c, v, ref) => {
    const ink = v.State === 'Default' ? 'color/text/ink' : 'color/text/disabled';
    box(c, { dir: 'H', gap: 8, p: [0, 12, 0, 12], cross: 'CENTER', w: 150, hv: { S: 'size/key-s', M: 'size/key', L: 'size/key-l' }[v.Size], r: 's', stroke: 'color/line/key' });
    const t = await T('Wert', 'Auswahl', 'Body/M Medium', ink);
    add(c, t);
    truncate(t);
    ref(t, 'characters', 'Value');
    add(c, icon('Caret', 'size/icon-s', ink, 'Pfeil'));
  });
  endSection();

  beginSection('Schalter, Segmente, Chips');
  await component('Atom/Toggle', 'Schalter an/aus (.fxl-switch). An = Weißglut.', [['Size', ['M', 'L']], ['On', ['False', 'True']]], [], async (c, v) => {
    const on = v.On === 'True', L = v.Size === 'L';
    box(c, { dir: 'H', p: 2, align: on ? 'MAX' : 'MIN', cross: 'CENTER', wv: L ? 'size/toggle-w-l' : 'size/toggle-w', hv: L ? 'size/toggle-h-l' : 'size/toggle-h', r: 'pill', fill: on ? 'color/text/ink' : 'color/line/line' });
    const k = figma.createEllipse();
    k.name = 'Knopf';
    k.resize(L ? 22 : 14, L ? 22 : 14);
    k.fills = [P('color/surface/sheet')];
    k.strokes = [];
    add(c, k);
  });
  await component('Atom/Segment', 'Ein Segment einer Segmentgruppe (.seg). Aktiv = helle Haarlinie mit Schein.', [['Size', ['M', 'L']], ['State', ['Default', 'Active', 'Disabled']]], [
    { name: 'Label', type: 'TEXT', def: 'Segment' }, { name: 'Count', type: 'TEXT', def: '12' }, { name: 'Show Count', type: 'BOOLEAN', def: false },
  ], async (c, v, ref) => {
    const on = v.State === 'Active';
    const ink = { Default: 'color/text/muted', Active: 'color/text/ink', Disabled: 'color/text/disabled' }[v.State];
    box(c, { dir: 'V', gap: 2, p: [0, 12, 0, 12], align: 'CENTER', cross: 'CENTER', hv: v.Size === 'L' ? 'size/touch' : 'size/key-s', r: 'l', stroke: on ? 'color/line/active' : null });
    const t = await T('Beschriftung', 'Segment', v.Size === 'L' ? 'Mono/Key L' : 'Mono/Key', ink, { glow: on });
    add(c, t);
    ref(t, 'characters', 'Label');
    const n = await T('Anzahl', '12', 'Mono/Small', 'color/text/muted');
    add(c, n);
    n.visible = false;
    ref(n, 'characters', 'Count');
    ref(n, 'visible', 'Show Count');
  });
  await component('Atom/Chip', 'Filter-Chip (.chip), optional mit Kategorie-Punkt.', [['State', ['Default', 'Active']]], [
    { name: 'Label', type: 'TEXT', def: 'Chip' }, { name: 'Show Dot', type: 'BOOLEAN', def: false },
  ], async (c, v, ref) => {
    const on = v.State === 'Active';
    box(c, { dir: 'H', gap: 8, p: [0, 8, 0, 8], cross: 'CENTER', hv: 'size/key-s', r: 's', fill: on ? 'color/text/ink' : null, stroke: on ? null : 'color/line/key' });
    const dot = I('Atom/LED', { Category: 'Drums', Shape: 'Dot' }, null, 'Punkt');
    add(c, dot);
    dot.visible = false;
    exposed(dot);
    ref(dot, 'visible', 'Show Dot');
    const t = await T('Beschriftung', 'Chip', 'Mono/Key', on ? 'color/text/on-accent' : 'color/text/ink');
    add(c, t);
    ref(t, 'characters', 'Label');
  });
  await component('Atom/Tag', 'Etikett am Clip (.clip-tag), z. B. „Pattern“.', [], [{ name: 'Label', type: 'TEXT', def: 'Pattern' }], async (c, v, ref) => {
    box(c, { dir: 'H', p: [2, 4, 2, 4], cross: 'CENTER', r: 's', stroke: 'color/line/line' });
    const t = await T('Beschriftung', 'Pattern', 'Mono/Small', 'color/text/muted');
    add(c, t);
    ref(t, 'characters', 'Label');
  });
  await component('Atom/Radio', 'Auswahlkreis (Export-Format).', [['On', ['False', 'True']]], [], async (c, v) => {
    const on = v.On === 'True';
    box(c, { dir: 'H', align: 'CENTER', cross: 'CENTER', wv: 'size/check', hv: 'size/check', r: 'pill', stroke: on ? 'color/text/ink' : 'color/line/knob' });
    if (on) {
      const d = figma.createEllipse();
      d.name = 'Punkt';
      d.resize(8, 8);
      d.fills = [P('color/text/ink')];
      d.strokes = [];
      add(c, d);
    }
  });
  await component('Atom/Checkbox', 'Auswahlkästchen (Export-Optionen).', [['On', ['False', 'True']]], [], async (c, v) => {
    const on = v.On === 'True';
    box(c, { dir: 'H', align: 'CENTER', cross: 'CENTER', wv: 'size/check', hv: 'size/check', r: 'xs', fill: on ? 'color/text/ink' : null, stroke: on ? null : 'color/line/knob' });
    if (on) {
      const k = figma.createVector();
      const np = normPath('M 3.5 8.5 L 6.5 11.5 L 12.5 4.5');
      k.vectorPaths = [{ windingRule: 'NONE', data: np.data }];
      k.name = 'Haken';
      k.fills = [];
      k.strokes = [P('color/text/on-accent')];
      bindF(k, 'strokeWeight', 'stroke/bold');
      k.strokeCap = 'ROUND';
      k.strokeJoin = 'ROUND';
      add(c, k);
    }
  });
  endSection();

  beginSection('Eingaben und Anzeigen');
  await component('Atom/Input', 'Eingabefeld in der Mulde (Suche, Projektname). Fokus = helle Linie.', [['Type', ['Search', 'Text']], ['State', ['Default', 'Focus']]], [{ name: 'Value', type: 'TEXT', def: 'Suchen …' }], async (c, v, ref) => {
    const S = v.Type === 'Search';
    box(c, { dir: 'H', gap: 8, p: [0, 12, 0, 12], cross: 'CENTER', w: 240, hv: 'size/input', r: 'l', fill: 'color/surface/well', stroke: v.State === 'Focus' ? 'color/state/focus' : 'color/line/key', sw: v.State === 'Focus' ? 'stroke/bold' : 'stroke/hair' });
    if (S) add(c, icon('Search', 'size/icon', 'color/text/muted', 'Lupe'));
    const t = await T('Wert', S ? 'Suchen …' : 'Beispiel-Arrangement', S ? 'Body/M' : 'Display/Name', S ? 'color/text/muted' : 'color/text/ink');
    add(c, t);
    truncate(t);
    ref(t, 'characters', 'Value');
  });
  await component('Atom/LCD Value', 'Display-Ziffern ohne Kasten. Editable = dünne Linie darunter (einstellbar, z. B. Tempo).', [['Size', ['L', 'M']], ['Editable', ['False', 'True']]], [
    { name: 'Value', type: 'TEXT', def: '120' }, { name: 'Show Chevron', type: 'BOOLEAN', def: false },
  ], async (c, v, ref) => {
    const ed = v.Editable === 'True';
    box(c, { dir: 'H', gap: 4, p: ed ? [0, 4, 2, 4] : 0, cross: 'CENTER', stroke: ed ? 'color/line/key' : null, sides: [0, 0, 1, 0] });
    const t = await T('Ziffern', '120', v.Size === 'L' ? 'LCD/L' : 'LCD/M', 'color/text/ink');
    add(c, t);
    ref(t, 'characters', 'Value');
    const ch = icon('Caret', 'size/icon-s', 'color/text/muted', 'Pfeil');
    add(c, ch);
    ch.visible = false;
    ref(ch, 'visible', 'Show Chevron');
  });
  await component('Atom/Label', 'Beschriftung in Mono-Großbuchstaben mit Laufweite (.lcd-label, .insp-kind).', [['Size', ['S', 'M']], ['Tone', ['Muted', 'Ink'].concat(CATS)]], [{ name: 'Label', type: 'TEXT', def: 'Takt' }], async (c, v, ref) => {
    box(c, { dir: 'H', cross: 'CENTER' });
    const color = v.Tone === 'Muted' ? 'color/text/muted' : v.Tone === 'Ink' ? 'color/text/ink' : 'color/cat/' + CAT_KEY[v.Tone];
    const t = await T('Beschriftung', 'Takt', v.Size === 'M' ? 'Mono/Label L' : 'Mono/Label', color);
    add(c, t);
    ref(t, 'characters', 'Label');
  });
  await component('Atom/Slider', 'Regler: Linie mit Griff. Wert = Breite von „Wert“ (ziehen), Gesamtbreite frei.', [['Size', ['M', 'L']]], [], async (c, v) => {
    const L = v.Size === 'L';
    box(c, { dir: 'H', cross: 'CENTER', w: 240, h: L ? 44 : 16 });
    const mk = (name, w, color) => {
      const r = figma.createRectangle();
      r.name = name;
      r.resize(w, 4);
      r.fills = [P(color)];
      r.strokes = [];
      setRadius(r, 'pill');
      return r;
    };
    add(c, mk('Wert', 140, 'color/text/ink'));
    const k = figma.createEllipse();
    k.name = 'Griff';
    k.resize(L ? 20 : 14, L ? 20 : 14);
    k.fills = [P('color/text/ink')];
    k.strokes = [];
    add(c, k);
    add(c, mk('Rest', 80, 'color/line/key'), { w: 'FILL' });
  });
  await component('Atom/Fader', 'Senkrechter Regler im Kanalzug. Wert = Höhe von „Wert“.', [['Size', ['M', 'L']]], [], async (c, v) => {
    const L = v.Size === 'L';
    box(c, { dir: 'V', cross: 'CENTER', w: L ? 30 : 22, h: 120 });
    const mk = (name, h, color) => {
      const r = figma.createRectangle();
      r.name = name;
      r.resize(4, h);
      r.fills = [P(color)];
      r.strokes = [];
      setRadius(r, 'pill');
      return r;
    };
    add(c, mk('Rest', 40, 'color/line/key'), { h: 'FILL' });
    const k = figma.createEllipse();
    k.name = 'Griff';
    k.resize(L ? 20 : 14, L ? 20 : 14);
    k.fills = [P('color/text/ink')];
    k.strokes = [];
    add(c, k);
    add(c, mk('Wert', 64, 'color/text/ink'));
  });
  await component('Atom/Knob', 'Drehknopf (.knob): Ring als Linie, Wert als Lichtbogen, Zeiger.', [['Size', ['S', 'M', 'L']], ['Value', ['Low', 'Center', 'High']]], [], async (c, v) => {
    const size = num({ S: 'size/knob-s', M: 'size/knob', L: 'size/knob-l' }[v.Size]);
    box(c, { wv: { S: 'size/knob-s', M: 'size/knob', L: 'size/knob-l' }[v.Size], hv: { S: 'size/knob-s', M: 'size/knob', L: 'size/knob-l' }[v.Size] });
    const ring = figma.createEllipse();
    ring.name = 'Ring';
    ring.resize(size, size);
    ring.fills = [];
    ring.strokes = [P('color/line/knob')];
    ring.strokeAlign = 'INSIDE';
    bindF(ring, 'strokeWeight', 'stroke/hair');
    c.appendChild(ring);
    ring.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    const start = (135 * Math.PI) / 180;
    const frac = { Low: 0.12, Center: 0.5, High: 0.78 }[v.Value];
    const end = start + frac * 1.5 * Math.PI;
    if (v.Value !== 'Center') {
      const arc = figma.createEllipse();
      arc.name = 'Bogen';
      arc.resize(size, size);
      arc.arcData = { startingAngle: start, endingAngle: end, innerRadius: 1 - 4 / size };
      arc.fills = [P('color/text/ink')];
      arc.strokes = [];
      c.appendChild(arc);
      arc.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    }
    const r1 = size * 0.12, r2 = size * 0.4, cx = size / 2;
    const ind = figma.createVector();
    const np = normPath('M ' + (cx + r1 * Math.cos(end)).toFixed(2) + ' ' + (cx + r1 * Math.sin(end)).toFixed(2) + ' L ' + (cx + r2 * Math.cos(end)).toFixed(2) + ' ' + (cx + r2 * Math.sin(end)).toFixed(2));
    ind.vectorPaths = [{ windingRule: 'NONE', data: np.data }];
    ind.name = 'Zeiger';
    ind.fills = [];
    ind.strokes = [P('color/text/ink')];
    bindF(ind, 'strokeWeight', 'stroke/bold');
    ind.strokeCap = 'ROUND';
    c.appendChild(ind);
    ind.x = np.x; ind.y = np.y;
    ind.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
  });
  await component('Atom/Meter', 'Pegelanzeige in Stufen (Deck: waagerecht, Mixer: senkrecht).', [['Orientation', ['Horizontal', 'Vertical']], ['Level', ['Off', 'Low', 'Hot']]], [], async (c, v) => {
    const H = v.Orientation === 'Horizontal';
    const n = H ? 28 : 24;
    box(c, { dir: H ? 'H' : 'V', gap: 2, cross: 'CENTER' });
    for (let i = 0; i < n; i++) {
      const k = H ? i : n - 1 - i;
      const f = k / n;
      let color = 'color/meter/off';
      if (v.Level === 'Low' && f < 0.5) color = 'color/meter/ok';
      if (v.Level === 'Hot') color = f < 0.65 ? 'color/meter/ok' : f < 0.85 ? 'color/meter/warm' : 'color/meter/hot';
      const r = figma.createRectangle();
      r.name = 'Stufe ' + (k + 1);
      r.resize(H ? 2 : 8, H ? 10 : 2);
      r.fills = [P(color)];
      r.strokes = [];
      add(c, r);
    }
  });
  endSection();

  beginSection('Flächen');
  const SURF = {
    Panel: { fill: 'color/surface/panel', stroke: 'color/line/line', r: 's' },
    Deck: { fill: 'color/surface/deck', r: 's' },
    Sheet: { fill: 'color/surface/sheet', r: 'l' },
    Well: { fill: 'color/surface/well', stroke: 'color/line/key', r: 'l' },
    Outline: { stroke: 'color/line/key', r: 'l' },
    Head: { fill: 'color/surface/head' },
    Raised: { fill: 'color/surface/raised' },
  };
  await component('Atom/Surface', 'Fläche als Hintergrund hinter Inhalt (absolut, dehnt sich mit): Panel, Deck, Schublade, Mulde …', [['Type', Object.keys(SURF)]], [], async (c, v) => {
    const s = SURF[v.Type];
    box(c, { w: 160, h: 96, fill: s.fill, stroke: s.stroke, r: s.r });
  });
  await component('Atom/Category Frame', 'Rahmen in der Kategoriefarbe (Clip-Karte im Inspektor).', [['Category', CATS]], [], async (c, v) => {
    box(c, { w: 160, h: 96, r: 's', stroke: 'color/cat/' + CAT_KEY[v.Category], sw: 'stroke/focus' });
  });
  await component('Atom/Slot', 'Platzhalter für den Inhalt einer Schublade (per Instance-Swap ersetzen).', [], [], async (c) => {
    box(c, { dir: 'H', align: 'CENTER', cross: 'CENTER', w: 240, h: 120, r: 's', stroke: 'color/text/muted', dash: [4, 4] });
    add(c, await T('Hinweis', 'Inhalt', 'Body/S', 'color/text/muted'));
  });
  endSection();
}

// ---------------------------------------------------------------- Molecules

async function lcdField(c, v, ref) {
  box(c, { dir: 'V', p: [2, 8, 2, 8] });
  const lab = I('Atom/Label', { Size: 'S', Tone: v.Mode === 'Editable' ? 'Ink' : 'Muted' }, { Label: 'Takt' }, 'Beschriftung');
  add(c, lab);
  exposed(lab);
  const val = I('Atom/LCD Value', { Size: 'L', Editable: v.Mode === 'Editable' ? 'True' : 'False' }, { Value: '001' }, 'Wert');
  add(c, val);
  exposed(val);
}

async function buildMolecules() {
  figma.notify('Loopwerk: Molecules …', { timeout: 1500 });
  beginSection('Deck');
  await component('Molecule/Transport', 'Transport-Gruppe: Zum Anfang · Spielen-Linse · Loop | Aufnahme · Einstellen · Klick. Handy: Anfang, Linse, runder Aufnahme-Knopf.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    if (v.Device === 'Desktop') {
      box(c, { dir: 'H', gap: 12, cross: 'CENTER' });
      const play = F('Wiedergabe', { dir: 'H', gap: 8, cross: 'CENTER' });
      const home = I('Atom/Key', { Size: 'M', State: 'Default' }, { 'Show Label': false, 'Show Icon': true, Icon: C['Atom/Icon/Home'] }, 'Zum Anfang');
      add(play, home); square(home, 'size/key');
      add(play, I('Atom/Icon Button', { Shape: 'Circle', Size: 'M', State: 'Default' }, { Icon: C['Atom/Icon/Play'] }, 'Abspielen'));
      add(play, I('Atom/Key', { Size: 'M', State: 'Default' }, { Label: 'Loop', 'Show Icon': true, Icon: C['Atom/Icon/Loop'] }, 'Loop'));
      add(c, play);
      const rec = F('Aufnahme', { dir: 'H', gap: 4, cross: 'CENTER' });
      const r = I('Atom/Key', { Size: 'M', State: 'Default' }, { 'Show Label': false, 'Show Icon': true, Icon: C['Atom/Icon/Rec'] }, 'Aufnahme');
      add(rec, r); square(r, 'size/key');
      const more = I('Atom/Key', { Size: 'M', State: 'Default' }, { 'Show Label': false, 'Show Chevron': true }, 'Aufnahme einstellen');
      add(rec, more);
      more.resize(20, num('size/key'));
      bindF(more, 'paddingLeft', 'space/4');
      bindF(more, 'paddingRight', 'space/4');
      add(rec, I('Atom/Key', { Size: 'M', State: 'Default' }, { Label: 'Klick', 'Show Icon': true, Icon: C['Atom/Icon/Metronome'] }, 'Klick'));
      add(c, rec);
    } else {
      box(c, { dir: 'H', gap: 4, cross: 'CENTER' });
      const home = I('Atom/Key', { Size: 'L', State: 'Default' }, { 'Show Label': false, 'Show Icon': true, Icon: C['Atom/Icon/Home'] }, 'Zum Anfang');
      add(c, home); square(home, 'size/key-l');
      add(c, I('Atom/Icon Button', { Shape: 'Circle', Size: 'M', State: 'Default' }, { Icon: C['Atom/Icon/Play'] }, 'Abspielen'));
      add(c, I('Atom/Icon Button', { Shape: 'Circle', Size: 'M', State: 'Default' }, { Icon: C['Atom/Icon/Rec'] }, 'Aufnahme'));
    }
  });
  await component('Molecule/LCD Field', 'Display-Zelle: Beschriftung über Ziffern. Editable mit Linie (Tempo, Tonart).', [['Mode', ['Display', 'Editable']]], [], lcdField);
  await component('Molecule/Meter Field', 'Pegel im Deck: Beschriftung „Master“ über der Stufenanzeige.', [], [], async (c) => {
    box(c, { dir: 'V', gap: 8 });
    add(c, I('Atom/Label', { Size: 'S', Tone: 'Muted' }, { Label: 'Master' }, 'Beschriftung'));
    add(c, I('Atom/Meter', { Orientation: 'Horizontal', Level: 'Off' }, null, 'Pegel'));
  });
  endSection();

  beginSection('Regal');
  await component('Molecule/Search Row', 'Suchzeile im Regal: Lupe · Suchtext · Regler (Länge/Ordnen) · Stern (Favoriten).', [], [{ name: 'Placeholder', type: 'TEXT', def: 'Suchen … (536)' }], async (c, v, ref) => {
    box(c, { dir: 'H', gap: 8, p: [0, 4, 0, 12], cross: 'CENTER', w: 246, hv: 'size/input', r: 'l', fill: 'color/surface/well', stroke: 'color/line/key' });
    add(c, icon('Search', 'size/icon', 'color/text/muted', 'Lupe'));
    const t = await T('Suchtext', 'Suchen … (536)', 'Body/M', 'color/text/muted');
    add(c, t);
    truncate(t);
    ref(t, 'characters', 'Placeholder');
    add(c, I('Atom/Divider', { Orientation: 'Vertical', Tone: 'Key' }, null, 'Trenner'));
    const fb = I('Atom/Icon Button', { Shape: 'Rounded', Size: 'S', State: 'Ghost' }, { Icon: C['Atom/Icon/Sliders'] }, 'Filter');
    add(c, fb); exposed(fb);
    const st = I('Atom/Icon Button', { Shape: 'Rounded', Size: 'S', State: 'Ghost' }, { Icon: C['Atom/Icon/Star'] }, 'Favoriten');
    add(c, st); exposed(st);
  });
  await component('Molecule/Shelf Row', 'Regal-Zeile: Kategorie-Punkt, Name, Länge, Stern. Gewählt = Hauch und Linie links.', [['State', ['Default', 'Selected']]], [
    { name: 'Name', type: 'TEXT', def: 'Four to the Floor' }, { name: 'Length', type: 'TEXT', def: '1 Takt' },
  ], async (c, v, ref) => {
    const sel = v.State === 'Selected';
    box(c, { dir: 'H', gap: 8, p: [8, 8, 8, 8], cross: 'CENTER', w: 254, r: 's', fill: sel ? 'color/overlay/white-04' : null, stroke: sel ? 'color/text/ink' : null, sw: 'stroke/bold', sides: [0, 0, 0, 1] });
    const dot = I('Atom/LED', { Shape: 'Dot', Category: 'Drums' }, null, 'Punkt');
    add(c, dot); exposed(dot);
    const n = await T('Name', 'Four to the Floor', 'Body/M', 'color/text/ink');
    add(c, n); truncate(n);
    ref(n, 'characters', 'Name');
    const l = await T('Länge', '1 Takt', 'Mono/Small', 'color/text/muted');
    add(c, l);
    ref(l, 'characters', 'Length');
    add(c, icon('Star', 'size/icon', sel ? 'color/text/ink' : 'color/text/muted', 'Favorit'));
  });
  await component('Molecule/Accordion Head', 'Akkordeon-Kopf einer Regal-Gruppe: Farbfeld, Name, Anzahl, Pfeil.', [['State', ['Closed', 'Open']]], [
    { name: 'Title', type: 'TEXT', def: 'Drums' }, { name: 'Count', type: 'TEXT', def: '261' },
  ], async (c, v, ref) => {
    const open = v.State === 'Open';
    box(c, { dir: 'H', gap: 8, p: [0, 8, 0, 8], cross: 'CENTER', w: 254, h: 36, r: 's' });
    const sw = I('Atom/LED', { Shape: 'Square', Category: 'Drums' }, null, 'Farbe');
    add(c, sw); exposed(sw);
    const t = await T('Titel', 'Drums', 'Display/Caps', open ? 'color/text/ink' : 'color/text/muted');
    add(c, t); truncate(t);
    ref(t, 'characters', 'Title');
    const n = await T('Anzahl', '261', 'Mono/Label L', 'color/text/muted');
    add(c, n);
    ref(n, 'characters', 'Count');
    add(c, icon(open ? 'Chevron Down' : 'Chevron Right', 'size/icon', open ? 'color/text/ink' : 'color/text/muted', 'Pfeil'));
  });
  await component('Molecule/Left Tabs', 'Reiter oben im Regal: Suchen | Erstellen.', [['Active', ['Search', 'Create']]], [], async (c, v) => {
    box(c, { dir: 'H', gap: 4, w: 246 });
    add(c, I('Atom/Underline Tab', { State: v.Active === 'Search' ? 'Active' : 'Default' }, { Label: 'Suchen' }, 'Suchen'), { w: 'FILL' });
    add(c, I('Atom/Underline Tab', { State: v.Active === 'Create' ? 'Active' : 'Default' }, { Label: 'Erstellen' }, 'Erstellen'), { w: 'FILL' });
  });
  endSection();

  beginSection('Arranger');
  await component('Molecule/Track Head', 'Spurkopf: Lichtpunkt, Name, Menü · Stumm, Solo, Lautstärke, Aufklappen. Stumm = Name durchgestrichen, Solo = Weißglut.', [
    ['Device', ['Desktop', 'Phone']], ['State', ['Default', 'Selected', 'Muted', 'Solo']],
  ], [{ name: 'Name', type: 'TEXT', def: 'Drums' }], async (c, v, ref) => {
    const D = v.Device === 'Desktop';
    const sel = v.State === 'Selected', mute = v.State === 'Muted';
    box(c, { dir: 'V', gap: 4, p: D ? [0, 8, 0, 12] : [0, 4, 0, 8], align: 'CENTER', wv: D ? 'size/track-head' : 'size/track-head-phone', hv: D ? 'size/track-h' : 'size/track-h-phone', fill: sel ? ['color/surface/head', 'color/overlay/white-04'] : 'color/surface/head', stroke: sel ? 'color/text/ink' : null, sw: 'stroke/bold', sides: [0, 0, 0, 1] });
    const top = F('Kopfzeile', { dir: 'H', gap: 8, cross: 'CENTER' });
    add(c, top, { w: 'FILL' });
    const dot = I('Atom/LED', { Shape: 'Dot', Category: 'Drums' }, null, 'Punkt');
    add(top, dot); exposed(dot);
    if (mute) dot.opacity = 0.25;
    const n = await T('Name', 'Drums', 'Body/Strong', mute ? 'color/text/muted' : 'color/text/ink', { strike: mute });
    add(top, n); truncate(n);
    ref(n, 'characters', 'Name');
    add(top, icon('More', 'size/icon', 'color/text/muted', 'Menü'));
    const bot = F('Bedienung', { dir: 'H', gap: D ? 8 : 4, cross: 'CENTER' });
    add(c, bot, { w: 'FILL' });
    const ks = D ? 'XS' : 'S';
    const m = I('Atom/Key', { Size: ks, State: mute ? 'Muted' : 'Default' }, { Label: 'M' }, 'Stumm');
    add(bot, m);
    const s = I('Atom/Key', { Size: ks, State: v.State === 'Solo' ? 'Primary' : 'Default' }, { Label: 'S' }, 'Solo');
    add(bot, s);
    if (!D) { m.resize(36, num('size/key-s')); s.resize(36, num('size/key-s')); bindF(m, 'width', 'size/key'); bindF(s, 'width', 'size/key'); }
    if (D) add(bot, I('Atom/Knob', { Size: 'S', Value: 'High' }, null, 'Lautstärke'));
    add(bot, F('Abstand', { dir: 'H' }), { w: 'FILL' });
    add(bot, icon('Chevron Down', 'size/icon', 'color/text/muted', 'Aufklappen'));
  });
  await component('Molecule/Clip', 'Clip: dunkler Körper, Kante und Name in der Kategoriefarbe, Wellenform als Licht. Ausgewählt: weiße Kante, Schnittmarken, Griffe.', [
    ['Category', CATS], ['State', ['Default', 'Selected']],
  ], [{ name: 'Name', type: 'TEXT', def: 'Clip' }, { name: 'Show Tag', type: 'BOOLEAN', def: false }], async (c, v, ref) => {
    const sel = v.State === 'Selected';
    const k = CAT_KEY[v.Category];
    box(c, { dir: 'V', w: 288, h: 52, r: 's', fill: sel ? 'color/surface/clip-selected' : 'color/surface/clip', stroke: sel ? 'color/text/ink' : 'color/cat-edge/' + k });
    const top = F('Kopf', { dir: 'H', gap: 8, p: [0, 8, 0, 8], cross: 'CENTER', h: 18 });
    add(c, top, { w: 'FILL' });
    const n = await T('Name', 'Clip', 'Body/Strong S', 'color/cat/' + k);
    add(top, n); truncate(n);
    ref(n, 'characters', 'Name');
    const tag = I('Atom/Tag', null, null, 'Etikett');
    add(top, tag);
    tag.visible = false;
    exposed(tag);
    ref(tag, 'visible', 'Show Tag');
    const w = I('Atom/Waveform', { Category: v.Category }, null, 'Wellenform');
    add(c, w, { w: 'FILL', h: 'FILL' });
    if (sel) {
      w.opacity = 0.85;
      add(c, I('Atom/Clip Grip', { Type: 'Fade', Category: v.Category }, null, 'Einblenden'), { abs: true, x: 0, y: 14 });
      add(c, I('Atom/Clip Grip', { Type: 'Volume', Category: v.Category }, null, 'Lautstärke'), { abs: true, x: 138, y: 14, cx: 'CENTER' });
      add(c, I('Atom/Clip Grip', { Type: 'Fade', Category: v.Category }, null, 'Ausblenden'), { abs: true, x: 276, y: 14, cx: 'MAX' });
      add(c, I('Atom/Clip Grip', { Type: 'Trim', Category: v.Category }, null, 'Kante links'), { abs: true, x: 3, y: 26 });
      add(c, I('Atom/Clip Grip', { Type: 'Trim', Category: v.Category }, null, 'Kante rechts'), { abs: true, x: 283, y: 26, cx: 'MAX' });
      const mk = I('Atom/Selection Marks', null, null, 'Schnittmarken');
      add(c, mk, { abs: true, x: -4, y: -4, cx: 'STRETCH', cy: 'STRETCH' });
      mk.resize(296, 60);
    }
  });
  await component('Molecule/Ruler Bar', 'Ein Takt im Lineal: Taktzahl und Taktlinie.', [['Device', ['Desktop', 'Phone']]], [{ name: 'Bar', type: 'TEXT', def: '1' }], async (c, v, ref) => {
    const D = v.Device === 'Desktop';
    box(c, { wv: 'size/bar', hv: D ? 'size/ruler' : 'size/ruler-phone', fill: 'color/surface/ruler', stroke: 'color/line/line', sides: [0, 0, 1, 0] });
    const l = I('Atom/Divider', { Orientation: 'Vertical', Tone: 'Grid-Bar' }, null, 'Taktlinie');
    c.appendChild(l);
    l.resize(1, c.height);
    l.constraints = { horizontal: 'MIN', vertical: 'STRETCH' };
    const t = await T('Taktzahl', '1', D ? 'Mono/Small' : 'Mono/Small L', 'color/text/muted');
    c.appendChild(t);
    t.x = 4; t.y = D ? 8 : 10;
    ref(t, 'characters', 'Bar');
  });
  await component('Molecule/Grid Bar', 'Raster eines Takts auf der Spur: Taktlinie und drei Schlaglinien.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    box(c, { wv: 'size/bar', hv: D ? 'size/track-h' : 'size/track-h-phone' });
    for (let i = 0; i < 4; i++) {
      const l = I('Atom/Divider', { Orientation: 'Vertical', Tone: i ? 'Grid-Beat' : 'Grid-Bar' }, null, i ? 'Schlag ' + (i + 1) : 'Takt');
      c.appendChild(l);
      l.resize(1, c.height);
      l.x = i * 24;
      l.constraints = { horizontal: 'SCALE', vertical: 'STRETCH' };
    }
  });
  await component('Molecule/Ruler Corner', 'Ecke über den Spurköpfen: „Takt“ und Harmonie-Schalter.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    box(c, { dir: 'H', p: [0, 12, 0, 12], align: 'SPACE_BETWEEN', cross: 'CENTER', wv: D ? 'size/track-head' : 'size/track-head-phone', hv: D ? 'size/ruler' : 'size/ruler-phone', fill: 'color/surface/ruler', stroke: 'color/line/line', sides: [0, 0, 1, 0] });
    if (D) add(c, I('Atom/Label', { Size: 'S', Tone: 'Muted' }, { Label: 'Takt' }, 'Takt'));
    add(c, I('Atom/Text Button', { State: 'Default' }, { Label: 'Harmonie', 'Show Chevron': true }, 'Harmonie'));
  });
  endSection();

  beginSection('Inspektor');
  await component('Molecule/Inspector Head', 'Kopf im Inspektor: Art (Clip/Spur/Song) und Name.', [['Kind', ['Clip', 'Track', 'Song']]], [
    { name: 'Name', type: 'TEXT', def: 'Bass Am–F–C–G' }, { name: 'Meta', type: 'TEXT', def: 'Takt 5–16 · 12 Takte' },
  ], async (c, v, ref) => {
    const clip = v.Kind === 'Clip';
    box(c, { dir: 'V', gap: 4, p: clip ? [12, 12, 8, 12] : 0, w: 270, fill: clip ? 'color/surface/raised' : null });
    if (v.Kind === 'Song') {
      add(c, I('Atom/Label', { Size: 'S', Tone: 'Muted' }, { Label: 'Song' }, 'Art'));
      const t = await T('Name', 'Beispiel-Arrangement', 'Display/XL', 'color/text/ink');
      add(c, t); truncate(t);
      ref(t, 'characters', 'Name');
      return;
    }
    const row = F('Zeile', { dir: 'H', gap: 8, cross: 'CENTER' });
    add(c, row, { w: 'FILL' });
    const art = I('Atom/Label', { Size: 'S', Tone: clip ? 'Bass' : 'Muted' }, { Label: clip ? 'Clip' : 'Spur' }, 'Art');
    add(row, art); exposed(art);
    add(row, await T('Punkt', '·', 'Body/S', 'color/text/muted'));
    if (clip) { const sw = I('Atom/LED', { Shape: 'Square', Category: 'Bass' }, null, 'Farbe'); add(row, sw); exposed(sw); }
    const n = await T('Name', clip ? 'Bass Am–F–C–G' : 'Bass', 'Body/Strong L', 'color/text/ink');
    add(row, n); truncate(n);
    ref(n, 'characters', 'Name');
    const m = await T('Meta', clip ? 'Takt 5–16 · 12 Takte' : 'Gilt für alle Clips der Spur · 1 Clip', 'Body/XS', 'color/text/muted');
    add(c, m); truncate(m);
    ref(m, 'characters', 'Meta');
  });
  await component('Molecule/Inspector Row', 'Inspektor-Zeile: Beschriftung, Wert, Regler darunter.', [['Device', ['Desktop', 'Phone']]], [
    { name: 'Label', type: 'TEXT', def: 'Lautstärke' }, { name: 'Value', type: 'TEXT', def: '0,0 dB' },
  ], async (c, v, ref) => {
    const D = v.Device === 'Desktop';
    box(c, { dir: 'V', gap: 4, w: D ? 270 : 366 });
    const top = F('Kopf', { dir: 'H', gap: 8, cross: 'CENTER' });
    add(c, top, { w: 'FILL' });
    const l = await T('Beschriftung', 'Lautstärke', 'Body/S', 'color/text/muted');
    add(top, l); truncate(l);
    ref(l, 'characters', 'Label');
    const w = await T('Wert', '0,0 dB', 'Mono/Value', 'color/text/ink');
    add(top, w);
    ref(w, 'characters', 'Value');
    add(c, I('Atom/Slider', { Size: D ? 'M' : 'L' }, null, 'Regler'), { w: 'FILL' });
  });
  await component('Molecule/Effect Row', 'Effekt-Zeile: Schalter, Name, Kurzfassung.', [['On', ['False', 'True']]], [
    { name: 'Name', type: 'TEXT', def: 'Verzerrer' }, { name: 'Summary', type: 'TEXT', def: 'aus' },
  ], async (c, v, ref) => {
    const on = v.On === 'True';
    box(c, { dir: 'H', gap: 12, p: [8, 8, 8, 8], cross: 'CENTER', w: 270, r: 's' });
    add(c, I('Atom/Toggle', { Size: 'M', On: v.On }, null, 'Schalter'));
    const n = await T('Name', 'Verzerrer', 'Body/Strong', 'color/text/ink');
    add(c, n); truncate(n);
    ref(n, 'characters', 'Name');
    const s = await T('Kurzfassung', on ? 'an' : 'aus', 'Body/XS', on ? 'color/text/ink' : 'color/text/muted');
    add(c, s);
    ref(s, 'characters', 'Summary');
  });
  await component('Molecule/Mastering Head', 'Mastering-Kopf: Name und Schalter, darunter der Messwert (nur an).', [['Device', ['Desktop', 'Phone']], ['On', ['False', 'True']]], [
    { name: 'Meter', type: 'TEXT', def: '−14,0 LUFS · Spitze −1,0 dBTP' },
  ], async (c, v, ref) => {
    const on = v.On === 'True', D = v.Device === 'Desktop';
    box(c, { dir: 'V', gap: 4, w: D ? 270 : 366 });
    const top = F('Kopf', { dir: 'H', gap: 12, cross: 'CENTER' });
    add(c, top, { w: 'FILL' });
    const t = await T('Name', 'Mastering', 'Display/Caps', on ? 'color/text/ink' : 'color/text/muted');
    add(top, t); truncate(t);
    add(top, I('Atom/Toggle', { Size: D ? 'M' : 'L', On: v.On }, null, 'Schalter'));
    if (on) {
      const m = await T('Messwert', '−14,0 LUFS · Spitze −1,0 dBTP', 'Mono/Small', 'color/text/ink');
      add(c, m);
      ref(m, 'characters', 'Meter');
    }
  });
  await component('Molecule/Segment Group', 'Segmentgruppe (Länge, Ordnen, Stil, Vergleich). Segmente sind freigelegt.', [['Size', ['M', 'L']], ['Count', ['2', '3', '4', '5']]], [], async (c, v) => {
    box(c, { dir: 'H', gap: 2, p: 2, cross: 'CENTER', r: 'l', stroke: 'color/line/key' });
    const n = Number(v.Count);
    for (let i = 0; i < n; i++) {
      const s = I('Atom/Segment', { Size: v.Size, State: i === 0 ? 'Active' : 'Default' }, { Label: 'Wahl ' + (i + 1) }, 'Segment ' + (i + 1));
      add(c, s); exposed(s);
    }
  });
  endSection();

  beginSection('Fachleiste, Rückmeldungen');
  await component('Molecule/Tab Item', 'Eintrag der Fachleiste (#tabbar): Icon und Beschriftung. Aktiv: Schubladen-Grund, Lichtstrich oben.', [
    ['Device', ['Desktop', 'Phone']], ['State', ['Default', 'Active', 'Disabled']],
  ], [{ name: 'Label', type: 'TEXT', def: 'Mixer' }, { name: 'Icon', type: 'INSTANCE_SWAP', def: C['Atom/Icon/Mixer'], pref: iconPrefs() }], async (c, v, ref) => {
    const D = v.Device === 'Desktop', on = v.State === 'Active';
    const ink = { Default: 'color/text/muted', Active: 'color/text/ink', Disabled: 'color/text/disabled' }[v.State];
    if (D) box(c, { dir: 'H', gap: 8, p: [0, 16, 0, 16], cross: 'CENTER', hv: 'size/tabbar', fill: on ? 'color/surface/sheet' : null });
    else box(c, { dir: 'V', gap: 4, p: [0, 4, 0, 4], align: 'CENTER', cross: 'CENTER', w: 92, h: 52, r: 's', fill: on ? 'color/surface/sheet' : null });
    const ic = icon('Mixer', D ? 'size/icon' : 'size/icon-m', ink);
    add(c, ic);
    ref(ic, 'mainComponent', 'Icon');
    const t = await T('Beschriftung', 'Mixer', D ? 'Mono/Key' : 'Mono/Key L', ink, { glow: on });
    add(c, t);
    ref(t, 'characters', 'Label');
    if (on) {
      const b = I('Atom/Beam', null, null, 'Lichtstrich');
      add(c, b, { abs: true, x: Math.round((c.width - 18) / 2), y: 0, cx: 'CENTER' });
    }
  });
  await component('Molecule/Hint', 'Einblender (#hint): kurze Rückmeldung, optional mit „Fertig“.', [], [
    { name: 'Message', type: 'TEXT', def: '6 Schläge gerückt (1/8).' }, { name: 'Show Action', type: 'BOOLEAN', def: false },
  ], async (c, v, ref) => {
    box(c, { dir: 'H', gap: 12, p: [8, 8, 8, 16], cross: 'CENTER', r: 'l', fill: 'color/surface/deck-2', stroke: 'color/line/key' });
    await fx(c, 'Shadow/Popover');
    const t = await T('Meldung', '6 Schläge gerückt (1/8).', 'Body/M Medium', 'color/text/ink');
    add(c, t);
    ref(t, 'characters', 'Message');
    const b = I('Atom/Pill', { Size: 'S', State: 'Primary' }, { Label: 'Fertig' }, 'Fertig');
    add(c, b);
    b.visible = false;
    ref(b, 'visible', 'Show Action');
  });
  await component('Molecule/Tip', 'Tipp-Box (Tutorial): Schritt, Text, Überspringen/Weiter.', [], [
    { name: 'Step', type: 'TEXT', def: 'Tipp 1 von 6' }, { name: 'Text', type: 'TEXT', def: 'Zieh einen Sound aus dem Regal auf eine Spur.' },
  ], async (c, v, ref) => {
    box(c, { dir: 'V', gap: 12, p: [12, 16, 12, 16], w: 300, r: 'l', fill: 'color/surface/deck', stroke: 'color/state/amber' });
    await fx(c, 'Shadow/Popover');
    const s = await T('Schritt', 'Tipp 1 von 6', 'Display/Caps', 'color/state/amber');
    add(c, s);
    ref(s, 'characters', 'Step');
    const t = await T('Text', 'Zieh einen Sound aus dem Regal auf eine Spur.', 'Body/M', 'color/text/ink');
    add(c, t, { w: 'FILL' });
    ref(t, 'characters', 'Text');
    const row = F('Knöpfe', { dir: 'H', gap: 8, align: 'MAX' });
    add(c, row, { w: 'FILL' });
    add(row, I('Atom/Key', { Size: 'M', State: 'Default' }, { Label: 'Überspringen' }, 'Überspringen'));
    add(row, I('Atom/Key', { Size: 'M', State: 'Primary' }, { Label: 'Weiter' }, 'Weiter'));
  });
  await component('Molecule/Dock Head', 'Kopf einer Schublade: Name, optional ein Knopf rechts.', [['Device', ['Desktop', 'Phone']]], [
    { name: 'Title', type: 'TEXT', def: 'Mixer' }, { name: 'Show Action', type: 'BOOLEAN', def: false },
  ], async (c, v, ref) => {
    box(c, { dir: 'H', p: [8, 12, 8, 12], align: 'SPACE_BETWEEN', cross: 'CENTER', w: v.Device === 'Desktop' ? 836 : 390, stroke: 'color/line/line', sides: [0, 0, 1, 0] });
    const t = await T('Titel', 'Mixer', v.Device === 'Desktop' ? 'Mono/Label' : 'Mono/Label L', 'color/text/ink');
    add(c, t);
    ref(t, 'characters', 'Title');
    const k = I('Atom/Key', { Size: v.Device === 'Desktop' ? 'M' : 'L', State: 'Default' }, { Label: 'FX-Pad' }, 'Aktion');
    add(c, k);
    k.visible = false;
    exposed(k);
    ref(k, 'visible', 'Show Action');
  });
  endSection();

  beginSection('Mixer, Song, Editor');
  await component('Molecule/Channel Head', 'Kopf eines Kanalzugs: Name und Effekt-Knopf. Master in Großbuchstaben mit Schein.', [['Type', ['Track', 'Bus', 'Master']]], [{ name: 'Name', type: 'TEXT', def: 'Drums' }], async (c, v, ref) => {
    box(c, { dir: 'V', gap: 8, w: 74 });
    const n = v.Type === 'Master'
      ? await T('Name', 'Master', 'Mono/Label L', 'color/text/ink', { glow: true })
      : await T('Name', v.Type === 'Bus' ? 'Hall-Bus' : 'Drums', 'Body/Strong', v.Type === 'Bus' ? 'color/text/muted' : 'color/text/ink');
    add(c, n); truncate(n);
    ref(n, 'characters', 'Name');
    const k = I('Atom/Key', { Size: 'S', State: 'Default' }, { Label: 'FX aus' }, 'Effekte');
    add(c, k, { w: 'FILL' });
    exposed(k);
  });
  await component('Molecule/Song Tile', 'Kachel im Song-Fach: Beschriftung, Wert, Einheit.', [], [{ name: 'Unit', type: 'TEXT', def: 'BPM' }, { name: 'Show Unit', type: 'BOOLEAN', def: true }], async (c, v, ref) => {
    box(c, { dir: 'V', gap: 8, p: [12, 12, 12, 12], w: 116, h: 80, r: 'l', stroke: 'color/line/key' });
    const lab = I('Atom/Label', { Size: 'M', Tone: 'Muted' }, { Label: 'Tempo' }, 'Beschriftung');
    add(c, lab); exposed(lab);
    const row = F('Wert', { dir: 'H', gap: 4, cross: 'MAX' });
    add(c, row);
    const val = I('Atom/LCD Value', { Size: 'L', Editable: 'False' }, { Value: '120' }, 'Ziffern');
    add(row, val); exposed(val);
    const u = await T('Einheit', 'BPM', 'Mono/Small', 'color/text/muted');
    add(row, u);
    ref(u, 'characters', 'Unit');
    ref(u, 'visible', 'Show Unit');
  });
  await component('Molecule/Tool Button', 'Werkzeug-Knopf der Clip-Leiste am Handy: Icon über Beschriftung. Danger = Löschen (rotes Icon).', [['State', ['Default', 'Danger']]], [
    { name: 'Label', type: 'TEXT', def: 'Teilen' }, { name: 'Icon', type: 'INSTANCE_SWAP', def: C['Atom/Icon/Scissors'], pref: iconPrefs() },
  ], async (c, v, ref) => {
    box(c, { dir: 'V', gap: 4, align: 'CENTER', cross: 'CENTER', w: 72, h: 52, r: 's', fill: 'color/surface/lane', stroke: 'color/line/line' });
    const ic = icon('Scissors', 'size/icon-m', v.State === 'Danger' ? 'color/state/danger' : null);
    add(c, ic);
    ref(ic, 'mainComponent', 'Icon');
    const t = await T('Beschriftung', 'Teilen', 'Display/Caps', 'color/text/ink');
    add(c, t);
    ref(t, 'characters', 'Label');
  });
  await component('Molecule/Beat Row', 'Zeile im Beat-Raster: Name und 16 Schritte in Vierergruppen.', [], [{ name: 'Name', type: 'TEXT', def: 'Kick' }], async (c, v, ref) => {
    box(c, { dir: 'H', gap: 8, cross: 'CENTER' });
    const n = await T('Name', 'Kick', 'Mono/Small', 'color/text/muted');
    add(c, n);
    n.resize(88, n.height);
    n.textAutoResize = 'HEIGHT';
    ref(n, 'characters', 'Name');
    for (let g = 0; g < 4; g++) {
      const grp = F('Schläge ' + (g * 4 + 1) + '–' + (g * 4 + 4), { dir: 'H', gap: 4 });
      for (let s = 0; s < 4; s++) add(grp, I('Atom/Step', { State: 'Off', Category: 'Drums' }, null, 'Schritt ' + (g * 4 + s + 1)));
      add(c, grp);
    }
  });
  await component('Molecule/Option', 'Option im Export: Auswahlkreis oder Kästchen mit Text.', [['Type', ['Radio', 'Checkbox']], ['On', ['False', 'True']]], [{ name: 'Label', type: 'TEXT', def: 'WAV – verlustfrei, 16 Bit, 44,1 kHz' }], async (c, v, ref) => {
    box(c, { dir: 'H', gap: 8, p: [4, 0, 4, 0], cross: 'CENTER' });
    add(c, I(v.Type === 'Radio' ? 'Atom/Radio' : 'Atom/Checkbox', { On: v.On }, null, 'Auswahl'));
    const t = await T('Beschriftung', 'WAV – verlustfrei, 16 Bit, 44,1 kHz', 'Body/M Medium', 'color/text/ink');
    add(c, t);
    ref(t, 'characters', 'Label');
  });
  endSection();
}

// ---------------------------------------------------------------- Inhalte wie in der App (Demo-Song)

const TRACKS = [
  { name: 'Drums', cat: 'Drums', clips: [{ name: 'Four to the Floor', start: 4, len: 12 }] },
  { name: 'Hi-Hats', cat: 'Drums', clips: [{ name: 'Hi-Hats 16tel', start: 8, len: 8 }] },
  { name: 'Bass', cat: 'Bass', clips: [{ name: 'Bass Am–F–C–G', start: 4, len: 12 }] },
  { name: 'Pad', cat: 'Chords', clips: [{ name: 'Pad Am–F–C–G', start: 0, len: 16 }] },
  { name: 'Arp', cat: 'Synth', clips: [{ name: 'Arp Am–F–C–G', start: 8, len: 8 }] },
  { name: 'Melodie', cat: 'Synth', clips: [{ name: 'Melodie Am–F–C–G', start: 12, len: 4 }] },
  { name: 'FX', cat: 'FX', clips: [{ name: 'Riser', start: 2, len: 2 }, { name: 'Crash', start: 4, len: 1 }] },
  { name: 'Spur 8', cat: null, clips: [] },
];
const SHELF_GROUPS = [['Drums', 'Drums', '261'], ['Bass', 'Bass', '33'], ['Chords', 'Akkorde', '123'], ['Synth', 'Synth', '59'], ['FX', 'FX', '60']];
const DRUM_LOOPS = [['Four to the Floor', '1 Takt'], ['Breakbeat', '2 Takte'], ['Halftime', '1 Takt'], ['Hi-Hats 16tel', '1 Takt'], ['Techno-Kick', '1 Takt'], ['Techno-Groove', '1 Takt'], ['Offbeat-Hats', '1 Takt'], ['Ride 8tel', '1 Takt'], ['Industrial-Perc', '2 Takte'], ['House-Groove', '1 Takt']];
const EFFECTS = ['Verzerrer', 'Filter', 'EQ', 'Kompressor', 'Pumpen', 'Echo', 'Hall'];

function label(text, size, tone, layerName) {
  return I('Atom/Label', { Size: size || 'S', Tone: tone || 'Muted' }, { Label: text }, layerName || text);
}
function key(text, size, state, layerName, extra) {
  return I('Atom/Key', { Size: size || 'M', State: state || 'Default' }, Object.assign({ Label: text }, extra || {}), layerName || text);
}
function iconKey(iconName, size, state, layerName) {
  const k = I('Atom/Key', { Size: size, State: state || 'Default' }, { 'Show Label': false, 'Show Icon': true, Icon: C['Atom/Icon/' + iconName] }, layerName);
  return k;
}
function divider(orient, tone, name) {
  return I('Atom/Divider', { Orientation: orient, Tone: tone || 'Line' }, null, name || 'Trennlinie');
}
function spacer() { return F('Abstand', { dir: 'H' }); }
function row(name, gap, o) { return F(name, Object.assign({ dir: 'H', gap: gap, cross: 'CENTER' }, o || {})); }
function col(name, gap, o) { return F(name, Object.assign({ dir: 'V', gap: gap }, o || {})); }
/** Zwei/vier Tasten nebeneinander, gleich breit */
function keyRow(parent, labels, size, activeIndex, gapPx) {
  const r = row('Tasten', gapPx || 8);
  add(parent, r, { w: 'FILL' });
  labels.forEach((l, i) => {
    const st = i === activeIndex ? 'Active' : 'Default';
    const k = typeof l === 'string' ? key(l, size, st) : key(l[0], size, l[1] || st, l[0], l[2]);
    add(r, k, { w: 'FILL' });
  });
  return r;
}
async function subTitle(parent, text) {
  add(parent, await T(text, text, 'Display/Caps', 'color/text/ink'));
}
function inspRow(parent, labelText, value, dev) {
  add(parent, I('Molecule/Inspector Row', { Device: dev || 'Desktop' }, { Label: labelText, Value: value }, labelText), { w: 'FILL' });
}

// ---------------------------------------------------------------- Organisms

async function buildOrganisms() {
  figma.notify('Loopwerk: Organisms …', { timeout: 1500 });
  beginSection('Deck und Leisten');
  await component('Organism/Deck', 'Transport-Deck oben: Wortmarke | Wiedergabe · Aufnahme | Takt, Schlag, Zeit | Tempo, Tonart | Pegel … Rückgängig | Projekt + Export. Handy: Wiedergabe | Takt, Tempo | Rückgängig.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    if (D) {
      box(c, { dir: 'H', gap: 12, p: [0, 12, 0, 12], cross: 'CENTER', w: 1424, hv: 'size/deck', r: 's', fill: 'color/surface/deck', stroke: 'color/line/line', sides: [0, 0, 1, 0] });
      add(c, I('Atom/Brand', null, null, 'Wortmarke'));
      add(c, divider('Vertical'));
      add(c, I('Molecule/Transport', { Device: 'Desktop' }, null, 'Transport'));
      add(c, divider('Vertical'));
      const lcd = row('Anzeige', 0);
      add(c, lcd);
      const cell = (lab, val, ed, chev) => {
        const f = I('Molecule/LCD Field', { Mode: ed ? 'Editable' : 'Display' }, null, lab);
        setProps(sub(f, 'Beschriftung'), { Label: lab });
        setProps(sub(f, 'Wert'), chev ? { Value: val, 'Show Chevron': true } : { Value: val });
        add(lcd, f);
      };
      cell('Takt', '001'); cell('Schlag', '1'); cell('Zeit', '0:00.0');
      add(lcd, divider('Vertical', 'Line', 'Trenner Song'));
      cell('Tempo', '120', true); cell('Tonart', 'Am', true, true);
      add(c, divider('Vertical'));
      add(c, I('Molecule/Meter Field', null, null, 'Pegel'));
      add(c, spacer(), { w: 'FILL' });
      const ur = row('Rückgängig', 8);
      add(c, ur);
      const u = iconKey('Undo', 'M', 'Disabled', 'Rückgängig'); add(ur, u); square(u, 'size/key');
      const r = iconKey('Redo', 'M', 'Disabled', 'Wiederholen'); add(ur, r); square(r, 'size/key');
      add(c, divider('Vertical'));
      const file = row('Projekt', 8);
      add(c, file);
      add(file, I('Atom/Dropdown', { Size: 'M', State: 'Default' }, { Value: 'Beispiel-Arrangement' }, 'Projekt-Menü'));
      add(file, key('Exportieren', 'M', 'Primary', 'Exportieren'));
    } else {
      box(c, { dir: 'H', gap: 4, p: [0, 4, 0, 4], cross: 'CENTER', w: 390, hv: 'size/deck', fill: 'color/surface/deck', stroke: 'color/line/line', sides: [0, 0, 1, 0] });
      add(c, I('Molecule/Transport', { Device: 'Phone' }, null, 'Transport'));
      add(c, divider('Vertical'));
      const lcd = row('Anzeige', 0);
      add(c, lcd);
      const t = I('Molecule/LCD Field', { Mode: 'Display' }, null, 'Takt');
      add(lcd, t);
      const tm = I('Molecule/LCD Field', { Mode: 'Editable' }, null, 'Tempo');
      setProps(sub(tm, 'Beschriftung'), { Label: 'Tempo' });
      setProps(sub(tm, 'Wert'), { Value: '120' });
      add(lcd, tm);
      add(c, spacer(), { w: 'FILL' });
      const u = iconKey('Undo', 'L', 'Disabled', 'Rückgängig'); add(c, u); square(u, 'size/key-l');
      const r = iconKey('Redo', 'L', 'Disabled', 'Wiederholen'); add(c, r); square(r, 'size/key-l');
    }
  });
  await component('Organism/Arranger Bar', 'Leiste über dem Arranger: Zoom, Spurhöhe, Raster. Handy: Pillen Raster · Klick · Loop.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    if (v.Device === 'Desktop') {
      box(c, { dir: 'H', gap: 4, p: [0, 8, 0, 8], cross: 'CENTER', w: 836, h: 40, fill: 'color/surface/panel', stroke: 'color/line/line', sides: [0, 0, 1, 0], r: 's', rc: ['topLeftRadius', 'topRightRadius'] });
      const z1 = iconKey('Minus', 'S', 'Default', 'Verkleinern'); add(c, z1); square(z1, 'size/key-s');
      const z2 = iconKey('Plus', 'S', 'Default', 'Vergrößern'); add(c, z2); square(z2, 'size/key-s');
      const y1 = key('Spuren −', 'S', 'Default', 'Spuren niedriger'); add(c, y1);
      const y2 = key('Spuren +', 'S', 'Default', 'Spuren höher'); add(c, y2);
      add(c, key('Raster: Schlag', 'S', 'Default', 'Raster', { 'Show Chevron': true }));
      add(c, spacer(), { w: 'FILL' });
    } else {
      box(c, { dir: 'H', gap: 4, p: [0, 8, 0, 8], cross: 'CENTER', w: 390, hv: 'size/touch' });
      add(c, I('Atom/Pill', { Size: 'M', State: 'Default' }, { Label: 'Raster: Schlag', 'Show Chevron': true }, 'Raster'));
      add(c, I('Atom/Pill', { Size: 'M', State: 'Default' }, { Label: 'Klick', 'Show Icon': true, Icon: C['Atom/Icon/Metronome'] }, 'Klick'));
      const l = I('Atom/Pill', { Size: 'M', State: 'Default' }, { 'Show Label': false, 'Show Icon': true, Icon: C['Atom/Icon/Loop'] }, 'Loop');
      add(c, l);
    }
  });
  await component('Organism/Tabbar', 'Fachleiste (#tabbar), dieselbe für Handy und Desktop. Aktiven Reiter über die Ebene „Reiter …“ umschalten.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    if (D) {
      box(c, { dir: 'H', gap: 4, p: [0, 8, 0, 8], cross: 'CENTER', w: 836, hv: 'size/tabbar', fill: 'color/surface/deck', stroke: 'color/line/line', sides: [1, 0, 0, 0], r: 's', rc: ['bottomLeftRadius', 'bottomRightRadius'] });
      add(c, I('Molecule/Tab Item', { Device: 'Desktop', State: 'Default' }, { Label: 'Mixer', Icon: C['Atom/Icon/Mixer'] }, 'Reiter Mixer'));
      add(c, I('Molecule/Tab Item', { Device: 'Desktop', State: 'Default' }, { Label: 'FX-Pad', Icon: C['Atom/Icon/FX-Pad'] }, 'Reiter FX-Pad'));
      add(c, I('Molecule/Tab Item', { Device: 'Desktop', State: 'Disabled' }, { Label: 'Editor', Icon: C['Atom/Icon/Editor'] }, 'Reiter Editor'));
      add(c, spacer(), { w: 'FILL' });
      add(c, I('Atom/Text Button', { State: 'Default' }, { Label: '? Tastenkürzel' }, 'Tastenkürzel'));
    } else {
      box(c, { dir: 'H', gap: 4, p: [4, 8, 4, 8], cross: 'CENTER', w: 390, hv: 'size/tabbar-phone', fill: 'color/surface/deck', stroke: 'color/line/line', sides: [1, 0, 0, 0] });
      const tabs = [['Sounds', 'Notes', 'Default'], ['Mixer', 'Mixer', 'Default'], ['Editor', 'Editor', 'Disabled'], ['Song', 'Song', 'Default']];
      for (const t of tabs) add(c, I('Molecule/Tab Item', { Device: 'Phone', State: t[2] }, { Label: t[0], Icon: C['Atom/Icon/' + t[1]] }, 'Reiter ' + t[0]), { w: 'FILL' });
    }
  });
  await component('Organism/Clip Toolbar', 'Werkzeuge für den ausgewählten Clip am Handy (#clipbar).', [], [], async (c) => {
    box(c, { dir: 'H', gap: 4, p: [8, 8, 8, 8], cross: 'CENTER', w: 390, fill: 'color/surface/panel', stroke: 'color/line/line', sides: [1, 0, 0, 0] });
    const tools = [['Bearbeiten', 'Pencil', 'Default'], ['Teilen', 'Scissors', 'Default'], ['Duplizieren', 'Copy', 'Default'], ['Löschen', 'Trash', 'Danger'], ['Pegel', 'Levels', 'Default']];
    for (const t of tools) add(c, I('Molecule/Tool Button', { State: t[2] }, { Label: t[0], Icon: C['Atom/Icon/' + t[1]] }, t[0]), { w: 'FILL' });
  });
  endSection();

  beginSection('Regal');
  await component('Organism/Shelf', 'Regal (Assets): Suchen | Erstellen, Suchzeile, Gruppen als Akkordeon. Open = Gruppe Drums offen, Filter = Länge/Ordnen sichtbar. Handy: Inhalt des Fachs „Sounds“.', [
    ['Device', ['Desktop', 'Phone']], ['State', ['Closed', 'Open', 'Filter']],
  ], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    if (D) {
      box(c, { dir: 'V', gap: 12, p: [12, 12, 12, 12], wv: 'size/shelf', h: 815, clip: true, r: 's', fill: 'color/surface/panel', stroke: 'color/line/line' });
      add(c, await T('Titel', 'Assets', 'Display/L', 'color/text/ink'));
      add(c, I('Molecule/Left Tabs', { Active: 'Search' }, null, 'Reiter'), { w: 'FILL' });
    } else {
      box(c, { dir: 'V', gap: 12, p: [8, 12, 12, 12], w: 390, h: 420, clip: true });
    }
    const search = I('Molecule/Search Row', null, { Placeholder: D ? 'Suchen … (536)' : 'Suchen … (536)' }, 'Suchzeile');
    add(c, search, { w: 'FILL' });
    if (v.State === 'Filter') {
      setProps(sub(search, 'Filter'), { State: 'Active' });
      const box2 = col('Filter', 8, { p: [12, 12, 12, 12] });
      add(c, box2, { w: 'FILL' });
      add(box2, label('Länge'));
      const len = I('Molecule/Segment Group', { Size: 'M', Count: '5' }, null, 'Länge');
      add(box2, len, { w: 'FILL' });
      const lens = [['1T', '37'], ['2T', '67'], ['4T', '62'], ['8T+', '0'], ['Shot', '370']];
      lens.forEach((l, i) => setProps(sub(len, 'Segment ' + (i + 1)), { Label: l[0], Count: l[1], 'Show Count': true, State: i === 3 ? 'Disabled' : 'Default' }));
      for (let i = 0; i < 5; i++) fillW(sub(len, 'Segment ' + (i + 1)));
      add(box2, label('Ordnen'));
      const sort = I('Molecule/Segment Group', { Size: 'M', Count: '2' }, null, 'Ordnen');
      add(box2, sort, { w: 'FILL' });
      setProps(sub(sort, 'Segment 1'), { Label: 'Kategorie' });
      setProps(sub(sort, 'Segment 2'), { Label: 'Genre' });
      for (let i = 1; i <= 2; i++) fillW(sub(sort, 'Segment ' + i));
      backdrop(box2, I('Atom/Surface', { Type: 'Well' }, null, 'Fläche'));
    }
    if (!D) {
      const mk = row('Erstellen', 8);
      add(c, mk, { w: 'FILL' });
      for (const l of ['+ Import', '+ Link', '+ Beat', '+ Melodie']) add(mk, key(l, 'L', 'Default'), { w: 'FILL' });
    }
    const list = col('Gruppen', 2);
    add(c, list, { w: 'FILL' });
    for (const g of SHELF_GROUPS) {
      const open = D && v.State !== 'Closed' && g[0] === 'Drums';
      const h = I('Molecule/Accordion Head', { State: open ? 'Open' : 'Closed' }, { Title: g[1], Count: g[2] }, 'Gruppe ' + g[1]);
      setProps(sub(h, 'Farbe'), { Category: g[0] });
      add(list, h, { w: 'FILL' });
      if (open) {
        const items = col('Einträge ' + g[1], 0);
        add(list, items, { w: 'FILL' });
        add(items, label('Loops · 57', 'S', 'Muted', 'Untergruppe'));
        DRUM_LOOPS.forEach((l, i) => add(items, I('Molecule/Shelf Row', { State: i === 0 ? 'Selected' : 'Default' }, { Name: l[0], Length: l[1] }, l[0]), { w: 'FILL' }));
      }
    }
  }, (v) => v.Device === 'Phone' && v.State !== 'Closed');
  endSection();

  beginSection('Arranger');
  await component('Organism/Arranger', 'Arranger: Ecke + Lineal, Spuren mit Kopf und Raster, Clips des Demo-Songs. Clip auswählen: Ebene „Clip …“ → State=Selected.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    const W = D ? 836 : 390, H = D ? 733 : 680;
    const headW = num(D ? 'size/track-head' : 'size/track-head-phone');
    const rulerH = num(D ? 'size/ruler' : 'size/ruler-phone');
    const trackH = num(D ? 'size/track-h' : 'size/track-h-phone');
    const bar = num('size/bar');
    const bars = D ? 8 : 3;
    box(c, { dir: 'V', w: W, h: H, clip: true, fill: 'color/surface/panel' });
    const head = row('Kopfzeile', 0, { cross: 'MIN' });
    add(c, head, { w: 'FILL' });
    add(head, I('Molecule/Ruler Corner', { Device: v.Device }, null, 'Ecke'));
    const ruler = F('Lineal', { dir: 'H', h: rulerH, clip: true });
    add(head, ruler, { w: 'FILL' });
    for (let b = 1; b <= bars; b++) add(ruler, I('Molecule/Ruler Bar', { Device: v.Device }, { Bar: String(b) }, 'Takt ' + b));
    const grip = I('Atom/Playhead Grip', { Device: v.Device }, null, 'Abspielmarke');
    add(ruler, grip, { abs: true, x: 0, y: rulerH - grip.height - 2 });
    for (const tr of TRACKS) {
      const r = col('Spur ' + tr.name, 0);
      add(c, r, { w: 'FILL' });
      const line = row('Zeile', 0, { cross: 'MIN', h: trackH });
      add(r, line, { w: 'FILL' });
      const th = I('Molecule/Track Head', { Device: v.Device, State: 'Default' }, { Name: tr.name }, 'Spurkopf ' + tr.name);
      setProps(sub(th, 'Punkt'), { Category: tr.cat || 'Off' });
      add(line, th);
      const lane = F('Bahn', { dir: 'H', h: trackH, clip: true });
      add(line, lane, { w: 'FILL' });
      for (let b = 0; b < bars; b++) add(lane, I('Molecule/Grid Bar', { Device: v.Device }, null, 'Raster ' + (b + 1)));
      for (const cl of tr.clips) {
        const ci = I('Molecule/Clip', { Category: tr.cat, State: 'Default' }, { Name: cl.name }, 'Clip ' + cl.name);
        add(lane, ci, { abs: true, x: cl.start * bar, y: 3 });
        ci.resize(cl.len * bar, trackH - 6);
      }
      add(r, divider('Horizontal', 'Row'), { w: 'FILL' });
    }
    const addRow = row('Spur hinzufügen', 0, { cross: 'MIN' });
    add(c, addRow, { w: 'FILL' });
    const ah = row('Knöpfe', D ? 8 : 4, { p: D ? [0, 8, 0, 12] : [0, 4, 0, 8], align: 'SPACE_BETWEEN', w: headW, h: 40 });
    add(addRow, ah);
    add(ah, I('Atom/Text Button', { State: 'Default' }, { Label: 'Spur', 'Show Icon': true }, '+ Spur'));
    add(ah, I('Atom/Text Button', { State: 'Default' }, { Label: 'Summe', 'Show Chevron': true }, 'Summe'));
    backdrop(ah, I('Atom/Surface', { Type: 'Head' }, null, 'Fläche'));
    const ph = I('Atom/Playhead Line', null, null, 'Abspiellinie');
    add(c, ph, { abs: true, x: headW, y: rulerH, cy: 'STRETCH' });
    ph.resize(1, H - rulerH);
  });
  endSection();

  beginSection('Inspektor');
  await component('Organism/Inspector', 'Inspektor rechts: Clip (Karte in der Kategoriefarbe + Spur), Spur oder Song (Tempo, Tonart, Master, Verlauf, Mastering).', [['Kind', ['Clip', 'Track', 'Song']]], [], async (c, v) => {
    box(c, { dir: 'V', gap: 12, p: v.Kind === 'Clip' ? [8, 8, 8, 8] : 0, wv: 'size/inspector', h: 815, clip: true, r: 's', fill: 'color/surface/panel', stroke: 'color/line/line' });
    const trackSection = async (parent) => {
      const s = col('Spur', 12, { p: [12, 16, 12, 16] });
      add(parent, s, { w: 'FILL' });
      add(s, I('Molecule/Inspector Head', { Kind: 'Track' }, { Name: 'Bass', Meta: 'Gilt für alle Clips der Spur · 1 Clip' }, 'Kopf'), { w: 'FILL' });
      inspRow(s, 'Spur-Lautstärke', '−1,9 dB');
      inspRow(s, 'Panorama', 'Mitte');
      add(s, label('Verlauf'));
      keyRow(s, ['Einblenden', 'Ausblenden'], 'M');
      keyRow(s, ['Filter öffnen', 'Filter schließen'], 'M');
      add(s, await T('Länge in Takten', 'Länge in Takten', 'Body/S', 'color/text/muted'));
      keyRow(s, ['1', '2', '4', '8'], 'M', 2, 4);
      add(s, I('Atom/Text Button', { State: 'Active' }, { Label: 'Kurve zeigen (A)' }, 'Kurve zeigen'));
      const fxs = col('Effekte', 0);
      add(s, fxs, { w: 'FILL' });
      for (const e of EFFECTS) add(fxs, I('Molecule/Effect Row', { On: 'False' }, { Name: e }, e), { w: 'FILL' });
    };
    if (v.Kind === 'Clip') {
      const card = col('Clip-Karte', 12, { p: [0, 0, 12, 0] });
      add(c, card, { w: 'FILL' });
      add(card, I('Molecule/Inspector Head', { Kind: 'Clip' }, null, 'Kopf'), { w: 'FILL' });
      const body = col('Einstellungen', 12, { p: [0, 12, 0, 12] });
      add(card, body, { w: 'FILL' });
      inspRow(body, 'Clip-Lautstärke', '0,0 dB');
      inspRow(body, 'Einblenden', 'aus');
      inspRow(body, 'Ausblenden', 'aus');
      inspRow(body, 'Geschwindigkeit', '100 %');
      keyRow(body, ['½×', '1×', '2×', ['Wie Tonband', 'Disabled']], 'M', 1, 4);
      const st = row('Sound-Tempo', 8);
      add(body, st, { w: 'FILL' });
      const stl = await T('Beschriftung', 'Sound-Tempo', 'Body/S', 'color/text/muted');
      add(st, stl); truncate(stl);
      add(st, await T('Wert', 'folgt dem Song', 'Mono/Value', 'color/text/ink'));
      keyRow(body, ['Bearbeiten', ['Teilen', 'Default', { 'Show Icon': true, Icon: C['Atom/Icon/Scissors'] }]], 'M');
      keyRow(body, ['Duplizieren', 'Löschen'], 'M');
      backdrop(card, I('Atom/Category Frame', { Category: 'Bass' }, null, 'Rahmen'));
      await trackSection(c);
    } else if (v.Kind === 'Track') {
      await trackSection(c);
    } else {
      const s = col('Song', 12, { p: [12, 16, 12, 16] });
      add(c, s, { w: 'FILL' });
      add(s, I('Molecule/Inspector Head', { Kind: 'Song' }, { Name: 'Beispiel-Arrangement' }, 'Kopf'), { w: 'FILL' });
      add(s, label('Tempo (BPM)'));
      const tempo = row('Tempo', 8);
      add(s, tempo, { w: 'FILL' });
      const minus = iconKey('Minus', 'M', 'Default', 'Langsamer'); add(tempo, minus); square(minus, 'size/key');
      const val = col('Wert', 0, { cross: 'CENTER' });
      add(tempo, val, { w: 'FILL' });
      add(val, I('Atom/LCD Value', { Size: 'M', Editable: 'False' }, { Value: '120' }, 'Ziffern'));
      const plus = iconKey('Plus', 'M', 'Default', 'Schneller'); add(tempo, plus); square(plus, 'size/key');
      const keyR = row('Tonart', 8);
      add(s, keyR, { w: 'FILL' });
      const kl = await T('Beschriftung', 'Tonart', 'Body/S', 'color/text/muted');
      add(keyR, kl); truncate(kl);
      add(keyR, I('Atom/LCD Value', { Size: 'M', Editable: 'True' }, { Value: 'Am · C-Dur' }, 'Tonart'));
      inspRow(s, 'Länge', '32 Takte');
      add(s, divider('Horizontal'), { w: 'FILL' });
      await subTitle(s, 'Master');
      inspRow(s, 'Master-Lautstärke', '−1,4 dB');
      const fxs = col('Effekte', 0);
      add(s, fxs, { w: 'FILL' });
      for (const e of EFFECTS) add(fxs, I('Molecule/Effect Row', { On: 'False' }, { Name: e }, e), { w: 'FILL' });
      add(s, divider('Horizontal'), { w: 'FILL' });
      await subTitle(s, 'Verlauf der Summe');
      keyRow(s, ['Einblenden', 'Ausblenden'], 'M');
      add(s, await T('Länge in Takten', 'Länge in Takten', 'Body/S', 'color/text/muted'));
      keyRow(s, ['1', '2', '4', '8'], 'M', 2, 4);
      add(s, I('Atom/Text Button', { State: 'Active' }, { Label: 'Summen-Kurve zeigen (A)' }, 'Kurve zeigen'));
      add(s, divider('Horizontal'), { w: 'FILL' });
      add(s, I('Molecule/Mastering Head', { Device: 'Desktop', On: 'False' }, null, 'Mastering'), { w: 'FILL' });
    }
  });
  endSection();

  beginSection('Mixer');
  await component('Organism/Channel Strip', 'Kanalzug: Kopf, Sends Hall/Echo, Panorama, Fader mit Pegel, Wert, Stumm/Solo. Bus = Rückkanal, Master mit Lichtstrich.', [
    ['Device', ['Desktop', 'Phone']], ['Type', ['Track', 'Bus', 'Master']],
  ], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    const master = v.Type === 'Master', bus = v.Type === 'Bus';
    box(c, { dir: 'V', gap: 8, p: [8, 4, 8, 4], cross: 'CENTER', wv: master ? 'size/strip-master' : D ? 'size/strip' : 'size/strip-phone', h: D ? 324 : 600, r: 's',
      fill: master ? 'color/surface/master' : bus ? 'color/surface/bus' : 'color/surface/strip', stroke: master ? 'color/line/active' : 'color/line/line' });
    const head = I('Molecule/Channel Head', { Type: v.Type }, { Name: master ? 'Master' : bus ? 'Hall-Bus' : 'Drums' }, 'Kopf');
    add(c, head, { w: 'FILL' });
    if (!master && !bus && D) {
      const sends = row('Sends', 8, { align: 'CENTER' });
      add(c, sends, { w: 'FILL' });
      for (const s of [['Hall', '→H'], ['Echo', '→E']]) {
        const g = col('Send ' + s[0], 2, { cross: 'CENTER' });
        add(sends, g);
        add(g, I('Atom/Knob', { Size: 'S', Value: 'Low' }, null, 'Regler'));
        add(g, await T('Beschriftung', s[1], 'Mono/Small', 'color/text/muted'));
      }
    }
    if (!master && !bus) add(c, I('Atom/Knob', { Size: D ? 'M' : 'L', Value: 'Center' }, null, 'Panorama'));
    const fr = row('Fader', 8, { align: 'CENTER', cross: 'MAX' });
    add(c, fr, { w: 'FILL', h: 'FILL' });
    add(fr, I('Atom/Fader', { Size: D ? 'M' : 'L' }, null, 'Lautstärke'), { h: 'FILL' });
    add(fr, I('Atom/Meter', { Orientation: 'Vertical', Level: master ? 'Low' : 'Off' }, null, 'Pegel'));
    add(c, await T('Wert', master ? '−1,4 dB' : '−1,9 dB', 'Mono/Small', master ? 'color/text/ink' : 'color/text/muted'));
    if (!master) {
      const ms = row('Stumm und Solo', 4, { align: 'CENTER' });
      add(c, ms);
      add(ms, key('M', D ? 'XS' : 'L', 'Default', 'Stumm'));
      if (!bus) add(ms, key('S', D ? 'XS' : 'L', 'Default', 'Solo'));
    }
    if (master) {
      const beam = I('Atom/Beam', null, null, 'Lichtstrich');
      add(c, beam, { abs: true, x: 14, y: 0, cx: 'STRETCH' });
      beam.resize(num('size/strip-master') - 28, num('stroke/bold'));
    }
  }, (v) => v.Device === 'Phone' && v.Type === 'Bus');
  await component('Organism/Mixer', 'Mixer: Kanalzüge (scrollen), Rückkanäle Hall/Echo und Master bleiben rechts stehen.', [['Device', ['Desktop', 'Phone']]], [], async (c, v) => {
    const D = v.Device === 'Desktop';
    box(c, { dir: 'V', w: D ? 836 : 390, h: D ? 370 : 700 });
    add(c, I('Molecule/Dock Head', { Device: v.Device }, D ? { Title: 'Mixer' } : { Title: 'Mixer', 'Show Action': true }, 'Kopf'), { w: 'FILL' });
    const strips = row('Kanalzüge', 8, { p: [12, 12, 12, 12], cross: 'MIN' });
    add(c, strips, { w: 'FILL', h: 'FILL' });
    const scroll = row('Spuren', 8, { cross: 'MIN', clip: true });
    add(strips, scroll, { w: 'FILL', h: 'FILL' });
    for (const tr of TRACKS) {
      const s = I('Organism/Channel Strip', { Device: v.Device, Type: 'Track' }, null, 'Kanal ' + tr.name);
      setProps(sub(s, 'Kopf'), { Name: tr.name });
      add(scroll, s, { h: 'FILL' });
    }
    if (D) {
      for (const b of ['Hall-Bus', 'Echo-Bus']) {
        const s = I('Organism/Channel Strip', { Device: 'Desktop', Type: 'Bus' }, null, b);
        setProps(sub(s, 'Kopf'), { Name: b });
        add(strips, s, { h: 'FILL' });
      }
    }
    add(strips, I('Organism/Channel Strip', { Device: v.Device, Type: 'Master' }, null, 'Master'), { h: 'FILL' });
  });
  endSection();

  beginSection('Song, Editor, Export');
  await component('Organism/Song Panel', 'Inhalt des Fachs „Song“ am Handy: Name, Kacheln, Song-Starter, Mastering (an), Summe, Speichern/Exportieren.', [], [], async (c) => {
    box(c, { dir: 'V', gap: 12, p: [0, 0, 12, 0], w: 390, h: 700, clip: true });
    add(c, I('Molecule/Dock Head', { Device: 'Phone' }, { Title: 'Song' }, 'Kopf'), { w: 'FILL' });
    const b = col('Inhalt', 12, { p: [0, 12, 0, 12] });
    add(c, b, { w: 'FILL' });
    add(b, I('Atom/Input', { Type: 'Text', State: 'Default' }, { Value: 'Beispiel-Arrangement' }, 'Projektname'), { w: 'FILL' });
    const tiles = row('Kacheln', 8);
    add(b, tiles, { w: 'FILL' });
    const tile = (lab, val, unit) => {
      const t = I('Molecule/Song Tile', null, unit ? { Unit: unit } : { 'Show Unit': false }, lab);
      setProps(sub(t, 'Beschriftung'), { Label: lab });
      setProps(sub(t, 'Ziffern'), { Value: val });
      add(tiles, t, { w: 'FILL' });
    };
    tile('Tempo', '120', 'BPM'); tile('Tonart', 'Am'); tile('Länge', '32', 'Takte');
    add(b, label('Song-Starter', 'M'));
    const g = row('Genres', 8, { clip: true });
    add(b, g, { w: 'FILL' });
    for (const n of ['House', 'Techno', 'Hip-Hop', 'Lo-Fi', 'Pop', 'Trap']) add(g, key(n, 'L', 'Default'));
    keyRow(b, [['Nochmal', 'Disabled'], '+ Begleitung'], 'L');
    add(b, divider('Horizontal'), { w: 'FILL' });
    add(b, I('Molecule/Mastering Head', { Device: 'Phone', On: 'True' }, null, 'Mastering'), { w: 'FILL' });
    add(b, label('Stil', 'M'));
    const stil = I('Molecule/Segment Group', { Size: 'L', Count: '4' }, null, 'Stil');
    add(b, stil, { w: 'FILL' });
    ['Ausgewogen', 'Warm', 'Hell', 'Laut'].forEach((n, i) => { const s = sub(stil, 'Segment ' + (i + 1)); setProps(s, { Label: n }); fillW(s); });
    add(b, label('Vergleich', 'M'));
    const cmp = I('Molecule/Segment Group', { Size: 'L', Count: '3' }, null, 'Vergleich');
    add(b, cmp, { w: 'FILL' });
    ['Aus', 'Vorher', 'Nachher'].forEach((n, i) => { const s = sub(cmp, 'Segment ' + (i + 1)); setProps(s, { Label: n }); fillW(s); });
    add(b, divider('Horizontal'), { w: 'FILL' });
    const sum = row('Summe', 8);
    add(b, sum, { w: 'FILL' });
    add(sum, label('Summe', 'M'));
    add(sum, key('Einblenden', 'L'), { w: 'FILL' });
    add(sum, key('Ausblenden', 'L'), { w: 'FILL' });
    const main = row('Speichern und Exportieren', 8);
    add(b, main, { w: 'FILL' });
    add(main, I('Atom/Pill', { Size: 'L', State: 'Primary' }, { Label: 'Speichern' }, 'Speichern'), { w: 'FILL' });
    add(main, I('Atom/Pill', { Size: 'L', State: 'Primary' }, { Label: 'Exportieren' }, 'Exportieren'), { w: 'FILL' });
  });
  await component('Organism/Beat Editor', 'Beat-Editor (vereinfacht): Leiste mit Schritte/Pads, Kit, Live, Anhören; Raster mit 8 Instrumenten × 16 Schritten.', [], [], async (c) => {
    box(c, { dir: 'V', w: 836, h: 370, clip: true });
    const bar = row('Leiste', 8, { p: [8, 12, 8, 12] });
    add(c, bar, { w: 'FILL' });
    add(bar, label('Beat-Editor', 'S', 'Ink', 'Titel'));
    const view = I('Molecule/Segment Group', { Size: 'M', Count: '2' }, null, 'Ansicht');
    add(bar, view);
    setProps(sub(view, 'Segment 1'), { Label: 'Schritte' });
    setProps(sub(view, 'Segment 2'), { Label: 'Pads' });
    add(bar, await T('Kit', 'Kit', 'Body/S', 'color/text/muted'));
    add(bar, I('Atom/Dropdown', { Size: 'S', State: 'Default' }, { Value: 'Elektro (synthetisch)' }, 'Kit-Auswahl'));
    add(bar, spacer(), { w: 'FILL' });
    add(bar, key('Live', 'S', 'Default', 'Live', { 'Show Icon': true, Icon: C['Atom/Icon/Rec'] }));
    add(bar, key('Anhören', 'S', 'Default', 'Anhören', { 'Show Icon': true, Icon: C['Atom/Icon/Play'] }));
    add(bar, key('Mehr', 'S', 'Default', 'Mehr', { 'Show Chevron': true }));
    add(c, divider('Horizontal'), { w: 'FILL' });
    const grid = col('Raster', 4, { p: [12, 12, 12, 12] });
    add(c, grid, { w: 'FILL' });
    const pattern = [['Kick', [1, 5, 9, 13]], ['Snare', [5, 13]], ['Clap', [13]], ['Hi-Hat zu', [3, 7, 11, 15]], ['Hi-Hat offen', [16]], ['Tom tief', []], ['Tom hoch', [12]], ['Becken', [1]]];
    for (const p of pattern) {
      const r = I('Molecule/Beat Row', null, { Name: p[0] }, p[0]);
      add(grid, r);
      for (const s of /** @type {number[]} */ (p[1])) setProps(sub(r, 'Schritt ' + s), { State: 'On' });
    }
  });
  await component('Organism/Export Panel', 'Export-Fach (Desktop-Aufklappfeld): Format, Bereich, Einzelspuren, Mastering, Exportieren.', [], [], async (c) => {
    box(c, { dir: 'V', gap: 16, p: [16, 16, 16, 16], w: 380, r: 'l', fill: 'color/surface/sheet', stroke: 'color/line/line' });
    await fx(c, 'Shadow/Popover');
    add(c, label('Song exportieren', 'S', 'Ink', 'Titel'));
    const group = (title, opts) => {
      const g = col(title, 4);
      add(c, g, { w: 'FILL' });
      add(g, label(title));
      for (const o of opts) add(g, I('Molecule/Option', { Type: o[0], On: o[1] ? 'True' : 'False' }, { Label: o[2] }, o[2]));
    };
    group('Format', [['Radio', 1, 'WAV – verlustfrei, 16 Bit, 44,1 kHz'], ['Radio', 0, 'WAV – 24 Bit, für die Weiterarbeit'], ['Radio', 0, 'WAV – 32 Bit Gleitkomma, übersteuert nicht'], ['Radio', 0, 'MP3 – 192 kBit/s, etwa ein Siebtel so groß']]);
    group('Bereich', [['Radio', 1, 'Ganzer Song (Takt 1–16, 32,0 s)'], ['Radio', 0, 'Loop-Bereich (Takt 1–4)'], ['Checkbox', 1, 'Hall und Echo ausklingen lassen (+2,5 s)']]);
    group('Einzelspuren', [['Checkbox', 0, 'Einzelspuren (Stems) – 7 Spuren als ZIP'], ['Checkbox', 0, 'Mit Summe (Master-Effekte, Mastering)']]);
    add(c, I('Molecule/Mastering Head', { Device: 'Desktop', On: 'False' }, null, 'Mastering'), { w: 'FILL' });
    add(c, key('Exportieren', 'M', 'Primary', 'Exportieren'));
    const note = await T('Hinweis', 'In claude.ai wird die Audiodatei als ZIP gespeichert. MP3-Kodierung mit LAME (LGPL).', 'Body/XS', 'color/text/muted');
    add(c, note, { w: 'FILL' });
  });
  endSection();

  beginSection('Schublade');
  const slotPrefs = [C['Organism/Shelf'], C['Organism/Mixer'], C['Organism/Song Panel'], C['Organism/Beat Editor'], C['Organism/Export Panel'], C['Atom/Slot']];
  await component('Organism/Sheet', 'Schublade über dem Arranger: Griff + Inhalt. Inhalt per Instance-Swap (Property „Content“): Regal, Mixer, Song, Beat-Editor …', [['Device', ['Desktop', 'Phone']]], [
    { name: 'Content', type: 'INSTANCE_SWAP', def: C['Atom/Slot'], pref: slotPrefs },
  ], async (c, v, ref) => {
    const D = v.Device === 'Desktop';
    box(c, { dir: 'V', w: D ? 836 : 390, h: D ? 388 : 444, clip: true, fill: 'color/surface/sheet', stroke: 'color/line/line', sides: [1, 0, 0, 0], r: 'l', rc: ['topLeftRadius', 'topRightRadius'] });
    await fx(c, 'Shadow/Sheet');
    add(c, I('Atom/Sheet Grip', { Device: v.Device }, null, 'Griff'), { w: 'FILL' });
    const slot = I('Atom/Slot', null, null, 'Inhalt');
    add(c, slot, { w: 'FILL', h: 'FILL' });
    ref(slot, 'mainComponent', 'Content');
  });
  endSection();
}

// ---------------------------------------------------------------- Screens

/** Inhalt der Schublade tauschen und füllen lassen */
function fillSheet(sheet, compName, variant) {
  const t = C[compName];
  const comp = t.type === 'COMPONENT_SET' ? pickVariant(t, variant || {}) : t;
  setProps(sheet, { Content: comp });
  // nach dem Tausch kann die Ebene den Namen des neuen Inhalts tragen: dann das letzte Kind nehmen
  const slot = /** @type {InstanceNode} */ (sheet.findOne((x) => x.type === 'INSTANCE' && x.name === 'Inhalt') || sheet.children[sheet.children.length - 1]);
  try { slot.layoutSizingHorizontal = 'FILL'; slot.layoutSizingVertical = 'FILL'; } catch (e) { warn('Schublade: Inhalt nicht gedehnt'); }
}

async function buildScreens() {
  figma.notify('Loopwerk: Screens …', { timeout: 1500 });
  /** @type {FrameNode[]} */
  const screens = [];
  const desk = async (name, o) => {
    const s = F('Desktop · ' + name, { dir: 'V', gap: 8, p: [8, 8, 8, 8], w: 1440, h: 900, clip: true, fill: 'color/surface/bg' });
    add(s, I('Organism/Deck', { Device: 'Desktop' }, null, 'Deck'), { w: 'FILL' });
    const body = row('Arbeitsfläche', 8, { cross: 'MIN' });
    add(s, body, { w: 'FILL', h: 'FILL' });
    add(body, I('Organism/Shelf', { Device: 'Desktop', State: o.shelf || 'Closed' }, null, 'Regal'), { h: 'FILL' });
    const mid = col('Mitte', 0);
    add(body, mid, { w: 'FILL', h: 'FILL' });
    add(mid, I('Organism/Arranger Bar', { Device: 'Desktop' }, null, 'Arranger-Leiste'), { w: 'FILL' });
    const arr = I('Organism/Arranger', { Device: 'Desktop' }, null, 'Arranger');
    add(mid, arr, { w: 'FILL', h: 'FILL' });
    if (o.clip) setProps(sub(arr, 'Clip ' + o.clip), { State: 'Selected' });
    if (o.sheet) {
      const sh = I('Organism/Sheet', { Device: 'Desktop' }, null, 'Schublade');
      add(mid, sh, { w: 'FILL' });
      fillSheet(sh, o.sheet, { Device: 'Desktop' });
    }
    const tb = I('Organism/Tabbar', { Device: 'Desktop' }, null, 'Fachleiste');
    add(mid, tb, { w: 'FILL' });
    if (o.tab) setProps(sub(tb, 'Reiter ' + o.tab), { State: 'Active' });
    if (o.clip) { setProps(sub(tb, 'Reiter Editor'), { State: 'Default', Label: 'Editor · Bass Am–F–C–G' }); }
    add(body, I('Organism/Inspector', { Kind: o.insp || 'Song' }, null, 'Inspektor'), { h: 'FILL' });
    screens.push(s);
    return s;
  };
  const phone = async (name, o) => {
    const s = F('Handy · ' + name, { dir: 'V', w: 390, h: 844, clip: true, fill: 'color/surface/bg' });
    add(s, I('Organism/Deck', { Device: 'Phone' }, null, 'Deck'), { w: 'FILL' });
    if (o.arranger !== false) {
      add(s, I('Organism/Arranger Bar', { Device: 'Phone' }, null, 'Arranger-Leiste'), { w: 'FILL' });
      const arr = I('Organism/Arranger', { Device: 'Phone' }, null, 'Arranger');
      add(s, arr, { w: 'FILL', h: 'FILL' });
      if (o.clip) setProps(sub(arr, 'Clip ' + o.clip), { State: 'Selected' });
    }
    if (o.sheet) {
      const sh = I('Organism/Sheet', { Device: 'Phone' }, null, 'Schublade');
      add(s, sh, o.arranger === false ? { w: 'FILL', h: 'FILL' } : { w: 'FILL' });
      fillSheet(sh, o.sheet, o.variant);
    }
    if (o.clip) add(s, I('Organism/Clip Toolbar', null, null, 'Clip-Werkzeuge'), { w: 'FILL' });
    const tb = I('Organism/Tabbar', { Device: 'Phone' }, null, 'Fachleiste');
    add(s, tb, { w: 'FILL' });
    if (o.tab) setProps(sub(tb, 'Reiter ' + o.tab), { State: 'Active' });
    if (o.clip) setProps(sub(tb, 'Reiter Editor'), { State: 'Default' });
    screens.push(s);
    return s;
  };

  beginSection('Desktop 1440 × 900');
  for (const s of [
    await desk('Start', {}),
    await desk('Clip ausgewählt', { clip: 'Bass Am–F–C–G', insp: 'Clip' }),
    await desk('Mixer offen', { sheet: 'Organism/Mixer', tab: 'Mixer' }),
    await desk('Regal mit Filter', { shelf: 'Filter' }),
  ]) { SECTION.appendChild(s); place(s); }
  endSection();
  beginSection('Handy 390 × 844');
  for (const s of [
    await phone('Start', {}),
    await phone('Sounds-Fach', { sheet: 'Organism/Shelf', variant: { Device: 'Phone', State: 'Closed' }, tab: 'Sounds' }),
    await phone('Mixer', { arranger: false, sheet: 'Organism/Mixer', variant: { Device: 'Phone' }, tab: 'Mixer' }),
    await phone('Song-Fach', { arranger: false, sheet: 'Organism/Song Panel', tab: 'Song' }),
    await phone('Clip ausgewählt', { clip: 'Pad Am–F–C–G' }),
  ]) { SECTION.appendChild(s); place(s); }
  endSection();
  return screens;
}

// ---------------------------------------------------------------- Cover

async function buildCover(counts) {
  beginSection('Loopwerk');
  const f = F('Cover', { dir: 'V', gap: 24, p: [48, 48, 48, 48], w: 1440, h: 900, fill: 'color/surface/bg' });
  SECTION.appendChild(f);
  add(f, I('Atom/Brand', null, null, 'Wortmarke'));
  add(f, await T('Titel', 'Design-System „Phosphor“', 'Display/XL', 'color/text/ink'));
  add(f, await T('Version', 'Loopwerk ' + VERSION + ' · erzeugt am ' + new Date().toLocaleDateString('de-DE') + ' mit tools/figma-plugin' + (RUN.suffix ? ' · Lauf' + RUN.suffix : ''), 'Body/M', 'color/text/muted'));
  add(f, divider('Horizontal'), { w: 'FILL' });
  const lines = [
    ['Seiten', 'Cover · Atoms · Molecules · Organisms · Screens. Molecules bestehen nur aus Atom-Instanzen, Organisms aus Molecules/Atoms, Screens nur aus Organisms.'],
    ['Variablen', counts.variables + ' Variablen in „Phosphor“ (Farben, Modus Dunkel), „Maße“ (Abstände, Radien, Größen, Schriftgrößen) und „Schrift“ (Familien).'],
    ['Stile', TEXT_STYLES.length + ' Text-Stile (Display, Body, Mono, LCD) und ' + Object.keys(ES).length + ' Effekt-Stile (Glow, Shadow, Blur).'],
    ['Namen', 'Komponenten „Ebene/Name“ (Atom/Key). Varianten englisch: State, Size, Device, Category, Type, On. Ebenen deutsch wie in der App.'],
    ['Regeln', 'Was klingt, leuchtet (Kategoriefarben). Einstellungen sind Linien. Aktiv = Weißglut. Rot nur für Aufnahme und Löschen. Still ist schwarz.'],
  ];
  for (const l of lines) {
    const r = row(l[0], 24, { cross: 'MIN' });
    add(f, r, { w: 'FILL' });
    const k = label(l[0], 'M', 'Muted', 'Schlüssel');
    add(r, k);
    k.resize(140, k.height);
    const t = await T('Text', l[1], 'Body/M', 'color/text/ink');
    add(r, t, { w: 'FILL' });
  }
  const leg = row('Kategorien', 24);
  add(f, leg);
  for (const cat of CATS) {
    const g = row(CAT_DE[cat], 8);
    add(leg, g);
    add(g, I('Atom/LED', { Shape: 'Dot', Category: cat }, null, 'Punkt'));
    add(g, await T('Name', CAT_DE[cat], 'Body/Strong', 'color/cat/' + CAT_KEY[cat]));
  }
  place(f);
  endSection();
}

// ---------------------------------------------------------------- Ablauf

async function main() {
  const existing = figma.root.children.filter((p) => /^Atoms( · \d+)?$/.test(p.name)).length;
  if (existing) {
    RUN.suffix = ' · ' + (existing + 1);
    RUN.stylePrefix = 'Lauf ' + (existing + 1) + '/';
  }
  figma.notify('Loopwerk: Schriften und Variablen …', { timeout: 1500 });
  const fontRes = await resolveFonts();
  if (fontRes.missing.length) {
    RUN.fontNote = 'Ersatzschrift: ' + fontRes.missing.join(', ');
    figma.notify('Schrift fehlt – ' + RUN.fontNote + '. Google Fonts installieren und Plugin erneut laufen lassen.', { timeout: 8000 });
  }
  await createVariables();
  await createFontVariables(fontRes.fonts);
  await createTextStyles(fontRes.fonts);
  await createEffectStyles();

  const pages = {};
  for (const n of ['Cover', 'Atoms', 'Molecules', 'Organisms', 'Screens']) {
    const p = figma.createPage();
    p.name = n + RUN.suffix;
    pages[n] = p;
  }
  await usePage(pages.Atoms);
  await buildAtoms();
  await usePage(pages.Molecules);
  await buildMolecules();
  await usePage(pages.Organisms);
  await buildOrganisms();
  await usePage(pages.Screens);
  await buildScreens();
  await usePage(pages.Cover);
  await buildCover(stats);

  const msg = 'Fertig: ' + stats.components + ' Komponenten (' + stats.variants + ' Varianten), ' + stats.variables + ' Variablen, ' + TEXT_STYLES.length + ' Text-Stile, ' + Object.keys(ES).length + ' Effekt-Stile'
    + (stats.bindFails ? ' · ' + stats.bindFails + ' Bindungen nicht möglich' : '') + (RUN.fontNote ? ' · ' + RUN.fontNote : '');
  if (warnings.length) console.warn('Loopwerk-Plugin Hinweise:\n' + warnings.join('\n'));
  figma.closePlugin(msg);
}

main().catch((e) => {
  console.error(e);
  figma.closePlugin('Abgebrochen: ' + (e && e.message ? e.message : String(e)));
});
