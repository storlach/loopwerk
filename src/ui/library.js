// Sound-Regal: Suche, Kategorie-Filter, Favoriten. Klick = anhören und auswählen, Ziehen = auf eine Spur legen.

import { CATEGORIES, GENRES } from '../samples.js';
import { el, trackPointer } from '../util.js';
import { lsKey } from '../edition.js';
import { suggestMaterial } from '../recipe.js';

const FAV_KEY = lsKey('loopwerk.favs');
const OPEN_KEY = lsKey('loopwerk.shelfOpen');
const SORT_KEY = lsKey('loopwerk.shelfSort');
const LEN_KEY = lsKey('loopwerk.shelfLen');
// Längen-Filter: Loops nach Takten, Einzelklänge als One-Shot
const lenBucket = (s) => {
  if (s.kind !== 'loop') return 'shot';
  const bars = s.lengthBeats / 4;
  return bars <= 1 ? '1' : bars <= 2 ? '2' : bars <= 4 ? '4' : '8';
};
// Auf schmalen Bildschirmen ist immer nur eine Kategorie offen (Akkordeon)
const narrow = window.matchMedia('(max-width: 760px)');

// Das große Regal startet mit geschlossenen Gruppen (die Akkordeons ersetzen die Kategorie-Filter) und merkt sich
// den Zustand nur für die laufende Sitzung (Neuladen); wenige Herkunftsgruppen (groupBy) merken ihn dauerhaft
const openStore = (groupBy) => (groupBy ? localStorage : sessionStorage);
function loadOpen(groupBy) {
  try { const v = JSON.parse(openStore(groupBy).getItem(OPEN_KEY)); if (Array.isArray(v)) return new Set(v); } catch { /* Standard */ }
  return new Set(groupBy ? groupBy.map((g) => g.id) : []);
}
function saveOpen(open, groupBy) {
  try { openStore(groupBy).setItem(OPEN_KEY, JSON.stringify([...open])); } catch { /* Speicher nicht verfügbar */ }
}

function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); } catch { return new Set(); }
}
function saveFavs(favs) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch { /* Speicher nicht verfügbar */ }
}

const lengthLabel = (s, calm = false) => {
  if (s.kind !== 'loop') return calm ? 'Einzelklang' : 'One-Shot';
  const bars = s.lengthBeats / 4;
  return bars >= 1 && Number.isInteger(bars) ? `${bars} ${bars === 1 ? 'Takt' : 'Takte'}` : `${s.lengthBeats} Schläge`;
};

const describe = (s) => {
  const parts = [s.name, s.kind === 'loop' ? `Loop, ${s.beats} Schläge` : 'One-Shot'];
  if (s.bpm) parts.push(`Original ${String(s.bpm).replace('.', ',')} BPM`);
  if (s.key) parts.push(`Tonart ${s.key}`);
  if (s.genres?.length) parts.push(s.genres.map((g) => GENRES.find((x) => x.id === g)?.label).filter(Boolean).join(', '));
  parts.push(s.origin === 'Loopwerk' ? 'synthetisch erzeugt' : `${s.origin}${s.license ? ` (${s.license})` : ''}`);
  return parts.join(' · ');
};

// Herkunftsgruppen der Kiste (Edition mit shelfGroups): nach Material – Körper, Dinge, Stimme, Strom, Schleife.
// Reihenfolge der Wahl: Rezept (vom Nutzer gesetzt) → Eltern-Sound → letzte Wahl am Datensatz → Vorschlag aus der Herkunft
const materialIn = (s, store, library) => store.project.recipes?.[s.id]?.material
  ?? (s.parentId ? library.get(s.parentId)?.material : null) ?? s.material ?? suggestMaterial(s);

