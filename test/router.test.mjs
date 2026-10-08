import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, plan, SORTS } from '../js/router.js';
import { haversine } from '../js/geo.js';

// A small made-up town. Stops sit on a grid, about 1.1 km per 0.01 degree.
const at = (x, y) => ({ lat: 24.8 + y * 0.01, lng: 67 + x * 0.01 });
const stop = (name, x, y) => ({ name: [name, name], ...at(x, y), conf: 'matched' });
const stops = {
  a1: stop('A1', 0, 0), a2: stop('A2', 2, 0), hub: stop('Hub', 4, 0), a4: stop('A4', 6, 0),
  b1: stop('B1', 4, 2), b2: stop('B2', 4, 4),
  c1: stop('C1', 6, 4), c2: stop('C2', 8, 4),
};
const line = (id, service, ids) => ({
  id, service, color: '#000', name: [id, id], stops: ids,
  segs: ids.slice(0, -1).map((s, i) => [[stops[s].lat, stops[s].lng], [stops[ids[i + 1]].lat, stops[ids[i + 1]].lng]]),
  dist: ids.slice(0, -1).map((s, i) => Math.round(haversine(stops[s], stops[ids[i + 1]]))),
});
const network = {
  stops,
  lines: [
    line('EW', 'peoples', ['a1', 'a2', 'hub', 'a4']),
    line('EW2', 'brt', ['a1', 'a2', 'hub', 'a4']),
    line('NS', 'peoples', ['hub', 'b1', 'b2']),
    line('TOP', 'peoples', ['b2', 'c1', 'c2']),
  ],
  fares: { peoples: { type: 'distance', bands: [[15, 80], [null, 120]] }, brt: { type: 'unknown' } },
};
const index = buildIndex(network);
const near = (id) => ({ lat: stops[id].lat + 0.001, lng: stops[id].lng });
const busLegs = (o) => o.legs.filter((l) => l.type === 'bus');

test('direct trip on one line, in either direction', () => {
  for (const [from, to] of [['a1', 'a4'], ['a4', 'a1']]) {
    const best = plan(index, near(from), near(to)).options.sort(SORTS.changes)[0];
    assert.equal(best.changes, 0);
    assert.deepEqual([busLegs(best)[0].from, busLegs(best)[0].to], [from, to]);
  }
});

test('lines sharing the same stops are offered together as one option', () => {
  const best = plan(index, near('a1'), near('a4')).options[0];
  assert.deepEqual(busLegs(best)[0].lines.sort(), ['EW', 'EW2']);
});

test('one change at the shared stop', () => {
  const best = plan(index, near('a1'), near('b2')).options.sort(SORTS.changes)[0];
  assert.equal(best.changes, 1);
  assert.deepEqual(busLegs(best).map((l) => [l.from, l.to]), [['a1', 'hub'], ['hub', 'b2']]);
  assert.deepEqual(busLegs(best)[0].stopIds, ['a1', 'a2', 'hub']);
});

test('two changes when nothing shorter exists', () => {
  const best = plan(index, near('a1'), near('c2')).options.sort(SORTS.changes)[0];
  assert.equal(best.changes, 2);
  assert.deepEqual(busLegs(best).map((l) => l.line[0] + l.to), ['Ehub', 'Nb2', 'Tc2']);
});

test('fare adds up per bus and is unknown when a line has no published fare', () => {
  const { options } = plan(index, near('a1'), near('b2'));
  const viaPeoples = options.find((o) => busLegs(o).every((l) => l.fare !== null));
  assert.equal(viaPeoples.fare, 160);
  assert.equal(viaPeoples.fareKnown, true);
});

test('a start far from any stop is reported as a gap, not a walk', () => {
  const far = { lat: stops.a1.lat - 0.04, lng: stops.a1.lng };
  const best = plan(index, far, near('a4')).options[0];
  assert.equal(best.legs[0].type, 'gap');
  assert.ok(best.gapM > 4000);
});

test('very short trips offer walking and never a longer bus detour', () => {
  const { options } = plan(index, near('a1'), { lat: stops.a1.lat + 0.004, lng: stops.a1.lng });
  assert.ok(options.some((o) => o.walkOnly));
  assert.ok(options.every((o) => o.walkOnly || o.walkM + o.gapM < 600));
});

test('ride geometry starts at the boarding stop and ends at the alighting stop', () => {
  const leg = busLegs(plan(index, near('a4'), near('a1')).options[0])[0];
  assert.deepEqual(leg.path[0], [stops.a4.lat, stops.a4.lng]);
  assert.deepEqual(leg.path.at(-1), [stops.a1.lat, stops.a1.lng]);
});
