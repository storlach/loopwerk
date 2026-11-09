// Hörprobe: rendert einen Song-Starter, das Beispiel-Arrangement oder eine Projektdatei offline als WAV (dieselbe Kette wie der Export).
// Aufruf:  node tools/hoerprobe.cjs (--starter <id|alle> | --beispiel | --projekt <datei>) [--takte 1-16] [--stil <id|aus|wie-gesetzt|alle>] [--out <ordner>] [--bits 16|24]
// Beispiel: node tools/hoerprobe.cjs --starter melodic --takte 1-16 --stil alle --out /tmp/proben
// Danach je Datei eine Zeile mit den Messwerten aus tools/messen.cjs.
const fs = require('fs');
const path = require('path');
const { openApp } = require('../tests/harness.cjs');
const { messeDatei, zeile } = require('./messen.cjs');

const HILFE = `Rendert offline (schneller als Echtzeit) eine WAV-Datei zum Anhören und misst sie.

Aufruf: node tools/hoerprobe.cjs <Quelle> [Optionen]
Quelle (genau eine, --starter und --projekt dürfen wiederholt werden):
  --starter <id>       Song-Starter aus src/starter.js (house, techno, hiphop, lofi, pop, trap, ambient, rock, breaks, melodic); "alle" = jeder
  --beispiel           das Beispiel-Arrangement
  --projekt <datei>    gespeicherte Projektdatei (.json; .zip = Sicherung/Song-ZIP, wird wie "Öffnen" in der App gelesen)
Optionen:
  --takte 1-16         Takt-Bereich (Voreinstellung 1-16; endet der Song früher, wird gekürzt und das gemeldet)
  --stil <id>          Mastering-Stil überschreiben: balanced, warm, bright, loud, club | aus | wie-gesetzt (Voreinstellung) | alle (je Stil eine Datei)
  --out <ordner>       Zielordner (Voreinstellung ./hoerproben)
  --bits 16|24         Wortbreite der WAV (Voreinstellung 16)
  --help               diese Hilfe
Dateiname: <quelle>-takte-<von>-<bis>-<stil>.wav (stil "ohne" = Mastering aus). Kein Ausklang (Hall/Echo am Ende werden abgeschnitten).
Exit-Code: 0 = alle Dateien gerendert, 1 = Fehler in den Optionen oder beim Rendern.`;

function fail(m) { console.error('Fehler: ' + m); process.exit(1); }

function args() {
  const a = process.argv.slice(2);
  if (a.includes('--help') || a.includes('-h')) { console.log(HILFE); process.exit(0); }
  const o = { quellen: [], takte: '1-16', stil: 'wie-gesetzt', out: 'hoerproben', bits: 16 };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    const wert = () => { const v = a[++i]; if (v == null || v.startsWith('--')) fail(`${k} braucht einen Wert`); return v; };
    if (k === '--starter') o.quellen.push({ art: 'starter', id: wert() });
    else if (k === '--beispiel') o.quellen.push({ art: 'beispiel' });
    else if (k === '--projekt') o.quellen.push({ art: 'projekt', datei: wert() });
    else if (k === '--takte') o.takte = wert();
    else if (k === '--stil') o.stil = wert();
    else if (k === '--out') o.out = wert();
    else if (k === '--bits') o.bits = Number(wert());
    else fail(`unbekanntes Argument ${k} (siehe --help)`);
  }
  if (!o.quellen.length) fail('keine Quelle: --starter, --beispiel oder --projekt (siehe --help)');
  const m = /^(\d+)(?:-(\d+))?$/.exec(o.takte);
  if (!m || Number(m[1]) < 1 || (m[2] && Number(m[2]) < Number(m[1]))) fail('--takte: Form "von-bis" mit 1 <= von <= bis erwartet, z. B. 1-16');
  o.von = Number(m[1]);
  o.bis = Number(m[2] ?? m[1]);
  if (![16, 24].includes(o.bits)) fail('--bits: 16 oder 24');
  o.out = path.resolve(o.out);
  for (const q of o.quellen) if (q.art === 'projekt' && !fs.existsSync(q.datei)) fail(`Projektdatei nicht gefunden: ${q.datei}`);
  return o;
}

const slug = (s) => String(s).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-+|-+$/g, '') || 'projekt';

