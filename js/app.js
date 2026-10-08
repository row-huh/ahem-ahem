import { buildIndex, plan, SORTS } from './router.js';
import { walkMetres } from './geo.js';
import { t, pick, dist, getLang, setLang } from './i18n.js';
import { createSearch, inKarachi } from './search.js';

const L = window.L;
const LETTERS = 'ABCDEFGH';
const MAX_POINTS = LETTERS.length;
const $ = (id) => document.getElementById(id);

// Tiny DOM builder: h('div', {class: 'x', onclick: fn}, 'text', childNode)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') for (const [prop, val] of Object.entries(v)) el.style.setProperty(prop, val);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const [network, places] = await Promise.all([
  fetch('data/network.json').then((r) => r.json()),
  fetch('data/places.json').then((r) => r.json()),
]);
const index = buildIndex(network);
const lineById = Object.fromEntries(network.lines.map((l) => [l.id, l]));
const linesAtStop = {};
for (const l of network.lines) for (const s of l.stops) (linesAtStop[s] ??= []).push(l.id);
const search = createSearch(network, places);

const state = {
  points: [{ loc: null }, { loc: null }], // loc: { lat, lng, kind: 'pin'|'stop'|'place'|'me', name?: [en, ur], stopId? }
  results: [], // one per consecutive pair of points, or null
  chosen: [], // selected option per pair
  sort: 'changes',
  routeFocus: null,
};

// ---------- map ----------
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([24.885, 67.08], 11);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const TRIP_BLUE = '#1a73e8';
const NETWORK_GREY = '#7b8794';
const networkLayer = L.layerGroup().addTo(map);
const stopLayer = L.layerGroup();
const tripLayer = L.layerGroup().addTo(map);
const pointLayer = L.layerGroup().addTo(map);
const linePaths = {};

for (const line of network.lines) {
  linePaths[line.id] = L.polyline(line.segs, { color: line.color, weight: 3, opacity: 0.55, interactive: false }).addTo(networkLayer);
}
for (const [id, s] of Object.entries(network.stops)) {
  L.circleMarker([s.lat, s.lng], { radius: 5, color: '#1f2933', weight: 1.5, fillColor: '#fff', fillOpacity: 1, dashArray: s.conf === 'approx' ? '2 3' : null })
    .on('click', (e) => { L.DomEvent.stopPropagation(e); openChooser({ lat: s.lat, lng: s.lng, kind: 'stop', stopId: id, name: s.name }); })
    .addTo(stopLayer);
}
const syncStops = () => (map.getZoom() >= 13 ? stopLayer.addTo(map) : stopLayer.remove());
map.on('zoomend', syncStops);
map.on('click', (e) => openChooser({ lat: e.latlng.lat, lng: e.latlng.lng, kind: 'pin' }));

function chip(lineId) {
  const line = lineById[lineId];
  return h('span', { class: 'chip', style: { background: line.color, color: readableOn(line.color) }, title: pick(line.name) }, lineId);
}
function readableOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? '#1f2933' : '#fff';
}

// Popup offering what to do with a tapped point or stop.
function openChooser(loc) {
  const last = state.points.length - 1;
  const choose = (fn) => () => { map.closePopup(); fn(); };
  const body = h('div', { class: 'chooser', dir: document.documentElement.dir },
    h('strong', {}, locLabel(loc)),
    loc.kind === 'stop' && h('div', { class: 'chips' }, linesAtStop[loc.stopId].map(chip)),
    loc.kind === 'stop' && network.stops[loc.stopId].conf === 'approx' && h('small', {}, t('approxNote')),
    h('button', { type: 'button', onclick: choose(() => setPoint(0, loc)) }, t('startHere')),
    h('button', { type: 'button', onclick: choose(() => setPoint(last, loc)) }, t('goHere')),
    state.points[last].loc && state.points.length < MAX_POINTS && h('button', { type: 'button', class: 'secondary', onclick: choose(() => { state.points.push({ loc: null }); setPoint(last + 1, loc); }) }, t('addStopHere')),
  );
  L.popup({ closeButton: false, minWidth: 190 }).setLatLng([loc.lat, loc.lng]).setContent(body).openOn(map);
}

