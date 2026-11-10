#!/usr/bin/env node
// Mischung der Song-Starter und des Beispiels messen (ADR 013, Klanganalyse K1/K2/K3/W1): Lautheit je Spur im Refrain,
// Drums minus Bass, Anteil unter 250 Hz / über 2 kHz / über 4 kHz und Breite (Mastering wie gesetzt), Song ohne Mastering
// und mit jedem Stil, Sends und Effekte je Spur.
// Aufruf:  node tools/klang/mix.cjs [--starter a,b|alle] [--beispiel] [--stile balanced,loud|keine] [--song VC] [--json f]
// Beispiel: node tools/klang/mix.cjs --starter pop,hiphop --stile keine
const fs = require('fs');
const path = require('path');

const HILFE = `Mischung der Starter messen (Offline-Rendering wie der Export).

  node tools/klang/mix.cjs [Optionen]
  --starter <liste>  Starter-IDs (Komma) oder "alle" (Voreinstellung alle, dazu das Beispiel)
  --beispiel         nur das Beispiel-Arrangement (mit --starter: zusätzlich)
  --variante <n>     Starter-Variante (Voreinstellung 0)
  --stile <liste>    Mastering-Stile für den Song-Abschnitt (Voreinstellung alle; "keine" = nur ohne Mastering)
  --song <teile>     Abschnitt für "ohne/mit Stil": Buchstaben der Teile (I V C B D O), Voreinstellung VC
  --json <datei>     Ergebnis als JSON speichern
  --help             diese Hilfe

Spalten: Spuren im Refrain (LUFS, ohne Limiter), D−B = Drums (bzw. Kick) minus Bass, Refrain wie gesetzt: LUFS,
<250 Hz %, >2 kHz %, >4 kHz %, Breite (Seite/(Mitte+Seite), 0 = mono), Song: ohne Mastering → je Stil.
Exit-Code: 0 = gemessen (das Skript urteilt nicht), 1 = Bedien- oder Messfehler.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(HILFE); process.exit(0); }
const opt = (name, def = null) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; if (!v || v.startsWith('--')) { console.error(`Fehler: ${name} braucht einen Wert.\n\n${HILFE}`); process.exit(1); } return v; };
const known = ['--starter', '--variante', '--stile', '--song', '--json'];
for (let i = 0; i < args.length; i++) { if (known.includes(args[i])) { i++; continue; } if (args[i] === '--beispiel') continue; console.error(`Fehler: unbekannte Option ${args[i]}\n\n${HILFE}`); process.exit(1); }
const ROOT = path.join(__dirname, '..', '..');
const ALL = ['house', 'techno', 'hiphop', 'lofi', 'pop', 'trap', 'ambient', 'rock', 'breaks', 'melodic'];
const st = opt('--starter');
let ids = st == null ? (args.includes('--beispiel') ? [] : ALL) : st === 'alle' ? ALL : st.split(',');
for (const id of ids) if (!ALL.includes(id)) { console.error(`Fehler: unbekannter Starter "${id}" (${ALL.join(', ')})`); process.exit(1); }
if (args.includes('--beispiel') || st == null) ids = [...ids, 'demo'];
const stOpt = opt('--stile');
const styles = stOpt === 'keine' ? [] : stOpt ? stOpt.split(',') : null;
const variant = Number(opt('--variante', 0));

(async () => {
  const { openApp } = require(path.join(ROOT, 'tests', 'harness.cjs'));
  const { measureMix } = require(path.join(ROOT, 'tests', 'pegel-mess.cjs'));
  const app = await openApp({ fresh: true });
  app.page.setDefaultTimeout(3600000);
  const res = {};
  try {
    for (const id of ids) {
      const m = await measureMix(app.page, { id, variant, styles, song: opt('--song', 'VC') });
      res[id] = m;
      const t = m.tracks;
      const drums = t.Kick ?? t.Drums;
      const db = drums != null && t.Bass != null ? (drums - t.Bass).toFixed(1) : '–';
      const sends = m.strips.filter((s) => Object.values(s.sends).some((v) => v > 0)).map((s) => `${s.name}:${Object.entries(s.sends).map(([k, v]) => `${k} ${v}`).join('/')}`).join(' ');
      console.log(`\n${id}  (Mastering ${m.mastering.on ? m.mastering.style : 'aus'})`);
      console.log(`  Spuren: ${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(' · ')}   D−B ${db}`);
      console.log(`  Fader: ${m.strips.map((s) => `${s.name} ${s.volume}`).join(' · ')}`);
      console.log(`  Refrain: ${m.refrain.lufs} LUFS · <250 ${m.refrain.low} % · >2k ${m.refrain.hi2k} % · >4k ${m.refrain.hi4k} % · Breite ${m.refrain.width} (über 250 Hz ${m.refrain.widthUp})`);
      console.log(`  Song ${m.range.song.map((b) => b / 4 + 1).join('–')}: ${Object.entries(m.song).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
      if (sends) console.log(`  Sends: ${sends}`);
    }
  } catch (err) {
    console.error('Messfehler:', err.message);
    await app.close();
    process.exit(1);
  }
  if (app.errors.length) console.error('Konsolenfehler:', app.errors.slice(0, 5).join(' | '));
  await app.close();
  const out = opt('--json');
  if (out) { fs.writeFileSync(out, JSON.stringify(res, null, 1)); console.log(`\ngespeichert: ${out}`); }
})().catch((err) => { console.error('Fehler:', err.message); process.exit(1); });
