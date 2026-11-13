// Erzeugt docs/umbau/woerter.md aus der Wort-Tabelle (src/ui/words-table.js) und den festen Abschnitten unten.
// Aufruf: node tools/woerter.cjs [--out docs/umbau/woerter.md]
// Exit-Code: 0 = geschrieben, 1 = Fehler.
const fs = require('fs');
const path = require('path');

const NEU_GESETZT = [
  ['(Zeile in Datei) „Neuer Song“', 'Reiter Datei, Befehlsliste', 'Ersetzt den Abschnitt mit zehn Genre-Knöpfen; öffnet den Ablauf'],
  ['Ablauf „Neuer Song“: „Welcher Stil?“ · „Anhören und entscheiden“ · „Song bauen“ / „Jetzigen Song ersetzen“ / „Sicher? Ersetzt den jetzigen Song“ · „Fertig“', 'Karte in der Mitte', 'Hauptknopf sagt, was passiert; die Rückfrage steht im Knopf'],
  ['Ablauf „Neuer Sound“: „Was möchtest du machen?“', 'Karte in der Mitte', 'Einstieg wie bisher „Erstellen“, jetzt über „+ Neu“ neben der Suche'],
  ['Ablauf „Exportieren“: „Was soll exportiert werden?“ · „Format und Klang“ · „Bereit zum Speichern“ · „Weiter“ · „Zurück“', 'Karte in der Mitte', 'Schritte statt Klappfeld'],
  ['Tipp „+ Neu“ (create-neu)', 'Tipps', 'Der Tipp „Unter Erstellen …“ zeigt auf den verschwundenen Unterreiter'],
];
const BLEIBT = [
  ['Tempo, Takt, Schlag, Loop, Klick, Mixer, Hall, Echo, EQ, FX-Pad', 'Etablierte Musikwörter, die Einsteiger überall wiedersehen'],
  ['Kompressor, Verzerrer, Filter, Pumpen, Resonanz', 'Effektnamen, die man auch in anderen Programmen findet; die Regler dazu sind mit Alltagswörtern beschriftet (Stärke, Tiefe)'],
  ['Ansprache / Ausklang', 'Deutsche Fachwörter für Attack/Release, ohne bessere Alltagsentsprechung gefunden'],
  ['LUFS, dBTP, dB, BPM', 'Bleiben als Zahl mit Einheit; die Etiketten „Lautheit“ und „Spitze“ stehen davor (Tabelle)'],
  ['Normalisieren (Sample bearbeiten)', 'Unsicher: „Auf Höchstpegel“ wäre klarer, trifft aber nicht genau; der Hinweistext „Auf −1 dB anheben“ erklärt es. Zur Abnahme.'],
  ['Latenz einmessen (Aufnahme-Feld)', 'Unsicher: „Verzögerung“ könnte mit Echo verwechselt werden; Martin entscheiden lassen'],
  ['Pattern (Marke am Clip, Liste der Sounds)', 'Unsicher: ein besseres Wort („Beat/Melodie“) hängt vom Typ ab; Marke wird dynamisch erzeugt, nicht in der Tabelle'],
  ['Einrasten, Swing, Gleiten, Anschlag, Quantisieren-Hinweis', 'Musikalisch gebräuchlich, im Editor selbst mit Hinweistext'],
  ['Stimme entfernen, Stille, Zuschneiden, Rückwärts, Einblenden, Ausblenden', 'Schon Alltagswörter'],
  ['Öffnen, Speichern, Leeren, Tipps wieder zeigen, Tastenkürzel, Gesten', 'Schon Alltagswörter'],
  ['Beschriftungen von Sound-Namen, Spurnamen, Projektname', 'Inhalt der Person bzw. der Bibliothek, wird nie umgeschrieben (Regal, Clips, Spurköpfe sind ausgenommen)'],
  ['Mixer-Zeile „Keine Effekte“, „2 Effekte“', 'Schon Alltagswörter'],
  ['Texte am Handy und in Krachwerk', 'Bleiben bewusst alt: die Wörter gelten nur im Layout „reiter“ am Desktop'],
];

(async () => {
  const { ENTRIES } = await import(path.resolve(__dirname, '../src/ui/words-table.js'));
  const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'docs/umbau/woerter.md';
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const alt = (e) => (e.art === 'regex' ? `Muster ${e.alt.replace(/\\\\/g, '\\')}` : e.alt);
  const L = [];
  L.push('# Wörter: alt → neu (Scheibe 7)', '');
  L.push('Gilt nur im Layout „reiter“ am Desktop (Loopwerk, ab 761 px Breite). Krachwerk und Handy behalten ihre Wörter.');
  L.push('Quelle der Tabelle: `src/ui/words-table.js`; diese Datei erzeugt `node tools/woerter.cjs`. Gesetzt werden die Wörter von `src/ui/words.js`:');
  L.push('beim Start und beim Wechsel der Breite werden Texte, `title`, `aria-label` und `placeholder` der Seite umgeschrieben (Originale werden gemerkt und am Handy zurückgesetzt); dynamisch erzeugte Texte (Mixer, Inspektor, Einblender, Tipps, Export-Ergebnis) laufen über `W()`.', '');
  L.push('Regeln: Deutsch, aus Sicht der Person, ein Wort je Sache, kein Fachwort, wo ein Alltagswort trägt; etablierte Musikwörter bleiben.', '');
  L.push('Art: „ganz“ = der ganze Text, „teil“ = Textstück, „Muster“ = regulärer Ausdruck (`$1` = Treffer).', '');
  L.push(`## Geändert (${ENTRIES.length} Einträge)`, '', '| alt | neu | wo | warum |', '|---|---|---|---|');
  for (const e of ENTRIES) L.push(`| ${esc(alt(e))} | ${esc(e.neu || '(entfällt)')} | ${esc(e.wo)} | ${esc(e.warum)} |`);
  L.push('', `## Neu gesetzte Texte (${NEU_GESETZT.length})`, '', '| Text | wo | warum |', '|---|---|---|');
  for (const r of NEU_GESETZT) L.push(`| ${esc(r[0])} | ${esc(r[1])} | ${esc(r[2])} |`);
  L.push('', `## Geprüft, bleibt (${BLEIBT.length})`, '', '| Wort | warum |', '|---|---|');
  for (const r of BLEIBT) L.push(`| ${esc(r[0])} | ${esc(r[1])} |`);
  L.push('', '## Hinweise', '',
    '- Überschrift „Assets“ im Reiter Sounds: entfällt ganz (die Unterreiter samt Überschrift sind am Desktop durch „+ Neu“ ersetzt).',
    '- Die Regel „ein Wort“ schreibt auch Sound- und Spurnamen nicht um (`#library`, `.clip`, `.track-head` sind ausgenommen). Heißt eine Spur „Master“ oder „Summe“, zeigen nur aria-label und Mixer-Zeile „Gesamt“.',
    '- Texte, die nur beim Breitenwechsel zur Laufzeit neu entstehen, zeigen die alten Wörter bis zur nächsten Aktualisierung der Fläche.', '');
  fs.writeFileSync(path.resolve(out), L.join('\n'));
  console.log(`geschrieben: ${out} (${ENTRIES.length} geändert, ${BLEIBT.length} bleibt)`);
})().catch((e) => { console.error(e); process.exit(1); });
