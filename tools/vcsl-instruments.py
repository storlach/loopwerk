#!/usr/bin/env python3
"""VCSL-Instrumente für den Melodie-Sampler (Versilian Community Sample Library, CC0 1.0).

Je Instrument ein Ordner der VCSL mit einer Anschlagstärke. Jede Datei wird dekodiert (ffmpeg), auf Mono
gebracht und die Tonhöhe per YIN gemessen. Die Zone bekommt die GEMESSENE MIDI-Note, weil die Oktaven
in den VCSL-Dateinamen teils versetzt sind. Je Ton gewinnt die Datei mit der kleinsten Abweichung.
Das Raster liegt bei `step` Halbtönen (±1 Halbton Toleranz); Lücken werden im Bericht genannt.

Schnitt: vorn Stille weg (Anschlag bleibt), höchstens `cap` s, Fade am Ende. Je Instrument ein gemeinsamer
Faktor: Der Median der Zonen-Spitzen liegt bei PEAK_NOMINAL (0,65), Ausreißer-Zonen werden bei LIMIT_PEAK
begrenzt. `gain` (eng, 0,9 bis 1,1) gleicht die mittlere Lautheit zwischen den Instrumenten aus.
Sustain-Instrumente bekommen eine Schleife im gehaltenen Teil: Schleifenpunkte auf aufsteigenden
Nulldurchgängen, nur wenn die Kreuzkorrelation der Fenster mindestens LOOP_MIN beträgt.

Dateinamen: assets/samples/vcsl/inst/<id>/<note>.wav, note = c, cs, d, ... mit Oktave (c3 = MIDI 48, wie der Rest).

Auswahl (Instrumente, Ordner in der VCSL, Anschlagstärke-Muster, Bereich, Raster, Schnitt) steht unten in
INSTRUMENTS. Ein Lauf ohne --only schreibt alles neu (src/instruments-vcsl.js inklusive).

Aufruf aus dem Projektwurzelordner:
  python3 -I tools/vcsl-instruments.py --clone <blobloser VCSL-Klon> --raw <leerer Ordner für Rohdateien>

Die Rohdateien sind fremde Daten: sie werden nur gelesen (git show, ffmpeg), nie ausgeführt.
"""
import argparse
import collections
import hashlib
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
PEAK_NOMINAL = 0.65  # Median-Spitze der Zonen eines Instruments; mit gain etwa 0,6–0,7 (vel 1)
LIMIT_PEAK = 0.88  # Zonen darüber werden begrenzt (vor gain): Reserve, damit gain bis 1,1 nicht übersteuert
REL_MIN, REL_MAX = 0.9, 1.1  # Lautheitsausgleich zwischen den Instrumenten (RMS), eng begrenzt
# Ersatzklang der Engine, solange das Instrument lädt (ids aus src/instruments.js)
FALLBACK = {'vc-grand': 'piano', 'vc-harfe': 'pluck', 'vc-cembalo': 'pluck', 'vc-vibrafon': 'bell',
            'vc-handglocken': 'bell', 'vc-psalter': 'pluck', 'vc-fmpiano': 'piano', 'vc-clavisynth': 'piano',
            'vc-orgel': 'organ', 'vc-blockfloete': 'flute', 'vc-okarina': 'flute', 'vc-saxophon': 'lead',
            'vc-strumstick': 'pluck'}
LOOP_MIN = 0.97  # Mindestkorrelation der Schleifenfenster
LOOP_MIN_LEN = 0.4  # s
PITCH_TOL = 35.0  # Cent, die gemessene Tonhöhe muss zum Ziel-Ton passen
MAX_FILE = 600_000
MAX_TOTAL = 30_000_000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
FILE_NAMES = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b']

CH = 'Chordophones/'
ID = 'Idiophones/Struck Idiophones/'
IDP = 'Idiophones/Plucked Idiophones/'
AE = 'Aerophones/'
EL = 'Electrophones/TX81Z/'

