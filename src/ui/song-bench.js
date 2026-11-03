// Song-Werkbank (Krachwerk Scheibe 5, Spec docs/specs/krachwerk-5-song.md): ersetzt im Inspektor und im Song-Fach alles, was den
// ganzen Song betrifft. Kopf (Name, „32 Takte · 1:25“, Exportieren) · Fortschritt als Linie · Reiter Song · Mischen · Fertig · Projekt · Aufnahme.
// Je Reiter höchstens 5 Griffe im Grund, der Rest unter „Feinheiten“. Geschrieben wird nur über Store-Aktionen
// (setBpm, setKey, setLength, setProjectName, setMaster, setTrack, setMastering); Speichern, Öffnen, Sichern liegen außerhalb des Undo.

import { MIN_BPM, MAX_BPM, keyChangesOf } from '../model.js';
import { masterOf, masteringOf } from '../engine.js';
import { ingredients } from '../recipe.js';
import { el } from '../util.js';
import { lsKey } from '../edition.js';
import { loadRecPrefs, saveRecPrefs } from '../rec-prefs.js';
import { formatDb } from './arranger.js';
import { bindKeySelect } from './key-select.js';
import { mountMasteringControls } from './mastering.js';
import { narrow } from './place.js';
import { setSongSlots } from './song-slots.js';
import { fillText } from './freeze-ui.js';

const TAB_KEY = lsKey('loopwerk.wbTab');
const FINE_KEY = lsKey('loopwerk.wbFine');
const TABS = [['song', 'Song'], ['mischen', 'Mischen'], ['fertig', 'Fertig'], ['projekt', 'Projekt'], ['aufnahme', 'Aufnahme']];

