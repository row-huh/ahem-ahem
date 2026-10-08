// Journey planner over the bus network. No timetables: it reasons about distance,
// walking and number of bus changes only.
//
// Method: every ordered combination of up to three lines is tried. For each combination
// the best boarding, changing and alighting stops are chosen by a single "effort" cost
// (bus metres + weighted walking metres). Options whose rides pass the same stops on
// different lines are merged into one option listing every line that works.
import { walkMetres } from './geo.js';

export const WALK_LIMIT_M = 1000; // beyond this an access stretch is shown as "needs a rickshaw"
const WALK_WEIGHT = 6; // one metre on foot costs as much as six on a bus
const CHANGE_PENALTY = 4000; // effort of changing buses, in bus-metres
const TRANSFER_WALK_M = 400; // longest walk between two stops when changing
const MAX_OPTIONS = 8;

export function buildIndex(network) {
  const lines = network.lines.map((l) => {
    const cum = [0];
    for (const d of l.dist) cum.push(cum[cum.length - 1] + d);
    return { ...l, cum };
  });
  // transfers[a][b] = [{ia, ib, walk}] : ways to change from line a to line b
  const transfers = lines.map(() => lines.map(() => []));
  lines.forEach((a, ai) => {
    lines.forEach((b, bi) => {
      if (ai === bi) return;
      a.stops.forEach((sa, ia) => {
        b.stops.forEach((sb, ib) => {
          const walk = sa === sb ? 0 : walkMetres(network.stops[sa], network.stops[sb]);
          if (walk <= TRANSFER_WALK_M) transfers[ai][bi].push({ ia, ib, walk });
        });
      });
    });
  });
  return { stops: network.stops, lines, transfers, fares: network.fares || {} };
}

// Stops worth walking to from a point: everything close, or the nearest cluster if nothing is.
function accessMap(index, point) {
  const all = Object.entries(index.stops).map(([id, s]) => [id, walkMetres(point, s)]);
  const nearest = Math.min(...all.map(([, m]) => m));
  const reach = Math.max(1500, nearest * 1.6 + 300);
  return new Map(all.filter(([, m]) => m <= reach));
}

function fareFor(index, line, metres) {
  const rule = index.fares[line.service];
  if (!rule || rule.type !== 'distance') return null;
  const km = metres / 1000;
  const band = rule.bands.find(([upTo]) => upTo === null || km <= upTo);
  return band ? band[1] : null;
}

// Best way to get on `line` so as to be at stop index `at`, and the mirror for getting off.
function bestEnd(line, at, access) {
  let best = null;
  line.stops.forEach((id, i) => {
    if (i === at || !access.has(id)) return;
    const cost = access.get(id) * WALK_WEIGHT + Math.abs(line.cum[at] - line.cum[i]);
    if (!best || cost < best.cost) best = { cost, i };
  });
  return best;
}

function rideGeometry(line, from, to) {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const pts = [];
  for (let i = lo; i < hi; i++) pts.push(...(i === lo ? line.segs[i] : line.segs[i].slice(1)));
  return from <= to ? pts : pts.reverse();
}

