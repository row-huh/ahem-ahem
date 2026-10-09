// Place search. Bus stops on the network and known Karachi bus stops are matched on the
// phone itself, so search keeps working on a weak connection. Anything else is looked up
// in OpenStreetMap through the public Photon service.
import { pick } from './i18n.js';

const KARACHI = { south: 24.7, west: 66.8, north: 25.2, east: 67.55 };
export const inKarachi = (p) => p.lat >= KARACHI.south && p.lat <= KARACHI.north && p.lng >= KARACHI.west && p.lng <= KARACHI.east;

const fold = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function createSearch(network, places) {
  const local = [
    ...Object.entries(network.stops).map(([id, s]) => ({ kind: 'stop', id, name: s.name, lat: s.lat, lng: s.lng, key: fold(s.name.join(' ')) })),
    ...places.map(([name, lat, lng]) => ({ kind: 'place', name: [name, name], lat, lng, key: fold(name) })),
  ];

  function searchLocal(query, limit = 6) {
    const q = fold(query);
    if (!q) return [];
    const words = q.split(' ');
    const hits = [];
    for (const item of local) {
      if (!words.every((w) => item.key.includes(w))) continue;
      // Network stops first, then names that start with the query, then shorter names.
      const rank = (item.kind === 'stop' ? 0 : 100) + (item.key.startsWith(q) ? 0 : 20) + Math.min(item.key.length, 19);
      hits.push({ rank, item });
    }
    return hits.sort((a, b) => a.rank - b.rank).slice(0, limit).map((h) => h.item);
  }

  async function searchRemote(query, signal) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query.slice(0, 100))}&limit=5&lang=en&lat=24.88&lon=67.06&bbox=${KARACHI.west},${KARACHI.south},${KARACHI.east},${KARACHI.north}`;
    const res = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return [];
    const data = await res.json();
    // Photon is somebody else's server: keep only well-formed results inside Karachi.
    const features = Array.isArray(data?.features) ? data.features.slice(0, 5) : [];
    return features.map((f) => {
      const p = f?.properties || {};
      const [lng, lat] = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : [];
      if (typeof lat !== 'number' || typeof lng !== 'number' || !inKarachi({ lat, lng })) return null;
      const clean = (x) => (typeof x === 'string' ? x.trim().slice(0, 80) : '');
      const detail = [p.street, p.district || p.locality, p.city].map(clean).filter((x) => x && x !== p.name);
      const name = clean(p.name) || detail.shift() || query.slice(0, 80);
      return { kind: 'place', name: [name, name], detail: [...new Set(detail)].slice(0, 2).join(', '), lat, lng };
    }).filter(Boolean);
  }

  return { searchLocal, searchRemote };
}

export const resultLabel = (r) => pick(r.name);