// ---------- labels ----------
function nearestStopTo(p, within = 1500) {
  let best = null;
  for (const [id, s] of Object.entries(network.stops)) {
    const m = walkMetres(p, s);
    if (m <= within && (!best || m < best.m)) best = { id, m };
  }
  return best;
}
function locLabel(loc) {
  if (loc.name) return pick(loc.name);
  const base = loc.kind === 'me' ? t('myLocationLabel') : t('pinned');
  const near = nearestStopTo(loc);
  return near ? `${base} (${t('near', { place: stopName(near.id) })})` : base;
}
const stopName = (id) => pick(network.stops[id].name);

// ---------- trip points ----------
function setPoint(i, loc) {
  if (!inKarachi(loc)) return showHint(t('outsideKarachi'));
  state.points[i].loc = loc;
  showHint('');
  recompute(true);
  renderPoints();
}

function recompute(refit) {
  state.results = state.points.slice(0, -1).map((p, i) => {
    const q = state.points[i + 1];
    return p.loc && q.loc ? plan(index, p.loc, q.loc) : null;
  });
  state.chosen = state.results.map(() => 0);
  saveToLink();
  renderResults();
  drawTrip(refit);
}

// The trip lives in the page address, so a link to it can be shared or bookmarked.
function saveToLink() {
  const set = state.points.filter((p) => p.loc).map((p) => `${p.loc.lat.toFixed(5)},${p.loc.lng.toFixed(5)}`);
  history.replaceState(null, '', set.length ? `#trip=${set.join(';')}` : location.pathname);
}
function loadFromLink() {
  const match = location.hash.match(/^#trip=([\d.,;-]+)$/);
  if (!match) return;
  const locs = match[1].split(';').slice(0, MAX_POINTS).map((pair) => {
    const [lat, lng] = pair.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKarachi({ lat, lng })) return null;
    const stop = nearestStopTo({ lat, lng }, 15);
    return stop ? { lat, lng, kind: 'stop', stopId: stop.id, name: network.stops[stop.id].name } : { lat, lng, kind: 'pin' };
  }).filter(Boolean);
  if (!locs.length) return;
  state.points = locs.map((loc) => ({ loc }));
  if (state.points.length < 2) state.points.push({ loc: null });
  recompute(true);
}

function showHint(text) {
  $('hint').textContent = text || (state.points.some((p) => !p.loc) ? t('tapHint') : '');
}

function renderPoints() {
  const list = $('points');
  list.replaceChildren(...state.points.map((p, i) => pointRow(p, i)));
  $('add-stop').textContent = `+ ${t('addStop')}`;
  $('add-stop').hidden = state.points.length >= MAX_POINTS || !state.points.at(-1).loc;
  showHint('');
}