// onBench(id): Werkbank für einen Sound (Doppelklick, lange drücken); Schnitte eines Zerlegens (s.group) stehen als eine
// eingerückte Zeile „Name · 8 Schnitte“ unter dem Eltern-Sound und klappen auf
// objects (Krachwerk, Scheibe 4): Kits und Instrumente des Songs als erste Gruppe, dazu die Vorlage „Pad-Wand“:
// { list(): [{ id, kind, name, sub }], template(): { name, sub } | null, open(id), place(obj, target), importTemplate() }
export function mountLibrary({ root, library, store, engine, ui, arranger, onDeleteOwn, groupBy = null, onBench = null, objects = null }) {
  const search = document.getElementById('shelf-search');
  const favBtn = document.getElementById('shelf-fav');
  const resetBtn = document.getElementById('shelf-reset');
  const lupe = document.getElementById('shelf-lupe');
  const find = document.getElementById('shelf-find');
  const totalEl = document.getElementById('shelf-total');
  const favs = loadFavs();
  const open = loadOpen(groupBy);
  // Akkordeon (immer nur eine Gruppe offen) nur im großen Regal am Handy; wenige Herkunftsgruppen dürfen alle offen sein
  const accordion = () => narrow.matches && !groupBy;
  let filter = 'all';
  const items = new Map();
  const cutOpen = new Set(); // aufgeklappte Schnitt-Gruppen
  let fresh = { id: null, until: 0 }; // kurz aufleuchtende Zeile; bleibt über ein Neuzeichnen hinweg (z. B. Tonart erkannt)

  // Gruppen im Regal: nach Kategorie oder nach Genre (ein Sound kann in mehreren Genres stehen)
  let sort = 'cat';
  try { if (localStorage.getItem(SORT_KEY) === 'genre') sort = 'genre'; } catch { /* Standard */ }
  const groupsFor = (mode) => (groupBy
    ? groupBy.map((g) => ({ ...g, cls: `cat-${g.cat}`, has: (s) => (s.category === 'own' || /^pat-/.test(s.id)) && materialIn(s, store, library) === g.id }))
    : mode === 'genre'
    ? [
      // Sounds, deren Hauptgenre das ist, stehen oben
      ...GENRES.map((g) => ({ id: 'g-' + g.id, label: g.label, cls: 'genre', has: (s) => !!s.genres?.includes(g.id), rank: (s) => (s.genres[0] === g.id ? 0 : 1) })),
      { id: 'g-none', label: 'Eigene & ohne Genre', cls: 'cat-own', has: (s) => !s.genres?.length },
    ]
    : CATEGORIES.map((c) => ({ id: c.id, label: c.label, cls: `cat-${c.id}`, has: (s) => s.category === c.id })));
  let groups = groupsFor(sort);

  const sortBtns = [...document.querySelectorAll('.shelf-sort .seg[data-sort]')];
  for (const b of sortBtns) {
    b.addEventListener('click', () => {
      if (sort === b.dataset.sort) { setPane(false); return; }
      sort = b.dataset.sort;
      try { localStorage.setItem(SORT_KEY, sort); } catch { /* egal */ }
      groups = groupsFor(sort);
      if (filter !== 'all' && filter !== 'fav') filter = 'all';
      setPane(false);
      render();
    });
  }
  let len = 'all';
  try { len = localStorage.getItem(LEN_KEY) || 'all'; } catch { /* Standard */ }
  const lenBtns = [...document.querySelectorAll('.shelf-len .seg')];
  for (const b of lenBtns) {
    b.addEventListener('click', () => {
      len = len === b.dataset.len ? 'all' : b.dataset.len;
      try { localStorage.setItem(LEN_KEY, len); } catch { /* egal */ }
      setPane(false);
      render();
    });
  }
  // Länge und Ordnen liegen in einem kleinen Fach hinter dem Regler-Knopf (Handy und Desktop gleich) und schließen nach der Wahl
  const filterBtn = document.getElementById('shelf-filter-btn');
  const filterBox = document.getElementById('shelf-filters');
  // Auf- und Zuklappen in Bewegung: die Fläche wächst, die Liste darunter rutscht sichtbar nach unten,
  // die Zeilen gleiten nacheinander von oben herein (beim Schließen umgekehrt)
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let filterAnim = null;
  function setPane(want) {
    if (!filterBtn || !filterBox) return;
    if (want === (filterBtn.getAttribute('aria-expanded') === 'true')) return;
    filterBtn.setAttribute('aria-expanded', String(want));
    filterAnim?.cancel();
    if (want) filterBox.classList.add('open');
    if (calm.matches || !filterBox.animate) { filterBox.classList.toggle('open', want); return; }
    const h = filterBox.scrollHeight;
    const ease = 'cubic-bezier(.2, .8, .2, 1)';
    filterBox.style.overflow = 'hidden';
    const frames = [{ height: '0px', opacity: 0, marginTop: '-8px' }, { height: `${h}px`, opacity: 1, marginTop: '0px' }];
    filterAnim = filterBox.animate(want ? frames : [...frames].reverse(), { duration: want ? 180 : 140, easing: ease });
    filterAnim.onfinish = () => {
      filterBox.style.overflow = '';
      filterAnim = null;
      if (!want) filterBox.classList.remove('open');
    };
  }
  filterBtn?.addEventListener('click', () => setPane(filterBtn.getAttribute('aria-expanded') !== 'true'));
  // Esc oder ein Tipp daneben schließt das Fach
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || filterBtn?.getAttribute('aria-expanded') !== 'true' || !(filterBox.contains(e.target) || find.contains(e.target))) return;
    setPane(false);
    filterBtn.focus();
    e.stopPropagation();
  });
  document.addEventListener('pointerdown', (e) => {
    if (filterBtn?.getAttribute('aria-expanded') === 'true' && !filterBox.contains(e.target) && !find.contains(e.target)) setPane(false);
  }, true);
  favBtn?.addEventListener('click', () => { filter = filter === 'fav' ? 'all' : 'fav'; render(); });
  // Ein Tipp setzt Suche, Länge, Ordnung und Favoriten zurück
  resetBtn?.addEventListener('click', () => {
    search.value = '';
    filter = 'all';
    len = 'all';
    sort = 'cat';
    groups = groupsFor(sort);
    try { localStorage.setItem(LEN_KEY, 'all'); localStorage.setItem(SORT_KEY, 'cat'); } catch { /* egal */ }
    setPane(false);
    render();
  });
  search.addEventListener('input', render);

  function activate(sample) {
    if (ui.armedSampleId === sample.id) {
      ui.arm(null);
      engine.stopPreview();
    } else {
      ui.arm(sample.id);
      // Noch nicht geladen: kurz „lädt“ zeigen, bis der Klang da ist
      const item = root.querySelector(`.loop-item[data-sample-id="${sample.id}"]`);
      if (sample.lazy) item?.classList.add('loading');
      engine.previewSample(sample.id).finally(() => item?.classList.remove('loading'));
    }
  }

  function makeItem(s, cat = s.category) {
    const row = el('div', `loop-row cat-${cat}`);
    const item = el('button', 'loop-item');
    item.type = 'button';
    item.dataset.sampleId = s.id;
    item.append(el('span', 'loop-play'), el('span', 'loop-name', s.name), el('span', 'loop-len', lengthLabel(s, !!groupBy)));
    item.title = describe(s);
    bindItem(item, s);
    const star = el('button', 'loop-fav', '★');
    star.type = 'button';
    star.addEventListener('click', () => {
      if (favs.has(s.id)) favs.delete(s.id); else favs.add(s.id);
      saveFavs(favs);
      render();
    });
    row.append(item, star);
    if (s.category === 'own' && onDeleteOwn) {
      row.classList.add('own');
      const del = el('button', 'loop-del', '×');
      del.type = 'button';
      del.title = 'Eigenen Sound löschen';
      del.setAttribute('aria-label', `${s.name} löschen`);
      let armed = null;
      del.addEventListener('click', () => {
        if (armed) { clearTimeout(armed); onDeleteOwn(s.id); return; }
        del.classList.add('confirm');
        del.textContent = '?';
        armed = setTimeout(() => { armed = null; del.classList.remove('confirm'); del.textContent = '×'; }, 3000);
      });
      row.append(del);
    }
    return { row, item, star };
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    // Muster eines Kits oder Instruments im Song gehören zum Clip, nicht in die Kiste (dort stehen Kit und Instrument selbst);
    // ohne Clip bleiben sie sichtbar, damit man sie löschen kann
    const asObject = (s) => {
      const pat = objects && s.patternId ? store.project.patterns?.[s.patternId] : null;
      return !!pat && (store.project.kits?.[pat.kit] || store.project.instruments?.[pat.preset]) && store.clipsOf(s.id) > 0;
    };
    const all = library.list().filter((s) => !s.missing && !asObject(s));
    const words = (s) => [s.name, CATEGORIES.find((c) => c.id === s.category)?.label, ...(s.genres || []).map((g) => GENRES.find((x) => x.id === g)?.label),
      ...(s.tags || []), s.kind === 'loop' ? 'loop' : 'one-shot oneshot', s.origin]
      .filter(Boolean).join(' ').toLowerCase();
    const inFilter = (s) => filter === 'all' || (filter === 'fav' ? favs.has(s.id) : !!groups.find((g) => g.id === filter)?.has(s));
    const match = (s) => (!q || words(s).includes(q)) && inFilter(s) && (len === 'all' || lenBucket(s) === len);
    const shown = all.filter(match);
    root.innerHTML = '';
    items.clear();
    for (const b of sortBtns) b.setAttribute('aria-pressed', String(b.dataset.sort === sort));
    for (const b of lenBtns) b.setAttribute('aria-pressed', String(b.dataset.len === len));
    // Anzahl und Pegel je Länge: die Treffer ohne Längenfilter, damit man vor dem Tipp sieht, was er bringt
    const base = all.filter((s) => (!q || words(s).includes(q)) && inFilter(s));
    const counts = { 1: 0, 2: 0, 4: 0, 8: 0, shot: 0 };
    for (const s of base) counts[lenBucket(s)]++;
    const top = Math.max(1, ...Object.values(counts));
    const lenName = { 1: '1 Takt', 2: '2 Takte', 4: '4 Takte', 8: 'ab 5 Takten', shot: 'One-Shot' };
    for (const b of lenBtns) {
      const k = b.dataset.len;
      const n = counts[k];
      b.querySelector('.len-n').textContent = String(n);
      b.style.setProperty('--p', String(Math.sqrt(n / top)));
      b.disabled = n === 0 && len !== k;
      b.setAttribute('aria-label', `${lenName[k]}, ${n} ${n === 1 ? 'Sound' : 'Sounds'}`);
    }
    const lenShort = { 1: '1T', 2: '2T', 4: '4T', 8: '8T+', shot: 'Shot' };
    const val = [len !== 'all' ? lenShort[len] : '', sort !== 'cat' ? 'Genre' : ''].filter(Boolean).join(' ');
    const pane = len !== 'all' || sort !== 'cat';
    if (filterBtn) {
      document.getElementById('shelf-filter-n').textContent = val;
      filterBtn.classList.toggle('set', pane);
      filterBtn.setAttribute('aria-label', pane ? `Länge und Ordnen: ${[len !== 'all' ? lenName[len] : '', sort !== 'cat' ? 'nach Genre' : ''].filter(Boolean).join(', ')}` : 'Länge und Ordnen');
    }
    if (favBtn) {
      favBtn.classList.toggle('set', filter === 'fav');
      favBtn.setAttribute('aria-pressed', String(filter === 'fav'));
    }
    // × ersetzt die Lupe, sobald etwas wirkt
    const anything = !!q || filter !== 'all' || pane;
    if (resetBtn) { resetBtn.hidden = !anything; lupe.hidden = anything; }
    search.placeholder = !all.length ? 'Suchen …' : shown.length === all.length ? `Suchen … (${all.length})` : `Suchen … (${shown.length} Treffer)`;
    totalEl.textContent = shown.length === all.length ? `${all.length}` : `${shown.length} von ${all.length}`;

    const objQ = (o) => !q || o.name.toLowerCase().includes(q);
    const showObjs = !!objects && filter === 'all' && len === 'all';
    const objList = showObjs ? objects.list().filter(objQ) : [];
    const tpl = showObjs && !q ? objects.template() : null;
    if (objList.length || tpl) renderObjects(objList, tpl);
    if (!shown.length && !objList.length && !tpl) {
      root.append(el('p', 'shelf-empty', groupBy && !q && filter === 'all' ? 'Noch nichts aufgenommen' : filter === 'fav' && !q
        ? 'Noch keine Favoriten. Markiere Sounds mit dem Stern.'
        : `Keine Sounds gefunden${q ? ` für „${search.value.trim()}“` : ''}.`));
      return;
    }
    for (const cat of groups) {
      if (filter !== 'all' && filter !== 'fav' && filter !== cat.id) continue;
      const samples = shown.filter(cat.has);
      if (cat.rank) samples.sort((a, b) => cat.rank(a) - cat.rank(b));
      // Varianten stehen direkt unter ihrem Eltern-Sound (eingerückt), auch wenn sie später entstanden sind
      if (groupBy) {
        const roots = samples.filter((x) => !x.parentId);
        const kids = (id) => samples.filter((x) => x.parentId === id);
        const ordered = roots.flatMap((x) => [x, ...kids(x.id)]);
        for (const x of samples) if (!ordered.includes(x)) ordered.push(x);
        samples.splice(0, samples.length, ...ordered);
      }
      if (!samples.length) continue;
      // Bei Suche oder Filter sind alle Treffer-Gruppen offen, sonst gilt der gemerkte Zustand
      const forced = !!q || len !== 'all' || filter === 'fav';
      const expanded = forced || open.has(cat.id);
      const group = el('section', `shelf-group ${cat.cls}`);
      const h = el('h3', 'shelf-cat-wrap');
      const head = el('button', 'shelf-cat');
      head.type = 'button';
      head.id = `shelf-cat-${cat.id}`;
      head.setAttribute('aria-expanded', String(expanded));
      head.setAttribute('aria-controls', `shelf-items-${cat.id}`);
      head.disabled = forced;
      head.append(el('span', 'swatch'), el('span', null, cat.label), el('span', 'shelf-count', String(samples.length)), el('span', 'shelf-chevron'));
      head.addEventListener('click', () => toggle(cat.id));
      h.append(head);
      const list = el('div', 'shelf-items');
      list.id = `shelf-items-${cat.id}`;
      list.hidden = !expanded;
      // Große Gruppen in Abschnitte teilen: Loops, One-Shots, Percussion
      const section = (s) => (s.kind === 'loop' ? 'Loops' : s.tags?.includes('percussion') ? 'Percussion' : 'One-Shots');
      const order = { Loops: 0, 'One-Shots': 1, Percussion: 2 };
      const split = sort === 'cat' && samples.length > 24 && new Set(samples.map(section)).size > 1;
      if (split) samples.sort((a, b) => order[section(a)] - order[section(b)]);
      let lastSection = null;
      const doneGroups = new Set();
      for (const s of samples) {
        if (groupBy && s.group && s.parentId) {
          if (doneGroups.has(s.group)) continue;
          doneGroups.add(s.group);
          const kids = samples.filter((x) => x.group === s.group);
          const isOpen = cutOpen.has(s.group) || forced;
          const gr = el('div', `loop-row cat-${groupBy ? cat.cat : s.category} variant loop-group`);
          const gb = el('button', 'loop-group-btn');
          gb.type = 'button';
          gb.dataset.group = s.group;
          gb.setAttribute('aria-expanded', String(isOpen));
          const base = library.get(s.parentId)?.name ?? s.name.replace(/ · \d+$/, '');
          gb.append(el('span', 'loop-name', `${base} · ${kids.length} ${kids.length === 1 ? 'Schnitt' : 'Schnitte'}`), el('span', 'shelf-chevron'));
          gb.addEventListener('click', () => { if (cutOpen.has(s.group)) cutOpen.delete(s.group); else cutOpen.add(s.group); render(); });
          gr.append(gb);
          list.append(gr);
          if (!isOpen) continue;
          for (const k of kids) {
            const made = makeItem(k, groupBy ? cat.cat : k.category);
            made.row.classList.add('variant', 'group-kid');
            if (!items.has(k.id)) items.set(k.id, []);
            items.get(k.id).push(made.row);
            const fav = favs.has(k.id);
            made.star.classList.toggle('on', fav);
            made.star.setAttribute('aria-pressed', String(fav));
            made.star.setAttribute('aria-label', `${k.name} als Favorit ${fav ? 'entfernen' : 'markieren'}`);
            list.append(made.row);
          }
          continue;
        }
        if (split && section(s) !== lastSection) {
          lastSection = section(s);
          list.append(el('div', 'shelf-sub', `${lastSection} · ${samples.filter((x) => section(x) === lastSection).length}`));
        }
        const { row, star } = makeItem(s, groupBy ? cat.cat : s.category);
        if (s.parentId) row.classList.add('variant');
        if (s.id === fresh.id && performance.now() < fresh.until) row.classList.add('fresh');
        if (!items.has(s.id)) items.set(s.id, []);
        items.get(s.id).push(row);
        const fav = favs.has(s.id);
        star.classList.toggle('on', fav);
        star.setAttribute('aria-pressed', String(fav));
        star.setAttribute('aria-label', `${s.name} als Favorit ${fav ? 'entfernen' : 'markieren'}`);
        list.append(row);
      }
      group.append(h, list);
      root.append(group);
    }
    sync();
  }

  function renderObjects(list, tpl) {
    const expanded = !open.has('kits-zu') || !!search.value.trim();
    const group = el('section', 'shelf-group cat-drums shelf-kits');
    const h = el('h3', 'shelf-cat-wrap');
    const head = el('button', 'shelf-cat');
    head.type = 'button';
    head.id = 'shelf-cat-kits';
    head.setAttribute('aria-expanded', String(expanded));
    head.setAttribute('aria-controls', 'shelf-items-kits');
    head.append(el('span', 'swatch'), el('span', null, 'Kits und Instrumente'), el('span', 'shelf-count', String(list.length + (tpl ? 1 : 0))), el('span', 'shelf-chevron'));
    head.addEventListener('click', () => { if (open.has('kits-zu')) open.delete('kits-zu'); else open.add('kits-zu'); saveOpen(open, groupBy); render(); });
    h.append(head);
    const box = el('div', 'shelf-items');
    box.id = 'shelf-items-kits';
    box.hidden = !expanded;
    const rowOf = (o, cat) => {
      const r = el('div', `loop-row cat-${cat} loop-object`);
      const item = el('button', 'loop-item');
      item.type = 'button';
      item.dataset.objectId = o.id;
      item.append(el('span', 'loop-play'), el('span', 'loop-name', o.name), el('span', 'loop-len', o.sub));
      r.append(item);
      return { r, item };
    };
    for (const o of list) {
      const { r, item } = rowOf(o, o.kind === 'kit' ? 'drums' : 'synth');
      item.title = `${o.kind === 'kit' ? 'Kit' : 'Instrument'} · ${o.sub}`;
      bindObject(item, o);
      box.append(r);
    }
    if (tpl) {
      const { r, item } = rowOf({ id: 'pad-wand', name: tpl.name, sub: tpl.sub }, 'drums');
      r.classList.add('loop-template');
      item.dataset.template = 'pads';
      item.title = 'Vorlage aus deiner alten Pad-Wand: antippen legt ein Kit daraus an';
      item.addEventListener('click', () => objects.importTemplate());
      box.append(r);
    }
    group.append(h, box);
    root.append(group);
  }

  // Tipp öffnet die Werkbank, Ziehen auf eine Spur legt das Kit oder Instrument als Clip ab
  function bindObject(item, o) {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX, sy = e.clientY;
      let ghost = null, target = null;
      const probe = { category: o.kind === 'kit' ? 'drums' : 'synth', lengthBeats: 4 };
      const clean = () => { ghost?.remove(); document.body.classList.remove('is-dragging'); arranger.clearDropPreview(); };
      trackPointer(e, (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          ghost = el('div', `drag-ghost cat-${probe.category}`, o.name);
          document.body.append(ghost);
          document.body.classList.add('is-dragging');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        target = arranger.dropTargetAt(ev.clientX, ev.clientY, probe);
      }, () => {
        if (!ghost) { objects.open(o.id); return; }
        clean();
        if (target) objects.place(o, target);
      }, clean);
    });
    item.addEventListener('click', (e) => { if (e.detail === 0) objects.open(o.id); });
    item.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function toggle(catId) {
    if (open.has(catId)) open.delete(catId);
    else {
      if (accordion()) open.clear();
      open.add(catId);
    }
    saveOpen(open, groupBy);
    render();
    if (accordion() && open.has(catId)) document.getElementById(`shelf-cat-${catId}`)?.scrollIntoView({ block: 'nearest' });
  }

  // Werkbank für den Sound: ersetzt das Anwählen des Doppelklicks bzw. der langen Berührung
  const benchable = (sample) => !!onBench && !/^pat-/.test(sample.id) && !sample.patternId && !sample.missing;
  const openBench = (sample) => {
    ui.arm(null);
    engine.stopPreview();
    onBench(sample.id);
  };
  let lastTap = { id: null, t: 0 };

  // Ziehen auf ein Pad der Kit-Werkbank (Element mit data-pad-drop): Ziel hervorheben, beim Loslassen Ereignis „pad-drop“
  function overPad(ev, prev) {
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-pad-drop]') ?? null;
    if (hit !== prev) { prev?.classList.remove('pad-over'); hit?.classList.add('pad-over'); }
    return hit;
  }

  function bindItem(item, sample) {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;
      let target = null;
      let long = false;
      let padOver = null;
      const timer = benchable(sample) ? setTimeout(() => { if (!ghost) { long = true; lastTap = { id: null, t: 0 }; openBench(sample); } }, 520) : 0;
      trackPointer(e, (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          clearTimeout(timer);
          ghost = el('div', `drag-ghost cat-${sample.category}`, sample.name);
          document.body.append(ghost);
          document.body.classList.add('is-dragging');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        target = arranger.dropTargetAt(ev.clientX, ev.clientY, sample);
        padOver = overPad(ev, padOver);
      }, () => {
        clearTimeout(timer);
        if (long) return;
        if (!ghost) {
          const now = performance.now();
          if (benchable(sample) && lastTap.id === sample.id && now - lastTap.t < 350) { lastTap = { id: null, t: 0 }; openBench(sample); return; }
          lastTap = { id: sample.id, t: now };
          activate(sample);
          return;
        }
        ghost.remove();
        document.body.classList.remove('is-dragging');
        arranger.clearDropPreview();
        if (padOver) { padOver.classList.remove('pad-over'); padOver.dispatchEvent(new CustomEvent('pad-drop', { detail: { sampleId: sample.id } })); return; }
        if (target) arranger.select(store.addClip(target.trackId, sample.id, target.startBeat, sample.lengthBeats));
      }, () => {
        clearTimeout(timer);
        padOver?.classList.remove('pad-over');
        ghost?.remove();
        document.body.classList.remove('is-dragging');
        arranger.clearDropPreview();
      });
    });
    if (onBench) item.addEventListener('contextmenu', (e) => e.preventDefault());
    // Tastatur: Enter hört an und wählt, Umschalt+Enter öffnet die Werkbank (click ohne Zeigerbewegung)
    item.addEventListener('click', (e) => { if (e.detail !== 0) return; if (e.shiftKey && benchable(sample)) openBench(sample); else activate(sample); });
  }

  function sync() {
    for (const [id, list] of items) {
      for (const row of list) {
        const item = row.firstChild;
        item.classList.toggle('armed', ui.armedSampleId === id);
        item.classList.toggle('previewing', engine.preview?.sampleId === id);
        item.setAttribute('aria-pressed', String(ui.armedSampleId === id));
      }
    }
  }
  ui.on(sync);
  engine.on(sync);
  // Kits, Instrumente und die Vorlage ändern sich im Store, nicht in der Bibliothek: nur bei geänderter Liste neu aufbauen
  if (objects) {
    const patClips = () => store.project.tracks.reduce((n, t) => n + t.clips.filter((c) => /^pat-/.test(c.sampleId)).length, 0);
    const sig = () => JSON.stringify([objects.list(), objects.template(), patClips()]);
    let last = sig();
    store.on(() => { const s = sig(); if (s !== last) { last = s; render(); } });
  }
  // Tempowechsel ändert nichts, was das Regal zeigt (Loops in Takten, One-Shots ohne Länge): kein Neuaufbau
  library.on?.((why) => { if (why !== 'tempo') render(); });
  narrow.addEventListener('change', () => {
    if (accordion() && open.size > 1) { const first = [...open][0]; open.clear(); open.add(first); saveOpen(open, groupBy); }
    render();
  });
  if (accordion() && open.size > 1) { const first = [...open][0]; open.clear(); open.add(first); }
  render();
  // Sound sichtbar machen: Gruppe öffnen (Filter/Suche lösen, falls sie ihn verbergen), hinscrollen, kurz aufleuchten
  function reveal(sampleId) {
    const s = library.get(sampleId);
    if (!s) return;
    const group = groups.find((g) => g.has(s));
    if (!group) return;
    const q = search.value.trim().toLowerCase();
    if (q && !s.name.toLowerCase().includes(q)) search.value = '';
    if (filter !== 'all' && filter !== group.id && !(filter === 'fav' && favs.has(s.id))) filter = 'all';
    if (len !== 'all' && lenBucket(s) !== len) len = 'all';
    if (accordion()) open.clear();
    open.add(group.id);
    saveOpen(open, groupBy);
    render();
    const row = items.get(sampleId)?.[0];
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    row.classList.add('fresh');
    fresh = { id: sampleId, until: performance.now() + 1600 };
    setTimeout(() => { for (const r of items.get(sampleId) || []) r.classList.remove('fresh'); }, 1600);
  }

  return { render, reveal };
}
