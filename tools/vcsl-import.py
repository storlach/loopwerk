#!/usr/bin/env python3
"""VCSL-Import für Loopwerk: Versilian Community Sample Library (CC0 1.0).

Holt eine feste Auswahl aus einem blobless Klon (git show), schneidet Stille vorn und hinten weg,
setzt einen kurzen Ausklang, normalisiert den Spitzenpegel auf PEAK_TARGET (wie src/catalog.js),
schreibt 16-Bit-WAV nach assets/samples/vcsl/<gruppe>/ und erzeugt src/catalog-vcsl.js.

Mono: Kick, Snare, Tom, Hi-Hat und Klatschen sowie alle melodischen Töne werden als Mono-Summe
abgelegt (Gesamtgröße, wie Drumcomputer-Samples). Becken, Ride, Gongs und Perkussion bleiben stereo,
außer ihr Seitenkanal liegt unter -30 dB. Gegenphasiges Material wird nicht summiert, sondern durch
den lauteren Kanal ersetzt.

Töne: Die Oktavbezeichnung im Dateinamen stimmt bei VCSL oft nicht mit dem Klang überein. Deshalb
steht je Eintrag der gemessene Zielton (note) und ein Oktav-Offset (off, Halbtöne): Dateiname =
Zielton − off. Der Grundton wird per YIN geprüft (Abweichung bis 50 Cent), Name und Katalog folgen
der Prüfung.

Aufruf aus dem Projektwurzelordner:
  python3 -I tools/vcsl-import.py --clone <klon> --raw <ordner-für-rohdateien>

Die Rohdateien sind fremde Daten: sie werden nur gelesen (ffmpeg dekodiert), nie ausgeführt.
"""
import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import wave
from urllib.parse import quote

import numpy as np

SR = 44100
COMMIT = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e'  # Stand der LICENSE-Prüfung (CC0 1.0)
REPO = 'https://github.com/sgossner/VCSL'
LICENSE_URL = 'https://creativecommons.org/publicdomain/zero/1.0/'
ORIGIN = 'VCSL (Versilian Studios)'
PEAK_TARGET = {'drums': 0.62, 'chords': 0.42, 'synth': 0.42}  # Spiegel von PEAK_TARGET in src/catalog.js
MONO_BELOW_DB = -30.0  # Seitenkanal leiser als das: praktisch mono
MAX_FILE = 2_000_000
MAX_TOTAL = 35_000_000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

DR, PC, ML = 'drums', 'percussion', 'melodic'
K = ('house', 'techno', 'hiphop')
S = ('pop', 'breaks', 'hiphop')
T = ('pop', 'breaks')
H = ('house', 'techno', 'pop')
AMB = ('ambient', 'pop')
MF = 'Membranophones/Struck Membranophones/'
ID = 'Idiophones/Struck Idiophones/'
CH = 'Chordophones/'
EL = 'Electrophones/TX81Z/'
AE = 'Aerophones/'


def d(slug, name, pat, cap=1.0, genres=(), mono=True):
    """Schlag (Drums): Muster = Ordner/Dateinamen-Präfix (Regex), Suffix bis .wav beliebig.
    Mono-Summe (Standard bei Drumcomputern und für die Größe); Becken mit mono=False."""
    return (DR, slug, name, 'drums', pat, dict(cap=cap, genres=genres, tags=(), mono=mono))


def p(slug, name, pat, cap=0.9, genres=(), tags=('percussion',)):
    return (PC, slug, name, 'drums', pat, dict(cap=cap, genres=genres, tags=tags))


def note_midi(note):
    mm = re.match(r'([A-G])(#|b)?(-?\d)$', note)
    base = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[mm[1]] + (1 if mm[2] == '#' else -1 if mm[2] == 'b' else 0)
    return (int(mm[3]) + 1) * 12 + base


def name_token(note, off):
    """Dateinamen-Oktave: Zielton minus Offset (Halbtöne), z. B. C3 mit off 12 -> C2."""
    midi = note_midi(note) - off
    return f'{NAMES[midi % 12]}{midi // 12 - 1}'


def m(slug, name, note, cat, tmpl, off=0, cap=1.5, genres=AMB, tags=('einzelton',), var=False):
    """Melodischer Einzelton (Mono): tmpl enthält '{}' für den Dateinamen-Ton.
    var=True: Variante (leise, Vibrato) desselben Tons im selben Ordner erlaubt."""
    pat = tmpl.format(name_token(note, off))
    return (ML, slug, name, cat, pat,
            dict(cap=cap, genres=genres, tags=tags, note=note, off=off, mono=True, var=var))