# Auswahlliste. folder: Ordner in der VCSL (ohne Unterordner), pick: Regex auf den Dateinamen (eine Anschlagstärke),
# lo/hi: MIDI-Bereich, step: Rasterabstand in Halbtönen, cap: größte Länge in s, sustain: Schleife nötig.
# Nicht aufgenommen, weil der Ton-Raster nicht hält (Lücken über 4 Halbtöne): Marimba (nur C/G/B/F, bis 8 HT),
# Xylofon (nur G/C, bis 7 HT), Klavier Yamaha (nur C/G, bis 7 HT), Mundharmonika (Akkordtöne, bis 8 HT),
# Dan Tranh (Stimmung bis 22 ct daneben, Lücken bis 5 HT). Nicht aufgenommen, weil Namen und Messung sich
# widersprechen: Röhrenglockenspiel (Oktavversatz +60 bis +72 je Datei), Röhrenglocken (Oktavversatz, nur 5 Töne),
# Kalimba (Oktavversatz, kurzer Anschlag). Harfe, Vibrafon und Psalter sind im Original diatonisch bzw. nur weiße
# Tasten; die Zonen liegen dort höchstens 4 HT auseinander, weil die Quelle keine Zwischentöne hat.
# Keine Quelle in der VCSL: Celesta, Akkordeon, Harmonium, Klarinette, Blech, Gitarre (Zupfinstrument: Strumstick).
# Nicht gewählt wegen unklarem Lizenzvermerk (Info.txt): Pfeifenorgel (Ivy Audio, Weitergabe durch Versilian),
# Klavier Knight (Ivy Audio, VSCO 2 Pro). Die Orgel ist die Renaissance-Orgel (kein Vermerk).
INSTRUMENTS = [
    dict(id='vc-grand', label='Konzertflügel', category='chords', release=0.4, sustain=False,
         folder=CH + 'Zithers/Grand Piano, Steinway B/NoSus', pick=r'_vl3_rr1\.wav$', lo=45, hi=81, step=4, cap=2.0),
    dict(id='vc-harfe', label='Konzertharfe', category='chords', release=0.8, sustain=False,
         folder=CH + 'Composite Chordophones/Concert Harp', pick=[r'_mf1\.wav$', r'_f1\.wav$'], lo=52, hi=84, step=3, cap=2.0),
    dict(id='vc-cembalo', label='Cembalo', category='chords', release=0.5, sustain=False,
         folder=CH + 'Zithers/Harpsichord, Italian/Sustains/stop1', pick=r'Harpsichord_stop1_', lo=45, hi=81, step=3, cap=2.0),
    dict(id='vc-vibrafon', label='Vibrafon', category='chords', release=1.0, sustain=False,
         folder=ID + 'Vibraphone/Soft Mallets', pick=[r'_v2_rr1_Main\.wav$', r'_v1_rr1_Main\.wav$'], lo=45, hi=88, step=3, cap=2.0),
    dict(id='vc-handglocken', label='Handglocken', category='synth', release=1.0, sustain=False,
         folder=ID + 'Hand Chimes', pick=r'sus_', lo=48, hi=84, step=3, cap=2.0),
    dict(id='vc-psalter', label='Psalter', category='chords', release=0.6, sustain=False,
         folder=CH + 'Zithers/Psaltery, Bowed and Plucked/Pluck', pick=r'Pluck_rr1', lo=69, hi=88, step=3, cap=1.8),
    dict(id='vc-fmpiano', label='FM-Piano', category='synth', release=0.3, sustain=False,
         folder=EL + 'FM Piano', pick=r'_vl2\.wav$', lo=45, hi=81, step=4, cap=2.0),
    dict(id='vc-clavisynth', label='Clavisynth', category='synth', release=0.3, sustain=False,
         folder=EL + 'Clavisynth', pick=r'_vl2\.wav$', lo=45, hi=81, step=4, cap=2.0),
    dict(id='vc-orgel', label='Orgel', category='synth', release=0.12, sustain=True,
         folder=AE + 'Edge-blown Aerophones/Renaissance Organ/Full', pick=r'Room_', lo=36, hi=72, step=4, cap=2.5),
    dict(id='vc-blockfloete', label='Altblockflöte', category='synth', release=0.12, sustain=True,
         folder=AE + 'Edge-blown Aerophones/Baroque Alto Recorder/Sustain', pick=r'rr1_Main', lo=65, hi=88, step=3, cap=2.5),
    dict(id='vc-okarina', label='Okarina', category='synth', release=0.12, sustain=True,
         folder=AE + 'Edge-blown Aerophones/Ocarina, Typical/Sustains/Sus', pick=r'StdOcarina_Sus_', lo=69, hi=85, step=2, cap=2.5),
    dict(id='vc-saxophon', label='Tenorsaxophon', category='synth', release=0.2, sustain=True,
         folder=AE + 'Reed Aerophones/Tenor Saxophone/Non-Vibrato', pick=r'vl3_rr1', lo=46, hi=79, step=3, cap=2.5),
    dict(id='vc-strumstick', label='Strumstick', category='chords', release=0.6, sustain=False,
         folder=CH + 'Composite Chordophones/Strumstick/Finger', pick=r'Str3_Main_.*vl2_rr1', lo=64, hi=83, step=3, cap=1.5),
]


