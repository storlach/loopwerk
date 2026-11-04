---
name: effekt-bauen
description: Vorlage, um in Loopwerk einen neuen Audio-Effekt (EQ, Hall, Echo, Kompressor, Filter, Verzerrung …) hinzuzufügen – Parameterdefinition, Node-Graph für Realtime und Offline, Regler in der UI, Presets, Messtest. Verwenden ab Roadmap-Stufe 4.
---

# Einen Effekt bauen

## 1. Definition (`src/effects/<name>.js`)
```js
export const delay = {
  id: 'delay',
  label: 'Echo',
  params: {
    time:     { label: 'Zeit',     min: 0.05, max: 2,   default: 0.375, unit: 's', syncable: true },
    feedback: { label: 'Rückkopplung', min: 0, max: 0.9, default: 0.35 },
    mix:      { label: 'Anteil',   min: 0,    max: 1,   default: 0.3 },
  },
  presets: { 'Achtel punktiert': { time: 0.375, feedback: 0.35, mix: 0.3 } },
  create(ctx) { /* gibt { input, output, set(param, value, time), dispose() } zurück */ },
};
```
- `create` muss mit `AudioContext` **und** `OfflineAudioContext` funktionieren.
- Immer einen Dry/Wet-Anteil (`mix`) vorsehen, Standard so, dass der Effekt hörbar, aber nicht aufdringlich ist.
- Tempo-synchrone Zeiten (`syncable`) als Notenwerte anbieten (1/4, 1/8, 1/8 punktiert) – umgerechnet über `spb`.

## 2. Modell (ADR 008)
- Spur und Master haben `fx` als Objekt mit einem Eintrag je Effekttyp (`fx.filter = { on, cutoff, … }`, `withFx` füllt auf). Änderungen über `setTrackFx`/`setMasterFx` (mit `coalesce` beim Drehen).
- Reihenfolge: optionales `fxOrder` (Liste von Effekt-IDs) an Spur und `project.master`; `fxOrderOf(owner)` bereinigt (Unbekannte/Doppelte weg, Fehlende hinten in `EFFECT_IDS`). Store: `moveFx(target, fxId, toIndex)`, `resetFxOrder(target)`; die Grundreihenfolge speichert kein Feld. Jeder Effekt steht höchstens einmal in der Kette.
- Ein neuer Effekt kommt in `EFFECTS` (Grundreihenfolge) und damit automatisch in jede Reihenfolge (hinten an, wenn eine Spur schon eine eigene hat).
- Send-Busse: `track.sends = { hall?, echo? }` (0…1, 0 fällt weg), `project.buses = { hall?: { volume, mute, size }, echo?: { volume, mute, time, feedback } }`; `BUSES`, `busOf`, `sendOf` in `effects.js`, Store `setSend`/`setBus`. Effekte, die als Bus taugen (Hall, Echo), kennen `create(ctx, { dry: false })`: kein trockener Weg, Anteil fest 1.

## 3. Engine
- `buildMix` hängt die Kette zwischen Spur-Gain und Panner ein, `buildFxChain(ctx, fx, spb, grid, order)` in der Reihenfolge `order`. Änderungen an der Kette während der Wiedergabe ohne Aussetzer (neue Kette aufbauen, überblenden, alte entsorgen). Wechselt nur die Reihenfolge (`fxKey` mit gleicher Menge), blendet `installChain(…, { keepTail: true })` die Eingänge über und lässt die alte Kette ausklingen (Hall/Echo-Fahne bleibt).
- Parameteränderungen mit `setTargetAtTime`.

## 4. UI
- Regler: Ziehen nach oben/unten, Doppelklick = Standardwert, Mausrad fein. Wert mit Einheit anzeigen.
- Bypass-Schalter je Effekt. Presets als Auswahl.

## 5. Test (Skill `audio-test`)
- Bypass = Signal unverändert (Differenz < 1e-6).
- Ein charakteristisches Merkmal messen, z. B. Echo: Impuls → zweite Spitze nach `time`, Höhe ≈ `mix × feedback`-Kette; EQ: Energieänderung im Band.
- Ohr-Test für Martin: Preset nennen, das er anhören soll.
