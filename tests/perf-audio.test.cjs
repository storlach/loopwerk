// Performance Teil 2 (docs/analyse/2026-11-performance.md): Scheduler mit Vorlauf und Einstieg mit Versatz,
// Krachwerk ohne Netz, MP3 ohne Blockade, Mastering-Messung, Freigeben von Klängen. Grenzen prüfen Verhalten, nicht die Uhr.
const { openApp, createChecker } = require('./harness.cjs');
const { schedProbe } = require('../tools/perf/sched-probe.cjs');

const { check, finish } = createChecker();
const ms = (s) => `${Math.round(s * 1000)} ms`;

async function scheduler() {
  const app = await openApp();
  const { page } = app;
  try {
    // Blockade 0,3 s: der Einsatz kurz vor ihrem Ende ist schon geplant – nichts weicht ab
    const b = await page.evaluate(schedProbe, { kind: 'block', block: 0.3 });
    check('Hauptthread 0,3 s blockiert: Wiedergabe unverändert (Vorlauf)', b.bad < 0.005, `abweichend ${ms(b.bad)} (Stille ${ms(b.silent)}, falsche Stelle ${ms(b.misplaced)})`);
    // Blockade 0,8 s: der Einsatz kommt zu spät dran und steigt an der richtigen Stelle ein (nur kurze Stille, keine Verschiebung)
    const l = await page.evaluate(schedProbe, { kind: 'block', block: 0.8 });
    check('Zu spät geplanter Einsatz startet mit Versatz an der richtigen Stelle', l.misplaced < 0.02 && l.silent < 0.2, `falsche Stelle ${ms(l.misplaced)}, Stille ${ms(l.silent)}`);
    for (const kind of ['mute', 'fader', 'move', 'stop']) {
      const r = await page.evaluate(schedProbe, { kind });
      check(`Live-Änderung „${kind}“ hörbar nach höchstens 0,1 s`, r.react < 0.1, `Reaktion ${ms(r.react)}`);
    }
    const lp = await page.evaluate(schedProbe, { kind: 'loop', d: 0.1 });
    check('Loop-Ende 0,1 s vor der Marke gesetzt: der Sprung kommt an der richtigen Stelle', lp.bad < 0.01, `abweichend ${ms(lp.bad)}`);
    check('Scheduler: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Scheduler: Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
}

(async () => {
  const only = process.env.PERF_AUDIO_ONLY ? process.env.PERF_AUDIO_ONLY.split(',') : null;
  const parts = { scheduler };
  for (const [name, fn] of Object.entries(parts)) if (!only || only.includes(name)) await fn();
  finish();
})();
