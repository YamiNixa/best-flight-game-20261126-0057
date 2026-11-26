// Harbor Run — world: the procedural harbour town of Gullhaven.
// Coastline, sea, sand, town blocks, hills, runway and clouds are all
// generated from a small seeded random source, so the map is identical
// every time the game loads.

import { CONFIG } from './config.js';

const P = CONFIG.palette;
const W = CONFIG.world;

// Deterministic pseudo-random generator (mulberry32) — one seed, one town.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20261126);

// Coastline: the sea lies south of this wavy line (smaller z = further out).
export function coastZAt(x) {
  return W.coastZ
    + Math.sin(x * 0.0011) * W.coastWobble * 0.6
    + Math.sin(x * 0.0031 + 1.7) * W.coastWobble * 0.4;
}

export function isSea(x, z) {
  return z < coastZAt(x);
}

// Terrain height in metres. Sea floor sits below the water plane;
// hills rise to the north; the town and runway sit on flat ground.
export function groundHeightAt(x, z) {
  if (isSea(x, z)) return -6;
  let h = 0;
  if (z > W.hills.z0) {
    const t = Math.min(1, (z - W.hills.z0) / 900);
    h += t * t * W.hills.peak
      * (0.55 + 0.45 * Math.sin(x * 0.002 + 2.0) * Math.sin(x * 0.0007 + 0.5));
  }
  // Gentle dunes between town and hills.
  h += Math.max(0, Math.sin(x * 0.004 + 1.0) * Math.sin(z * 0.005)) * 4;
  return h;
}

// Is the point on the runway strip (for landing checks and paint)?
export function onRunway(x, z) {
  const r = W.runway;
  return Math.abs(x - r.x) < r.length / 2 && Math.abs(z - r.z) < r.width / 2;
}

// Is the point inside the town blocks?
export function inTown(x, z) {
  const t = W.town;
  return x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1;
}

// ---- Town: deterministic blocks of houses with roofs --------------------
export const buildings = [];
{
  const t = W.town;
  const cols = 9;
  const rows = 5;
  const cw = (t.x1 - t.x0) / cols;
  const rw = (t.z1 - t.z0) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Leave streets: skip every third row's middle, and the runway road.
      if ((i + j) % 4 === 3) continue;
      const bx = t.x0 + i * cw + cw * 0.15 + rng() * cw * 0.2;
      const bz = t.z0 + j * rw + rw * 0.15 + rng() * rw * 0.2;
      const bw = cw * (0.45 + rng() * 0.25);
      const bd = rw * (0.45 + rng() * 0.25);
      const bh = 8 + rng() * 18;
      buildings.push({ x: bx, z: bz, w: bw, d: bd, h: bh, hue: rng() });
    }
  }
  // The harbour lighthouse and the town hall stand out on the skyline.
  buildings.push({ x: -180, z: -190, w: 14, d: 14, h: 46, hue: 0.9, lighthouse: true });
  buildings.push({ x: 120, z: 300, w: 46, d: 30, h: 30, hue: 0.2, hall: true });
}

// ---- Clouds: slow white puffs drifting over the bay ----------------------
export const clouds = [];
for (let i = 0; i < 26; i++) {
  clouds.push({
    x: (rng() - 0.5) * 3800,
    y: 260 + rng() * 180,
    z: (rng() - 0.5) * 3400,
    s: 60 + rng() * 130,
    drift: 1.5 + rng() * 2.5,
  });
}

// ---- Terrain paint: what colour is the ground at this point? -------------
export function groundColor(x, z) {
  if (isSea(x, z)) {
    // Deeper blue further from shore.
    const d = coastZAt(x) - z;
    return d > 260 ? P.seaDeep : P.sea;
  }
  if (onRunway(x, z)) return P.runway;
  const coast = coastZAt(x);
  if (z < coast + 26) return P.sand;              // beach
  if (inTown(x, z)) return P.townBlock;           // town ground
  const h = groundHeightAt(x, z);
  if (h > 55) return P.hillHigh;
  if (h > 18) return P.hill;
  // Patchy fields: two greens that alternate with position.
  const patch = Math.sin(x * 0.013) * Math.sin(z * 0.011) > 0;
  return patch ? P.grass : P.grassDark;
}

// ---- Distance helpers -----------------------------------------------------
export function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Heading in degrees, 0 = north (-z), 90 = east (+x), as the HUD shows it.
export function headingDegrees(headingRad) {
  let d = (headingRad * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}