def note_name(midi):
    return f'{NAMES[midi % 12]}{midi // 12 - 1}'


def file_note(midi):
    return f'{FILE_NAMES[midi % 12]}{midi // 12 - 1}'


def nominal_midi(basename):
    """Oktave aus dem VCSL-Dateinamen (nur Diagnose, die Zone folgt der Messung)."""
    hits = re.findall(r'(?<![A-Za-z])([A-G])(#?)(-?\d)(?!\d)', basename)
    if not hits:
        return None
    letter, sharp, octave = hits[-1]
    base = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[letter] + (1 if sharp else 0)
    return (int(octave) + 1) * 12 + base


def load_names(clone):
    """Dateiliste des Klons (nur Pfade, keine Blobs)."""
    out = subprocess.run(['git', '-C', clone, 'ls-tree', '-r', '--name-only', 'HEAD'],
                         capture_output=True, text=True, check=True).stdout
    return [n for n in out.splitlines() if n.lower().endswith('.wav')]


def fetch(clone, path, rawdir, tag):
    """Rohdatei holen; der Name enthält den Pfad-Hash, damit nie eine alte Datei greift."""
    h = hashlib.sha1(path.encode('utf-8')).hexdigest()[:10]
    dst = os.path.join(rawdir, f'{tag}-{h}.wav')
    if not os.path.exists(dst):
        data = subprocess.run(['git', '-C', clone, 'show', f'HEAD:{path}'], capture_output=True, check=True).stdout
        with open(dst, 'wb') as f:
            f.write(data)
    return dst


