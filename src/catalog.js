// Katalog der mitgelieferten Fremd-Sounds. Alle aus dem Sonic-Pi-Projekt, dort als CC0 veröffentlicht
// (https://github.com/sonic-pi-net/sonic-pi/blob/main/etc/samples/README.md), Originale auf freesound.org.
// Als WAV (16 Bit) mitgeliefert; One-Shots über 4 s gekürzt und ausgeblendet.
// Loops: Schlagzahl per Onset-Analyse bestimmt (siehe docs/specs/stufe-3-bibliothek-tempo.md), Tempo = Schläge · 60 / Dauer.

const CC0 = { license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'Sonic Pi' };
const fs = (n) => `https://freesound.org/people/${n}`;

const entry = (file, name, category, extra) => ({
  id: 'sp-' + file.replace(/_/g, '-'),
  file: `assets/samples/sonicpi/${file}.wav`,
  name,
  category,
  kind: 'oneshot',
  ...CC0,
  ...extra,
});

export const CATALOG = [
  // Loops
  entry('loop_amen', 'Amen Break', 'drums', { kind: 'loop', beats: 4, source: fs('Dolfeus/sounds/43389/') }),
  entry('loop_breakbeat', 'Breakbeat 126', 'drums', { kind: 'loop', beats: 4, source: fs('Snapper4298/sounds/160354/') }),
  entry('loop_compus', 'Compus', 'drums', { kind: 'loop', beats: 16, source: fs('godspine/sounds/212288/') }),
  entry('loop_garzul', 'Garzul', 'drums', { kind: 'loop', beats: 16, source: fs('Garzul/sounds/213524/') }),
  entry('loop_mika', 'Mika', 'drums', { kind: 'loop', beats: 16, source: fs('mika55/sounds/188551/') }),
  entry('loop_safari', 'Safari', 'drums', { kind: 'loop', beats: 16, source: fs('nemaavla/sounds/318759/') }),
  // Drums einzeln
  entry('bd_haus', 'Kick Haus', 'drums', { source: fs('Rodrigo%20The%20Mad/sounds/137722/') }),
  entry('bd_808', 'Kick 808', 'drums', { source: fs('EKVelika/sounds/208447/') }),
  entry('bd_boom', 'Kick Boom', 'drums', { source: fs('Snapper4298/sounds/157245/') }),
  entry('sn_dub', 'Snare Dub', 'drums', { source: fs('Adriak909/sounds/173142/') }),
  entry('sn_generic', 'Snare', 'drums', { source: fs('hullum/sounds/415582/') }),
  entry('drum_snare_hard', 'Snare akustisch', 'drums', { source: fs('menegass/sounds/100058/') }),
  entry('drum_cymbal_closed', 'Hi-Hat geschlossen', 'drums', { source: fs('menegass/sounds/100053/') }),
  entry('drum_cymbal_open', 'Hi-Hat offen', 'drums', { source: fs('menegass/sounds/100055/') }),
  entry('drum_cymbal_hard', 'Becken', 'drums', { source: fs('menegass/sounds/100056/') }),
  entry('perc_snap', 'Fingerschnipsen', 'drums', { source: fs('SoundCollectah/sounds/109400/') }),
  entry('drum_tom_mid_hard', 'Tom mittel', 'drums', { source: fs('menegass/sounds/100066/') }),
  entry('drum_tom_lo_hard', 'Tom tief', 'drums', { source: fs('menegass/sounds/100064/') }),
  entry('drum_cowbell', 'Kuhglocke', 'drums', { source: fs('Neotone/sounds/75338/') }),
  // Bass (Grundton C)
  entry('bass_hard_c', 'Bass hart (C)', 'bass', { key: 'C', source: fs('ani_music/sounds/165309/') }),
  entry('bass_voxy_c', 'Bass Voxy (C)', 'bass', { key: 'C', source: fs('ani_music/sounds/165325/') }),
  entry('bass_woodsy_c', 'Bass Woodsy (C)', 'bass', { key: 'C', source: fs('ani_music/sounds/165322/') }),
  // Akkorde und Flächen
  entry('ambi_piano', 'Klavier-Fläche', 'chords', { source: fs('RutgerMuller/sounds/51245/') }),
  entry('guit_em9', 'Gitarre Em9', 'chords', { key: 'Em', source: fs('Sub-d/sounds/46992/') }),
  entry('guit_e_fifths', 'Gitarre E-Quinten', 'chords', { key: 'E', source: fs('Sub-d/sounds/46990/') }),
  entry('ambi_choir', 'Chor', 'chords', { source: fs('Exsomniel/sounds/207809/') }),
  // Synth und Glocken
  entry('elec_chime', 'Glockenspiel elektrisch', 'synth', { source: fs('looppool/sounds/13138/') }),
  entry('elec_blip', 'Blip', 'synth', { source: fs('looppool/sounds/13121/') }),
  entry('perc_bell', 'Glocke', 'synth', { source: fs('AlaskaRobotics/sounds/221515/') }),
  // FX
  entry('ambi_drone', 'Drone', 'fx', { source: fs('Autistic%20Lucario/sounds/195341/') }),
  entry('ambi_glass_hum', 'Glas-Summen', 'fx', { source: fs('kaligari/sounds/35391/') }),
  entry('misc_cineboom', 'Kino-Boom', 'fx', { source: 'http://freesound.org/people/Northern_Monkey/sounds/177242/' }),
  entry('ambi_swoosh', 'Swoosh', 'fx', { source: fs('Halgrimm/sounds/169867/') }),
];

// Ziel-Spitzenpegel je Kategorie (siehe Skill sample-import)
export const PEAK_TARGET = { drums: 0.62, bass: 0.5, chords: 0.42, synth: 0.42, fx: 0.5, own: 0.6 };
