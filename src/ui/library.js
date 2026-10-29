// Sound-Regal: Suche, Kategorie-Filter, Favoriten. Klick = anhören und auswählen, Ziehen = auf eine Spur legen.

import { CATEGORIES } from '../samples.js';
import { el, trackPointer } from '../util.js';

const FAV_KEY = 'loopwerk.favs';

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
  parts.push(s.origin === 'Loopwerk' ? 'synthetisch erzeugt' : `${s.origin}${s.license ? ` (${s.license})` : ''}`);
  return parts.join(' · ');
};

export function mountLibrary({ root, library, store, engine, ui, arranger, onDeleteOwn }) {
  const search = document.getElementById('shelf-search');
  const chipsEl = document.getElementById('shelf-chips');
  const totalEl = document.getElementById('shelf-total');
  const favs = loadFavs();
  let filter = 'all';
  const items = new Map();

  const chipDefs = [{ id: 'all', label: 'Alle' }, { id: 'fav', label: '★' }, ...CATEGORIES];
  for (const c of chipDefs) {
    const chip = el('button', `chip${c.id !== 'all' && c.id !== 'fav' ? ` cat-${c.id}` : ''}`, c.label);
    chip.type = 'button';
    chip.dataset.filter = c.id;
    if (c.id === 'fav') { chip.title = 'Favoriten'; chip.setAttribute('aria-label', 'Favoriten'); }
    chip.addEventListener('click', () => { filter = c.id; render(); });
    chipsEl.append(chip);
  }
  search.addEventListener('input', render);

  function activate(sample) {
    if (ui.armedSampleId === sample.id) {
      ui.arm(null);
      engine.stopPreview();
    } else {
      ui.arm(sample.id);
      engine.previewSample(sample.id);
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
    const match = (s) => (!q || s.name.toLowerCase().includes(q) || (CATEGORIES.find((c) => c.id === s.category)?.label ?? '').toLowerCase().includes(q))
      && (filter === 'all' || (filter === 'fav' ? favs.has(s.id) : s.category === filter));
    const shown = all.filter(match);
    root.innerHTML = '';
    items.clear();
    for (const chip of chipsEl.children) chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
    totalEl.textContent = shown.length === all.length ? `${all.length}` : `${shown.length} von ${all.length}`;

    if (!shown.length) {
      root.append(el('p', 'shelf-empty', filter === 'fav' && !q
        ? 'Noch keine Favoriten. Markiere Sounds mit dem Stern.'
        : `Keine Sounds gefunden${q ? ` für „${search.value.trim()}“` : ''}.`));
      return;
    }
    for (const cat of CATEGORIES) {
      const samples = shown.filter((s) => s.category === cat.id);
      if (!samples.length) continue;
      const group = el('section', `shelf-group cat-${cat.id}`);
      const head = el('h3', 'shelf-cat');
      head.append(el('span', 'swatch'), el('span', null, cat.label), el('span', 'shelf-count', String(samples.length)));
      const list = el('div', 'shelf-items');
      for (const s of samples) {
        const { row, star } = makeItem(s);
        items.set(s.id, row);
        const fav = favs.has(s.id);
        star.classList.toggle('on', fav);
        star.setAttribute('aria-pressed', String(fav));
        star.setAttribute('aria-label', `${s.name} als Favorit ${fav ? 'entfernen' : 'markieren'}`);
        list.append(row);
      }
      group.append(head, list);
      root.append(group);
    }
    sync();
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
    for (const [id, row] of items) {
      const item = row.firstChild;
      item.classList.toggle('armed', ui.armedSampleId === id);
      item.classList.toggle('previewing', engine.preview?.sampleId === id);
      item.setAttribute('aria-pressed', String(ui.armedSampleId === id));
    }
  }
  ui.on(sync);
  engine.on(sync);
  library.on?.(render);
  render();
  return { render };
}
