// Builds data/network.json from the hand-authored stop and line lists.
//   1. Places each stop: looks it up in OpenStreetMap (Nominatim + the bus stops in
//      data/cache/osm_stops.csv) and accepts a match only if it is close to the rough
//      position we wrote by hand. Otherwise the rough position is kept and the stop is
//      marked "approximate".
//   2. Draws each line along real roads using OSRM. A leg that comes back as an
//      implausible detour falls back to a straight segment.
// Network answers are cached in data/cache so re-runs are offline and repeatable.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { STOPS } from '../data/source/stops.mjs';
import { LINES, FARES } from '../data/source/lines.mjs';
import { haversine } from '../js/geo.js';

const ROOT = new URL('..', import.meta.url).pathname;
const UA = 'karachi-bus-planner-prototype/0.1 (data build script)';
const ACCEPT_M = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadCache(name) {
  const p = `${ROOT}data/cache/${name}`;
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}
function saveCache(name, obj) {
  writeFileSync(`${ROOT}data/cache/${name}`, JSON.stringify(obj));
}

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(40000) });
      if (res.ok) return await res.json();
    } catch {}
    await sleep(2000 * (i + 1));
  }
  return null;
}

const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

function loadOsmStops() {
  const p = `${ROOT}data/cache/osm_stops.csv`;
  if (!existsSync(p)) return [];
  const [head, ...rows] = readFileSync(p, 'utf8').trim().split('\n');
  const cols = head.split('|');
  return rows
    .map((r) => Object.fromEntries(r.split('|').map((v, i) => [cols[i], v])))
    .filter((r) => r.name && r['@lat'])
    .map((r) => ({ name: r.name, n: ` ${norm(r.name)} `, lat: +r['@lat'], lng: +r['@lon'] }));
}

