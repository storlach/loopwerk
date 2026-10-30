// Sound-Regal: Suche, Kategorie-Filter, Favoriten. Klick = anhören und auswählen, Ziehen = auf eine Spur legen.

import { CATEGORIES, GENRES } from '../samples.js';
import { el, trackPointer } from '../util.js';

const FAV_KEY = 'loopwerk.favs';
const OPEN_KEY = 'loopwerk.shelfOpen';
const SORT_KEY = 'loopwerk.shelfSort';
// Auf schmalen Bildschirmen ist immer nur eine Kategorie offen (Akkordeon)
const narrow = window.matchMedia('(max-width: 760px)');

function loadOpen() {
  try { const v = JSON.parse(localStorage.getItem(OPEN_KEY)); if (Array.isArray(v)) return new Set(v); } catch { /* Standard */ }
  return new Set(['drums']);
}
function saveOpen(open) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch { /* Speicher nicht verfügbar */ }
}

function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); } catch { return new Set(); }
}
function saveFavs(favs) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch { /* Speicher nicht verfügbar */ }
}

const lengthLabel = (s) => {
  if (s.kind !== 'loop') return 'One-Shot';
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

export function mountLibrary({ root, library, store, engine, ui, arranger, onDeleteOwn }) {
  const search = document.getElementById('shelf-search');
  const chipsEl = document.getElementById('shelf-chips');
  const totalEl = document.getElementById('shelf-total');
  const favs = loadFavs();
  const open = loadOpen();
  let filter = 'all';
  const items = new Map();

  // Gruppen im Regal: nach Kategorie oder nach Genre (ein Sound kann in mehreren Genres stehen)
  let sort = 'cat';
  try { if (localStorage.getItem(SORT_KEY) === 'genre') sort = 'genre'; } catch { /* Standard */ }
  const groupsFor = (mode) => (mode === 'genre'
    ? [
      // Sounds, deren Hauptgenre das ist, stehen oben
      ...GENRES.map((g) => ({ id: 'g-' + g.id, label: g.label, cls: 'genre', has: (s) => !!s.genres?.includes(g.id), rank: (s) => (s.genres[0] === g.id ? 0 : 1) })),
      { id: 'g-none', label: 'Eigene & ohne Genre', cls: 'cat-own', has: (s) => !s.genres?.length },
    ]
    : CATEGORIES.map((c) => ({ id: c.id, label: c.label, cls: `cat-${c.id}`, has: (s) => s.category === c.id })));
  let groups = groupsFor(sort);

  function buildChips() {
    chipsEl.innerHTML = '';
    for (const c of [{ id: 'all', label: 'Alle' }, { id: 'fav', label: '★' }, ...groups]) {
      const chip = el('button', `chip${c.cls ? ` ${c.cls}` : ''}`, c.label);
      chip.type = 'button';
      chip.dataset.filter = c.id;
      if (c.id === 'fav') { chip.title = 'Favoriten'; chip.setAttribute('aria-label', 'Favoriten'); }
      chip.addEventListener('click', () => { filter = c.id; render(); });
      chipsEl.append(chip);
    }
  }
  const sortBtns = [...document.querySelectorAll('.shelf-sort .seg')];
  for (const b of sortBtns) {
    b.addEventListener('click', () => {
      if (sort === b.dataset.sort) return;
      sort = b.dataset.sort;
      try { localStorage.setItem(SORT_KEY, sort); } catch { /* egal */ }
      groups = groupsFor(sort);
      if (filter !== 'all' && filter !== 'fav') filter = 'all';
      // Erste Gruppe öffnen, damit gleich etwas zu sehen ist
      if (!groups.some((g) => open.has(g.id))) { if (narrow.matches) open.clear(); open.add(groups[0].id); saveOpen(open); }
      buildChips();
      render();
    });
  }
  buildChips();
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

  function makeItem(s) {
    const row = el('div', `loop-row cat-${s.category}`);
    const item = el('button', 'loop-item');
    item.type = 'button';
    item.dataset.sampleId = s.id;
    item.append(el('span', 'loop-play'), el('span', 'loop-name', s.name), el('span', 'loop-len', lengthLabel(s)));
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
    const all = library.list();
    const words = (s) => [s.name, CATEGORIES.find((c) => c.id === s.category)?.label, ...(s.genres || []).map((g) => GENRES.find((x) => x.id === g)?.label)]
      .filter(Boolean).join(' ').toLowerCase();
    const inFilter = (s) => filter === 'all' || (filter === 'fav' ? favs.has(s.id) : !!groups.find((g) => g.id === filter)?.has(s));
    const match = (s) => (!q || words(s).includes(q)) && inFilter(s);
    const shown = all.filter(match);
    root.innerHTML = '';
    items.clear();
    for (const chip of chipsEl.children) chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
    for (const b of sortBtns) b.setAttribute('aria-pressed', String(b.dataset.sort === sort));
    totalEl.textContent = shown.length === all.length ? `${all.length}` : `${shown.length} von ${all.length}`;

    if (!shown.length) {
      root.append(el('p', 'shelf-empty', filter === 'fav' && !q
        ? 'Noch keine Favoriten. Markiere Sounds mit dem Stern.'
        : `Keine Sounds gefunden${q ? ` für „${search.value.trim()}“` : ''}.`));
      return;
    }
    for (const cat of groups) {
      if (filter !== 'all' && filter !== 'fav' && filter !== cat.id) continue;
      const samples = shown.filter(cat.has);
      if (cat.rank) samples.sort((a, b) => cat.rank(a) - cat.rank(b));
      if (!samples.length) continue;
      // Bei Suche oder Filter sind alle Treffer-Gruppen offen, sonst gilt der gemerkte Zustand
      const forced = !!q || filter !== 'all';
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
      for (const s of samples) {
        const { row, star } = makeItem(s);
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

  function toggle(catId) {
    if (open.has(catId)) open.delete(catId);
    else {
      if (narrow.matches) open.clear();
      open.add(catId);
    }
    saveOpen(open);
    render();
    if (narrow.matches && open.has(catId)) document.getElementById(`shelf-cat-${catId}`)?.scrollIntoView({ block: 'nearest' });
  }

  function bindItem(item, sample) {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;
      let target = null;
      trackPointer(e, (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          ghost = el('div', `drag-ghost cat-${sample.category}`, sample.name);
          document.body.append(ghost);
          document.body.classList.add('is-dragging');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        target = arranger.dropTargetAt(ev.clientX, ev.clientY, sample);
      }, () => {
        if (!ghost) { activate(sample); return; }
        ghost.remove();
        document.body.classList.remove('is-dragging');
        arranger.clearDropPreview();
        if (target) arranger.select(store.addClip(target.trackId, sample.id, target.startBeat, sample.lengthBeats));
      }, () => {
        ghost?.remove();
        document.body.classList.remove('is-dragging');
        arranger.clearDropPreview();
      });
    });
    // Tastatur (Enter): click ohne Zeigerbewegung
    item.addEventListener('click', (e) => { if (e.detail === 0) activate(sample); });
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
  library.on?.(render);
  narrow.addEventListener('change', () => {
    if (narrow.matches && open.size > 1) { const first = [...open][0]; open.clear(); open.add(first); saveOpen(open); }
    render();
  });
  if (narrow.matches && open.size > 1) { const first = [...open][0]; open.clear(); open.add(first); }
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
    if (narrow.matches) open.clear();
    open.add(group.id);
    saveOpen(open);
    render();
    const row = items.get(sampleId)?.[0];
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    row.classList.add('fresh');
    setTimeout(() => row.classList.remove('fresh'), 1600);
  }

  return { render, reveal };
}