function pointRow(p, i) {
  const last = i === state.points.length - 1;
  const role = i === 0 ? t('start') : last ? t('destination') : `${t('stopN')} ${i}`;
  const placeholder = i === 0 ? t('placeholderStart') : i === 1 ? t('placeholderEnd') : t('placeholderStop');
  const suggestions = h('ul', { class: 'suggest', hidden: true });
  const input = h('input', { type: 'search', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': role, placeholder, value: p.loc ? locLabel(p.loc) : '' });
  let timer = null, pending = null;

  const show = (items, note) => {
    suggestions.replaceChildren(
      ...items.map((r) => h('li', {}, h('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => setPoint(i, { lat: r.lat, lng: r.lng, kind: r.kind, stopId: r.id, name: r.name }) },
        h('span', { class: 'suggest-name' }, pick(r.name)),
        h('span', { class: 'suggest-kind' }, r.kind === 'stop' ? t('busStop') : r.detail || t('place')),
        r.kind === 'stop' && h('span', { class: 'chips' }, linesAtStop[r.id].slice(0, 5).map(chip)),
      ))),
      note ? h('li', { class: 'suggest-note' }, note) : '',
    );
    suggestions.hidden = false;
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    pending?.abort();
    if (q.length < 2) { suggestions.hidden = true; return; }
    const local = search.searchLocal(q);
    show(local, q.length >= 3 ? t('searching') : null);
    if (q.length < 3) return;
    timer = setTimeout(async () => {
      pending = new AbortController();
      let remote = [];
      try { remote = await search.searchRemote(q, pending.signal); } catch (e) { if (e.name === 'AbortError') return; }
      // Skip online results that duplicate something already listed nearby.
      const extra = remote.filter((r) => inKarachi(r) && !local.some((l) => walkMetres(l, r) < 150));
      const all = [...local, ...extra].slice(0, 8);
      show(all, all.length ? null : t('noMatches'));
    }, 350);
  });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('blur', () => setTimeout(() => {
    suggestions.hidden = true;
    input.value = p.loc ? locLabel(p.loc) : '';
  }, 150));

  return h('li', { class: 'point' },
    h('span', { class: `badge${i === 0 ? ' badge-start' : ''}` }, LETTERS[i]),
    h('div', { class: 'field' }, input, suggestions),
    i === 0 && h('button', { type: 'button', class: 'icon', title: t('myLocation'), 'aria-label': t('myLocation'), onclick: locateMe }, '◎'),
    state.points.length > 2 && h('button', { type: 'button', class: 'icon', title: t('remove'), 'aria-label': `${t('remove')} ${LETTERS[i]}`, onclick: () => { state.points.splice(i, 1); recompute(true); renderPoints(); } }, '✕'),
  );
}

function locateMe() {
  if (!navigator.geolocation) return showHint(t('locationFailed'));
  showHint(t('locating'));
  navigator.geolocation.getCurrentPosition(
    (pos) => setPoint(0, { lat: pos.coords.latitude, lng: pos.coords.longitude, kind: 'me' }),
    () => showHint(t('locationFailed')),
    { enableHighAccuracy: true, timeout: 12000 },
  );
}

$('add-stop').addEventListener('click', () => {
  state.points.push({ loc: null });
  recompute(false);
  renderPoints();
  $('points').lastElementChild.querySelector('input').focus();
});

// ---------- results ----------
function renderResults() {
  const box = $('results');
  const sections = state.results.map((res, i) => {
    if (!res) return null;
    const title = state.results.length > 1 && h('h2', {}, h('span', { class: 'badge badge-sm' }, LETTERS[i]), ' → ', h('span', { class: 'badge badge-sm' }, LETTERS[i + 1]),
      ` ${t('leg', { a: locLabel(state.points[i].loc), b: locLabel(state.points[i + 1].loc) })}`);
    if (!res.options.length) {
      return h('section', { class: 'leg' }, title, h('p', { class: 'empty' }, t('noOptions')),
        [res.nearestFrom, res.nearestTo].filter((n) => n && n.metres > 1000).map((n) => h('p', { class: 'empty' }, t('farFromNetwork', { stop: stopName(n.id), d: dist(n.metres) }))));
    }
    const sorted = res.options.map((o, k) => ({ o, k })).sort((a, b) => SORTS[state.sort](a.o, b.o));
    return h('section', { class: 'leg' }, title, sorted.map(({ o, k }) => optionCard(o, i, k)));
  }).filter(Boolean);

  const sorter = sections.length > 0 && h('div', { class: 'sorter', role: 'group', 'aria-label': t('sortBy') },
    Object.keys(SORTS).map((key) => h('button', { type: 'button', class: key === state.sort ? 'on' : '', 'aria-pressed': String(key === state.sort), onclick: () => { state.sort = key; renderResults(); } }, t(`sort_${key}`))));
  box.replaceChildren(sorter || '', ...sections);
}

function fareText(o) {
  if (o.walkOnly) return null;
  if (o.fareKnown) return t('aboutRs', { n: o.fare });
  return o.fare > 0 ? t('fareUnknownSome', { n: o.fare }) : t('fareUnknown');
}

function optionCard(o, legIndex, optIndex) {
  const open = state.chosen[legIndex] === optIndex;
  const buses = o.legs.filter((l) => l.type === 'bus');
  const route = o.walkOnly
    ? h('span', { class: 'walk-only' }, t('walkOnly'))
    : buses.flatMap((b, n) => [n > 0 && h('span', { class: 'arrow' }, '›'), h('span', { class: 'chips' }, b.lines.map(chip))]);
  const facts = [
    !o.walkOnly && (o.changes === 0 ? t('direct') : o.changes === 1 ? t('change1') : t('changesN', { n: o.changes })),
    o.walkM >= 30 && t('walkTotal', { d: dist(o.walkM) }),
    !o.walkOnly && dist(o.busM + o.walkM + o.gapM),
    fareText(o),
  ].filter(Boolean);
  const head = h('button', { type: 'button', class: 'opt-head', 'aria-expanded': String(open), onclick: () => { state.chosen[legIndex] = optIndex; renderResults(); drawTrip(true); } },
    h('span', { class: 'opt-route' }, route),
    h('span', { class: 'opt-facts' }, facts.join(' · ')),
    o.gapM > 0 && h('span', { class: 'opt-warn' }, '⚠ ', t('gapShort', { d: dist(o.gapM) })),
  );
  return h('article', { class: `opt${open ? ' open' : ''}` }, head, open && steps(o));
}

function steps(o) {
  const items = o.legs.map((leg, n) => {
    if (leg.type === 'bus') return busStep(leg);
    const d = dist(leg.metres);
    if (leg.type === 'gap') {
      const text = leg.toStop ? t('gapToStop', { stop: stopName(leg.toStop), d }) : t('gapToEnd', { stop: stopName(leg.fromStop), d });
      return h('li', { class: 'step gap' }, h('span', { class: 'dot' }, '⚠'), h('div', {}, text));
    }
    const text = o.walkOnly ? t('walkWhole', { d }) : !leg.toStop ? t('walkToEnd', { d }) : n === 0 ? t('walkToStop', { stop: stopName(leg.toStop), d }) : t('walkBetween', { stop: stopName(leg.toStop), d });
    return h('li', { class: 'step walk' }, h('span', { class: 'dot' }, '🚶'), h('div', {}, text));
  });
  const pink = [...new Set(o.legs.filter((l) => l.type === 'bus').flatMap((l) => l.lines).filter((id) => lineById[id].pink))];
  return h('div', { class: 'opt-body' }, h('ol', { class: 'steps' }, items), pink.length > 0 && h('p', { class: 'note' }, t('pinkNote', { lines: pink.join(', ') })));
}

function busStep(leg) {
  const line = lineById[leg.line];
  const approx = [leg.from, leg.to].some((id) => network.stops[id].conf === 'approx');
  const fare = leg.fare === null ? t('fareUnknown') : t('aboutRs', { n: leg.fare }) + (leg.fareOn ? ` (${leg.fareOn.join(', ')})` : '');
  const middle = leg.stopIds.slice(1, -1);
  return h('li', { class: 'step bus', style: { '--route': line.color } },
    h('span', { class: 'dot' }, '🚌'),
    h('div', {},
      h('div', { class: 'chips' }, leg.lines.map(chip), leg.lines.length > 1 && h('small', {}, t('anyOf'))),
      h('div', { class: 'services' }, [...new Set(leg.lines.map((id) => t(`service_${lineById[id].service}`)))].join(' · ')),
      h('div', { class: 'stop-from' }, t('board', { stop: stopName(leg.from) })),
      middle.length > 0 && h('details', {}, h('summary', {}, t('rideInfo', { n: leg.stopIds.length - 1, d: dist(leg.metres) })), h('ul', { class: 'via' }, middle.map((id) => h('li', {}, stopName(id))))),
      middle.length === 0 && h('div', { class: 'ride-info' }, t('rideInfo', { n: 1, d: dist(leg.metres) })),
      h('div', { class: 'stop-to' }, t('getOff', { stop: stopName(leg.to) })),
      h('div', { class: 'fare' }, fare),
      approx && h('small', { class: 'approx' }, `≈ ${t('approxNote')}`),
    ),
  );
}

// ---------- drawing the chosen trip ----------
function drawTrip(refit) {
  tripLayer.clearLayers();
  pointLayer.clearLayers();
  const bounds = [];
  state.results.forEach((res, i) => {
    const o = res?.options[state.chosen[i]];
    if (!o) return;
    for (const leg of o.legs) {
      bounds.push(...leg.path);
      if (leg.type === 'bus') {
        L.polyline(leg.path, { color: '#fff', weight: 10, opacity: 0.95, interactive: false }).addTo(tripLayer);
        L.polyline(leg.path, { color: TRIP_BLUE, weight: 6, interactive: false }).addTo(tripLayer);
        for (const id of [leg.from, leg.to]) {
          const s = network.stops[id];
          L.circleMarker([s.lat, s.lng], { radius: 7, color: TRIP_BLUE, weight: 3, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(pick(s.name)).addTo(tripLayer);
        }
      } else {
        L.polyline(leg.path, { color: leg.type === 'gap' ? '#c62828' : TRIP_BLUE, weight: 4, dashArray: '2 9', lineCap: 'round', interactive: false }).addTo(tripLayer);
      }
    }
  });
  state.points.forEach((p, i) => {
    if (!p.loc) return;
    bounds.push([p.loc.lat, p.loc.lng]);
    const icon = L.divIcon({ className: '', html: `<span class="pin${i === 0 ? ' pin-start' : ''}">${LETTERS[i]}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    L.marker([p.loc.lat, p.loc.lng], { icon, draggable: true, title: locLabel(p.loc) })
      .on('dragend', (e) => { const { lat, lng } = e.target.getLatLng(); setPoint(i, { lat, lng, kind: 'pin' }); })
      .addTo(pointLayer);
  });
  state.tripShown = bounds.length > 1 && state.results.some(Boolean);
  styleNetwork();
  if (refit && bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  else if (refit && bounds.length === 1) map.setView(bounds[0], Math.max(map.getZoom(), 14));
}

// ---------- all routes ----------
// While a trip is on the map the rest of the network goes grey, so the blue trip is the
// only colour on it. A route picked from the list keeps its own colour.
function styleNetwork() {
  for (const [lineId, path] of Object.entries(linePaths)) {
    const on = lineId === state.routeFocus;
    const grey = state.tripShown && !on;
    path.setStyle({ color: grey ? NETWORK_GREY : lineById[lineId].color, weight: on ? 6 : 3, opacity: on ? 1 : state.routeFocus ? 0.15 : grey ? 0.4 : 0.55 });
  }
}
function renderRoutes() {
  $('routes-title').textContent = `${t('allRoutes')} (${network.lines.length})`;
  $('route-list').replaceChildren(...network.lines.map((line) =>
    h('li', {}, h('button', { type: 'button', class: state.routeFocus === line.id ? 'on' : '', onclick: () => focusRoute(line.id) },
      chip(line.id), h('span', { class: 'route-name' }, pick(line.name)), h('small', {}, t(`service_${line.service}`))))));
}
function focusRoute(id) {
  state.routeFocus = state.routeFocus === id ? null : id;
  styleNetwork();
  const path = linePaths[state.routeFocus];
  if (path) { path.bringToFront(); map.fitBounds(path.getBounds(), { padding: [30, 30] }); }
  renderRoutes();
}

// ---------- chrome ----------
function renderChrome() {
  const ur = getLang() === 'ur';
  document.documentElement.lang = ur ? 'ur' : 'en';
  document.documentElement.dir = ur ? 'rtl' : 'ltr';
  document.title = t('title');
  $('title').textContent = t('title');
  $('tagline').textContent = t('tagline');
  $('lang').textContent = t('langSwitch');
  $('map-size').textContent = $('app').classList.contains('big-map') ? t('smallerMap') : t('biggerMap');
  const fareYear = Object.values(network.fares).find((f) => f.asOf)?.asOf;
  $('notes').replaceChildren(h('p', {}, t('noTimes')), fareYear && h('p', {}, t('fareFootnote', { year: fareYear })), h('p', {}, t('dataNote')));
}
function renderAll() {
  renderChrome();
  renderPoints();
  renderResults();
  renderRoutes();
  drawTrip(false);
}
$('lang').addEventListener('click', () => { setLang(getLang() === 'ur' ? 'en' : 'ur'); map.closePopup(); renderAll(); });
$('map-size').addEventListener('click', () => { $('app').classList.toggle('big-map'); renderChrome(); setTimeout(() => map.invalidateSize(), 220); });

loadFromLink();
renderAll();
syncStops();