def decode(path):
    """ffmpeg -> float64, stereo, 44,1 kHz."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le',
                        '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype='<f4').reshape(-1, 2).astype(np.float64)


def rms(v):
    return math.sqrt(float(np.mean(v ** 2))) if len(v) else 0.0


def to_mono(x):
    """Mitte; bei Gegenphase (Mitte schwach) der lautere Kanal."""
    l, r = x[:, 0], x[:, 1]
    mid = (l + r) / 2
    if rms(mid) >= 0.7 * max(rms(l), rms(r)):
        return mid
    return l if rms(l) >= rms(r) else r


def yin_f0(x, fmin=60.0, fmax=2400.0, w=2048, thr=0.12):
    """Grundtonschätzung nach YIN (de Cheveigné & Kawahara 2002) für ein Fenster."""
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


def measure_pitch(x):
    """Gemessener Ton (MIDI, Abweichung in Cent). Drei Fenster (100, 300, 500 ms nach dem Anschlag); mindestens
    zwei müssen sich um höchstens 30 Cent einig sein. Der Ton muss auf PITCH_TOL genau zu einer Halbtonstufe passen."""
    peak = np.max(np.abs(x))
    if peak <= 0:
        return None
    onset = int(np.argmax(np.abs(x) >= 0.1 * peak))
    fs = []
    for dt in (0.1, 0.3, 0.5):
        f = yin_f0(x[onset + int(dt * SR):], w=4096)
        if f is not None:
            fs.append(f)
    good = [f for f in fs if sum(abs(1200 * math.log2(f / g)) <= 30 for g in fs) >= 2]
    if len(good) < 2:
        return None
    f = math.exp(sum(math.log(g) for g in good) / len(good))
    m = round(69 + 12 * math.log2(f / 440.0))
    cents = 1200 * math.log2(f / (440.0 * 2 ** ((m - 69) / 12)))
    if abs(cents) > PITCH_TOL:
        return None
    return m, cents


def trim(x, cap_s):
    """Stille vorn und hinten weg (-50 dB), Länge höchstens cap_s, sanfter Fade am Ende."""
    env = np.abs(x)
    peak = env.max()
    idx = np.nonzero(env >= peak * 10 ** (-50 / 20))[0]
    start = max(0, idx[0] - int(0.002 * SR))
    end = min(len(x), idx[-1] + int(0.01 * SR))
    y = x[start:end].copy()
    cap = int(cap_s * SR)
    if len(y) > cap:
        y = y[:cap]
        fade = int(0.15 * SR)
    else:
        fade = int(0.02 * SR)
    fade = min(fade, len(y) // 4)
    if fade > 0:
        y[-fade:] *= np.cos(np.linspace(0, math.pi / 2, fade)) ** 2
    fin = min(int(0.0005 * SR), len(y) // 4)
    if fin > 0:
        y[:fin] *= np.linspace(0, 1, fin)
    return y


def find_loop(x):
    """Schleife im gehaltenen Teil: Anfang und Ende auf aufsteigenden Nulldurchgängen, Fenster korrelieren.
    Liefert (Start, Ende) in Samples oder None. Ende bleibt vor dem Fade."""
    n = len(x)
    W = int(0.05 * SR)
    if n < int(1.0 * SR):
        return None
    up = np.nonzero((x[:-1] < 0) & (x[1:] >= 0))[0] + 1
    starts = up[(up >= int(0.25 * SR)) & (up <= int(0.5 * n)) & (up + W <= n)]
    ends = up[(up >= int(0.4 * SR)) & (up <= n - int(0.35 * SR) - W)]
    if len(starts) == 0 or len(ends) == 0:
        return None

    def windows(idx):
        a = np.stack([x[i:i + W] for i in idx])
        a = a - a.mean(axis=1, keepdims=True)
        return a, np.linalg.norm(a, axis=1)

    a, na = windows(starts)
    b, nb = windows(ends)
    if (na < 1e-9).any() or (nb < 1e-9).any():
        return None
    c = (a @ b.T) / (na[:, None] * nb[None, :])
    length = ends[None, :] - starts[:, None]
    ratio = nb[None, :] / na[:, None]
    ok = (length >= int(LOOP_MIN_LEN * SR)) & (np.abs(ratio - 1) <= 0.08) & (c >= LOOP_MIN)
    if not ok.any():
        return None
    score = np.where(ok, length, -1)
    i, j = np.unravel_index(np.argmax(score), score.shape)
    return int(starts[i]), int(ends[j])


def write_wav(path, y):
    pcm = np.clip(np.round(y * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def js_str(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def zone_line(z):
    parts = [f"midi: {z['midi']}", f"file: {js_str(z['file'])}"]
    if 'loopStart' in z:
        parts += [f"loopStart: {z['loopStart']:.6f}", f"loopEnd: {z['loopEnd']:.6f}"]
    return '      { ' + ', '.join(parts) + ' },'


def instrument_block(inst, zones, gain, source):
    lines = [
        '  {',
        f"    id: {js_str(inst['id'])}, label: {js_str(inst['label'])}, category: {js_str(inst['category'])}, "
        "// chords | synth | bass",
        f"    release: {inst['release']},            // Ausklang in s nach Notenende",
        f"    sustain: {'true' if inst['sustain'] else 'false'},           // true = Ton hält, solange die Note dauert",
        f"    gain: {gain:.2f},                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain",
    ]
    if inst['id'] in FALLBACK:
        lines.append(f"    fallback: {js_str(FALLBACK[inst['id']])},  // Ersatzklang, solange das Instrument lädt")
    lines.append('    zones: [')
    lines += [zone_line(z) for z in zones]
    lines += [
        '    ],',
        f"    license: 'CC0', licenseUrl: {js_str(LICENSE_URL)}, origin: {js_str(ORIGIN)},",
        f"    source: {js_str(source)},",
        '  },',
    ]
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--clone', required=True, help='blobloser VCSL-Klon')
    ap.add_argument('--raw', required=True, help='leerer Ordner für Rohdateien (fremde Daten, nur lesen)')
    ap.add_argument('--only', default='', help='nur diese ids (Probelauf; schreibt keine JS-Datei)')
    args = ap.parse_args()
    only = {s for s in args.only.split(',') if s}
    selected = [i for i in INSTRUMENTS if not only or i['id'] in only]
    names = load_names(args.clone)
    os.makedirs(args.raw, exist_ok=True)
    rejects = []
    built = []  # (inst, zones[{midi, note, y, loop}], peak_scale, rms_scaled, gap-report)
    for inst in selected:
        folder = inst['folder']
        pats = inst['pick'] if isinstance(inst['pick'], list) else [inst['pick']]  # Priorität: erste Schicht zuerst
        cands = []
        for n in sorted(names):
            if not n.startswith(folder + '/') or '/' in n[len(folder) + 1:]:
                continue
            prio = next((k for k, p in enumerate(pats) if re.search(p, os.path.basename(n))), None)
            if prio is not None:
                cands.append((n, prio))
        if not cands:
            rejects.append((inst['label'], '-', 'kein Treffer im Ordner'))
            continue
        measured, offs = {}, collections.Counter()
        per_file = []
        for path, prio in cands:
            base = os.path.basename(path)
            raw = fetch(args.clone, path, args.raw, inst['id'])
            x = to_mono(decode(raw))
            res = measure_pitch(x)
            if res is None:
                rejects.append((inst['label'], base, 'Tonhöhe unsicher (YIN)'))
                continue
            m, cents = res
            nom = nominal_midi(base)
            if nom is not None:
                offs[m - nom] += 1
            per_file.append((path, m, cents, nom, prio))
        mode_off = offs.most_common(1)[0][0] if offs else None
        if only:
            for path, m, cents, nom, prio in sorted(per_file, key=lambda t: t[1]):
                off = '' if nom is None else f'{m - nom:+d}'
                print(f"    gemessen {note_name(m):4} {cents:+5.1f} ct  Off {off:>4}  Schicht {prio}  {os.path.basename(path)[:60]}")
        for path, m, cents, nom, prio in per_file:
            base = os.path.basename(path)
            if nom is not None and mode_off is not None and (m - nom) != mode_off and (m - nom - mode_off) % 12 == 0:
                rejects.append((inst['label'], base, f'Oktavabweichung {m - nom:+d} gegen Ordner-Mehrheit {mode_off:+d} (YIN-Verdacht)'))
                continue
            if m < inst['lo'] - 1 or m > inst['hi'] + 1:
                continue
            prev = measured.get(m)
            if prev is None or (prio, abs(cents)) < (prev[2], abs(prev[1])):
                measured[m] = (path, cents, prio)
        # Raster: je Schritt der nächste gemessene Ton (Toleranz ±1 Halbton)
        zones_m, used = [], set()
        for g in range(inst['lo'], inst['hi'] + 1, inst['step']):
            for cand in (g, g + 1, g - 1):
                if cand in measured and cand not in used and inst['lo'] <= cand <= inst['hi']:
                    zones_m.append(cand)
                    used.add(cand)
                    break
        if len(zones_m) < 3:
            rejects.append((inst['label'], '-', f'nur {len(zones_m)} Zonen im Bereich, Instrument verworfen'))
            continue
        zones = []
        for m in sorted(zones_m):
            path, cents, _ = measured[m]
            x = to_mono(decode(fetch(args.clone, path, args.raw, inst['id'])))
            y = trim(x, inst['cap'])
            loop = None
            if inst['sustain']:
                loop = find_loop(y)
            zones.append(dict(midi=m, note=file_note(m), y=y, loop=loop, src=path, cents=cents))
        gaps = [b['midi'] - a['midi'] for a, b in zip(zones, zones[1:])]
        missing = [m for m in range(zones[0]['midi'], zones[-1]['midi'] + 1) if m not in used and m not in measured]
        built.append((inst, zones, gaps))
        print(f"{inst['label']:16} {len(zones):2d} Zonen  {note_name(zones[0]['midi'])}–{note_name(zones[-1]['midi'])}"
              f"  max. Abstand {max(gaps) if gaps else 0} HT  Schleifen {sum(1 for z in zones if z['loop'])}", flush=True)
        for z in zones:
            print(f"    {note_name(z['midi']):4} {os.path.basename(z['src'])[:60]:60} {z['cents']:+5.1f} ct"
                  f"  {len(z['y']) / SR:4.2f} s {'loop' if z['loop'] else ''}", flush=True)

    # Skalierung je Instrument: Median der Spitzenpegel auf PEAK_NOMINAL (ein Faktor für alle Zonen)
    scaled = []
    for inst, zones, gaps in built:
        peaks = np.array([np.max(np.abs(z['y'])) for z in zones])
        s = PEAK_NOMINAL / float(np.median(peaks))
        rms_med = float(np.median([rms(z['y'] * s) for z in zones]))
        scaled.append((inst, zones, gaps, s, rms_med))
    ref = float(np.median([t[4] for t in scaled]))
    final = []
    for inst, zones, gaps, s, rms_med in scaled:
        gain = round(min(max(ref / rms_med, REL_MIN), REL_MAX), 2)  # Lautheitsausgleich, eng begrenzt
        final.append((inst, zones, gaps, s, gain))

    if only:
        print('\nProbelauf (--only): keine Dateien geschrieben.')
        for label, base, why in rejects:
            print(f'  verworfen {label}: {base}: {why}')
        return

    inst_root = os.path.join(ROOT, 'assets', 'samples', 'vcsl', 'inst')
    if os.path.isdir(inst_root):
        for dname in os.listdir(inst_root):
            p = os.path.join(inst_root, dname)
            for f in os.listdir(p) if os.path.isdir(p) else []:
                os.remove(os.path.join(p, f))
    blocks, total, report = [], 0, []
    for inst, zones, gaps, s, gain in final:
        out_dir = os.path.join(inst_root, inst['id'])
        os.makedirs(out_dir, exist_ok=True)
        zone_out, size_sum, limited = [], 0, 0
        for z in zones:
            y = z['y'] * s
            pk = float(np.max(np.abs(y)))
            if pk > LIMIT_PEAK:  # Ausreißer-Zone begrenzen, sonst übersteuert gain
                y = y * (LIMIT_PEAK / pk)
                limited += 1
            dst = os.path.join(out_dir, z['note'] + '.wav')
            write_wav(dst, y)
            size = os.path.getsize(dst)
            if size > MAX_FILE:
                sys.exit(f'{dst}: zu groß ({size} Byte)')
            size_sum += size
            rel = os.path.relpath(dst, ROOT).replace(os.sep, '/')
            zone = {'midi': z['midi'], 'file': rel}
            if z['loop']:
                zone['loopStart'] = round(z['loop'][0] / SR, 6)
                zone['loopEnd'] = round(z['loop'][1] / SR, 6)
            zone_out.append(zone)
        total += size_sum
        folder_url = f"{REPO}/tree/{COMMIT}/{quote(inst['folder'])}"
        blocks.append(instrument_block(inst, zone_out, gain, folder_url))
        loops = sum(1 for z in zones if z['loop'])
        report.append((inst['label'], inst['id'], len(zones), note_name(zones[0]['midi']),
                       note_name(zones[-1]['midi']), max(gaps) if gaps else 0, loops, size_sum, gain,
                       round(PEAK_NOMINAL * gain, 2), limited))
    if total > MAX_TOTAL:
        sys.exit(f'Gesamtgröße {total} Byte über dem Limit')

    out = os.path.join(ROOT, 'src', 'instruments-vcsl.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// VCSL-Instrumente (CC0) als Sampler-Zonen. Erzeugt von tools/vcsl-instruments.py.\n')
        f.write('export const SAMPLED_INSTRUMENTS = [\n')
        f.write('\n'.join(blocks) + '\n')
        f.write('];\n')

    print()
    for label, iid, n, lo_n, hi_n, gap, loops, size, gain, peak, lim in report:
        print(f'{label:16} {iid:18} {n:2d} Zonen  {lo_n}–{hi_n}  max. Abstand {gap} HT  '
              f'Schleifen {loops}  {size / 1000:7.1f} kB  gain {gain}  Spitze {peak}  begrenzt {lim}')
    print(f'\nGesamt: {total / 1e6:.2f} MB in {sum(r[2] for r in report)} Dateien')
    print('Verworfen:')
    for label, base, why in rejects:
        print(f'  {label}: {base}: {why}')


if __name__ == '__main__':
    main()
