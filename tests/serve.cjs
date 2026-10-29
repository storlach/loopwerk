// Mini-Server für lokale Tests. Umhüllt index.html wie die Artifact-Veröffentlichung mit einem HTML-Gerüst.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const SKELETON_HEAD = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>';

function start(port = 0) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    let body = fs.readFileSync(file);
    if (p === '/index.html') body = SKELETON_HEAD + body + '</body></html>';
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { start };
if (require.main === module) start(Number(process.argv[2]) || 8080).then((s) => console.log('http://127.0.0.1:' + s.address().port));
