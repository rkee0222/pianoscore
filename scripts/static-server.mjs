// Minimal static file server for E2E only (the app itself needs no server).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const PORT = Number(process.env.E2E_PORT || 4173);

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    let file = join(root, path);
    if (!existsSync(file)) file = join(root, 'index.html');
    const body = await readFile(file);
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${root} on ${PORT}`));
