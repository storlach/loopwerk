// Datei zum Speichern anbieten. Im Artifact über die Capability `downloads` (die Person bestätigt);
// Formate, die dort nicht erlaubt sind (WAV, MP3), werden in eine ZIP-Datei gepackt. Lokal: normaler Download.

import { makeZip } from '../zip.js';

const ARTIFACT_OK = ['json', 'txt', 'md', 'csv', 'zip', 'pdf', 'png', 'jpg', 'webm', 'mp4'];

export async function saveFile(filename, blob) {
  const ext = filename.split('.').pop().toLowerCase();
  if (window.claude?.use) {
    const downloads = await window.claude.use('downloads');
    if (!downloads) throw Object.assign(new Error('Speichern ist in dieser Ansicht nicht möglich.'), { code: 'unavailable' });
    if (ARTIFACT_OK.includes(ext)) {
      await downloads.save({ filename, data: blob });
      return { filename, zipped: false };
    }
    const zipName = filename.replace(/\.[^.]+$/, '') + '.zip';
    const zip = makeZip([{ name: filename, data: new Uint8Array(await blob.arrayBuffer()) }]);
    await downloads.save({ filename: zipName, data: zip });
    return { filename: zipName, zipped: true };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { filename, zipped: false };
}

export const safeName = (name, fallback = 'Loopwerk-Projekt') =>
  (name || fallback).replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || fallback;
