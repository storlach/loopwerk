// Feld „Aufnahme“ (Spec 2.13 A): Eingang, Latenz [−] 142 ms [+] · eingemessen/geschätzt, Einmessen.
// Desktop im Klappfeld am ● (#rec-pop), Handy im Fach „Song“ (#song-rec), Krachwerk: Song-Werkbank bzw. Song-Fach.
// Werte je Gerät in rec-settings.js (kein Projektfeld, kein Rückgängig).

import { el } from '../util.js';
import { place, narrow } from './place.js';
import { slot } from './song-slots.js';
import { deviceKey, loadLatency, saveLatency, estimateLatency, DEFAULT_INPUT } from '../rec-settings.js';

const NUDGE_MAX = 500;

export function mountRecSetup({ ui, engine, recorder }) {
  const $ = (id) => document.getElementById(id);
  const pop = $('rec-pop');
  const more = $('rec-more');
  const box = el('div', 'rec-setup');
  box.id = 'rec-setup';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Aufnahme');

  const inRow = el('div', 'rs-row');
  const inVal = el('span', 'rs-input', 'Standard-Mikrofon');
  inVal.id = 'rs-input';
  inRow.append(el('span', 'rs-label', 'Eingang'), inVal);

  const latRow = el('div', 'rs-row');
  const lat = el('div', 'rs-lat');
  const btn = (cls, text, label) => { const b = el('button', `key ${cls}`, text); b.type = 'button'; b.setAttribute('aria-label', label); return b; };
  const minus = btn('rs-step', '−', 'Weniger Ausgleich (Umschalt: 10 ms)');
  minus.id = 'rs-minus';
  minus.title = 'Aufnahme liegt zu früh: weniger Ausgleich (Umschalt: 10 ms)';
  const plus = btn('rs-step', '+', 'Mehr Ausgleich (Umschalt: 10 ms)');
  plus.id = 'rs-plus';
  plus.title = 'Aufnahme liegt zu spät: mehr Ausgleich (Umschalt: 10 ms)';
  const out = el('output', 'rs-out', '– ms');
  out.id = 'rs-lat';
  const mark = el('span', 'rs-mark', 'geschätzt');
  mark.id = 'rs-mark';
  lat.append(minus, out, plus, mark);
  latRow.append(el('span', 'rs-label', 'Latenz'), lat);

  const cal = btn('rs-cal', 'Einmessen', 'Latenz einmessen: 6 Klicks aus dem Lautsprecher');
  cal.id = 'rs-cal';
  cal.title = 'Spielt 6 Klicks aus dem Lautsprecher und misst, wann das Mikrofon sie hört';
  box.append(inRow, latRow, cal);
  pop.append(box);

  // Handy: Fach „Song“; Krachwerk am Desktop in der Song-Werkbank
  const songRec = $('song-rec');
  // Mit Song-Werkbank (Krachwerk): Reiter „Aufnahme" neben „Stopp nach Stille“
  const at = slot('rec');
  place(box, { narrow: songRec, calm: { narrow: at ?? songRec, wide: at ?? $('insp-song-tools') } });

  let key = null;
  const keyNow = async () => (key = await deviceKey(null, engine.ctx));

  async function render() {
    const k = await keyNow();
    const e = loadLatency(k);
    const measured = e?.ms != null;
    const base = measured ? e.ms : engine.ctx ? estimateLatency(engine.ctx) * 1000 : null;
    const nudge = e?.nudge || 0;
    out.textContent = base == null ? (nudge ? `${nudge > 0 ? '+' : ''}${nudge} ms` : '– ms') : `${Math.round(base + nudge)} ms`;
    mark.textContent = measured ? 'eingemessen' : 'geschätzt';
    mark.dataset.measured = String(measured);
    const input = k.slice(0, k.indexOf('|'));
    inVal.textContent = input && input !== DEFAULT_INPUT ? input : 'Standard-Mikrofon';
    inVal.title = inVal.textContent;
    box.dataset.key = k;
  }

  async function nudge(d) {
    const k = key ?? await keyNow();
    const e = loadLatency(k);
    const base = e?.ms ?? (engine.ctx ? estimateLatency(engine.ctx) * 1000 : 0);
    let n = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, (e?.nudge || 0) + d));
    if (base + n < 0) n = -Math.floor(base);
    saveLatency(k, { nudge: n });
    render();
  }

  // Klick: 1 ms (Umschalt: 10 ms); Halten wiederholt (Bedienung, kein Klangereignis)
  function stepper(b, dir) {
    let hold = 0, rep = 0, repeated = false;
    const stop = () => { clearTimeout(hold); clearInterval(rep); };
    b.addEventListener('pointerdown', (e) => {
      repeated = false;
      stop();
      const step = dir * (e.shiftKey ? 10 : 1);
      hold = setTimeout(() => { rep = setInterval(() => { repeated = true; nudge(step); }, 70); }, 420);
    });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, stop);
    b.addEventListener('click', (e) => {
      if (repeated) { repeated = false; return; }
      nudge(dir * (e.shiftKey ? 10 : 1));
    });
  }
  stepper(minus, -1);
  stepper(plus, 1);

  let mine = false; // diese Messung kam aus dem Feld: schließt es, wird abgebrochen
  cal.addEventListener('click', async () => {
    if (recorder.calibrating) return;
    mine = true;
    cal.textContent = 'Misst …';
    cal.setAttribute('aria-busy', 'true');
    try {
      const res = await recorder.calibrate();
      if (res) ui.flash(`Latenz ${Math.round(res.ms)} ms eingemessen.`);
    } catch (err) {
      if (err?.code !== 'cancelled') ui.flash(err?.message || 'Einmessen ging nicht.');
    } finally {
      mine = false;
      cal.textContent = 'Einmessen';
      cal.removeAttribute('aria-busy');
      render();
    }
  });

  // Feld zu (Klappfeld, Fach) während der Messung: abbrechen, das Mikrofon geht sofort zu
  const shown = () => box.getClientRects().length > 0 && !box.closest('[hidden]');
  const watch = () => {
    if (mine && recorder.calibrating && !shown()) recorder.cancelCalibrate();
  };
  new MutationObserver(watch).observe(document.getElementById('app'), { attributes: true, subtree: true, attributeFilter: ['hidden'] });
  ui.on(() => { if (narrow.matches || box.closest('#song')) requestAnimationFrame(watch); });
  // Beim Öffnen frische Werte (Ausgang kann gewechselt haben); Klick auf ▾ ist eine Geste: Ton-Kontext darf starten
  more?.addEventListener('click', () => { if (!pop.hidden) engine._ensure().then(render).catch(render); });
  ui.on(() => { if (ui.dock === 'song') render(); });
  // Song-Werkbank: beim Öffnen des Reiters „Aufnahme“ frische Werte (der Ton-Kontext darf dann starten)
  let wasShown = false;
  ui.on(() => {
    const now = shown();
    if (now && !wasShown && box.closest('.sb')) engine._ensure().then(render).catch(render);
    wasShown = now;
  });
  recorder.on((what) => { if (what === 'latency') render(); if (what === 'state') { cal.disabled = recorder.state !== 'idle' && !recorder.calibrating; } });
  narrow.addEventListener('change', render);
  render();
  return { render, el: box };
}