const load = (key) => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const save = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* egal */ } };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function mountSongBench(box, { store, ui, library, engine, mastering, exporter, own = null, appName = 'Krachwerk' }) {
  const root = el('div', 'wb sb');
  box.setAttribute('aria-label', 'Song-Werkbank');
  box.append(root);
  const fineOpen = load(FINE_KEY);
  const tabMem = load(TAB_KEY);

  // ---------- Kopf ----------
  const head = el('header', 'wb-head sb-head');
  const nameBtn = el('button', 'wb-name');
  nameBtn.type = 'button';
  nameBtn.id = 'sb-name';
  nameBtn.title = 'Antippen zum Umbenennen';
  const nameIn = document.createElement('input');
  Object.assign(nameIn, { type: 'text', maxLength: 40, id: 'sb-name-in', className: 'wb-name-in', hidden: true });
  nameIn.setAttribute('aria-label', 'Name des Songs');
  const meta = el('span', 'wb-count');
  meta.id = 'sb-meta';
  const headSlot = el('span', 'sb-head-slot'); // hier steht „Exportieren“ (layout.js)
  headSlot.id = 'sb-head-slot';
  head.append(nameBtn, nameIn, meta, headSlot);
  function rename(on) {
    nameBtn.hidden = on;
    nameIn.hidden = !on;
    if (on) { nameIn.value = store.project.name ?? ''; nameIn.focus(); nameIn.select(); }
  }
  nameBtn.addEventListener('click', () => rename(true));
  let keepName = true;
  nameIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); keepName = false; nameIn.blur(); }
  });
  nameIn.addEventListener('blur', () => {
    const v = nameIn.value.trim();
    const ok = keepName;
    keepName = true;
    rename(false);
    if (ok && v && v !== store.project.name) store.setProjectName(v);
  });
  // Fortschritt als Linie unter dem Kopf; der Text steht darunter (Status oder Zutaten)
  const prog = el('div', 'wb-prog sb-prog');
  prog.id = 'sb-prog';
  prog.hidden = true;
  const progFill = el('i');
  prog.append(progFill);
  const status = el('p', 'wb-tree sb-status');
  status.id = 'sb-status';
  status.setAttribute('role', 'status');

  // ---------- Reiter ----------
  const tabs = el('div', 'wb-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Song-Werkbank');
  const panels = {};
  const tabBtns = {};
  const slots = {};
  const savePref = (key, id, v) => { const cur = load(key); cur[id] = v; save(key, cur); };
  function panel(id) {
    const p = el('div', 'wb-panel');
    p.id = `sb-panel-${id}`;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', `sb-tab-${id}`);
    p.hidden = true;
    const grund = el('div', 'wb-grund');
    const fineBtn = el('button', 'wb-fine-btn', 'Feinheiten');
    fineBtn.type = 'button';
    fineBtn.id = `sb-fine-btn-${id}`;
    const fine = el('div', 'wb-fine');
    const setFine = (on) => { fine.hidden = !on; fineBtn.setAttribute('aria-expanded', String(on)); };
    setFine(!!fineOpen[`sb-${id}`]);
    fineBtn.addEventListener('click', () => { fineOpen[`sb-${id}`] = fine.hidden; setFine(fine.hidden); savePref(FINE_KEY, `sb-${id}`, fine.hidden === false); });
    p.append(grund, fineBtn, fine);
    panels[id] = { p, grund, fine, fineBtn };
    return panels[id];
  }
  for (const [id, label] of TABS) {
    const b = el('button', 'wb-tab', label);
    b.type = 'button';
    b.id = `sb-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `sb-panel-${id}`);
    b.addEventListener('click', () => choose(id));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = TABS.map(([i]) => i);
      const next = ids[(ids.indexOf(id) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
      e.preventDefault();
      choose(next);
      tabBtns[next].focus();
    });
    tabs.append(b);
    tabBtns[id] = b;
    panel(id);
  }
  root.append(head, prog, status, tabs, ...TABS.map(([i]) => panels[i].p));
  let tab = TABS.some(([i]) => i === tabMem.song) ? tabMem.song : 'song';
  function choose(id) {
    tab = id;
    savePref(TAB_KEY, 'song', id);
    show();
    render();
  }
  function show() {
    for (const [id] of TABS) {
      const on = id === tab;
      tabBtns[id].setAttribute('aria-selected', String(on));
      tabBtns[id].tabIndex = on ? 0 : -1;
      panels[id].p.hidden = !on;
    }
  }

  // ---------- Bausteine ----------
  const row = (parent, label) => {
    const r = el('label', 'insp-row wb-row');
    const out = el('output');
    r.append(el('span', null, label), out);
    parent.append(r);
    return { r, out };
  };
  const range = (r, id, min, max, step) => {
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), id });
    r.append(input);
    return input;
  };
  const toggle = (parent, label, id, fn) => {
    const b = el('button', 'wb-btn wb-toggle', label);
    b.type = 'button';
    b.id = id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', fn);
    parent.append(b);
    return b;
  };
  const setVal = (input, v) => { if (document.activeElement !== input) input.value = String(v); };
  const group = (parent, cls) => { const g = el('div', `sb-tools ${cls}`); g.id = cls; parent.append(g); return g; };
  const updaters = [];

  // ---------- Song: Tempo · Tonart · Länge · Klick ----------
  {
    const { grund, fine } = panels.song;
    const t = row(grund, 'Tempo');
    const tIn = range(t.r, 'sb-tempo', MIN_BPM, MAX_BPM, 1);
    tIn.setAttribute('aria-label', 'Tempo in BPM');
    tIn.addEventListener('input', () => { t.out.textContent = `${tIn.value} BPM`; });
    tIn.addEventListener('change', () => store.setBpm(Number(tIn.value)));
    const k = el('label', 'insp-row wb-row sb-key');
    const keySel = document.createElement('select');
    keySel.className = 'key-sel';
    keySel.id = 'sb-key';
    k.append(el('span', null, 'Tonart'), keySel);
    grund.append(k);
    bindKeySelect(keySel, store);
    const l = row(grund, 'Länge');
    const lIn = range(l.r, 'sb-length', 4, 128, 4);
    lIn.setAttribute('aria-label', 'Länge des Songs in Takten');
    lIn.addEventListener('input', () => { l.out.textContent = `${lIn.value} Takte`; });
    lIn.addEventListener('change', () => store.setLength(Number(lIn.value)));
    slots.song = group(grund, 'sb-song-tools'); // Klick (metro-btn)
    // Feinheiten: Tempo eintippen · Tonart je Takt und Akkordzeile zeigen (harm-btn) · Tonartwechsel
    const typed = el('label', 'insp-row wb-row');
    const typedIn = document.createElement('input');
    Object.assign(typedIn, { type: 'number', id: 'sb-bpm', min: String(MIN_BPM), max: String(MAX_BPM), step: '0.1', inputMode: 'decimal' });
    typedIn.setAttribute('aria-label', 'Tempo eintippen (BPM)');
    typedIn.addEventListener('change', () => store.setBpm(Number(String(typedIn.value).replace(',', '.'))));
    typedIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') typedIn.blur(); });
    typed.append(el('span', null, 'Tempo eintippen'), typedIn);
    fine.append(typed);
    slots.songFine = group(fine, 'sb-song-fine');
    const chg = el('div', 'insp-keychg');
    chg.id = 'sb-keychg';
    fine.append(chg);
    updaters.push(() => {
      const p = store.project;
      setVal(tIn, p.bpm);
      t.out.textContent = `${p.bpm} BPM`;
      setVal(lIn, p.lengthBars);
      l.out.textContent = `${p.lengthBars} Takte`;
      setVal(typedIn, p.bpm);
      const list = keyChangesOf(p);
      chg.hidden = !list.length;
      chg.replaceChildren(...(list.length ? [el('span', 'insp-keychg-label', 'Tonartwechsel')] : []), ...list.map((c) => {
        const r = el('div', 'insp-keychg-row');
        const rm = el('button', 'insp-keychg-rm', '×');
        rm.type = 'button';
        rm.title = `Wechsel ab Takt ${c.bar} entfernen`;
        rm.setAttribute('aria-label', `Tonartwechsel ab Takt ${c.bar} entfernen`);
        rm.addEventListener('click', () => store.clearKeyAt(c.bar));
        r.append(el('span', null, `ab Takt ${c.bar}`), el('output', null, c.key), rm);
        return r;
      }));
    });
  }

  // ---------- Mischen: Fader je Spur · FX-Pad ▸ · Summen-Effekte ▸ ----------
  {
    const { grund, fine } = panels.mischen;
    const faders = el('div', 'sb-faders');
    faders.id = 'sb-faders';
    grund.append(faders);
    let built = '';
    const rows = new Map();
    const faderRow = (id, label, onInput, onName) => {
      const r = el('div', 'insp-row wb-row sb-fader');
      const name = el(onName ? 'button' : 'span', 'sb-fname', label);
      if (onName) { name.type = 'button'; name.title = 'Spur-Werkbank öffnen'; name.addEventListener('click', onName); }
      const out = el('output');
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min: '0', max: '1', step: '0.01' });
      input.setAttribute('aria-label', `Lautstärke ${label}`);
      input.addEventListener('input', () => onInput(Number(input.value)));
      r.append(name, out, input);
      rows.set(id, { r, name, out, input });
      return r;
    };
    function build() {
      const p = store.project;
      const key = p.tracks.map((t) => `${t.id}:${t.name}`).join('|');
      if (key === built || faders.contains(document.activeElement)) return;
      built = key;
      rows.clear();
      faders.replaceChildren(
        ...p.tracks.map((t) => faderRow(t.id, t.name, (v) => store.setTrack(t.id, { volume: v }, 'vol-' + t.id), () => { ui.selectTrack(t.id); })),
        faderRow('__master', 'Summe', (v) => store.setMaster({ volume: v }, 'master-vol')),
      );
      rows.get('__master').r.classList.add('sb-master');
    }
    slots.mix = group(grund, 'sb-mix-tools'); // FX-Pad (fxpad-btn)
    const fxBtn = el('button', 'wb-btn sb-more', 'Summen-Effekte');
    fxBtn.type = 'button';
    fxBtn.id = 'sb-fx-toggle';
    fxBtn.setAttribute('aria-expanded', 'false');
    const fxHost = el('div', 'sb-fx');
    fxHost.id = 'sb-fx';
    fxHost.hidden = true;
    fxBtn.addEventListener('click', () => { fxHost.hidden = !fxHost.hidden; fxBtn.setAttribute('aria-expanded', String(!fxHost.hidden)); });
    grund.append(fxBtn, fxHost);
    slots.fx = fxHost;
    slots.auto = fine; // Verlauf der Summe (Inspektor hängt es hier ein)
    updaters.push(() => {
      build();
      const p = store.project;
      for (const t of p.tracks) {
        const r = rows.get(t.id);
        if (!r) continue;
        setVal(r.input, t.volume);
        r.out.textContent = formatDb(t.volume);
        r.r.classList.toggle('muted', !!t.mute);
      }
      const m = rows.get('__master');
      if (m) { const v = masterOf(p).volume; setVal(m.input, v); m.out.textContent = formatDb(v); }
    });
  }

  // ---------- Fertig: Mastering · Stil · nur Loop-Bereich · Teilen ----------
  {
    const { grund, fine } = panels.fertig;
    const mst = el('div', 'sb-mst');
    grund.append(mst);
    let cmpRow = null;
    if (mastering) cmpRow = mountMasteringControls(mst, { store, engine, analysis: mastering, prefix: 'sb-mst', split: true }).cmpRow;
    const loopBtn = toggle(grund, 'Nur Loop-Bereich', 'sb-loop', () => exporter.setLoopOnly(!exporter.loopOnly));
    const shareBtn = el('button', 'wb-btn', 'Teilen');
    shareBtn.type = 'button';
    shareBtn.id = 'sb-share';
    shareBtn.addEventListener('click', () => exporter.run({ share: true }));
    grund.append(shareBtn);
    const zut = el('p', 'wb-note sb-zut');
    zut.id = 'sb-zut';
    grund.append(zut);
    const mp3 = toggle(fine, 'MP3 statt WAV', 'sb-mp3', () => exporter.setPref('mp3', !exporter.prefs.mp3));
    const stems = toggle(fine, 'Einzelspuren (ZIP)', 'sb-stems', () => exporter.setPref('stems', !exporter.prefs.stems));
    const tail = toggle(fine, 'Ausklang am Ende', 'sb-tail', () => exporter.setPref('tail', !exporter.prefs.tail));
    const list = toggle(fine, 'Zutatenliste mitgeben', 'sb-list', () => exporter.setPref('list', !exporter.prefs.list));
    if (cmpRow) { cmpRow.id = 'sb-mst-cmp'; fine.append(cmpRow); }
    updaters.push(() => {
      const p = store.project;
      const hasLoop = p.loop.endBeat > p.loop.startBeat;
      loopBtn.hidden = !hasLoop;
      loopBtn.setAttribute('aria-pressed', String(hasLoop && exporter.loopOnly));
      shareBtn.hidden = !(narrow.matches && exporter.canShare());
      for (const [b, k] of [[mp3, 'mp3'], [stems, 'stems'], [tail, 'tail'], [list, 'list']]) b.setAttribute('aria-pressed', String(!!exporter.prefs[k]));
      if (cmpRow) cmpRow.hidden = !masteringOf(p).on;
      zut.textContent = ingredients(p, library, { app: appName }).summary;
    });
  }

  // ---------- Projekt: Speichern · Öffnen · Neuer Song · Sichern · Zurückholen ----------
  {
    const { grund, fine } = panels.projekt;
    slots.proj = group(grund, 'sb-proj-tools');
    const fill = el('p', 'wb-note');
    fill.id = 'sb-fill';
    fine.append(fill);
    slots.projFine = group(fine, 'sb-proj-fine'); // Tipps zurücksetzen, Tastenkürzel
    const about = el('p', 'wb-note sb-about');
    about.id = 'sb-about';
    about.textContent = `${appName} · gebaut auf Loopwerk · nur Selbstgemachtes: Aufnahmen, Dateien und was du daraus formst.`;
    fine.append(about);
    let last = 0;
    updaters.push(() => {
      if (!own || tab !== 'projekt' || Date.now() - last < 1500) return;
      last = Date.now();
      own.usage().then((u) => { const f = fillText(u); fill.textContent = f.text ? `${f.text}${f.full ? '' : ' belegt'}` : 'Noch nichts Eigenes gespeichert.'; }).catch(() => {});
    });
  }

  // ---------- Aufnahme: Stopp nach Stille · Stille-Dauer · Säubern (Latenz und Eingang folgen mit v2.13) ----------
  {
    const { grund, fine } = panels.aufnahme;
    const stop = toggle(grund, 'Stopp nach Stille', 'sb-autostop', () => { saveRecPrefs({ autoStop: !loadRecPrefs().autoStop }); render(); });
    slots.recSetup = el('div', 'sb-rec-setup'); // Platz für das Feld „Aufnahme“ aus v2.13 (Latenz, Einmessen, Eingang)
    slots.recSetup.id = 'sb-rec-slot';
    grund.append(slots.recSetup);
    const clean = toggle(fine, 'Säubern', 'sb-clean', () => { saveRecPrefs({ clean: !loadRecPrefs().clean }); render(); });
    const s = row(fine, 'Stille-Dauer');
    const sIn = range(s.r, 'sb-silence', 0.5, 3, 0.1);
    sIn.setAttribute('aria-label', 'Stille-Dauer bis zum Stopp in Sekunden');
    sIn.addEventListener('input', () => { s.out.textContent = `${Number(sIn.value).toFixed(1).replace('.', ',')} s`; });
    sIn.addEventListener('change', () => { saveRecPrefs({ silence: Number(sIn.value) }); render(); });
    updaters.push(() => {
      const r = loadRecPrefs();
      stop.setAttribute('aria-pressed', String(r.autoStop));
      clean.setAttribute('aria-pressed', String(r.clean));
      setVal(sIn, r.silence);
      s.out.textContent = `${r.silence.toFixed(1).replace('.', ',')} s`;
      s.r.hidden = !r.autoStop;
    });
  }

  setSongSlots({ head: headSlot, song: slots.song, songFine: slots.songFine, mix: slots.mix, proj: slots.proj, projFine: slots.projFine });
  show();

  // ---------- Anzeige ----------
  const busyBar = () => {
    const st = exporter.state;
    prog.hidden = !st.busy;
    progFill.style.width = `${Math.round(st.p * 100)}%`;
    status.textContent = st.text || '';
  };
  exporter.on(() => { busyBar(); render(); });

  function render() {
    const p = store.project;
    if (nameBtn.textContent !== (p.name || 'Song')) nameBtn.textContent = p.name || 'Song';
    const bars = p.lengthBars;
    meta.textContent = `${bars} ${bars === 1 ? 'Takt' : 'Takte'} · ${clock(bars * p.beatsPerBar * 60 / p.bpm)}`;
    for (const u of updaters) u();
    if (!exporter.state.text) status.textContent = '';
  }
  show();
  render();
  return { render, slots, show, get tab() { return tab; }, choose };
}
