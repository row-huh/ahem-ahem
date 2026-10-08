// Small geometry helpers shared by the planner, the map and the data build script.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// Straight-line distance in metres between two {lat, lng} points.
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Streets are never straight: walking distance is estimated as a detour over the direct line.
export const WALK_DETOUR = 1.3;
export const walkMetres = (a, b) => haversine(a, b) * WALK_DETOUR;