async function main() {
  const o = args();
  const app = await openApp({ viewport: { width: 1200, height: 800 } });
  const { page } = app;
  page.setDefaultTimeout(0);
  let bad = 0;
  const dateien = [];
  try {
    const info = await page.evaluate(async () => {
      const S = await import('./src/starter.js');
      const MC = await import('./src/dsp/master-core.js');
      return { starter: S.STARTER_GENRES.map((g) => g.id), stile: MC.MASTER_STYLES.map((s) => s.id) };
    });
    const stilArt = o.stil;
    if (!['aus', 'wie-gesetzt', 'alle', ...info.stile].includes(stilArt)) fail(`--stil: unbekannt "${stilArt}" (erlaubt: ${[...info.stile, 'aus', 'wie-gesetzt', 'alle'].join(', ')})`);
    // Quellenliste ausbreiten
    const jobs = [];
    for (const q of o.quellen) {
      if (q.art === 'starter') {
        const ids = q.id === 'alle' ? info.starter : [q.id];
        for (const id of ids) {
          if (!info.starter.includes(id)) fail(`unbekannter Starter "${id}" (erlaubt: ${info.starter.join(', ')}, alle)`);
          jobs.push({ ...q, id, name: `starter-${id}` });
        }
      } else jobs.push({ ...q, name: q.art === 'beispiel' ? 'beispiel' : `projekt-${slug(path.basename(q.datei))}` });
    }
    fs.mkdirSync(o.out, { recursive: true });
    for (const job of jobs) {
      // Quelle aufbauen
      let prep;
      try {
        const b64 = job.art === 'projekt' ? fs.readFileSync(job.datei).toString('base64') : null;
        prep = await page.evaluate(async ({ job, b64 }) => {
          const M = await import('./src/model.js');
          const { store, library, tempo, patterns, io } = window.loopwerk;
          if (job.art === 'beispiel') store.replace(M.createDemoProject());
          else if (job.art === 'starter') {
            const S = await import('./src/starter.js');
            store.replace(M.createEmptyProject());
            const r = await S.runStarter(job.id, { store, library });
            if (r.skipped?.length) console.warn('Starter: übersprungen ' + r.skipped.length);
          } else {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const before = store.project;
            await io.openFile(new File([bytes], job.datei.split('/').pop()));
            if (store.project === before) throw new Error('Datei ließ sich nicht öffnen (kein gültiges Loopwerk-Projekt?)');
          }
          await tempo.apply();
          await patterns.sync(store.project);
          await library.ensureProject(store.project);
          const p = store.project;
          const E = await import('./src/export.js');
          return { bpm: p.bpm, bpb: p.beatsPerBar, endBar: E.songEndBeat(p) / p.beatsPerBar, mastering: p.master?.mastering ?? { on: false } };
        }, { job, b64 });
      } catch (e) {
        bad++;
        console.error(`Fehler bei ${job.name}: ${e.message.split('\n')[0]}`);
        continue;
      }
      if (prep.endBar <= 0) { bad++; console.error(`Fehler bei ${job.name}: Song ist leer`); continue; }
      const von = o.von;
      const bis = Math.min(o.bis, prep.endBar);
      if (von > prep.endBar) { bad++; console.error(`Fehler bei ${job.name}: Song hat nur ${prep.endBar} Takte, --takte beginnt bei ${von}`); continue; }
      if (bis < o.bis) console.log(`Hinweis ${job.name}: Song endet nach Takt ${prep.endBar}, Bereich gekürzt auf ${von}-${bis}`);
      const stile = stilArt === 'alle' ? info.stile : [stilArt];
      for (const stil of stile) {
        const eff = stil === 'wie-gesetzt' ? (prep.mastering.on ? prep.mastering.style : 'aus') : stil;
        const dname = `${job.name}-takte-${von}-${bis}-${eff === 'aus' ? 'ohne' : eff}.wav`;
        const t0 = Date.now();
        try {
          const b64 = await page.evaluate(async ({ von, bis, eff, bits }) => {
            const { store, library } = window.loopwerk;
            const E = await import('./src/export.js');
            const p = structuredClone(store.project);
            const bpb = p.beatsPerBar;
            p.loop = { ...(p.loop || {}), startBeat: (von - 1) * bpb, endBeat: bis * bpb };
            const cur = p.master?.mastering ?? { on: false, style: 'balanced' };
            p.master = { ...(p.master || {}), mastering: eff === 'aus' ? { ...cur, on: false } : { ...cur, on: true, style: eff === 'wie-gesetzt' ? cur.style : eff } };
            const r = await E.exportSong(p, library, { format: bits === 24 ? 'wav24' : 'wav', range: 'loop', tail: false });
            const bytes = new Uint8Array(await r.blob.arrayBuffer());
            let s = '';
            for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            return btoa(s);
          }, { von, bis, eff, bits: o.bits });
          const file = path.join(o.out, dname);
          fs.writeFileSync(file, Buffer.from(b64, 'base64'));
          const sek = ((Date.now() - t0) / 1000).toFixed(1);
          dateien.push(file);
          console.log(`gerendert in ${sek} s: ${file}`);
          console.log('  ' + zeile(await messeDatei(file)));
        } catch (e) {
          bad++;
          console.error(`Fehler beim Rendern ${dname}: ${e.message.split('\n')[0]}`);
        }
      }
    }
    if (app.errors.length) console.error(`Hinweis: ${app.errors.length} Konsolenfehler der Seite, erster: ${app.errors[0].slice(0, 200)}`);
  } finally {
    await app.close();
  }
  console.log(`\n${dateien.length} Datei(en) in ${o.out}${bad ? `, ${bad} Fehler` : ''}`);
  return bad ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error('Fehler: ' + e.message); process.exit(1); });
