// PostToolUse-Hook: prüft nach jeder Änderung an einer JS-Datei die Syntax.
// Exit 2 meldet den Fehler an Claude zurück, damit er sofort behoben wird.
import { spawnSync } from 'node:child_process';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let file = '';
try {
  const data = JSON.parse(input);
  file = data.tool_input?.file_path || data.tool_response?.filePath || '';
} catch {
  process.exit(0);
}
if (!/\.(m|c)?js$/.test(file)) process.exit(0);

const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (r.status !== 0) {
  process.stderr.write(`Syntaxfehler in ${file}:\n${r.stderr}`);
  process.exit(2);
}
