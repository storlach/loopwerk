// Import per Link: Audiodateien direkt aus dem Netz holen (wenn der Server es dem Browser erlaubt).
// Streaming-Seiten wie YouTube geben ihre Dateien nicht heraus – dafür lässt sich der Ton eines anderen Tabs
// aufnehmen (am Computer in Chrome/Edge). Ein eingefügter Link (Strg+V) startet den Import direkt.

import { startTabCapture } from '../recorder.js';
import { channelsToBuffer } from '../own-sounds.js';

export const STREAMING = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|tiktok\.com|instagram\.com|vimeo\.com|deezer\.com|music\.apple\.com|twitch\.tv)$/i;
const AUDIO_EXT = /\.(wav|mp3|ogg|oga|opus|flac|m4a|aac|webm)$/i;

function fileName(url) {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  return last || 'Sound aus dem Netz';
}

export function mountLinkImport({ ui, importer, engine, own, store, arranger, shelf }) {
  const $ = (id) => document.getElementById(id);
  const pop = $('link-pop');
  const input = $('link-input');
  const go = $('link-go');
  const note = $('link-note');
  const capBtn = $('tab-capture');
  let target = null;
  let capture = null;
  // Tab-Ton aufnehmen geht nur am Computer (Chrome, Edge)
  const canCapture = !!navigator.mediaDevices?.getDisplayMedia;
  capBtn.hidden = !canCapture;

  function open(t = null, text = '') {
    target = t;
    pop.hidden = false;
    note.textContent = '';
    pop.dataset.mode = '';
    if (text) input.value = text;
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }
  function close() {
    if (capture) return; // während der Aufnahme bleibt das Feld offen
    pop.hidden = true;
    input.blur();
  }

  async function fetchLink(text) {
    let url;
    try { url = new URL(text.trim()); } catch { note.textContent = 'Das ist kein Link. Er beginnt mit https://'; return false; }
    if (!/^https?:$/.test(url.protocol)) { note.textContent = 'Nur Links mit http:// oder https:// gehen.'; return false; }
    if (STREAMING.test(url.hostname)) {
      pop.dataset.mode = 'streaming';
      note.textContent = canCapture
        ? 'YouTube und andere Streaming-Seiten geben ihre Dateien nicht heraus. Spiel das Video in einem anderen Tab ab und nimm seinen Ton auf.'
        : 'YouTube und andere Streaming-Seiten geben ihre Dateien nicht heraus. Am Computer (Chrome oder Edge) kannst du den Ton eines anderen Tabs aufnehmen.';
      return false;
    }
    go.disabled = true;
    note.textContent = 'Lädt …';
    try {
      let res;
      try { res = await fetch(url.href, { mode: 'cors' }); } catch { throw new Error('Der Server erlaubt das Laden aus dem Browser nicht. Lade die Datei herunter und ziehe sie auf eine Spur.'); }
      if (!res.ok) throw new Error(`Der Link liefert nichts (Fehler ${res.status}).`);
      const blob = await res.blob();
      const name = fileName(url);
      const type = blob.type || '';
      if (!type.startsWith('audio/') && !(AUDIO_EXT.test(name) && (!type || type === 'application/octet-stream'))) {
        throw new Error('Unter dem Link liegt keine Audiodatei. Nimm einen Link, der direkt auf eine WAV-, MP3- oder OGG-Datei zeigt.');
      }
      note.textContent = '';
      pop.hidden = true;
      await importer.importFiles([new File([blob], AUDIO_EXT.test(name) ? name : `${name}.audio`, { type: type || 'audio/mpeg' })], target);
      input.value = '';
      return true;
    } catch (err) {
      note.textContent = err.message;
      return false;
    } finally {
      go.disabled = false;
    }
  }

  async function toggleCapture() {
    if (capture) {
      const c = capture;
      capture = null;
      capBtn.textContent = '● Ton aus einem Tab aufnehmen';
      capBtn.setAttribute('aria-pressed', 'false');
      ui.status(null);
      try {
        const { chs, sampleRate } = await c.stop();
        const n = 1 + own.library.list().filter((s) => /^Tab-Aufnahme \d+$/.test(s.name)).length;
        const sample = await own.create({ name: `Tab-Aufnahme ${n}`, buffer: channelsToBuffer(chs, sampleRate), source: 'Tab-Aufnahme' });
        if (target) {
          const id = store.addClip(target.trackId, sample.id, target.startBeat, sample.lengthBeats);
          arranger.select(id);
        } else ui.arm(sample.id);
        shelf.reveal(sample.id);
        ui.flash(`„${sample.name}“ aufgenommen${target ? ' und eingesetzt' : ' – steht unter „Eigene“. Tippe oder klicke in eine Spur, um sie einzusetzen'}.`);
        pop.hidden = true;
      } catch (err) {
        note.textContent = err.message;
      }
      return;
    }
    try {
      note.textContent = 'Wähle im nächsten Fenster den Tab mit dem Video und hake „Tab-Audio teilen“ an.';
      capture = await startTabCapture(engine);
      capBtn.textContent = '■ Aufnahme beenden';
      capBtn.setAttribute('aria-pressed', 'true');
      note.textContent = 'Nimmt auf – spiel das Video im anderen Tab ab. Danach hier beenden.';
      ui.status('Tab-Ton wird aufgenommen …');
      capture.ended.then(() => { if (capture) toggleCapture(); });
    } catch (err) {
      capture = null;
      note.textContent = err.message;
    }
  }

  go.addEventListener('click', () => fetchLink(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fetchLink(input.value); }
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  capBtn.addEventListener('click', toggleCapture);
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-link-open]')) close();
  }, true);
  for (const b of document.querySelectorAll('[data-link-open]')) b.addEventListener('click', () => open());

  // Link irgendwo einfügen (nicht in einem Eingabefeld): gleich holen
  document.addEventListener('paste', (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    const text = (e.clipboardData?.getData('text') || '').trim();
    if (!/^https?:\/\/\S+$/.test(text)) return;
    e.preventDefault();
    open(null, text);
    fetchLink(text);
  });

  return { open, close, fetchLink };
}