async function placeStops() {
  const cache = loadCache('geocode.json');
  const osmStops = loadOsmStops();
  const placed = {};
  for (const [id, [en, ur, lat, lng, hint, mode]] of Object.entries(STOPS)) {
    const prior = { lat, lng };
    if (mode === 'rough') { placed[id] = { name: [en, ur], lat, lng, conf: 'approx' }; continue; }
    const queries = [...new Set([hint, en.replace(/\(.*?\)/g, '').trim()].filter(Boolean))];
    const candidates = [];
    for (const q of queries) {
      if (!(q in cache)) {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=pk&bounded=1&viewbox=66.8,25.2,67.55,24.7&q=${encodeURIComponent(q + ', Karachi')}`;
        const res = await getJson(url);
        if (res) cache[q] = res.map((r) => ({ lat: +r.lat, lng: +r.lon, name: r.display_name.split(',')[0] }));
        saveCache('geocode.json', cache);
        await sleep(1100);
      }
      for (const c of cache[q] || []) candidates.push({ ...c, via: 'search' });
    }
    const key = ` ${norm(en)} `;
    for (const s of osmStops) if (s.n.includes(key)) candidates.push({ lat: s.lat, lng: s.lng, name: s.name, via: 'bus stop' });

    let best = null;
    for (const c of candidates) {
      const d = haversine(prior, c);
      if (!best || d < best.d) best = { ...c, d };
    }
    if (best && best.d <= ACCEPT_M) {
      placed[id] = { name: [en, ur], lat: best.lat, lng: best.lng, conf: 'matched', matched: best.name, moved: Math.round(best.d) };
    } else {
      placed[id] = { name: [en, ur], lat, lng, conf: 'approx', nearest: best ? `${best.name} (${Math.round(best.d)} m away)` : null };
    }
  }
  return placed;
}

// Douglas-Peucker on [lat, lng] points, tolerance in metres.
function simplify(pts, tol = 8) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const kx = 111320 * Math.cos((a[0] * Math.PI) / 180);
  const ky = 110540;
  const ax = a[1] * kx, ay = a[0] * ky, bx = b[1] * kx, by = b[0] * ky;
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const px = pts[i][1] * kx, py = pts[i][0] * ky;
    const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

const lineLength = (pts) => pts.slice(1).reduce((sum, p, i) => sum + haversine({ lat: pts[i][0], lng: pts[i][1] }, { lat: p[0], lng: p[1] }), 0);

// Nearest position on a polyline to a point, searching from vertex `start` onwards.
function project(pts, p, start = 0) {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180), ky = 110540;
  let best = { d: Infinity, i: start, pt: pts[start] };
  for (let i = start; i < pts.length - 1; i++) {
    const ax = (pts[i][1] - p.lng) * kx, ay = (pts[i][0] - p.lat) * ky;
    const bx = (pts[i + 1][1] - p.lng) * kx, by = (pts[i + 1][0] - p.lat) * ky;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9;
    const f = Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / len2));
    const d = Math.hypot(ax + f * (bx - ax), ay + f * (by - ay));
    if (d < best.d) best = { d, i, pt: [pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])] };
  }
  return best;
}

const ROUTERS = {
  car: 'https://router.project-osrm.org/route/v1/driving',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
};

// The point `metres` along a polyline, or null if the line is shorter than that.
function pointAlong(pts, metres) {
  for (let i = 1; i < pts.length; i++) {
    const d = haversine({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] });
    if (d >= metres) { const f = metres / d; return [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])]; }
    metres -= d;
  }
  return null;
}

async function routeThrough(cache, pts, profile) {
  const key = `${profile}:${pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('>')}`;
  if (!(key in cache)) {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await getJson(`${ROUTERS[profile]}/${coords}?overview=false&steps=true&geometries=geojson&continue_straight=false`);
    await sleep(1200);
    if (!res?.routes?.[0]) return null;
    cache[key] = res.routes[0].legs.map((leg) => ({
      d: Math.round(leg.distance),
      g: simplify(leg.steps.flatMap((s) => s.geometry.coordinates.map(([x, y]) => [y, x]))).map(([y, x]) => [+y.toFixed(5), +x.toFixed(5)]),
    }));
    saveCache('routes.json', cache);
  }
  return cache[key];
}

// Draws one line along roads. Only confidently placed stops steer the road route.
// A driving route is preferred. Where it makes a long detour (a stop placed on the far side
// of a divided road forces a U-turn) the walking route for that leg is used instead, since
// it ignores travel direction. A stop that still drags the line off course is dropped as a
// waypoint and placed onto the finished line afterwards.
async function drawLine(cache, line, stops, flags) {
  const pts = line.stops.map((id) => stops[id]);
  const last = pts.length - 1;
  const flagsAtStart = flags.length;
  const anchor = pts.map((p, i) => i === 0 || i === last || p.conf === 'matched');
  const forced = pts.map(() => false); // stops the line demonstrably has to pass
  let path = null;
  for (let round = 0; round < 12; round++) {
    const idx = pts.map((_, i) => i).filter((i) => anchor[i]);
    const via = idx.map((i) => pts[i]);
    const car = await routeThrough(cache, via, 'car');
    const foot = await routeThrough(cache, via, 'foot');
    if (!car && !foot) { console.warn(`! could not route ${line.id}; drawn straight`); break; }
    const isBad = (leg, k) => {
      if (!leg || leg.g.length < 2) return true;
      const straight = haversine(pts[idx[k]], pts[idx[k + 1]]);
      return leg.d > 2.2 * straight && leg.d - straight > 1200;
    };
    const legs = idx.slice(0, -1).map((_, k) => (!isBad(car?.[k], k) ? car[k] : !isBad(foot?.[k], k) ? foot[k] : null));
    let dropped = false;
    legs.forEach((leg, k) => {
      if (leg) return;
      for (const i of [idx[k], idx[k + 1]]) if (i !== 0 && i !== last && anchor[i]) { anchor[i] = false; dropped = true; }
    });
    // A waypoint the route drives out to and straight back from is off the bus road.
    for (let k = 1; k < idx.length - 1; k++) {
      const [into, out] = [legs[k - 1], legs[k]];
      if (!into || !out || !anchor[idx[k]] || forced[idx[k]]) continue;
      const ahead = pointAlong(out.g, 150);
      if (ahead && project(into.g, { lat: ahead[0], lng: ahead[1] }).d < 60) { anchor[idx[k]] = false; dropped = true; }
    }
    if (!dropped) {
      path = legs.flatMap((leg, k) => {
        if (!leg) flags.push(`${line.id}: ${pts[idx[k]].name[0]} → ${pts[idx[k + 1]].name[0]} drawn straight (no sensible road route)`);
        const g = leg ? leg.g : pts.slice(idx[k], idx[k + 1] + 1).map((p) => [p.lat, p.lng]);
        return k === 0 ? g : g.slice(1);
      });
      // A confidently placed stop that ended up far from the line was dropped wrongly: put it back.
      let restored = false;
      pts.forEach((p, i) => {
        if (anchor[i] || p.conf !== 'matched' || project(path, p).d <= 900) return;
        anchor[i] = forced[i] = restored = true;
      });
      if (!restored) break;
      flags.length = flagsAtStart;
    }
  }
  if (!path) path = pts.map((p) => [p.lat, p.lng]);
  return path;
}

async function drawLines(stops) {
  const cache = loadCache('routes.json');
  const flags = [];
  const paths = [];
  for (const line of LINES) paths.push(await drawLine(cache, line, stops, flags));

  // Move stops onto the road line: always for approximate ones, and for matched ones that
  // are already close (a place's centre is rarely the kerb where the bus stops).
  const snapped = new Set();
  LINES.forEach((line, n) => {
    let from = 0;
    for (const id of line.stops) {
      const s = stops[id];
      const hit = project(paths[n], s, from);
      from = hit.i;
      if (snapped.has(id)) continue;
      snapped.add(id);
      if (hit.d <= (s.conf === 'approx' ? 2500 : 900)) [s.lat, s.lng] = hit.pt;
      else flags.push(`${line.id}: ${s.name[0]} is ${Math.round(hit.d)} m from the drawn route and was left where it is`);
    }
  });

  const out = LINES.map((line, n) => {
    const path = paths[n];
    const cuts = [];
    let from = 0;
    for (const id of line.stops) {
      const hit = project(path, stops[id], from);
      from = hit.i;
      cuts.push(hit);
    }
    const segs = cuts.slice(0, -1).map((a, i) => {
      const b = cuts[i + 1];
      const mid = path.slice(a.i + 1, b.i + 1);
      return [a.pt, ...mid, b.pt].map(([y, x]) => [+y.toFixed(5), +x.toFixed(5)]).filter((p, k, arr) => k === 0 || p[0] !== arr[k - 1][0] || p[1] !== arr[k - 1][1]);
    }).map((seg) => (seg.length > 1 ? seg : [seg[0], seg[0]]));
    const dist = segs.map((seg) => Math.round(lineLength(seg)));
    const total = dist.reduce((a, b) => a + b, 0) / 1000;
    if (line.km && Math.abs(total - line.km) / line.km > 0.2) flags.push(`${line.id}: drawn length ${total.toFixed(1)} km, SMTA says ${line.km} km`);
    return { id: line.id, listedAs: line.listedAs, service: line.service, pink: !!line.pink, color: line.color, name: line.name, stops: line.stops, segs, dist };
  });
  return { lines: out, flags };
}

const placed = await placeStops();
const used = new Set(LINES.flatMap((l) => l.stops));
for (const id of used) if (!placed[id]) throw new Error(`line uses unknown stop "${id}"`);
for (const id of Object.keys(placed)) if (!used.has(id)) console.warn(`! stop "${id}" is not on any line`);

const { lines, flags } = await drawLines(placed);
const stops = Object.fromEntries(
  Object.entries(placed).filter(([id]) => used.has(id)).map(([id, s]) => [id, { name: s.name, lat: +s.lat.toFixed(5), lng: +s.lng.toFixed(5), conf: s.conf }]),
);
const fares = JSON.parse(JSON.stringify(FARES, (k, v) => (v === Infinity ? null : v)));
writeFileSync(`${ROOT}data/network.json`, JSON.stringify({ built: new Date().toISOString().slice(0, 10), stops, lines, fares }));

// Known Karachi bus stop names from OpenStreetMap, for offline place search.
const seen = new Set();
const places = loadOsmStops()
  .filter((s) => /^[\x20-\x7e]+$/.test(s.name) && !seen.has(s.n) && seen.add(s.n))
  .map((s) => [s.name.trim(), +s.lat.toFixed(5), +s.lng.toFixed(5)]);
writeFileSync(`${ROOT}data/places.json`, JSON.stringify(places));

const approx = Object.values(placed).filter((s) => s.conf === 'approx');
console.log(`${Object.keys(stops).length} stops, ${lines.length} lines`);
console.log(`\nApproximate positions (${approx.length}):`);
for (const s of approx) console.log(`  ${s.name[0]}${s.nearest ? `  — nearest find: ${s.nearest}` : ''}`);
console.log(`\nThings to check (${flags.length}):`);
for (const f of flags) console.log(`  ${f}`);