SELECTION = [
    # Schlag: Kicks
    d('kick-1', 'Kick 1', MF + 'Bass Drum 1/BDrumNew_hit_v2_rr1_Sum', genres=K),
    d('kick-2', 'Kick 2', MF + 'Bass Drum 1/BDrumNew_hit_v3_rr1_Sum', genres=K),
    d('kick-3', 'Kick 3', MF + 'Bass Drum 1/BDrumNew_hit_v5_rr1_Sum', genres=K),
    d('kick-4', 'Kick 4', MF + 'Bass Drum 1/BDrumNew_hit_v7_rr1_Sum', genres=K),
    d('kick-5', 'Kick 5', MF + 'Bass Drum 2/bassdrum_hit_mf1', genres=K),
    d('kick-6', 'Kick 6', MF + 'Bass Drum 2/bassdrum_hit_ff', genres=K),
    d('kick-7', 'Kick 7', MF + 'Bass Drum 2/bassdrum_hit_pp1', genres=K),
    d('kick-8', 'Kick 8', MF + 'Bass Drum 2/bassdrum_hit_mf2', genres=K),
    d('kick-9', 'Kick 9', MF + 'Bass Drum 2/bassdrum_hit_f', genres=K),
    d('kick-10', 'Kick 10 leise', MF + 'Bass Drum 2/bassdrum_hit_mp1', genres=K),
    d('kick-11', 'Kick 11 leise', MF + 'Bass Drum 2/bassdrum_hit_mp2', genres=K),
    # Schlag: Snares, Rimshot, Sidestick, Seil
    d('snare-1', 'Snare 1', MF + 'Snare Drum, Modern 1/Snare2_HitSN_v3_rr1_Mid', genres=S),
    d('snare-2', 'Snare 2', MF + 'Snare Drum, Modern 1/Snare2_HitSN_v7_rr1_Mid', genres=S),
    d('snare-3', 'Snare 3', MF + 'Snare Drum, Modern 1/Snare2_HitNS_v2_rr1_Mid', genres=S),
    d('snare-4', 'Snare 4', MF + 'Snare Drum, Modern 1/Snare2_HitNS_v6_rr1_Mid', genres=S),
    d('snare-5', 'Snare 5', MF + 'Snare Drum, Modern 1/Snare2_HitSN_v5_rr1_Mid', genres=S),
    d('snare-6', 'Snare 6', MF + 'Snare Drum, Modern 2/Snare3M_HitSN_v3_rr1_Mid', genres=S),
    d('snare-7', 'Snare 7', MF + 'Snare Drum, Modern 2/Snare3M_HitNS_v5_rr1_Mid', genres=S),
    d('snare-8', 'Snare 8', MF + 'Snare Drum, Modern 2/Snare3M_HitNS_v2_rr1_Mid', genres=S),
    d('snare-9', 'Snare 9', MF + 'Snare Drum, Modern 3/Snare4_HitSN_v2_rr1_Mid', genres=S),
    d('snare-10', 'Snare 10', MF + 'Snare Drum, Modern 3/Snare4_HitSN_v4_rr1_Mid', genres=S),
    d('snare-11', 'Snare 11', MF + 'Snare Drum, Modern 3/Snare4_HitSN_v5_rr1_Mid', genres=S),
    d('snare-taps-1', 'Snare tupfen 1', MF + 'Snare Drum, Modern 1/Snare2_taps_v4_rr1_Mid', genres=S),
    d('snare-taps-2', 'Snare tupfen 2', MF + 'Snare Drum, Modern 2/Snare3M_taps_v4_rr1_Mid', genres=S),
    d('snare-taps-3', 'Snare tupfen 3', MF + 'Snare Drum, Modern 3/Snare4_taps_v4_rr1_Mid', genres=S),
    d('rimshot-1', 'Rimshot', MF + 'Snare Drum, Modern 3/Snare4_rimshot_v2_rr1_Mid', genres=S),
    d('sidestick-1', 'Sidestick', MF + 'Snare Drum, Modern 2/Snare3M_Xstick_v2_rr1_Mid', genres=S),
    d('snare-stick-1', 'Snare Stick', MF + 'Snare Drum, Modern 2/Snare3M_stick_v3_rr1_Mid', genres=S),
    d('snare-stick-2', 'Snare Stick 2', MF + 'Snare Drum, Modern 1/Snare2_stick_v1_rr1_Mid', genres=S),
    d('snare-seil-1', 'Snare Seil 1', MF + 'Snare Drum, Rope Tension/Hi/RopeSnare_hi_sn_Main_vl2_rr1', genres=S),
    d('snare-seil-2', 'Snare Seil 2', MF + 'Snare Drum, Rope Tension/Hi/RopeSnare_hi_sn_Main_vl4_rr1', genres=S),
    d('snare-seil-3', 'Snare Seil 3', MF + 'Snare Drum, Rope Tension/Low/RopeSnare_low_sn_Main_vl2_rr1', genres=S),
    # Schlag: Toms
    d('tom-hoch-1', 'Tom hoch 1', MF + 'Tom 1/Stick/TomH_HitS_v2_rr1_Mid', cap=1.0, genres=T),
    d('tom-hoch-2', 'Tom hoch 2', MF + 'Tom 1/Stick/TomH_HitS_v3_rr1_Mid', cap=1.0, genres=T),
    d('tom-hoch-3', 'Tom hoch 3', MF + 'Tom 1/Stick/TomH_HitS_v4_rr1_Mid', cap=1.0, genres=T),
    d('tom-hoch-4', 'Tom hoch 4', MF + 'Tom 1/Mallet/TomH_HitM_v2_rr1_Mid', cap=1.0, genres=T),
    d('tom-hoch-5', 'Tom hoch 5', MF + 'Tom 1/Mallet/TomH_HitM_v3_rr1_Mid', cap=1.0, genres=T),
    d('tom-hoch-rim', 'Tom hoch Rim', MF + 'Tom 1/TomH_rimS_v2_rr1_Mid', cap=1.2, genres=T),
    d('tom-tief-1', 'Tom tief 1', MF + 'Tom 2/Stick/TomL_HitS_v2_rr1_Mid', cap=1.0, genres=T),
    d('tom-tief-2', 'Tom tief 2', MF + 'Tom 2/Stick/TomL_HitS_v3_rr1_Mid', cap=1.0, genres=T),
    d('tom-tief-3', 'Tom tief 3', MF + 'Tom 2/Stick/TomL_HitS_v4_rr1_Mid', cap=1.0, genres=T),
    d('tom-tief-4', 'Tom tief 4', MF + 'Tom 2/Mallet/TomL_HitM_v2_rr1_Mid', cap=1.0, genres=T),
    # Schlag: Hi-Hats
    d('hihat-1', 'Hi-Hat geschlossen 1', ID + 'Hi-Hat Cymbal/HiHat_Close_rr1_Mid', cap=1.0, genres=H),
    d('hihat-2', 'Hi-Hat geschlossen 2', ID + 'Hi-Hat Cymbal/HiHat_HitC_v1_rr1_Mid', cap=1.0, genres=H),
    d('hihat-3', 'Hi-Hat geschlossen 3', ID + 'Hi-Hat Cymbal/HiHat_HitC_v3_rr1_Mid', cap=1.0, genres=H),
    d('hihat-4', 'Hi-Hat geschlossen 4', ID + 'Hi-Hat Cymbal/HiHat_HitC_v2_rr1_Mid', cap=1.0, genres=H),
    d('hihat-5', 'Hi-Hat geschlossen 5', ID + 'Hi-Hat Cymbal/HiHat_HitC_v4_rr1_Mid', cap=1.0, genres=H),
    d('hihat-6', 'Hi-Hat locker', ID + 'Hi-Hat Cymbal/HiHat_HitLoose_rr1_Mid', cap=1.0, genres=H),
    d('hihat-7', 'Hi-Hat offen 1', ID + 'Hi-Hat Cymbal/HiHat_HitO_rr1_Mid', cap=1.0, genres=H),
    d('hihat-8', 'Hi-Hat offen 2', ID + 'Hi-Hat Cymbal/HiHat_HitO_rr2_Mid', cap=1.0, genres=H),
    d('hihat-9', 'Hi-Hat halboffen', ID + 'Hi-Hat Cymbal/HiHat_HitOC_rr5_Mid', cap=1.0, genres=H),
    # Schlag: Claps
    d('klatschen-1', 'Klatschen 1', ID + 'Claps/Clap_rr1', genres=('house', 'hiphop')),
    d('klatschen-2', 'Klatschen 2', ID + 'Claps/Clap_rr2', genres=('house', 'hiphop')),
    d('klatschen-3', 'Klatschen 3', ID + 'Claps/Clap_rr3', genres=('house', 'hiphop')),
    d('klatschen-4', 'Klatschen 4', ID + 'Claps/Clap_rr4', genres=('house', 'hiphop')),
    d('klatschen-5', 'Klatschen 5', ID + 'Claps/Clap_rr5', genres=('house', 'hiphop')),
    d('klatschen-solo-1', 'Klatschen solo 1', ID + 'Claps/SoloClap_vl1', genres=('house', 'hiphop')),
    d('klatschen-solo-2', 'Klatschen solo 2', ID + 'Claps/SoloClap_vl2', genres=('house', 'hiphop')),
    d('snare-12', 'Snare 12', MF + 'Snare Drum, Modern 2/Snare3M_HitSN_v2_rr1_Mid', genres=S),
    d('snare-13', 'Snare 13', MF + 'Snare Drum, Modern 3/Snare4_HitSN_v2_rr2_Mid', genres=S),
    d('snare-14', 'Snare 14', MF + 'Snare Drum, Modern 1/Snare2_HitSN_v5_rr2_Mid', genres=S),
    d('snare-15', 'Snare 15', MF + 'Snare Drum, Modern 2/Snare3M_HitNS_v2_rr2_Mid', genres=S),
    d('tom-hoch-6', 'Tom hoch 6', MF + 'Tom 1/Stick/TomH_HitS_v2_rr2_Mid', genres=T),
    d('tom-tief-5', 'Tom tief 5', MF + 'Tom 2/Stick/TomL_HitS_v2_rr2_Mid', genres=T),
    d('tom-tief-6', 'Tom tief 6', MF + 'Tom 2/Stick/TomL_HitS_v3_rr2_Mid', genres=T),
    d('hihat-10', 'Hi-Hat geschlossen 6', ID + 'Hi-Hat Cymbal/HiHat_Close_rr2_Mid', genres=H),
    d('hihat-11', 'Hi-Hat geschlossen 7', ID + 'Hi-Hat Cymbal/HiHat_HitC_v2_rr2_Mid', genres=H),
    d('hihat-12', 'Hi-Hat geschlossen 8', ID + 'Hi-Hat Cymbal/HiHat_HitC_v3_rr2_Mid', genres=H),
    d('klatschen-6', 'Klatschen 6', ID + 'Claps/Clap_rr6', genres=('house', 'hiphop')),
    d('kick-12', 'Kick 12 leise', MF + 'Bass Drum 1/BDrumNew_hit_v2_rr2_Sum', genres=K),
    d('kick-13', 'Kick 13 leise', MF + 'Bass Drum 1/BDrumNew_hit_v3_rr2_Sum', genres=K),
    # Schlag: Becken und Ride (bis 3 s; Größe)
    d('becken-1', 'Becken 1', ID + 'Clash Cymbals 1/cymbal_crash1_mf1', cap=3.0, genres=('pop', 'house', 'breaks'), mono=False),
    d('becken-kurz', 'Becken kurz', ID + 'Clash Cymbals 1/cymbal_crash1_short1', cap=1.0, genres=('pop', 'house', 'breaks'), mono=False),
    d('becken-3', 'Becken 3', ID + 'Clash Cymbals 2/cymbal_crash2_f1', cap=3.0, genres=('pop', 'house', 'breaks'), mono=False),
    d('ride-1', 'Ride 1', ID + 'Suspended Cymbal 1/susCymb1_hit_f1', cap=2.5, genres=('pop', 'ambient'), mono=False),
    d('ride-glocke', 'Ride Glocke', ID + 'Suspended Cymbal 2/susCymb2_hit_bell_f1', cap=2.0, genres=('pop', 'ambient'), mono=False),
    # Perkussion
    p('shaker-1', 'Shaker 1', ID + 'Shaker, Small/Mid_ShakerDouble_Down_rr1', genres=AMB),
    p('shaker-2', 'Shaker 2', ID + 'Shaker, Small/Mid_ShakerHighFaster_Up_rr1', genres=AMB),
    p('shaker-3', 'Shaker 3', ID + 'Shaker, Small/Mid_ShakerDouble_Up_rr1', genres=AMB),
    p('shaker-roll', 'Shaker Roll', ID + 'Shaker, Small/Mid_Shaker_Roll_Fast_rr1', cap=1.0, genres=AMB),
    p('shaker-gross-1', 'Shaker groß 1', ID + 'Shaker, Large/LShaker_Hit_rr1_Mid', genres=AMB),
    p('shaker-gross-2', 'Shaker groß 2', ID + 'Shaker, Large/LShaker_Shake1U_rr1_Mid', cap=1.2, genres=AMB),
    p('shaker-gross-3', 'Shaker groß 3', ID + 'Shaker, Large/LShaker_Hit_rr2_Mid', genres=AMB),
    p('shaker-gross-4', 'Shaker groß 4', ID + 'Shaker, Large/LShaker_Shake1D_rr2_Mid', cap=1.2, genres=AMB),
    p('tamburin-1', 'Tamburin 1', ID + 'Tambourine 1/Tamb1_Hit_v1_rr1_Mid', genres=('pop', 'house')),
    p('tamburin-2', 'Tamburin 2', ID + 'Tambourine 2/Tamb2_Hit_v1_rr1_Mid', genres=('pop', 'house')),
    p('tamburin-3', 'Tamburin 3', ID + 'Tambourine 1/Tamb1_Hit_v2_rr1_Mid', genres=('pop', 'house')),
    p('tamburin-4', 'Tamburin 4', ID + 'Tambourine 2/Tamb2_Hit_v2_rr2_Mid', genres=('pop', 'house')),
    p('tamburin-schuetteln-1', 'Tamburin schütteln 1', ID + 'Tambourine 1/Tamb1_Shake_rr1_Mid', cap=1.5, genres=('pop', 'house')),
    p('tamburin-schuetteln-2', 'Tamburin schütteln 2', ID + 'Tambourine 2/Tamb2_Shake_rr3_Mid', cap=1.5, genres=('pop', 'house')),
    p('triangel-1', 'Triangel 1', ID + 'Triangles/Triangle1_HitFM_v1_rr1_Mid', cap=1.8, genres=AMB),
    p('triangel-2', 'Triangel 2', ID + 'Triangles/Triangle3_Hit_v1_rr1_Mid', cap=1.8, genres=AMB),
    p('triangel-3', 'Triangel 3', ID + 'Triangles/Triangle6_Hit_v1_rr1_Mid', cap=1.8, genres=AMB),
    p('triangel-4', 'Triangel 4', ID + 'Triangles/Triangle1_Hit_v2_rr1_Mid', cap=1.8, genres=AMB),
    p('cajon-1', 'Cajón 1', ID + 'Cajon/Cajon_hit1_f_rr1', genres=('pop', 'breaks')),
    p('cajon-2', 'Cajón 2', ID + 'Cajon/Cajon_hit2_f_rr1', genres=('pop', 'breaks')),
    p('cajon-3', 'Cajón 3', ID + 'Cajon/Cajon_hit3_f_rr1', genres=('pop', 'breaks')),
    p('cajon-4', 'Cajón 4 leise', ID + 'Cajon/Cajon_hit1_mp_rr1', genres=('pop', 'breaks')),
    p('cajon-5', 'Cajón 5', ID + 'Cajon/Cajon_hit1_fff_rr1', genres=('pop', 'breaks')),
    p('cajon-6', 'Cajón 6 leise', ID + 'Cajon/Cajon_hit2_pp_rr1', genres=('pop', 'breaks')),
    p('cajon-7', 'Cajón 7', ID + 'Cajon/Cajon_hit1_mp_rr2', genres=('pop', 'breaks')),
    p('cajon-8', 'Cajón 8', ID + 'Cajon/Cajon_hit2_f_rr2', genres=('pop', 'breaks')),
    p('conga-1', 'Conga 1', MF + 'Conga/Conga_HitN_v1_rr1_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('conga-2', 'Conga 2', MF + 'Conga/Conga_HitN_v2_rr1_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('conga-3', 'Conga 3', MF + 'Conga/Conga_HitFM_v1_rr1_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('conga-4', 'Conga 4', MF + 'Conga/Conga_HitN_v3_rr1_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('conga-5', 'Conga 5', MF + 'Conga/Conga_HitFM_v2_rr1_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('conga-6', 'Conga 6', MF + 'Conga/Conga_HitN_v1_rr2_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('quinto-1', 'Quinto 1', MF + 'Conga/Quinto_HitFM1_v1_rr1_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('quinto-2', 'Quinto 2', MF + 'Conga/Quinto_HitFM1_v2_rr1_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('bongo-1', 'Bongo hoch 1', MF + 'Bongos/BongoH_Hit1_v1_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('bongo-2', 'Bongo hoch 2', MF + 'Bongos/BongoH_Hit1_v3_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('bongo-3', 'Bongo hoch 3', MF + 'Bongos/BongoH_Hit1_v2_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('bongo-4', 'Bongo hoch 4', MF + 'Bongos/BongoH_Hit1_v1_rr2_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('bongo-gedaempft', 'Bongo gedämpft', MF + 'Bongos/BongoH_HitMuted1_v2_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('bongo-gedaempft-2', 'Bongo gedämpft 2', MF + 'Bongos/BongoH_HitMuted1_v1_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('darbuka-1', 'Darbuka 1', MF + 'Darbuka/Darbuka_1_hit_vl1_rr1', genres=AMB, tags=('percussion', 'orient')),
    p('darbuka-2', 'Darbuka 2', MF + 'Darbuka/Darbuka_2_hit_vl2_rr1', genres=AMB, tags=('percussion', 'orient')),
    p('darbuka-3', 'Darbuka 3', MF + 'Darbuka/Darbuka_3_hit_vl1_rr1', genres=AMB, tags=('percussion', 'orient')),
    p('darbuka-4', 'Darbuka 4', MF + 'Darbuka/Darbuka_4_hit_vl1_rr1', genres=AMB, tags=('percussion', 'orient')),
    p('darbuka-5', 'Darbuka 5', MF + 'Darbuka/Darbuka_1_hit_vl2_rr1', genres=AMB, tags=('percussion', 'orient')),
    p('darbuka-6', 'Darbuka 6', MF + 'Darbuka/Darbuka_3_hit_vl2_rr1', genres=AMB, tags=('percussion', 'orient')),
    p('darbuka-7', 'Darbuka 7', MF + 'Darbuka/Darbuka_2_hit_vl1_rr1', genres=AMB, tags=('percussion', 'orient')),
    p('rahmen-gross-1', 'Rahmentrommel groß 1', MF + 'Frame Drum/HDrumL_Hit_v2_rr1_Sum', genres=AMB),
    p('rahmen-gross-2', 'Rahmentrommel groß 2', MF + 'Frame Drum/HDrumL_Hit_v3_rr1_Sum', genres=AMB),
    p('rahmen-klein', 'Rahmentrommel klein', MF + 'Frame Drum/HDrumS_HitMuted_v2_rr1_Sum', genres=AMB),
    p('rahmen-klein-2', 'Rahmentrommel klein 2', MF + 'Frame Drum/HDrumS_HitMuted_v3_rr1_Sum', genres=AMB),
    p('rahmen-hand', 'Rahmentrommel Hand', MF + 'Frame Drum/HDrumL_Hand_rr1_Sum', genres=AMB),
    p('rahmen-hand-klein', 'Rahmentrommel Hand klein', MF + 'Frame Drum/HDrumS_Hand_v1_rr1_Sum', genres=AMB),
    p('claves-1', 'Claves 1', ID + 'Claves/Claves1_Hit_v1_rr1_Mid', genres=('house', 'hiphop'), tags=('percussion', 'latin')),
    p('claves-2', 'Claves 2', ID + 'Claves/Claves2_Hit_v2_rr1_Mid', genres=('house', 'hiphop'), tags=('percussion', 'latin')),
    p('claves-3', 'Claves 3', ID + 'Claves/Claves1_Hit_v2_rr1_Mid', genres=('house', 'hiphop'), tags=('percussion', 'latin')),
    p('claves-4', 'Claves 4', ID + 'Claves/Claves2_Hit_v1_rr1_Mid', genres=('house', 'hiphop'), tags=('percussion', 'latin')),
    p('holzblock-1', 'Holzblock 1', ID + 'Woodblock/wood_click_f_rr1', genres=('pop', 'house')),
    p('holzblock-2', 'Holzblock 2', ID + 'Woodblock/wood_click_mp', genres=('pop', 'house')),
    p('holzblock-3', 'Holzblock 3', ID + 'Woodblock/wood_click_ff', genres=('pop', 'house')),
    p('holzblock-leise', 'Holzblock leise', ID + 'Woodblock/wood_click_pp_rr1', genres=('pop', 'house')),
    p('holzblock-4', 'Holzblock 4', ID + 'Woodblock/wood_click2_mp', genres=('pop', 'house')),
    p('holzblock-5', 'Holzblock 5', ID + 'Woodblock/wood_click3_vl1', genres=('pop', 'house')),
    p('holzblock-6', 'Holzblock 6', ID + 'Woodblock/wood_click3_vl2', genres=('pop', 'house')),
    p('kuhglocke-1', 'Kuhglocke 1', ID + 'Cowbells/Cowbell1_Hit_v2_rr1_Mid', genres=('house',)),
    p('kuhglocke-2', 'Kuhglocke 2', ID + 'Cowbells/Cowbell2_Normal_v2_rr1_Mid', genres=('house',)),
    p('kuhglocke-gedaempft', 'Kuhglocke gedämpft', ID + 'Cowbells/Cowbell1_Muted_v2_rr1_Mid', genres=('house',)),
    p('kuhglocke-doppelt', 'Kuhglocke doppelt', ID + 'Cowbells/Cowbell2_Double_v2_rr1_Mid', genres=('house',)),
    p('kuhglocke-gedaempft-2', 'Kuhglocke gedämpft 2', ID + 'Cowbells/Cowbell2_Muted_v2_rr1_Mid', genres=('house',)),
    p('guiro-1', 'Guiro 1', ID + 'Guiro/Guiro_Hit_rr1_Mid', cap=1.2, genres=('pop', 'house'), tags=('percussion', 'latin')),
    p('guiro-2', 'Guiro 2', ID + 'Guiro/Guiro_Med_rr1_Mid', cap=1.2, genres=('pop', 'house'), tags=('percussion', 'latin')),
    p('guiro-schnell', 'Guiro schnell', ID + 'Guiro/Guiro_Fast_rr1_Mid', cap=1.2, genres=('pop', 'house'), tags=('percussion', 'latin')),
    p('guiro-3', 'Guiro 3', ID + 'Guiro/Guiro_Hit_rr2_Mid', cap=1.2, genres=('pop', 'house'), tags=('percussion', 'latin')),
    p('guiro-4', 'Guiro 4', ID + 'Guiro/Guiro_Slow_rr2_Mid', cap=1.2, genres=('pop', 'house'), tags=('percussion', 'latin')),
    p('cabasa-1', 'Cabasa 1', ID + 'Cabasa/Cabasa1_Hit_rr1_Mid', genres=('pop', 'house')),
    p('cabasa-2', 'Cabasa 2', ID + 'Cabasa/Cabasa1_Hit_rr2_Mid', genres=('pop', 'house')),
    p('cabasa-rub', 'Cabasa reiben', ID + 'Cabasa/Cabasa1_Rub_v1_rr1_Mid', cap=1.2, genres=('pop', 'house')),
    p('agogo-hoch-1', 'Agogo hoch 1', ID + 'Agogo Bells/Agogo_High_v1_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('agogo-tief-1', 'Agogo tief 1', ID + 'Agogo Bells/Agogo_Low_v1_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('agogo-hoch-2', 'Agogo hoch 2', ID + 'Agogo Bells/Agogo_High_v2_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('agogo-tief-2', 'Agogo tief 2', ID + 'Agogo Bells/Agogo_Low_v2_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('schellen-1', 'Schellenkranz', ID + 'Sleigh Bells/Sleighbells_Hit_rr1_Mid', cap=1.2, genres=AMB),
    p('schellen-2', 'Schellenkranz 2', ID + 'Sleigh Bells/Sleighbells_Hit_rr2_Mid', cap=1.2, genres=AMB),
    p('ratsche-1', 'Ratsche', ID + 'Ratchet/Ratchet1_Fast_rr1_Mid', cap=1.2, genres=('breaks',)),
    p('klapperstock-1', 'Klapperstock', ID + 'Slapstick/slapstick_rr1', genres=('breaks', 'pop')),
    p('klapperstock-2', 'Klapperstock 2', ID + 'Slapstick/slapstick_rr2', genres=('breaks', 'pop')),
    p('klapperstock-leise', 'Klapperstock leise', ID + 'Slapstick/slapstick_quiet_rr1', genres=('breaks', 'pop')),
    p('amboss-1', 'Amboss', ID + 'Anvil/Anvil_Hit1_v2_rr1_Mid', cap=1.2, genres=('ambient', 'breaks')),
    p('amboss-2', 'Amboss 2', ID + 'Anvil/Anvil_Hit2_v2_rr1_Mid', cap=1.2, genres=('ambient', 'breaks')),
    p('gong-1', 'Gong 1', ID + 'Gong 1/gong_f', cap=2.5, genres=('ambient',)),
    p('gong-2', 'Gong groß', ID + 'Gong 1/gong_fff', cap=2.5, genres=('ambient',)),
    p('schlitz-hoch', 'Schlitztrommel hoch', ID + 'Slit Drum/LogDrumHi_MedM_v1_rr1_Sum', genres=AMB),
    p('schlitz-tief', 'Schlitztrommel tief', ID + 'Slit Drum/LogDrumLo_MedM_v1_rr1_Sum', genres=AMB),
    p('flexaton-1', 'Flexaton', ID + 'Flexatone/flexatone1', cap=1.0, genres=('ambient',)),
    p('fingerzimbeln', 'Fingerzimbeln', ID + 'Finger Cymbals/Fing_Cymb', cap=1.6, genres=('ambient',)),
    p('shaker-4', 'Shaker 4', ID + 'Shaker, Small/Mid_ShakerDouble_Down_rr2', genres=AMB),
    p('tamburin-5', 'Tamburin schütteln 3', ID + 'Tambourine 2/Tamb2_Shake_rr4_Mid', cap=1.0, genres=('pop', 'house')),
    p('triangel-5', 'Triangel 5', ID + 'Triangles/Triangle3_HitFM_v2_rr1_Mid', cap=1.8, genres=AMB),
    p('cajon-9', 'Cajón 9', ID + 'Cajon/Cajon_hit2_mp_rr1', genres=('pop', 'breaks')),
    p('conga-7', 'Conga 7', MF + 'Conga/Conga_HitN_v3_rr2_Sum', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('bongo-5', 'Bongo hoch 5', MF + 'Bongos/BongoH_Hit1_v2_rr2_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('darbuka-8', 'Darbuka 8', MF + 'Darbuka/Darbuka_4_hit_vl2_rr1', genres=AMB, tags=('percussion', 'orient')),
    p('darbuka-9', 'Darbuka 9', MF + 'Darbuka/Darbuka_2_hit_vl2_rr2', genres=AMB, tags=('percussion', 'orient')),
    p('rahmen-gross-3', 'Rahmentrommel groß 3', MF + 'Frame Drum/HDrumL_Hit_v2_rr2_Sum', genres=AMB),
    p('claves-5', 'Claves 5', ID + 'Claves/Claves2_Hit_v3_rr1_Mid', genres=('house', 'hiphop'), tags=('percussion', 'latin')),
    p('kuhglocke-3', 'Kuhglocke 3', ID + 'Cowbells/Cowbell1_Normal_v2_rr1_Mid', genres=('house',)),
    p('holzblock-7', 'Holzblock 7', ID + 'Woodblock/wood_click_pp_rr2', genres=('pop', 'house')),
    p('holzblock-8', 'Holzblock 8', ID + 'Woodblock/wood_click_pp_rr3', genres=('pop', 'house')),
    p('guiro-5', 'Guiro 5', ID + 'Guiro/Guiro_Hit_rr1_Mid', cap=1.0, genres=('pop', 'house'), tags=('percussion', 'latin')),
    p('cabasa-3', 'Cabasa reiben 2', ID + 'Cabasa/Cabasa1_Rub_v2_rr1_Mid', cap=1.0, genres=('pop', 'house')),
    p('agogo-hoch-3', 'Agogo hoch 3', ID + 'Agogo Bells/Agogo_High_v3_rr1_Mid', genres=('house', 'pop'), tags=('percussion', 'latin')),
    p('schlitz-hoch-2', 'Schlitztrommel hoch 2', ID + 'Slit Drum/LogDrumHi_MedM_v2_rr1_Sum', genres=AMB),
    p('schlitz-tief-2', 'Schlitztrommel tief 2', ID + 'Slit Drum/LogDrumLo_MedM_v2_rr1_Sum', genres=AMB),
    p('amboss-3', 'Amboss 3', ID + 'Anvil/Anvil_Hit3_v2_rr1_Mid', cap=1.2, genres=('ambient', 'breaks')),
    p('ratsche-2', 'Ratsche 2', ID + 'Ratchet/Ratchet2_Crank_v1_rr1_Mid', cap=1.2, genres=('breaks',)),
    # Melodische Einzeltöne (Mono). Zielton = gemessener Ton; off = Oktavversatz der Dateinamen.
    m('harfe-a2', 'Harfe A2', 'A2', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_f1', cap=1.6),
    m('harfe-c3', 'Harfe C3', 'C3', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_f2', cap=1.6),
    m('harfe-e3', 'Harfe E3', 'E3', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_f1', cap=1.6),
    m('harfe-a4', 'Harfe A4', 'A4', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_f1', cap=1.6),
    m('harfe-c5', 'Harfe C5', 'C5', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_f1', cap=1.6),
    m('harfe-e5', 'Harfe E5', 'E5', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_f1', cap=1.6),
    m('harfe-leise-a2', 'Harfe leise A2', 'A2', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_mf1', cap=1.6, var=True),
    m('harfe-leise-e3', 'Harfe leise E3', 'E3', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_mf1', cap=1.6, var=True),
    m('harfe-leise-c3', 'Harfe leise C3', 'C3', 'chords', CH + 'Composite Chordophones/Concert Harp/KSHarp_{}_mf3', cap=1.6, var=True),
    m('folkharfe-c2', 'Folkharfe C2', 'C2', 'chords', CH + 'Composite Chordophones/Folk Harp/EWHarp_Normal_{}_v2_RR1', off=12, cap=1.6),
    m('folkharfe-e2', 'Folkharfe E2', 'E2', 'chords', CH + 'Composite Chordophones/Folk Harp/EWHarp_Normal_{}_v2_RR1', off=12, cap=1.6),
    m('folkharfe-c3', 'Folkharfe C3', 'C3', 'chords', CH + 'Composite Chordophones/Folk Harp/EWHarp_Normal_{}_v2_RR1', off=12, cap=1.6),
    m('folkharfe-e3', 'Folkharfe E3', 'E3', 'chords', CH + 'Composite Chordophones/Folk Harp/EWHarp_Normal_{}_v2_RR1', off=12, cap=1.6),
    m('folkharfe-c4', 'Folkharfe C4', 'C4', 'chords', CH + 'Composite Chordophones/Folk Harp/EWHarp_Normal_{}_v2_RR1', off=12, cap=1.6),
    m('folkharfe-e4', 'Folkharfe E4', 'E4', 'chords', CH + 'Composite Chordophones/Folk Harp/EWHarp_Normal_{}_v2_RR1', off=12, cap=1.6),
    m('folkharfe-c5', 'Folkharfe C5', 'C5', 'chords', CH + 'Composite Chordophones/Folk Harp/EWHarp_Normal_{}_v2_RR1', off=12, cap=1.6),
    m('strumstick-e3', 'Strumstick E3', 'E3', 'chords', CH + 'Composite Chordophones/Strumstick/Finger/Strumstick_Finger_Str[0-9]_Main_{}_', off=12, cap=1.6),
    m('strumstick-a3', 'Strumstick A3', 'A3', 'chords', CH + 'Composite Chordophones/Strumstick/Finger/Strumstick_Finger_Str[0-9]_Main_{}_', off=12, cap=1.6),
    m('strumstick-a4', 'Strumstick A4', 'A4', 'chords', CH + 'Composite Chordophones/Strumstick/Finger/Strumstick_Finger_Str[0-9]_Main_{}_', off=12, cap=1.6),
    m('strumstick-e4', 'Strumstick E4', 'E4', 'chords', CH + 'Composite Chordophones/Strumstick/Finger/Strumstick_Finger_Str[0-9]_Main_{}_', off=12, cap=1.6),
    m('fluegel-c2', 'Flügel C2', 'C2', 'chords', CH + 'Zithers/Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_{}_', cap=1.6),
    m('fluegel-e2', 'Flügel E2', 'E2', 'chords', CH + 'Zithers/Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_{}_', cap=1.6),
    m('fluegel-c3', 'Flügel C3', 'C3', 'chords', CH + 'Zithers/Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_{}_', cap=1.6),
    m('fluegel-e3', 'Flügel E3', 'E3', 'chords', CH + 'Zithers/Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_{}_', cap=1.6),
    m('fluegel-c4', 'Flügel C4', 'C4', 'chords', CH + 'Zithers/Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_{}_', cap=1.6),
    m('fluegel-e4', 'Flügel E4', 'E4', 'chords', CH + 'Zithers/Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_{}_', cap=1.6),
    m('fluegel-c5', 'Flügel C5', 'C5', 'chords', CH + 'Zithers/Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_{}_', cap=1.6),
    m('fluegel-e5', 'Flügel E5', 'E5', 'chords', CH + 'Zithers/Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_{}_', cap=1.6),
    m('fluegel2-c2', 'Flügel 2 C2', 'C2', 'chords', CH + 'Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_{}_', off=12, cap=1.6),
    m('fluegel2-c3', 'Flügel 2 C3', 'C3', 'chords', CH + 'Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_{}_', off=12, cap=1.6),
    m('fluegel2-e3', 'Flügel 2 E3', 'E3', 'chords', CH + 'Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_{}_', off=12, cap=1.6),
    m('fluegel2-c4', 'Flügel 2 C4', 'C4', 'chords', CH + 'Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_{}_', off=12, cap=1.6),
    m('fluegel2-e4', 'Flügel 2 E4', 'E4', 'chords', CH + 'Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_{}_', off=12, cap=1.6),
    m('fluegel2-c5', 'Flügel 2 C5', 'C5', 'chords', CH + 'Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_{}_', off=12, cap=1.6),
    m('klavier-a2', 'Klavier A2', 'A2', 'chords', CH + 'Zithers/Upright Piano, Knight/Sustains/Player_[^/]*_{}', off=12, cap=1.6),
    m('klavier-a3', 'Klavier A3', 'A3', 'chords', CH + 'Zithers/Upright Piano, Knight/Sustains/Player_[^/]*_{}', off=12, cap=1.6),
    m('klavier-a4', 'Klavier A4', 'A4', 'chords', CH + 'Zithers/Upright Piano, Knight/Sustains/Player_[^/]*_{}', off=12, cap=1.6),
    m('klavier2-c2', 'Klavier 2 C2', 'C2', 'chords', CH + 'Zithers/Upright Piano, Yamaha/Sustains/Upright1_Sus_{}_', off=12, cap=1.6),
    m('klavier2-c3', 'Klavier 2 C3', 'C3', 'chords', CH + 'Zithers/Upright Piano, Yamaha/Sustains/Upright1_Sus_{}_', off=12, cap=1.6),
    m('klavier2-c4', 'Klavier 2 C4', 'C4', 'chords', CH + 'Zithers/Upright Piano, Yamaha/Sustains/Upright1_Sus_{}_', off=12, cap=1.6),
    m('klavier2-c5', 'Klavier 2 C5', 'C5', 'chords', CH + 'Zithers/Upright Piano, Yamaha/Sustains/Upright1_Sus_{}_', off=12, cap=1.6),
    m('fmpiano-c2', 'FM-Piano C2', 'C2', 'synth', EL + 'FM Piano/FMPiano_{}_vl1', cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('fmpiano-e2', 'FM-Piano E2', 'E2', 'synth', EL + 'FM Piano/FMPiano_{}_vl1', cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('fmpiano-c3', 'FM-Piano C3', 'C3', 'synth', EL + 'FM Piano/FMPiano_{}_vl1', cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('fmpiano-e3', 'FM-Piano E3', 'E3', 'synth', EL + 'FM Piano/FMPiano_{}_vl1', cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('fmpiano-c4', 'FM-Piano C4', 'C4', 'synth', EL + 'FM Piano/FMPiano_{}_vl1', cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('fmpiano-e4', 'FM-Piano E4', 'E4', 'synth', EL + 'FM Piano/FMPiano_{}_vl1', cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('fmpiano-c5', 'FM-Piano C5', 'C5', 'synth', EL + 'FM Piano/FMPiano_{}_vl1', cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('clavisynth-c2', 'Clavisynth C2', 'C2', 'synth', EL + 'Clavisynth/Clavisynth_{}_vl1', off=24, cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('clavisynth-e2', 'Clavisynth E2', 'E2', 'synth', EL + 'Clavisynth/Clavisynth_{}_vl1', off=24, cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('clavisynth-c3', 'Clavisynth C3', 'C3', 'synth', EL + 'Clavisynth/Clavisynth_{}_vl1', off=24, cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('clavisynth-e3', 'Clavisynth E3', 'E3', 'synth', EL + 'Clavisynth/Clavisynth_{}_vl1', off=24, cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('clavisynth-c4', 'Clavisynth C4', 'C4', 'synth', EL + 'Clavisynth/Clavisynth_{}_vl1', off=24, cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('clavisynth-e4', 'Clavisynth E4', 'E4', 'synth', EL + 'Clavisynth/Clavisynth_{}_vl1', off=24, cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('clavisynth-c5', 'Clavisynth C5', 'C5', 'synth', EL + 'Clavisynth/Clavisynth_{}_vl1', off=24, cap=1.4, genres=('techno', 'house'), tags=('einzelton', 'fm')),
    m('vibrafon-hart-e4', 'Vibrafon E4', 'E4', 'chords', ID + 'Vibraphone/Hard Mallets/Vibes_hard_{}_', off=12, genres=AMB, tags=('einzelton', 'schlegel')),
    m('vibrafon-hart-a5', 'Vibrafon A5', 'A5', 'chords', ID + 'Vibraphone/Hard Mallets/Vibes_hard_{}_', off=12, genres=AMB, tags=('einzelton', 'schlegel')),
    m('vibrafon-weich-a3', 'Vibrafon weich A3', 'A3', 'chords', ID + 'Vibraphone/Soft Mallets/Vibes_soft_{}_', off=12, genres=AMB, tags=('einzelton', 'schlegel')),
    m('vibrafon-weich-c4', 'Vibrafon weich C4', 'C4', 'chords', ID + 'Vibraphone/Soft Mallets/Vibes_soft_{}_', off=12, genres=AMB, tags=('einzelton', 'schlegel')),
    m('vibrafon-weich-e4', 'Vibrafon weich E4', 'E4', 'chords', ID + 'Vibraphone/Soft Mallets/Vibes_soft_{}_', off=12, genres=AMB, tags=('einzelton', 'schlegel')),
    m('vibrafon-bogen-a3', 'Vibrafon gestrichen A3', 'A3', 'synth', ID + 'Vibraphone/Bowed/Vibes_bowed_{}_', off=12, cap=1.6, genres=('ambient',)),
    m('vibrafon-bogen-e4', 'Vibrafon gestrichen E4', 'E4', 'synth', ID + 'Vibraphone/Bowed/Vibes_bowed_{}_', off=12, cap=1.6, genres=('ambient',)),
    m('marimba-c3', 'Marimba C3', 'C3', 'chords', ID + 'Marimba/Marimba_hit_Outrigger_{}_med_01', off=12, genres=('pop', 'house')),
    m('marimba-c5', 'Marimba C5', 'C5', 'chords', ID + 'Marimba/Marimba_hit_Outrigger_{}_med_01', off=12, genres=('pop', 'house')),
    m('xylofon-c5', 'Xylofon C5', 'C5', 'chords', ID + 'Xylophone/Medium Mallets/Xylo_Medium_{}_', off=12, cap=1.4, genres=('pop', 'house')),
    m('xylofon-g5', 'Xylofon G5', 'G5', 'chords', ID + 'Xylophone/Medium Mallets/Xylo_Medium_{}_', off=12, cap=1.4, genres=('pop', 'house')),
    m('glockenspiel-g5', 'Glockenspiel G5', 'G5', 'synth', ID + 'Glockenspiel/glock_loud_{}_', cap=1.2, genres=AMB),
    m('glockenspiel-c5', 'Glockenspiel C5', 'C5', 'synth', ID + 'Glockenspiel/glock_loud_{}_', off=-12, cap=1.2, genres=AMB),
    m('handglocke-c4', 'Handglocke C4', 'C4', 'synth', ID + 'Hand Chimes/sus_{}_', off=12, cap=1.6, genres=('ambient',)),
    m('handglocke-e4', 'Handglocke E4', 'E4', 'synth', ID + 'Hand Chimes/sus_{}_', off=12, cap=1.6, genres=('ambient',)),
    m('handglocke-c5', 'Handglocke C5', 'C5', 'synth', ID + 'Hand Chimes/sus_{}_', off=12, cap=1.6, genres=('ambient',)),
    m('handglocke-e5', 'Handglocke E5', 'E5', 'synth', ID + 'Hand Chimes/sus_{}_', off=12, cap=1.6, genres=('ambient',)),
    m('handglocke-a5', 'Handglocke A5', 'A5', 'synth', ID + 'Hand Chimes/sus_{}_', off=12, cap=1.6, genres=('ambient',)),
    m('mundharmonika-c4', 'Mundharmonika C4', 'C4', 'synth', AE + 'Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal/Hohner-Special20_Normal_{}', off=12, cap=1.2, genres=AMB),
    m('mundharmonika-e4', 'Mundharmonika E4', 'E4', 'synth', AE + 'Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal/Hohner-Special20_Normal_{}', off=12, cap=1.2, genres=AMB),
    m('mundharmonika-c5', 'Mundharmonika C5', 'C5', 'synth', AE + 'Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal/Hohner-Special20_Normal_{}', off=12, cap=1.2, genres=AMB),
    m('mundharmonika-e5', 'Mundharmonika E5', 'E5', 'synth', AE + 'Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal/Hohner-Special20_Normal_{}', off=12, cap=1.2, genres=AMB),
    m('mundharmonika-g5', 'Mundharmonika G5', 'G5', 'synth', AE + 'Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal/Hohner-Special20_Normal_{}', off=12, cap=1.2, genres=AMB),
    m('mundharmonika-a4', 'Mundharmonika A4', 'A4', 'synth', AE + 'Free Aerophones/Harmonica-Hohner-Special20-F/Sustains/Normal/Hohner-Special20-F_Normal_{}', off=12, cap=1.2, genres=AMB),
    m('mundharmonika-a4-vib', 'Mundharmonika A4 Vibrato', 'A4', 'synth', AE + 'Free Aerophones/Harmonica-Hohner-Special20-F/Sustains/Vib/Hohner-Special20-F_Vib_{}', off=12, cap=1.2, genres=AMB),
    m('blockfloete-c5', 'Blockflöte C5', 'C5', 'synth', AE + 'Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_{}_rr1_Main', off=12, cap=1.0, genres=('ambient',)),
    m('blockfloete-e5', 'Blockflöte E5', 'E5', 'synth', AE + 'Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_{}_rr1_Main', off=12, cap=1.0, genres=('ambient',)),
    m('psalter-c5', 'Psalter C5', 'C5', 'chords', CH + 'Zithers/Psaltery, Bowed and Plucked/Pluck/BowedPsaltery_{}_', off=12, cap=1.4, genres=AMB),
    m('psalter-e5', 'Psalter E5', 'E5', 'chords', CH + 'Zithers/Psaltery, Bowed and Plucked/Pluck/BowedPsaltery_{}_', off=12, cap=1.4, genres=AMB),
    m('balafon-c5', 'Balafon C5', 'C5', 'chords', ID + 'Balafon/Soft Mallet/EthnicXylo_softM_{}_', off=12, cap=1.4, genres=('pop', 'house')),
]


def load_names(clone):
    """Dateiliste des Klons (nur Pfade, keine Blobs)."""
    out = subprocess.run(['git', '-C', clone, 'ls-tree', '-r', '--name-only', 'HEAD'],
                         capture_output=True, text=True, check=True).stdout
    return [n for n in out.splitlines() if n.lower().endswith('.wav')]


def find(names, pat):
    """Erster Treffer (sortiert) für das Muster (Regex); Suffix bis .wav ist beliebig."""
    rx = re.compile(pat + r'[^/]*\.wav$')
    hits = sorted(n for n in names if rx.search(n))
    return hits[0] if hits else None


def fetch(clone, path, rawdir, slug):
    """Rohdatei holen (git show); Rohdateien werden nur gelesen, nie ausgeführt.
    Der Cache-Name enthält den Pfad-Hash, damit ein geänderter Dateiname nie eine alte Datei liefert."""
    tag = hashlib.sha1(path.encode('utf-8')).hexdigest()[:8]
    dst = os.path.join(rawdir, f'{slug}-{tag}' + os.path.splitext(path)[1])
    if not os.path.exists(dst):
        data = subprocess.run(['git', '-C', clone, 'show', f'HEAD:{path}'], capture_output=True, check=True).stdout
        with open(dst, 'wb') as f:
            f.write(data)
    return dst


def decode(path):
    """ffmpeg -> float64, stereo, 44,1 kHz; Mono-Quellen kommen als identische Kanäle."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le',
                        '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype='<f4').reshape(-1, 2).astype(np.float64)


def rms(v):
    return math.sqrt(float(np.mean(v ** 2)))


def side_db(x):
    """Pegel des Seitenkanals relativ zur Mitte in dB."""
    mid = x.mean(axis=1)
    side = (x[:, 0] - x[:, 1]) / 2
    return 20 * math.log10(max(rms(side), 1e-12) / max(rms(mid), 1e-12))


def to_mono(x):
    """Mono-Summe; bei Gegenphase (Mitte schwach) der lautere Kanal. Liefert 2D mit gleichen Kanälen."""
    l, r = x[:, 0], x[:, 1]
    mid = (l + r) / 2
    v = mid if rms(mid) >= 0.7 * max(rms(l), rms(r)) else (l if rms(l) >= rms(r) else r)
    return np.stack([v, v], axis=1)


def yin_f0(x, fmin=60.0, fmax=1000.0, w=2048, thr=0.12):
    """Grundtonschätzung nach YIN (de Cheveigné & Kawahara 2002) für ein kurzes Fenster."""
    tau_min, tau_max = int(SR / fmax), int(SR / fmin)
    if len(x) < w + tau_max + 2:
        return None
    xs = x[:w + tau_max + 1]
    dd = np.zeros(tau_max + 1)
    for tau in range(1, tau_max + 1):
        df = xs[:w] - xs[tau:tau + w]
        dd[tau] = np.dot(df, df)
    cum = np.cumsum(dd[1:])
    cmnd = np.ones(tau_max + 1)
    cmnd[1:] = dd[1:] * np.arange(1, tau_max + 1) / np.maximum(cum, 1e-12)
    tau = None
    for t in range(max(tau_min, 2), tau_max):
        if cmnd[t] < thr and cmnd[t] <= cmnd[t - 1] and cmnd[t] <= cmnd[t + 1]:
            tau = t
            break
    if tau is None:
        tau = tau_min + int(np.argmin(cmnd[tau_min:tau_max]))
    a, b, c = cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]
    den = a - 2 * b + c
    shift = 0.5 * (a - c) / den if den != 0 else 0.0
    return SR / (tau + shift)


def pitch_ok(mid, env, note):
    """Grundton auf der Mitte (nicht auf einem Einzelkanal, der eine Oktave springen kann).
    Zwei Fenster (80 ms und 200 ms nach dem Anschlag); das bessere muss bis 50 Cent passen."""
    peak = env.max()
    onset = int(np.argmax(env >= 0.1 * peak))
    target = note_midi(note)
    best = None
    for dt in (0.08, 0.2):
        f = yin_f0(mid[onset + int(dt * SR):])
        if f is None:
            continue
        cents = 1200 * math.log2(f / (440.0 * 2 ** ((target - 69) / 12)))
        if best is None or abs(cents) < abs(best[1]):
            best = (f, cents)
    if best is None:
        return False, 'zu kurz für Tonhöhe'
    f, cents = best
    if abs(cents) > 50:
        midi = round(69 + 12 * math.log2(f / 440.0))
        return False, f'gemessen {f:.1f} Hz (~{NAMES[midi % 12]}{midi // 12 - 1}), erwartet {note} ({cents:+.0f} Cent)'
    return True, f'{f:.1f} Hz, {cents:+.0f} Cent'


def process(x, cat, cap_s):
    """Stille weg, Ausklang, Kappung auf cap_s, Spitzenpegel auf das Kategorie-Ziel."""
    env = np.max(np.abs(x), axis=1)
    peak = env.max()
    if peak <= 0:
        return None
    idx = np.nonzero(env >= peak * 10 ** (-50 / 20))[0]
    start = max(0, idx[0] - int(0.002 * SR))
    end = min(len(x), idx[-1] + int(0.01 * SR))
    x = x[start:end].copy()
    cap = int(cap_s * SR)
    if len(x) > cap:
        x = x[:cap]
        fade = int(0.15 * SR)
    else:
        fade = int(0.02 * SR)
    fade = min(fade, len(x) // 4)
    if fade > 0:
        x[-fade:] *= (np.cos(np.linspace(0, math.pi / 2, fade)) ** 2)[:, None]
    fin = min(int(0.0005 * SR), len(x) // 4)
    if fin > 0:
        x[:fin] *= np.linspace(0, 1, fin)[:, None]
    x *= PEAK_TARGET[cat] / np.max(np.abs(x))
    return x


def write_wav(path, x, mono):
    data = x[:, 0] if mono else x
    pcm = np.clip(np.round(data * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1 if mono else 2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def js(v):
    """JS-Literal wie im Repo: Strings in einfachen Anführungszeichen, Listen als Arrays."""
    if isinstance(v, list):
        return '[' + ', '.join(js(i) for i in v) + ']'
    return "'" + str(v).replace('\\', '\\\\').replace("'", "\\'") + "'"


def catalog_line(e):
    parts = [f"id: {js(e['id'])}", f"name: {js(e['name'])}", f"category: {js(e['category'])}", "kind: 'oneshot'",
             f"beats: {e['beats']}", 'bpm: 120', f"key: {js(e['key'])}"]
    if e.get('note'):
        parts.append(f"note: {js(e['note'])}")
    parts += [f"genres: {js(list(e['genres']))}", f"tags: {js(list(e['tags']))}", f"file: {js(e['file'])}",
              f"source: {js(e['source'])}", "license: 'CC0'", f"licenseUrl: {js(e['licenseUrl'])}",
              f"origin: {js(e['origin'])}"]
    return '  { ' + ', '.join(parts) + ' },'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--clone', required=True, help='blobloser VCSL-Klon')
    ap.add_argument('--raw', required=True, help='Ordner für Rohdateien (fremde Daten, nur lesen)')
    args = ap.parse_args()
    names = load_names(args.clone)
    os.makedirs(args.raw, exist_ok=True)
    entries, rejects, seen, notes_seen = [], [], set(), set()
    total = 0
    for group, slug, name, cat, pat, opt in SELECTION:
        if slug in seen:
            sys.exit(f'Slug doppelt: {slug}')
        seen.add(slug)
        path = find(names, pat)
        if path is None:
            rejects.append((name, f'kein Treffer für Muster „{pat}“'))
            continue
        x = decode(fetch(args.clone, path, args.raw, slug))
        sd = side_db(x)
        note = opt.get('note')
        forced = bool(opt.get('mono'))  # Mono-Summe nach Vorgabe (Drums, Melodik)
        mono = forced or sd <= MONO_BELOW_DB
        info = ''
        if note:
            ok, info = pitch_ok(x.mean(axis=1), np.max(np.abs(x), axis=1), note)
            if not ok:
                rejects.append((name, info))
                continue
            # ein Ton je Instrument und Ordner; Varianten (leise, Vibrato) ausgenommen
            key = (os.path.dirname(path), note, slug if opt.get('var') else '')
            if key in notes_seen:
                rejects.append((name, f'Ton {note} im Ordner schon vorhanden'))
                continue
            notes_seen.add(key)
        if forced:
            x = to_mono(x)
        y = process(x, cat, opt['cap'])
        if y is None:
            rejects.append((name, 'Stille'))
            continue
        dst_dir = os.path.join(ROOT, 'assets', 'samples', 'vcsl', group)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, slug + '.wav')
        write_wav(dst, y, mono)
        size = os.path.getsize(dst)
        if size > MAX_FILE:
            rejects.append((name, f'zu groß ({size} Byte)'))
            os.remove(dst)
            continue
        total += size
        dur = len(y) / SR
        beats = max(1, math.ceil(dur * 2 - 1e-6))
        entries.append({
            'id': 'vc-' + slug, 'name': name, 'category': cat, 'beats': beats,
            'key': note[0] if note else 'keine', 'note': note, 'genres': opt['genres'], 'tags': opt['tags'],
            'file': f'assets/samples/vcsl/{group}/{slug}.wav',
            'source': f'{REPO}/blob/{COMMIT}/' + quote(path), 'licenseUrl': LICENSE_URL, 'origin': ORIGIN,
        })
        print(f"{name:26} {group:10} {dur:4.2f} s {beats:2d} Schl. {'mono  ' if mono else 'stereo'} "
              f"side {sd:6.1f} dB {size / 1000:6.1f} kB  {info}", flush=True)
    out = os.path.join(ROOT, 'src', 'catalog-vcsl.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// VCSL – Versilian Community Sample Library, CC0 1.0 (LICENSE im Klon, Commit ' + COMMIT[:7] + ').\n')
        f.write('// Erzeugt von tools/vcsl-import.py; nicht von Hand ändern.\n')
        f.write('export const VCSL_CATALOG = [\n')
        for e in entries:
            f.write(catalog_line(e) + '\n')
        f.write('];\n')
    print(f'\n{len(entries)} Sounds, {total / 1e6:.2f} MB')
    print('Verworfen:')
    for n, why in rejects:
        print(f'  {n}: {why}')
    if total > MAX_TOTAL:
        sys.exit(f'Gesamtgröße {total} Byte über dem Limit')


if __name__ == '__main__':
    main()
