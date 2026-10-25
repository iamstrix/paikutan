// Local soundboard preview. Ctrl+C stops the server. Optional: node sound/serve.mjs 8790
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = process.cwd(), port = Number(process.argv[2] || 8789);
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.md':'text/plain; charset=utf-8', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (name === '/') name = '/sound/index.html';
    if (name.endsWith('/')) name += 'index.html';
    const file = resolve(root, '.' + name);
    if (!file.startsWith(root + sep) || name.split('/').some(part => part.startsWith('.')) || !/^\/(sound\/|js\/|css\/|assets\/|index\.html$|play\.html$|favicon\.png$)/.test(name) || !types[extname(file)]) { res.writeHead(403); res.end(); return; }
    res.setHeader('Content-Type', types[extname(file)]); res.setHeader('Cache-Control','no-store');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Soundboard: http://127.0.0.1:${port}/sound/`));
