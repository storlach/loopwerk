// Die drei Schritt-für-Schritt-Abläufe (Layout „reiter“, Desktop) auf der Karte aus flow.js. Sie hängen die vorhandenen Bedienelemente
// um (gleiche Kennungen und Logik): „Neuer Song“ = der Song-Starter, „Neuer Sound“ = das Erstellen-Panel, „Exportieren“ = das Fach #export.
// Jeder Schritt hat eine Voreinstellung: mit dem Hauptknopf kommt man durch.

import { starterGenre } from '../starter.js';

const CONFIRM_MS = 4000;

export function mountFlows({ flow, ui, engine, starter, exportApi }) {
  if (!flow) return null;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
  const bodyOf = () => flow.card.querySelector('.flow-body');

  // ---------- Neuer Song: Stil wählen → anhören und entscheiden ----------
  const box = $('starter');
  let armed = false;
  let armTimer = null;
  let summary = '';
  const status = el('p', 'flow-status');
  status.setAttribute('role', 'status');
  const play = el('button', 'dbtn flow-play', '▶ Anhören');
  play.type = 'button';
  play.id = 'flow-play';
  const disarm = () => { clearTimeout(armTimer); armed = false; };
  const syncPlay = () => { play.textContent = engine.playing ? '■ Anhalten' : '▶ Anhören'; };
  play.addEventListener('click', () => { if (engine.playing) engine.pause(); else engine.play(); syncPlay(); });
  flow.define('song', {
    title: 'Neuer Song',
    node: box,
    onOpen: () => {
      const body = bodyOf();
      body.prepend(status);
      body.append(play);
      starter.setChoose((id) => { starter.pick(id); disarm(); flow.refresh(); });
      starter.pick(starter.last?.genre ?? 'pop');
      summary = '';
    },
    onClose: () => { disarm(); starter.setChoose(null); status.remove(); play.remove(); },
    steps: [
      {
        heading: 'Welcher Stil?',
        focus: '.starter-genre[aria-pressed="true"]',
        main: () => ({
          label: armed ? 'Sicher? Ersetzt den jetzigen Song' : starter.safe() ? 'Song bauen' : 'Jetzigen Song ersetzen',
          title: starter.safe() ? '' : 'Ersetzt das aktuelle Lied – Rückgängig holt es zurück',
          disabled: starter.busy,
        }),
        async run() {
          if (!starter.safe() && !armed) {
            armed = true;
            clearTimeout(armTimer);
            armTimer = setTimeout(() => { armed = false; flow.refresh(); }, CONFIRM_MS);
            return 'stay';
          }
          disarm();
          const res = await starter.run(starter.picked ?? 'pop');
          if (!res) return 'stay';
          summary = res.summary;
          return 'next';
        },
      },
      {
        heading: 'Anhören und entscheiden',
        focus: '#flow-play',
        enter: () => { status.textContent = summary ? `${summary}. Rückgängig holt den alten Song zurück.` : `${starterGenre(starter.last?.genre)?.label ?? ''}`; syncPlay(); },
        main: () => ({ label: 'Fertig' }),
        run: () => 'close',
      },
    ],
  });
  $('new-song-btn')?.addEventListener('click', () => flow.open('song'));

  // ---------- Neuer Sound: eine Wahl, dann geht es in den jeweiligen Weg ----------
  const panel = $('create-panel');
  flow.define('sound', {
    title: 'Neuer Sound',
    node: panel,
    steps: [{ heading: 'Was möchtest du machen?', focus: '.ccard', main: () => ({ hidden: true }) }],
  });
  // Ein Weg wurde gewählt (Klick, Enter oder Ablegen auf eine Spur): Karte zu, der Weg öffnet seine eigene Fläche
  const picked = () => { if (flow.isOpen && flow.id === 'sound') flow.close({ focus: false }); };
  panel.addEventListener('click', (e) => { if (e.target.closest('.ccard')) picked(); });
  panel.addEventListener('pointerdown', (e) => {
    if (e.button === 0 && e.target.closest('.ccard')) document.addEventListener('pointerup', () => setTimeout(picked, 0), { once: true, capture: true });
  });
  $('shelf-new')?.addEventListener('click', () => flow.open('sound'));

  // ---------- Exportieren: Was → Format und Klang → Exportieren ----------
  const exp = $('export');
  const go = $('ex-go');
  const goHome = go?.parentElement;
  if (exp && go) {
    const sets = exp.querySelectorAll('fieldset.ex-set');
    const mark = (n, v) => n?.setAttribute('data-flow-step', v);
    mark(sets[1], '1'); mark($('ex-stems-set'), '1'); // Bereich, Einzelspuren
    mark(sets[0], '2'); mark($('ex-master-set'), '2'); // Format, Mastering
    mark(goHome, '3'); // Knopf, Fortschritt, Ergebnis
    new MutationObserver(() => flow.refresh()).observe(go, { attributes: true, childList: true, characterData: true, subtree: true });
    const weiter = { label: 'Weiter' };
    flow.define('export', {
      title: 'Exportieren',
      node: exp,
      onOpen: () => exportApi?.open(),
      steps: [
        { heading: 'Was soll exportiert werden?', focus: 'input[name="ex-range"]:checked', main: () => weiter, run: () => 'next' },
        { heading: 'Format und Klang', focus: 'input[name="ex-format"]:checked', main: () => weiter, run: () => 'next' },
        {
          heading: 'Bereit zum Speichern', main: () => ({}), mainNode: () => go, lockBack: () => exportApi?.busy,
          leave: () => goHome.prepend(go),
        },
      ],
    });
  }
  return { open: (id) => flow.open(id) };
}
