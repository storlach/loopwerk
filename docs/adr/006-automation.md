# ADR 006 – Automation: Punktkurven in Schlägen, geplant im Vorlauf-Fenster

**Stand:** 02.11.2026 · **Status:** vorgeschlagen (wartet auf Martin) · Spec: `docs/specs/v2.12-automation.md`

## Kontext
Lautstärke, Panorama und einige Effektwerte sollen sich im Song über die Zeit ändern – realtime und im Export gleich, mit Loop-Sprüngen, Start mitten im Song, Live-Änderung ohne Knackser, Undo und Projektdatei. Heute setzt `syncMix` bei jeder Store-Änderung Pegel und Effektwerte per `setTargetAtTime` (`effects.js: ramp`). Eine zweite Quelle auf denselben AudioParams würde sich mit dem Regler gegenseitig überschreiben.

## Entscheidung
1. **Modell:** `track.automation[key]` bzw. `project.master.automation[key]` = Liste `{ beat, value, curve? }`, Positionen in Schlägen, Werte im Wertebereich des Reglers. Stücke zwischen Punkten sind linear, `'step'` hält und springt in 1/128 Schlag. Jede Kurve ist damit stückweise linear in Schlägen. Optionales Feld, `PROJECT_VERSION` bleibt 1.
2. **Lautstärke multipliziert, alles andere ersetzt.** Die Lautstärke-Kurve ist ein Anteil (0–100 %) vom Fader und läuft über einen eigenen GainNode (`strip.auto`) hinter den Effekten. Der Fader bleibt frei, Vorlagen kennen den Fader nicht, und der Song-Starter und das Mischen bleiben unberührt (wie Clip-Lautstärke × Fades; Magix-Kurven an Objekten wirken ebenfalls zusätzlich zum Mixer). Panorama und Effektwerte sind absolut, denn ein relatives Panorama oder eine relative Grenzfrequenz ergibt keinen Sinn. Dort folgt der Regler der Kurve und ist gesperrt, wie in GarageBand oder Logic.
3. **Ein Besitzer je AudioParam:** Hat ein Parameter eine Kurve, lässt `syncMix`/`updateFxParams` ihn aus (Skip-Liste). Ein Besitzwechsel läuft über `handover` (`cancelAndHoldAtTime`, für Firefox nachgebildet).
4. **Planung im Vorlauf-Fenster:** `planLane` setzt je `_tick`-Fenster an jeder Stützstelle (Punkte, Sprungenden, Fensterende) ein `linearRampToValueAtTime` mit dem exakt interpolierten Wert. Weil die Kurve stückweise linear ist, sind die geteilten Rampen mathematisch identisch mit einer einzigen Rampe. Offline ruft `renderProject` dieselbe Funktion einmal für den ganzen Bereich auf. Live-Änderungen brechen nichts ab: Das nächste Fenster rampt vom zuletzt geplanten Wert auf die neue Kurve, das ist stetig und kommt nach höchstens etwa 0,18 s.
5. **Filter-Frequenz über `detune`:** Ein linearer Verlauf in Cent ist linear auf der logarithmischen Regler-Skala. Der Filter nutzt das künftig immer, auch ohne Kurve.

## Alternativen
- **Ganze Kurve beim Start vorplanen:** Loop-Sprünge und Live-Änderungen verlangen dann Abbrechen mitten in Rampen. Das springt hörbar, und `cancelAndHoldAtTime` fehlt in Firefox.
- **`setValueCurveAtTime` mit Stützwerten (wie Clip-Fades):** Es darf sich mit keinem anderen Ereignis überschneiden, lässt sich nicht stückweise fortsetzen und erzeugt mehr Daten. Nur sinnvoll für gekrümmte Stücke (später, falls Bézier-Kurven gewünscht sind).
- **Werte je Tick per `setTargetAtTime` aus JS:** Das ist nicht samplegenau, schwankt mit dem Tick und klingt offline anders.
- **AudioWorklet als Automationsquelle:** Die Genauigkeit wäre gleich, aber es gäbe mehr Code. Ohne Worklet gäbe es keine Automation.
- **Lautstärke ersetzt den Fader:** Das entspricht dem DAW-Standard. Aber nach jeder Kurve müsste man zum Lautermachen alle Punkte verschieben, und zwei Regler für dieselbe Sache verwirren Einsteiger.
- **Kurve über den Clips statt in eigener Zeile:** Clip-Ziehen und Punkt-Ziehen würden sich vor allem am Finger streiten. Über den Clips gibt es deshalb nur eine Anzeige.

## Folgen
- Lautstärke-Kurven sind auf den Fader-Wert begrenzt (offen: über 100 %).
- Verzerrer-Stärke ist kein AudioParam (WaveShaper-Kennlinie). Sie braucht einen Umbau oder wird durch „Anteil“ ersetzt (offene Frage).
- Live-Bearbeitung greift mit bis zu etwa 0,18 s Verzögerung.
- Je Fenster und Kurve entstehen ein paar AudioParam-Ereignisse. Das ist bei bis zu 16 Spuren × 6 Kurven unkritisch.
- Ein Null-Test sichert den Filter-Umbau (detune) ab, denn alte Projekte müssen gleich klingen.
