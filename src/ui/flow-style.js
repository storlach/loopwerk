// CSS der Schritt-Abläufe (flow.js), nur Layout „reiter“ am Desktop. Als Modul statt in index.html, damit die erzeugte Krachwerk-Seite
// (tools/werkstatt-page.cjs) bytegleich bleibt. Nur Tokens aus :root.

const CSS = `
@media (min-width: 761px) {
  #app[data-layout="reiter"] .ov-card.flow-card {
    width: min(640px, 100%); height: auto; max-height: 100%; grid-template-rows: auto minmax(0, 1fr) auto;
  }
  #app[data-layout="reiter"] .flow-card[data-flow="export"] { width: min(600px, 100%); }
  #app[data-layout="reiter"] .flow-park { display: none; }
  #app[data-layout="reiter"] .flow-head { padding: 26px 72px 8px 32px; display: grid; gap: 4px; }
  #app[data-layout="reiter"] .flow-step { font: 500 10px/1.4 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  #app[data-layout="reiter"] .flow-title { margin: 0; font: 300 28px/1.15 var(--font-display); color: var(--ink); }
  #app[data-layout="reiter"] .flow-heading { margin: 2px 0 0; font: 600 10px/1.4 var(--font-display); letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  #app[data-layout="reiter"] .flow-body { min-height: 0; overflow-y: auto; padding: 10px 32px 18px; display: grid; align-content: start; }
  #app[data-layout="reiter"] .flow-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 32px 22px; border-top: 1px solid var(--line);
  }
  #app[data-layout="reiter"] .flow-foot[hidden] { display: none; }
  #app[data-layout="reiter"] .flow-foot .dbtn { height: 44px; padding: 0 22px; font-size: 13px; }
  #app[data-layout="reiter"] .flow-back { background: transparent; }
  #app[data-layout="reiter"] .flow-main-slot { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  #app[data-layout="reiter"] .flow-foot .dbtn[hidden] { display: none; }
  #app[data-layout="reiter"] .flow-card[data-step="1"] [data-flow-step]:not([data-flow-step~="1"]),
  #app[data-layout="reiter"] .flow-card[data-step="2"] [data-flow-step]:not([data-flow-step~="2"]),
  #app[data-layout="reiter"] .flow-card[data-step="3"] [data-flow-step]:not([data-flow-step~="3"]) { display: none; }

  /* Neuer Song */
  #app[data-layout="reiter"] .flow-card #starter { gap: 12px; }
  #app[data-layout="reiter"] .flow-card #starter-genres { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  #app[data-layout="reiter"] .flow-card .starter-genre { height: 56px; font-size: 12px; }
  #app[data-layout="reiter"] .flow-card .starter-again,
  #app[data-layout="reiter"] .flow-card .starter-accomp { display: block; height: 44px; }
  #app[data-layout="reiter"] .flow-card[data-step="2"] #starter { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  #app[data-layout="reiter"] .flow-card[data-step="1"] #starter-genres { display: grid; }
  #app[data-layout="reiter"] .flow-card[data-step="2"] #starter-genres { display: none; }
  #app[data-layout="reiter"] .flow-card[data-step="1"] :is(#starter-again, #starter-accomp) { display: none; }
  #app[data-layout="reiter"] .flow-card .flow-status { margin: 0 0 12px; font-size: 13px; color: var(--ink); min-height: 1.4em; }
  #app[data-layout="reiter"] .flow-card .flow-play { height: 44px; margin-top: 8px; }
  #app[data-layout="reiter"] .flow-card[data-flow="song"] .flow-play[hidden] { display: none; }
  #app[data-layout="reiter"] .flow-card[data-flow="song"][data-step="1"] .flow-status,
  #app[data-layout="reiter"] .flow-card[data-flow="song"][data-step="1"] .flow-play { display: none; }
  #app[data-layout="reiter"] .flow-card .busy .starter, #app[data-layout="reiter"] .flow-card .create-panel.busy .starter { opacity: 0.6; pointer-events: none; }

  /* Neuer Sound: die Karten des Erstellen-Panels, zweispaltig */
  #app[data-layout="reiter"] .flow-card #create-panel { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0; overflow: visible; }
  #app[data-layout="reiter"] .flow-card #create-panel .create-sec { grid-column: 1 / -1; margin: 10px 0 0; }
  #app[data-layout="reiter"] .flow-card #create-panel .create-sec:first-child { margin-top: 0; }
  #app[data-layout="reiter"] .flow-card #create-panel > .create-sec[data-surface="starter"],
  #app[data-layout="reiter"] .flow-card #create-panel > #starter { display: none; }
  #app[data-layout="reiter"] .flow-card #create-panel .ccard { padding: 14px 16px; cursor: pointer; }
  #app[data-layout="reiter"] .flow-card #create-panel .ccard:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

  /* Exportieren: das Fach #export wird zum Inhalt der Karte */
  #app[data-layout="reiter"] .flow-body #export.dock {
    position: static; width: auto; height: auto; max-height: none; overflow: visible; box-shadow: none; background: transparent; border: 0; border-radius: 0;
    margin: 0; padding: 0; transform: none; clip-path: none; display: block; z-index: auto;
  }
  #app[data-layout="reiter"] .flow-body #export .dock-head { display: none; }
  #app[data-layout="reiter"] .flow-body #export .export-body { padding: 0; display: grid; gap: 14px; overflow: visible; }
  #app[data-layout="reiter"] .flow-body #export .ex-set { width: auto; padding: 12px 16px 14px; gap: 8px; }
  #app[data-layout="reiter"] .flow-body #export .ex-set label { min-height: 36px; }
  #app[data-layout="reiter"] .flow-body #export .ex-go { min-width: 0; }
  #app[data-layout="reiter"] .flow-foot #ex-go { height: 44px; padding: 0 22px; justify-self: auto; }
  #app[data-layout="reiter"] .flow-card[data-flow="export"] .flow-foot { gap: 12px; }

  /* Eine Karte wird auf eine Spur gezogen: die Fläche wird durchsichtig und lässt die Zeiger durch (der Arranger sucht die Spur unter dem Zeiger) */
  body.is-dragging #flow-overlay { opacity: 0.25; transition: opacity var(--move-swap, 160ms) ease; }
  body.is-dragging #flow-overlay, body.is-dragging #flow-overlay * { pointer-events: none !important; }

  /* Zeile „Neuer Song“ im Reiter Datei */
  #app[data-layout="reiter"] .side-datei-liste .side-datei-new { display: grid; }

  /* Sounds: „+ Neu“ neben der Suche, die Unterreiter entfallen */
  #app[data-layout="reiter"] .side .left-tabs { display: none; }
  #app[data-layout="reiter"] .side .shelf-find #shelf-new {
    display: inline-flex; align-items: center; justify-content: center; flex: none; height: 32px; padding: 0 14px; margin-left: 4px;
    border: 0; border-radius: var(--radius); background: transparent; box-shadow: var(--key-shadow); color: var(--ink); cursor: pointer;
    font: 600 11px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap;
  }
  #app[data-layout="reiter"] .side .shelf-find #shelf-new:hover { background: var(--lane-alt); }
  #app[data-layout="reiter"] .side .shelf-find #shelf-new:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
}
`;

export function installFlowStyle() {
  if (document.getElementById('flow-style')) return;
  const s = document.createElement('style');
  s.id = 'flow-style';
  s.textContent = CSS;
  document.head.append(s);
}
