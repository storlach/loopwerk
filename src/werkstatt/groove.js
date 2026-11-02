// Groove aus den eigenen Pads: Rollen (Kick/Snare/Hi-Hat/Extra) aus den Klassen wählen und ein Taktmuster
// in einer Schleife spielen. Geplant wird über ctx.currentTime mit Vorlauf; der Intervall-Takt weckt nur.

const STEPS = 16;
const LOOKAHEAD = 0.15;
const TICK_MS = 25;

// Muster je Rolle: Schritt → Stärke (16tel, ein Takt)
export const GROOVES = [
  { name: 'Kopfnicker', swing: 0.56, kick: { 0: 1, 10: 0.9 }, snare: { 4: 1, 12: 1 }, hat: { 0: 0.8, 2: 0.5, 4: 0.8, 6: 0.5, 8: 0.8, 10: 0.5, 12: 0.8, 14: 0.5 }, extra: { 7: 0.6, 15: 0.5 } },
  { name: 'Gerade', swing: 0.5, kick: { 0: 1, 4: 1, 8: 1, 12: 1 }, snare: { 4: 0.9, 12: 0.9 }, hat: { 2: 0.9, 6: 0.9, 10: 0.9, 14: 0.9, 3: 0.35, 11: 0.35 }, extra: { 9: 0.5 } },
  { name: 'Halbes Tempo', swing: 0.54, kick: { 0: 1, 3: 0.7, 10: 0.85 }, snare: { 8: 1 }, hat: { 0: 0.7, 2: 0.4, 4: 0.7, 6: 0.4, 8: 0.7, 10: 0.4, 12: 0.7, 13: 0.35, 14: 0.5 }, extra: { 6: 0.5, 15: 0.6 } },
  { name: 'Bruch', swing: 0.53, kick: { 0: 1, 2: 0.7, 10: 0.9, 11: 0.6 }, snare: { 4: 1, 12: 1, 15: 0.35 }, hat: { 0: 0.7, 2: 0.6, 4: 0.7, 6: 0.6, 8: 0.7, 10: 0.6, 12: 0.7, 14: 0.6 }, extra: { 7: 0.45 } },
];

const ROLE_CLS = { kick: ['tief'], snare: ['mittel', 'lang'], hat: ['hell'] };

// pads: [{ index, cls, centroid }] (nur gefüllte). rng: () => 0…1. Rückgabe { kick, snare, hat, extra } als Pad-Indizes.
export function chooseRoles(pads, rng = Math.random) {
  if (!pads.length) return null;
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const byBright = [...pads].sort((a, b) => a.centroid - b.centroid);
  const used = new Set();
  const take = (role, fallback) => {
    const fit = pads.filter((p) => ROLE_CLS[role].includes(p.cls) && !used.has(p.index));
    const free = byBright.filter((p) => !used.has(p.index));
    const p = fit.length ? pick(fit) : fallback(free.length ? free : byBright);
    used.add(p.index);
    return p.index;
  };
  const kick = take('kick', (l) => l[0]);
  const hat = take('hat', (l) => l[l.length - 1]);
  const snare = take('snare', (l) => l[l.length >> 1]);
  const rest = pads.filter((p) => !used.has(p.index) && p.cls !== 'lang');
  const extra = rest.length ? pick(rest).index : null;
  return { kick, snare, hat, extra };
}

export class Groove {
  // trigger(padIndex, when, velocity) spielt ein Pad zur Kontextzeit when
  constructor(ctx, trigger) {
    this.ctx = ctx;
    this.trigger = trigger;
    this.playing = false;
    this.bpm = 90;
    this.variant = 0;
    this.roles = null;
    this.timer = null;
    this.listeners = new Set();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  get pattern() { return GROOVES[this.variant % GROOVES.length]; }

  start() {
    if (this.playing || !this.roles) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    this.emit();
  }

  stop() {
    if (!this.playing) return;
    clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    this.emit();
  }

  tick() {
    const spb = 60 / this.bpm;
    const step = spb / 4;
    const p = this.pattern;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.nextTime < horizon) {
      const s = this.step % STEPS;
      // Swing: jede zweite 16tel nach hinten
      const when = this.nextTime + (s % 2 ? (p.swing - 0.5) * 2 * step : 0);
      for (const role of ['kick', 'snare', 'hat', 'extra']) {
        const v = p[role][s];
        const pad = this.roles[role];
        if (v && pad != null) this.trigger(pad, when, v);
      }
      this.nextTime += step;
      this.step++;
    }
  }
}
