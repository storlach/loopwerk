#!/usr/bin/env python3
"""Echte Gitarren-Aufnahmen für Loopwerk aufbereiten (Lizenz: CC0, siehe src/catalog-guitar.js).

Quellen:
  - Karoryfer Lecolds „Black And Green Guitars“ (CC0 1.0, LICENSE im Repo):
    https://github.com/sfzinstruments/karoryfer.black-and-green-guitars (Commit b3b3249)
    green = Gretsch Anniversary (twang, mf, rr1), black = Höfner Club (staccato rr1, hinter dem Steg)
  - Sonic Pi etc/samples (CC0 laut etc/samples/README.md): guit_harmonics.flac, guit_e_slide.flac

Aufruf (Downloads in einen eigenen, leeren Ordner; nichts daraus ausführen):
  git clone --filter=blob:none --no-checkout https://github.com/sfzinstruments/karoryfer.black-and-green-guitars <klon>
  curl -o <ordner>/guit_harmonics.flac https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/main/etc/samples/guit_harmonics.flac
  curl -o <ordner>/guit_e_slide.flac   https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/main/etc/samples/guit_e_slide.flac
  python3 -I tools/guitar-import.py --clone <klon> --sonicpi <ordner>
  node tools/pack-assets.cjs

Aufbereitung: mono, 44,1 kHz, 16 Bit; Stille vor dem Einsatz bis 2 ms entfernt; auf feste Länge gekürzt und
weich ausgeblendet; Spitzenpegel angeglichen (Instrument-Zonen 0,6, sonst 0,9 – die App gleicht je Kategorie an).
"""
import argparse
import os
import subprocess
import wave

import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTE = {'c': 0, 'db': 1, 'd': 2, 'eb': 3, 'e': 4, 'f': 5, 'gb': 6, 'g': 7, 'ab': 8, 'a': 9, 'bb': 10, 'b': 11}
# Zonen: E2 G2 A2 C3 D3 E3 G3 A3 C4 D4 E4 G4 A4 C5 E5 (Karoryfer-Namen eine Oktave höher: e3 = MIDI 40)
ZONES = ['e3', 'g3', 'a3', 'c4', 'd4', 'e4', 'g4', 'a4', 'c5', 'd5', 'e5', 'g5', 'a5', 'c6', 'e6']


def decode(data):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', str(SR), 'pipe:1'],
                         input=data, capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype=np.float32).astype(np.float64)


def prepare(x, seconds, fade, peak):
    pk = np.abs(x).max()
    on = int(np.argmax(np.abs(x) > pk * 0.01))
    x = x[max(0, on - int(0.002 * SR)):]
    n = min(len(x), int(seconds * SR))
    x = x[:n].copy()
    f = min(n, int(fade * SR))
    x[n - f:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f))
    return x * (peak / np.abs(x).max())


def write(rel, x):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'{rel}: {len(x) / SR:.2f} s, {os.path.getsize(path) // 1024} KB')


def blob(clone, path):
    return subprocess.run(['git', '-C', clone, 'show', f'HEAD:{path}'], capture_output=True, check=True).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--clone', required=True, help='blobloser Klon von karoryfer.black-and-green-guitars')
    ap.add_argument('--sonicpi', required=True, help='Ordner mit guit_harmonics.flac und guit_e_slide.flac')
    a = ap.parse_args()
    for z in ZONES:
        write(f'assets/samples/karoryfer/inst/kf-gretsch/{z}.wav',
              prepare(decode(blob(a.clone, f'Samples/green/ord/twang_{z}_mf_rr1.wav')), 2.2, 0.45, 0.6))
        write(f'assets/samples/karoryfer/inst/kf-hofner-kurz/{z}.wav',
              prepare(decode(blob(a.clone, f'Samples/black/stac/staccato_{z}_rr1.wav')), 0.6, 0.2, 0.6))
    write('assets/samples/karoryfer/fx/hofner-steg-a3.wav',
          prepare(decode(blob(a.clone, 'Samples/black/btb/btb_a3_rr1.wav')), 1.0, 0.15, 0.9))
    for name in ['guit_harmonics', 'guit_e_slide']:
        with open(os.path.join(a.sonicpi, f'{name}.flac'), 'rb') as f:
            write(f'assets/samples/sonicpi/{name}.wav', prepare(decode(f.read()), 4.0, 0.3, 0.9))


if __name__ == '__main__':
    main()
