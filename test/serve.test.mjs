// The preview server must only hand out the website's own files and must survive bad requests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';

const PORT = 5391;
let server;
// Raw request so that paths like "/../x" reach the server exactly as written.
const get = (path, method = 'GET') => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: PORT, path, method }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject);
  req.end();
});

before(async () => {
  server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT), HOST: '' } });
  await new Promise((resolve) => server.stdout.once('data', resolve));
});
after(() => server.kill());

test('serves the site with security headers', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  for (const path of ['/js/app.js', '/css/style.css', '/data/network.json', '/vendor/leaflet/leaflet.js']) assert.equal((await get(path)).status, 200, path);
});

test('keeps everything else private', async () => {
  const paths = ['/.git/config', '/.git/HEAD', '/package.json', '/scripts/serve.mjs', '/data/cache/geocode.json', '/data/source/stops.mjs', '/node_modules/leaflet/package.json', '/GUIDE.md',
    '/../../../../etc/passwd', '/js/..%2f..%2f.git%2fconfig', '/js/%2e%2e/.git/config', '/%252e%252e%252f.git%252fconfig', '/index.html%00', '/data/'];
  for (const path of paths) assert.equal((await get(path)).status, 404, path);
});

test('refuses anything but reading', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal((await get('/index.html', method)).status, 405, method);
});

test('survives malformed and oversized requests', async () => {
  assert.equal((await get('/%E0%A4%A')).status, 404);
  assert.equal((await get(`/${'a'.repeat(5000)}`)).status, 404);
  assert.equal((await get('/')).status, 200);
});