export function plan(index, from, to) {
  const { lines, transfers, stops } = index;
  const acc = accessMap(index, from);
  const egr = accessMap(index, to);
  const found = []; // { cost, rides: [{li, from, to}], walks: [m between rides] }

  const boardable = lines.map((l) => l.stops.some((id) => acc.has(id)));
  const leavable = lines.map((l) => l.stops.some((id) => egr.has(id)));

  lines.forEach((A, a) => {
    if (!boardable[a]) return;
    // one bus
    if (leavable[a]) {
      let best = null;
      A.stops.forEach((sj, j) => {
        if (!egr.has(sj)) return;
        const on = bestEnd(A, j, acc);
        if (!on) return;
        const cost = on.cost + egr.get(sj) * WALK_WEIGHT;
        if (!best || cost < best.cost) best = { cost, rides: [{ li: a, from: on.i, to: j }], walks: [] };
      });
      if (best) found.push(best);
    }
    lines.forEach((B, b) => {
      if (b === a || !transfers[a][b].length) return;
      // two buses
      if (leavable[b]) {
        let best = null;
        for (const t of transfers[a][b]) {
          const on = bestEnd(A, t.ia, acc);
          const off = bestEnd(B, t.ib, egr);
          if (!on || !off) continue;
          const cost = on.cost + t.walk * WALK_WEIGHT + off.cost;
          if (!best || cost < best.cost) best = { cost, rides: [{ li: a, from: on.i, to: t.ia }, { li: b, from: t.ib, to: off.i }], walks: [t.walk] };
        }
        if (best) found.push(best);
      }
      // three buses
      lines.forEach((C, c) => {
        if (c === a || c === b || !leavable[c] || !transfers[b][c].length) return;
        let best = null;
        for (const t1 of transfers[a][b]) {
          const on = bestEnd(A, t1.ia, acc);
          if (!on) continue;
          for (const t2 of transfers[b][c]) {
            if (t2.ia === t1.ib) continue;
            const off = bestEnd(C, t2.ib, egr);
            if (!off) continue;
            const cost = on.cost + t1.walk * WALK_WEIGHT + Math.abs(B.cum[t2.ia] - B.cum[t1.ib]) + t2.walk * WALK_WEIGHT + off.cost;
            if (!best || cost < best.cost) {
              best = { cost, rides: [{ li: a, from: on.i, to: t1.ia }, { li: b, from: t1.ib, to: t2.ia }, { li: c, from: t2.ib, to: off.i }], walks: [t1.walk, t2.walk] };
            }
          }
        }
        if (best) found.push(best);
      });
    });
  });

  // Merge options whose rides pass exactly the same stops, collecting the lines that serve each ride.
  const merged = new Map();
  for (const f of found) {
    const key = f.rides.map((r) => {
      const { stops: ids } = lines[r.li];
      const [lo, hi] = [Math.min(r.from, r.to), Math.max(r.from, r.to)];
      return `${ids[r.from]}>${ids[r.to]}:${ids.slice(lo, hi + 1).join(',')}`;
    }).join('|');
    const score = f.cost + (f.rides.length - 1) * CHANGE_PENALTY;
    const cur = merged.get(key);
    if (!cur) merged.set(key, { ...f, score, alts: f.rides.map((r) => [r.li]) });
    else {
      f.rides.forEach((r, i) => { if (!cur.alts[i].includes(r.li)) cur.alts[i].push(r.li); });
      if (score < cur.score) Object.assign(cur, { cost: f.cost, score, rides: f.rides, walks: f.walks });
    }
  }

  const direct = walkMetres(from, to);
  let options = [...merged.values()].map((m) => toOption(index, m, from, to, acc, egr));
  // A bus trip that involves more walking than simply walking there is not an option.
  options = options.filter((o) => o.walkM + o.gapM < direct);
  options.sort((x, y) => x.score - y.score);
  if (options.length) {
    const cutoff = options[0].score * 1.6 + 3000;
    options = options.filter((o) => o.score <= cutoff);
    const foot = (o) => o.walkM + o.gapM;
    // An extra change has to buy something: clearly less walking or a clearly shorter trip.
    options = options.filter((o) => !options.some((p) => p.changes < o.changes && !(foot(o) < foot(p) - 300 || o.busM + foot(o) < (p.busM + foot(p)) * 0.8)));
  }
  options = options.slice(0, MAX_OPTIONS);
  if (direct <= WALK_LIMIT_M * 1.5) {
    options.push({ score: direct * WALK_WEIGHT, changes: 0, walkM: direct, gapM: 0, busM: 0, fare: 0, fareKnown: true, walkOnly: true,
      legs: [{ type: 'walk', metres: direct, from, to, path: [[from.lat, from.lng], [to.lat, to.lng]] }] });
  }
  return { options, direct, nearestFrom: nearestStop(stops, acc), nearestTo: nearestStop(stops, egr) };
}

function nearestStop(stops, access) {
  let best = null;
  for (const [id, m] of access) if (!best || m < best.metres) best = { id, metres: m };
  return best;
}

function toOption(index, m, from, to, acc, egr) {
  const { lines, stops } = index;
  const legs = [];
  let walkM = 0, gapM = 0, busM = 0, fare = 0, fareKnown = true;
  const foot = (a, b, metres, toStop, fromStop) => {
    if (metres < 30) return;
    const type = metres > WALK_LIMIT_M ? 'gap' : 'walk';
    if (type === 'gap') gapM += metres; else walkM += metres;
    legs.push({ type, metres, toStop, fromStop, path: [[a.lat, a.lng], [b.lat, b.lng]] });
  };
  m.rides.forEach((r, i) => {
    const line = lines[r.li];
    const onId = line.stops[r.from], offId = line.stops[r.to];
    if (i === 0) foot(from, stops[onId], acc.get(onId), onId);
    else foot(stops[lines[m.rides[i - 1].li].stops[m.rides[i - 1].to]], stops[onId], m.walks[i - 1], onId);
    const metres = Math.abs(line.cum[r.to] - line.cum[r.from]);
    // Lines sharing these stops may charge differently, and some have no published fare.
    const altFares = m.alts[i].map((li) => [lines[li].id, fareFor(index, lines[li], metres)]);
    const known = altFares.filter(([, f]) => f !== null);
    const legFare = known.length ? Math.min(...known.map(([, f]) => f)) : null;
    const fareOn = known.length && known.length < altFares.length ? known.map(([id]) => id) : null;
    if (legFare === null) fareKnown = false; else fare += legFare;
    busM += metres;
    const step = r.from <= r.to ? 1 : -1;
    const stopIds = [];
    for (let k = r.from; k !== r.to + step; k += step) stopIds.push(line.stops[k]);
    legs.push({ type: 'bus', line: line.id, lines: m.alts[i].map((li) => lines[li].id), from: onId, to: offId, stopIds, metres, fare: legFare, fareOn, path: rideGeometry(line, r.from, r.to) });
    if (i === m.rides.length - 1) foot(stops[offId], to, egr.get(offId), undefined, offId);
  });
  return { score: m.score, changes: m.rides.length - 1, walkM, gapM, busM, fare, fareKnown, legs };
}

export const SORTS = {
  changes: (a, b) => a.changes - b.changes || a.score - b.score,
  walking: (a, b) => a.walkM + a.gapM - (b.walkM + b.gapM) || a.score - b.score,
  distance: (a, b) => a.busM + a.walkM + a.gapM - (b.busM + b.walkM + b.gapM),
  fare: (a, b) => Number(!a.fareKnown) - Number(!b.fareKnown) || a.fare - b.fare || a.score - b.score,
};
