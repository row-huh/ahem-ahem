// Local preview server. Sends no-cache headers so edits always show up on reload.
// It only hands out the files the website itself needs, and only to this computer unless
// HOST is set (HOST=0.0.0.0 npm start lets a phone on the same wifi open it).
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Everything else in the folder (.git, scripts, source data, caches, node_modules) stays private.
const PUBLIC = [/^\/index\.html$/, /^\/(css|js)\/[\w-]+\.(css|js)$/, /^\/vendor\/leaflet\/(images\/)?[\w.-]+\.(css|js|png)$/, /^\/data\/(network|places)\.json$/];

// The same policy is repeated in index.html for hosts where we cannot set headers.
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' https://photon.komoot.io; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // origin only: OpenStreetMap's tile servers refuse requests that hide where they come from
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

function publicPath(url) {
  if (url.length > 512) return null;
  let path;
  try {
    path = decodeURIComponent(url.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  if (path === '/') path = '/index.html';
  return PUBLIC.some((re) => re.test(path)) ? path : null;
}

const server = createServer(async (req, res) => {
  const send = (status, body, extra = {}) => res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra }).end(req.method === 'HEAD' ? undefined : body);
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed', { Allow: 'GET, HEAD' });
    const path = publicPath(req.url);
    if (!path) return send(404, 'Not found');
    // realpath so a symlink inside the folder cannot point the server at a file outside it
    const file = await realpath(resolve(ROOT, `.${path}`));
    if (!file.startsWith(ROOT + sep)) return send(404, 'Not found');
    send(200, await readFile(file), { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  } catch {
    if (!res.headersSent) send(404, 'Not found');
  }
});
// Drop slow or stalled connections instead of letting them pile up.
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;
server.on('clientError', (err, socket) => socket.destroy());
server.listen(PORT, HOST, () => console.log(`Karachi Bus Guide: http://localhost:${PORT}`));
