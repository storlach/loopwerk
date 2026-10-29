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

## 2. Modell
- Spur bekommt `effects: [{ id, type, params, bypass }]`. Änderungen über Store-Aktionen (`addEffect`, `setEffectParam` mit `coalesce` beim Drehen, `removeEffect`).

## 3. Engine
- `buildMix` hängt die Kette zwischen Spur-Gain und Panner ein; Änderungen an der Kette während der Wiedergabe ohne Aussetzer (neue Kette aufbauen, überblenden, alte entsorgen).
- Parameteränderungen mit `setTargetAtTime`.

## 4. UI
- Regler: Ziehen nach oben/unten, Doppelklick = Standardwert, Mausrad fein. Wert mit Einheit anzeigen.
- Bypass-Schalter je Effekt. Presets als Auswahl.

## 5. Test (Skill `audio-test`)
- Bypass = Signal unverändert (Differenz < 1e-6).
- Ein charakteristisches Merkmal messen, z. B. Echo: Impuls → zweite Spitze nach `time`, Höhe ≈ `mix × feedback`-Kette; EQ: Energieänderung im Band.
- Ohr-Test für Martin: Preset nennen, das er anhören soll.
