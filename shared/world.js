// The world map: Saddle Island in the middle and a loose ring of six smaller
// islands, placed from a fixed seed.
//
// Plain JS with no dependencies so the server builds exactly the same map as
// every player: nothing about the islands is ever sent over the wire.
// Each island is a height function in its own local frame (metres, sea level
// = 0, negative = seabed); props and puzzle pieces are listed in the same frame.

import { mulberry32, fbm, smoothstep as sstep, lerp, clamp } from './noise.js';
import { sunDirection } from './environment.js';

export const WORLD_SEED = 1721;
export const SEA_FLOOR = -40;

const TAU = Math.PI * 2;
const sq = (x) => x * x;

/** Seabed falling away from a shoreline; s = metres offshore, k > 1 = steeper. */
function shelf(s, k = 1) {
  s *= k;
  return -2.5 * sstep(0, 14, s) - 15 * sstep(10, 60, s) - 22.5 * sstep(50, 140, s);
}

/** Sand rising from the waterline; d = metres inland. */
const beach = (d, top = 2.2, width = 18) => top * sstep(0, width, d);

// ---------------------------------------------------------------------------
// Island shapes
// ---------------------------------------------------------------------------

function saddleIsland() {
  const BAY = { x: 25, z: 238, r: 55 };
  return {
    name: 'Saddle Island',
    land: 300,
    bound: 480,
    cell: 4,
    features: {
      bay: BAY,
      buoy: { x: 22, z: 302 },
    },
    height(lx, lz) {
      const r = Math.hypot(lx, lz);
      const wob = (fbm(lx * 0.0055 + 3.1, lz * 0.0055 - 1.7, 11, 3) - 0.5) * 80;
      const sdf = Math.max(r - 232 + wob, BAY.r - Math.hypot(lx - BAY.x, lz - BAY.z));
      if (sdf > 0) return shelf(sdf, 0.7);
      const d = -sdf;
      let h = beach(d, 2.4, 20) + 6 * sstep(16, 75, d);
      const hill1 = 98 * Math.exp(-(sq(lx + 75) + sq(lz + 40)) / sq(85));
      const hill2 = 56 * Math.exp(-(sq(lx - 100) + sq(lz - 45)) / sq(65));
      h += (hill1 + hill2) * sstep(18, 95, d);
      h += (fbm(lx * 0.035, lz * 0.035, 5, 3) - 0.5) * 7 * sstep(14, 45, d);
      return h;
    },
  };
}

function stackIsland() {
  const SPIRE = { x: 6, z: -5 };
  // Stacked, slightly leaning tiers of rock. Each rim is a ledge.
  const TIERS = [
    { r: 11.5, y0: 1, y1: 14, ox: 0, oz: 0 },
    { r: 9.4, y0: 13.6, y1: 27, ox: 0.8, oz: 0.3 },
    { r: 7.8, y0: 26.6, y1: 40, ox: 1.5, oz: 0.2 },
    { r: 6.0, y0: 39.6, y1: 51, ox: 2.0, oz: -0.4 },
    { r: 3.8, y0: 50.6, y1: 57, ox: 2.3, oz: -0.6 },
  ];
  return {
    name: 'Gannet Stack',
    land: 64,
    bound: 230,
    cell: 2,
    features: {
      spire: { ...SPIRE, tiers: TIERS },
      palms: [{ x: -33, z: 8, height: 6.5, lean: 0.55 }],
      shrubs: [{ x: -27, z: -9 }, { x: -24, z: 15 }, { x: -18, z: 22 }],
      rocks: [{ x: 24, z: 20, s: 3.4 }, { x: -6, z: -31, s: 2.9 }, { x: 30, z: -14, s: 2.4 }],
    },
    height(lx, lz) {
      const r = Math.hypot(lx, lz);
      const lee = sstep(0.35, 0.85, -lx / Math.max(r, 1e-3)); // pebble beach on local −x
      const wob = (fbm(lx * 0.04 + 7, lz * 0.04, 21, 3) - 0.5) * 16;
      const sdf = r - 42 + wob;
      if (sdf > 0) return shelf(sdf, lerp(4, 1.1, lee));
      const d = -sdf;
      const rock = 3.4 * sstep(0, 2.6, d) + (fbm(lx * 0.12, lz * 0.12, 23, 2) - 0.5) * 1.6 * sstep(2, 6, d);
      let h = lerp(rock, beach(d, 1.8, 12), lee);
      const rs = Math.hypot(lx - SPIRE.x, lz - SPIRE.z);
      // The rock plinth round the spire, except on the beach side, where sand
      // has drifted up against the foot of the climb.
      const face = sstep(0.72, 0.95, -(lx - SPIRE.x) / Math.max(rs, 1e-3));
      h = Math.max(h, 5 * sstep(17, 11.5, rs) * (1 - 0.75 * face));
      return h;
    },
  };
}

/** Distance to an open ring (radius rc) whose opening is centred on local +x. */
function arcDistance(lx, lz, rc, gap) {
  const r = Math.hypot(lx, lz);
  const a = Math.abs(Math.atan2(lz, lx));
  if (a >= gap) return Math.abs(r - rc);
  const ex = rc * Math.cos(gap);
  const ez = rc * Math.sin(gap) * (lz < 0 ? -1 : 1);
  return Math.hypot(lx - ex, lz - ez);
}

const HORSESHOE_SURGE = 0.9;

function horseshoeIsland() {
  const RC = 92;
  const W = 24;
  const GAP = 0.78;
  const OUTER = RC + W;
  // A flat rock shelf at the foot of the outer cliff, ending in a sandy pocket
  // of a cove. The swell runs straight onto it.
  const SHELF = { a0: GAP + 0.1, a1: GAP + 0.62, width: 3.6, top: 1.15 };
  const COVE = { a0: GAP + 0.62, a1: GAP + 0.75, depth: 13, floor: 1.6 };

  const palms = [1.45, 1.95, 2.55, -2.2, -1.5].map((a, i) => ({
    x: Math.cos(a) * (RC - W + 7),
    z: Math.sin(a) * (RC - W + 7),
    height: 7 + (i % 3) * 1.4,
    lean: 0.35 + (i % 2) * 0.25,
  }));

  return {
    name: 'The Horseshoe',
    land: 132,
    bound: 280,
    cell: 2,
    features: { rc: RC, w: W, gap: GAP, shelf: SHELF, cove: COVE, palms, shrubs: [] },
    height(lx, lz) {
      const r = Math.hypot(lx, lz);
      const as = Math.atan2(lz, lx);
      const a = Math.abs(as);
      // The shelf and cove get a clean, noise-free outer coastline.
      const path = as > 0 ? sstep(SHELF.a0 - 0.08, SHELF.a0, as) * sstep(COVE.a1 + 0.08, COVE.a1, as) : 0;
      const wob = (fbm(lx * 0.035 + 1, lz * 0.035, 31, 3) - 0.5) * 14 * (1 - path);
      const sdf = arcDistance(lx, lz, RC, GAP) - W + wob;

      if (sdf > 0) {
        const lagoon = -3.3 + (fbm(lx * 0.05, lz * 0.05, 33, 2) - 0.5) * 0.8;
        const basin = lerp(lagoon, SEA_FLOOR, sstep(RC + 10, RC + 165, r));
        const inner = Math.max(basin, shelf(sdf, 0.8));
        const outer = Math.min(basin, shelf(sdf, 6));
        const g = sstep(RC - 4, RC + 8, r) * sstep(GAP - 0.15, GAP + 0.25, a);
        return lerp(inner, outer, g);
      }

      const d = -sdf;
      const t = clamp((r - (RC - W)) / (2 * W), 0, 1); // 0 lagoon shore → 1 outer shore
      // A sheer wall of rock on the seaward side that starts abruptly at the tips.
      const ridge = 19 * sstep(0.35, 0.6, t) * sstep(GAP + 0.05, GAP + 0.15, a);
      let h = beach(d, 2.0, 14) + (fbm(lx * 0.09, lz * 0.09, 35, 2) - 0.5) * 1.4 * sstep(3, 10, d);
      h = Math.max(h, ridge * sstep(1.0, 6.0, d));

      if (path > 0 && r > RC) {
        const inward = OUTER - r;
        let carved;
        if (as < COVE.a0) {
          carved = inward < SHELF.width ? SHELF.top : SHELF.top + (h - SHELF.top) * sstep(SHELF.width, SHELF.width + 5, inward);
        } else {
          carved = inward < COVE.depth ? COVE.floor : COVE.floor + (h - COVE.floor) * sstep(COVE.depth, COVE.depth + 4, inward);
        }
        const hard = sstep(SHELF.a0 - 0.03, SHELF.a0, as) * sstep(COVE.a1 + 0.03, COVE.a1, as);
        h = lerp(h, Math.max(carved, 0.2), hard);
      }
      return h;
    },
    /** The swell runs straight up the shelf to the cliff foot (not into the cove). */
    surge(lx, lz) {
      const r = Math.hypot(lx, lz);
      const as = Math.atan2(lz, lx);
      const along = sstep(SHELF.a0 - 0.05, SHELF.a0 + 0.01, as) * sstep(COVE.a0 + 0.01, COVE.a0 - 0.03, as);
      return HORSESHOE_SURGE * along * sstep(OUTER - SHELF.width - 2.5, OUTER - SHELF.width + 0.5, r);
    },
    shelter(lx, lz) {
      const r = Math.hypot(lx, lz);
      const a = Math.abs(Math.atan2(lz, lx));
      const outerSide = sstep(RC - 6, RC + 6, r);
      const opening = sstep(RC - 20, RC + 70, r);
      const k = sstep(GAP - 0.1, GAP + 0.2, a);
      return lerp(0.15, 1, lerp(opening, outerSide, k));
    },
  };
}

function barIsland() {
  // `top` is the rock's flat crown (the top tier, offset and narrowed).
  const ROCK = { x: -66, z: 8, height: 19, radius: 3.1, top: { ox: 0.9, oz: 0.3, r: 1.2 } };
  return {
    name: "Pell's Bar",
    land: 104,
    bound: 340,
    cell: 2,
    features: {
      rock: ROCK,
      palms: [
        { id: 'split-palm', x: 22, z: 7, height: 8, lean: 0.4, split: true },
        { id: 'big-palm', x: 47, z: -3, height: 12.5, lean: 0.25 },
        { x: -33, z: 6, height: 7, lean: 0.6 },
        { x: 61, z: 8, height: 6.5, lean: 0.5 },
      ],
      shrubs: [{ x: -44, z: 4 }, { x: 4, z: -2 }, { x: 34, z: 9 }],
    },
    height(lx, lz) {
      const cx = clamp(lx, -78, 78);
      const halfW = 17 - 6 * sstep(40, 78, Math.abs(lx));
      const wob = (fbm(lx * 0.03 + 4, lz * 0.03, 41, 3) - 0.5) * 8;
      const sdf = Math.hypot(lx - cx, lz) - halfW + wob;
      if (sdf > 0) return shelf(sdf, 0.6);
      const d = -sdf;
      let h = 1.55 * sstep(0, 13, d) + (fbm(lx * 0.07, lz * 0.07, 43, 2) - 0.5) * 0.25 * sstep(4, 10, d);
      const rr = Math.hypot(lx - ROCK.x, lz - ROCK.z);
      if (rr < 7) h = Math.max(h, 2.0 * sstep(7, 3.2, rr));
      return h;
    },
  };
}

function reefIsland() {
  const CAY = { x: -30, z: 18, a: 22, b: 12 };
  const POOL = { x: -4, z: -6, r: 12 };
  const WRECK = { x: 15, z: -10, rot: 0.32, heel: 0.24 };
  return {
    name: 'Molly Ann Reef',
    land: 112,
    bound: 260,
    cell: 2,
    features: {
      cay: CAY,
      pool: POOL,
      wreck: WRECK,
      palms: [{ x: -36, z: 17, height: 7.5, lean: 0.45 }, { x: -25, z: 21, height: 6, lean: 0.7 }],
      rocks: [
        { x: -62, z: -20, s: 2.6 }, { x: 52, z: 26, s: 3.0 }, { x: -12, z: 44, s: 2.2 }, { x: 70, z: -18, s: 2.4 },
        // coral heads the wreck fetched up on
        { x: 23, z: -3, s: 1.9 }, { x: 25, z: -16, s: 2.2 }, { x: 16, z: -22, s: 1.5 }, { x: 30, z: -9, s: 1.6 },
      ],
    },
    height(lx, lz) {
      const e = Math.hypot(lx / 100, lz / 58) + (fbm(lx * 0.02, lz * 0.02, 51, 2) - 0.5) * 0.18;
      let h = -0.95 + (fbm(lx * 0.07, lz * 0.07, 53, 3) - 0.45) * 1.9 + 0.55 * sstep(0.78, 0.94, e);
      h += shelf(Math.max(0, e - 1) * 80, 1.2);
      // A deep pool by the wreck, open to the north so the swell rolls in.
      const pool = Math.hypot(lx - POOL.x, lz - POOL.z);
      const chan = sstep(POOL.r + 4, POOL.r - 2, Math.abs(lx - POOL.x)) * sstep(POOL.z + 2, POOL.z - 6, lz);
      const deep = Math.max(sstep(POOL.r + 3, POOL.r - 3, pool), chan);
      h = lerp(h, Math.min(h, -4.6 + (fbm(lx * 0.1, lz * 0.1, 55, 2) - 0.5)), deep);
      // Sand cay: the only bit that stays dry.
      const cd = Math.hypot((lx - CAY.x) / CAY.a, (lz - CAY.z) / CAY.b);
      if (cd < 1.3) h = Math.max(h, lerp(-1.0, 1.75, sstep(1.3, 0.45, cd)));
      return Math.max(h, SEA_FLOOR);
    },
    shelter(lx, lz) {
      const e = Math.hypot(lx / 100, lz / 58);
      const pool = Math.hypot(lx - POOL.x, lz - POOL.z);
      const chan = sstep(POOL.r + 4, POOL.r - 2, Math.abs(lx - POOL.x)) * sstep(POOL.z + 2, POOL.z - 6, lz);
      const open = Math.max(sstep(POOL.r + 4, POOL.r - 4, pool), chan);
      return lerp(lerp(0.4, 1, sstep(0.85, 1.05, e)), 0.85, open);
    },
  };
}

function sowIsland() {
  const PIGLETS = [
    { x: 60, z: 12, r: 5.0, h: 9.5 },
    { x: 70, z: -14, r: 4.0, h: 6.5 },
    { x: 52, z: -36, r: 4.6, h: 11.5 },
    { x: 76, z: 32, r: 3.4, h: 5.5 },
    { x: 44, z: 46, r: 4.2, h: 8 },
  ];
  const POCKET = { x: -45, z: -2, a: 6, b: 10 };
  return {
    name: 'Sow and Piglets',
    land: 92,
    bound: 260,
    cell: 2,
    features: {
      piglets: PIGLETS,
      shrubs: [{ x: -30, z: 10 }, { x: -12, z: -20 }, { x: 4, z: 14 }],
    },
    height(lx, lz) {
      const r = Math.hypot(lx, lz);
      const lee = sstep(0.4, 0.9, -lx / Math.max(r, 1e-3));
      const wob = (fbm(lx * 0.04 + 9, lz * 0.04, 71, 3) - 0.5) * 10;
      const sdf = r - 47 + wob;
      let h;
      if (sdf > 0) {
        h = shelf(sdf, lerp(3, 1, lee));
      } else {
        const d = -sdf;
        const dome = 27 * Math.pow(Math.max(0, 1 - sq(r / 52)), 0.8);
        h = lerp(2.2 * sstep(0, 2.5, d), beach(d, 1.6, 10), lee);
        h = Math.max(h, dome * sstep(0.5, 7, d)) + (fbm(lx * 0.1, lz * 0.1, 73, 2) - 0.5) * 1.2 * sstep(2, 6, d);
      }
      // A little pocket of beach on the lee side, where a boat can land.
      const pd = Math.hypot((lx - POCKET.x) / POCKET.a, (lz - POCKET.z) / POCKET.b);
      if (pd < 1.2) {
        const sand = clamp(0.45 + 0.13 * (lx - POCKET.x + 4), 0.3, 1.5);
        h = Math.min(h, lerp(sand, h, sstep(0.78, 1.2, pd)));
      }
      for (const p of PIGLETS) {
        const dp = Math.hypot(lx - p.x, lz - p.z);
        if (dp < p.r + 8) h = Math.max(h, lerp(-7, 1.0, sstep(p.r + 8, p.r, dp)));
      }
      return h;
    },
  };
}

function burntIsland() {
  return {
    name: 'Burnt Island',
    land: 150,
    bound: 300,
    cell: 2,
    features: {
      palms: [{ x: -70, z: 40, height: 8, lean: 0.4 }, { x: 64, z: -52, height: 7, lean: 0.55 }],
      stumps: [{ x: -20, z: 31 }, { x: -9, z: 37 }, { x: 2, z: 43 }],
      deadShrubs: [{ x: -40, z: -10 }, { x: -8, z: -44 }, { x: 30, z: 30 }, { x: 52, z: -20 }, { x: -55, z: 22 }],
      rocks: [{ x: 10, z: -10, s: 3.6 }, { x: -35, z: 50, s: 2.8 }, { x: 70, z: 12, s: 3.0 }],
    },
    height(lx, lz) {
      const r = Math.hypot(lx, lz);
      const wob = (fbm(lx * 0.009 + 2, lz * 0.009, 61, 3) - 0.5) * 60;
      const sdf = r - 112 + wob;
      if (sdf > 0) return shelf(sdf, 1.1);
      const d = -sdf;
      let h = beach(d, 2.0, 16);
      h += Math.max(0, fbm(lx * 0.013 + 5, lz * 0.013, 63, 3) - 0.38) * 48 * sstep(12, 55, d);
      h += 15 * Math.exp(-(sq(lx - 20) + sq(lz + 18)) / sq(42)) * sstep(14, 50, d);
      return h;
    },
  };
}

const KINDS = {
  saddle: saddleIsland,
  stack: stackIsland,
  horseshoe: horseshoeIsland,
  bar: barIsland,
  reef: reefIsland,
  sow: sowIsland,
  burnt: burntIsland,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

// Pell's Bar is turned so the rock's late-afternoon shadow runs up it.
const BAR_SHADOW_ANGLE = 0.2967; // shadow crosses the bar at ~17° to its long axis

function layout() {
  const rand = mulberry32(WORLD_SEED);
  const ring = ['stack', 'horseshoe', 'bar', 'reef', 'sow', 'burnt'];
  for (let i = ring.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ring[i], ring[j]] = [ring[j], ring[i]];
  }
  const start = rand() * TAU;
  const placed = [{ kind: 'saddle', x: 0, z: 0, rot: 0.35 }];
  ring.forEach((kind, i) => {
    const ang = start + (i / ring.length) * TAU + (rand() - 0.5) * 0.4;
    const r = 480 + rand() * 130;
    placed.push({ kind, x: Math.cos(ang) * r, z: Math.sin(ang) * r, rot: rand() * TAU });
  });
  for (const p of placed) {
    if (p.kind !== 'bar') continue;
    const sun = sunDirection(17);
    p.rot = Math.atan2(-sun.z, -sun.x) + BAR_SHADOW_ANGLE;
  }
  return placed;
}

export const ISLANDS = layout().map((p) => {
  const isl = { id: p.kind, kind: p.kind, ...KINDS[p.kind](), x: p.x, z: p.z, rot: p.rot };
  isl.cos = Math.cos(isl.rot);
  isl.sin = Math.sin(isl.rot);
  return isl;
});

export const ISLAND_BY_ID = Object.fromEntries(ISLANDS.map((i) => [i.id, i]));

export function toLocal(isl, x, z, out = {}) {
  const dx = x - isl.x;
  const dz = z - isl.z;
  out.x = isl.cos * dx + isl.sin * dz;
  out.z = -isl.sin * dx + isl.cos * dz;
  return out;
}

export function toWorld(isl, lx, lz, out = {}) {
  out.x = isl.x + isl.cos * lx - isl.sin * lz;
  out.z = isl.z + isl.sin * lx + isl.cos * lz;
  return out;
}

/** Rotate a local direction into world space. */
export function dirToWorld(isl, dx, dz, out = {}) {
  out.x = isl.cos * dx - isl.sin * dz;
  out.z = isl.sin * dx + isl.cos * dz;
  return out;
}

const tmpL = {};

/** Exact analytic terrain height (slow: evaluates every nearby island). */
export function terrainAnalytic(x, z) {
  let h = SEA_FLOOR;
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const dz = z - isl.z;
    if (dx * dx + dz * dz > isl.bound * isl.bound) continue;
    toLocal(isl, x, z, tmpL);
    const hi = isl.height(tmpL.x, tmpL.z);
    if (hi > h) h = hi;
  }
  return h;
}

/** Island whose land (not shelf) is nearest to (x, z), or null out at sea. */
export function islandNear(x, z, margin = 0) {
  let best = null;
  let bestD = Infinity;
  for (const isl of ISLANDS) {
    const d = Math.hypot(x - isl.x, z - isl.z) - isl.land - margin;
    if (d < 0 && d < bestD) {
      bestD = d;
      best = isl;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Baked grid: seabed height + wave damping, 2 m texels. The ocean shader gets
// the same numbers as a texture, so CPU and GPU waves agree near the shore.
// ---------------------------------------------------------------------------

export const BAKE_SIZE = 1024;
export const BAKE_HALF = 1024;

let bake = null;

export function worldBake() {
  if (bake) return bake;
  const n = BAKE_SIZE;
  const cell = (2 * BAKE_HALF) / n;
  const height = new Float32Array(n * n).fill(SEA_FLOOR);
  const shelter = new Float32Array(n * n).fill(1);
  const surge = new Float32Array(n * n);
  for (const isl of ISLANDS) {
    const i0 = clamp(Math.floor((isl.x - isl.bound + BAKE_HALF) / cell), 0, n - 1);
    const i1 = clamp(Math.ceil((isl.x + isl.bound + BAKE_HALF) / cell), 0, n - 1);
    const j0 = clamp(Math.floor((isl.z - isl.bound + BAKE_HALF) / cell), 0, n - 1);
    const j1 = clamp(Math.ceil((isl.z + isl.bound + BAKE_HALF) / cell), 0, n - 1);
    const b2 = isl.bound * isl.bound;
    for (let j = j0; j <= j1; j++) {
      const z = -BAKE_HALF + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = -BAKE_HALF + (i + 0.5) * cell;
        const dx = x - isl.x;
        const dz = z - isl.z;
        if (dx * dx + dz * dz > b2) continue;
        toLocal(isl, x, z, tmpL);
        const k = j * n + i;
        const h = isl.height(tmpL.x, tmpL.z);
        if (h > height[k]) height[k] = h;
        if (isl.shelter) shelter[k] = Math.min(shelter[k], isl.shelter(tmpL.x, tmpL.z));
        if (isl.surge) surge[k] = Math.max(surge[k], isl.surge(tmpL.x, tmpL.z));
      }
    }
  }
  const damp = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) {
    // Waves die away over shallows, except where an island lets the swell run
    // straight up onto the rock (surge).
    damp[k] = shelter[k] * Math.max(0.2 + 0.8 * sstep(0.3, 6.0, -height[k]), surge[k]);
  }
  bake = { n, cell, half: BAKE_HALF, height, damp };
  return bake;
}

function sampleField(field, x, z) {
  const b = worldBake();
  const n = b.n;
  let u = (x + b.half) / b.cell - 0.5;
  let v = (z + b.half) / b.cell - 0.5;
  u = clamp(u, 0, n - 1.0001);
  v = clamp(v, 0, n - 1.0001);
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const k = j * n + i;
  const a = field[k];
  const bb = field[k + 1];
  const c = field[k + n];
  const d = field[k + n + 1];
  return a + (bb - a) * fu + (c - a) * fv + (a - bb - c + d) * fu * fv;
}

/** Seabed (or land) height from the baked grid. */
export const seabedAt = (x, z) => sampleField(worldBake().height, x, z);

/** 0–1 multiplier on the swell height: calm in lagoons and shallows, 1 at open sea. */
export const dampingAt = (x, z) => sampleField(worldBake().damp, x, z);

// ---------------------------------------------------------------------------
// Per-island ground grids. These are both the rendered terrain (flat-shaded
// triangles) and the walkable surface, so feet always meet the drawn ground.
// ---------------------------------------------------------------------------

const grids = new Map();

export function islandGrid(isl) {
  let g = grids.get(isl.id);
  if (g) return g;
  const cell = isl.cell;
  const minX = Math.floor((isl.x - isl.land) / cell) * cell;
  const minZ = Math.floor((isl.z - isl.land) / cell) * cell;
  const nx = Math.ceil((2 * isl.land) / cell) + 2;
  const nz = nx;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      toLocal(isl, minX + i * cell, minZ + j * cell, tmpL);
      h[j * nx + i] = isl.height(tmpL.x, tmpL.z);
    }
  }
  g = { minX, minZ, cell, nx, nz, h };
  grids.set(isl.id, g);
  return g;
}

/**
 * Walkable ground height at (x, z): the exact triangle of the island mesh,
 * or the baked seabed out at sea. Optionally writes the surface normal.
 */
export function groundAt(x, z, normal = null) {
  let best = -Infinity;
  for (const isl of ISLANDS) {
    const g = islandGrid(isl);
    const fx = (x - g.minX) / g.cell;
    const fz = (z - g.minZ) / g.cell;
    if (fx < 0 || fz < 0 || fx >= g.nx - 1 || fz >= g.nz - 1) continue;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * g.nx + i;
    const h00 = g.h[k];
    const h10 = g.h[k + 1];
    const h01 = g.h[k + g.nx];
    const h11 = g.h[k + g.nx + 1];
    let h;
    let sx;
    let sz;
    if (u >= v) {
      h = h00 + u * (h10 - h00) + v * (h11 - h10);
      sx = (h10 - h00) / g.cell;
      sz = (h11 - h10) / g.cell;
    } else {
      h = h00 + v * (h01 - h00) + u * (h11 - h01);
      sx = (h11 - h01) / g.cell;
      sz = (h01 - h00) / g.cell;
    }
    if (h > best) {
      best = h;
      if (normal) {
        const len = Math.hypot(sx, 1, sz);
        normal.x = -sx / len;
        normal.y = 1 / len;
        normal.z = -sz / len;
      }
    }
  }
  if (best === -Infinity) {
    if (normal) {
      normal.x = 0;
      normal.y = 1;
      normal.z = 0;
    }
    return seabedAt(x, z);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pell's Bar: the weed line, and where the tip of the rock's shadow touches it.
// The shadow only reaches the weed line once a day, in the late afternoon, so
// that moment fixes a single spot.
// ---------------------------------------------------------------------------

let pells = null;

/** Tip of the rock's shadow at `hours`, in Pell's Bar local coordinates. */
export function barShadowTip(hours) {
  const isl = ISLAND_BY_ID.bar;
  const sun = sunDirection(hours);
  if (sun.y < 0.03) return null;
  const sx = isl.cos * sun.x + isl.sin * sun.z;
  const sz = -isl.sin * sun.x + isl.cos * sun.z;
  const hl = Math.hypot(sx, sz);
  const dx = -sx / hl;
  const dz = -sz / hl;
  const slope = sun.y / hl; // metres of drop per metre along the ground
  const rock = isl.features.rock;
  // The far edge of the rock's flat top throws the tip.
  const x0 = rock.x + rock.top.ox + dx * rock.top.r;
  const z0 = rock.z + rock.top.oz + dz * rock.top.r;
  const above = (s) => rock.height - s * slope - isl.height(x0 + dx * s, z0 + dz * s);
  let lo = 0;
  let hi = 0;
  while (above(hi) > 0) {
    lo = hi;
    hi += 0.5;
    if (hi > 600) return null;
  }
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (above(mid) > 0) lo = mid;
    else hi = mid;
  }
  return { x: x0 + dx * hi, z: z0 + dz * hi, length: hi };
}

/** The wrack line along the bar's north beach and the shadow spot (world coords). */
export function pellsBar() {
  if (pells) return pells;
  const isl = ISLAND_BY_ID.bar;
  const level = 0.95;
  const line = [];
  for (let lx = -60; lx <= 66; lx += 3) {
    let lo = -34;
    let hi = 0;
    if (isl.height(lx, hi) < level) continue;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      if (isl.height(lx, mid) >= level) hi = mid;
      else lo = mid;
    }
    line.push({ x: lx, z: hi });
  }
  const lineZ = (x) => {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i];
      const b = line[i + 1];
      if (x >= a.x && x <= b.x) return a.z + ((x - a.x) / (b.x - a.x)) * (b.z - a.z);
    }
    return null;
  };
  // Seaward of the weed line (> 0) or still on the bar (< 0)?
  const past = (hours) => {
    const tip = barShadowTip(hours);
    const z = tip && lineZ(tip.x);
    return z === null || z === undefined ? null : z - tip.z;
  };
  let hour = null;
  let prev = null;
  for (let h = 12; h < 19.5; h += 1 / 120) {
    const p = past(h);
    if (p !== null && prev !== null && prev.p <= 0 && p > 0) {
      let lo = prev.h;
      let hi = h;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const pm = past(mid);
        if (pm !== null && pm > 0) hi = mid;
        else lo = mid;
      }
      hour = hi;
      break;
    }
    prev = p === null ? null : { h, p };
  }
  const local = hour === null ? null : barShadowTip(hour);
  const spot = local ? toWorld(isl, local.x, local.z) : null;
  pells = { line, hour, local, spot };
  return pells;
}

// ---------------------------------------------------------------------------
// The Horseshoe's outer shelf: the swell runs over it, and anyone caught on it
// by a big one goes into the sea. Returns the seaward direction (world), or
// null if (x, z) isn't on the shelf.
// ---------------------------------------------------------------------------

export function surfAt(x, z) {
  const isl = ISLAND_BY_ID.horseshoe;
  const { shelf, cove, rc, w } = isl.features;
  const dx = x - isl.x;
  const dz = z - isl.z;
  if (dx * dx + dz * dz > (rc + w + 8) ** 2) return null;
  toLocal(isl, x, z, tmpL);
  const r = Math.hypot(tmpL.x, tmpL.z);
  const as = Math.atan2(tmpL.z, tmpL.x);
  if (as < shelf.a0 - 0.03 || as > cove.a0 || r < rc + w - shelf.width - 0.6) return null;
  return dirToWorld(isl, tmpL.x / r, tmpL.z / r);
}

/** Where the Horseshoe's cove chest is buried: on the sea side of the fallen rock. */
export function horseshoeCove() {
  const isl = ISLAND_BY_ID.horseshoe;
  const { cove, shelf, rc, w } = isl.features;
  const a = (cove.a0 + cove.a1) / 2;
  const back = rc + w - cove.depth;
  return {
    // A lump of the cliff that came down into the cove.
    boulder: { a: a - 0.01, r: back + 2.6, size: 2.1 },
    spot: toWorld(isl, Math.cos(a - 0.008) * (back + 6.2), Math.sin(a - 0.008) * (back + 6.2)),
    // Boulders on the shelf high enough to sit out a big sea on.
    refuges: [0.13, 0.27, 0.41].map((k) => ({ a: shelf.a0 + k, r: rc + w - 2.3 })),
  };
}

// ---------------------------------------------------------------------------
// Gannet Stack: footholds up the first drum of the spire on the beach side,
// a frayed rope up the second, and the old nest on top of it.
// Angles are around each drum's own centre, island-local.
// ---------------------------------------------------------------------------

let gannet = null;

export function gannetCourse() {
  if (gannet) return gannet;
  const isl = ISLAND_BY_ID.stack;
  const s = isl.features.spire;
  const [t1, t2] = s.tiers;
  const F = Math.PI; // the beach side
  const c1 = { x: s.x + t1.ox, z: s.z + t1.oz };
  const c2 = { x: s.x + t2.ox, z: s.z + t2.oz };
  const on = (c, r, a) => ({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r });
  // Staggered a little, each overlapping the one below by more than a metre.
  const ledges = [
    [F + 0.0, 3.4],
    [F + 0.045, 5.4],
    [F + 0.0, 7.4],
    [F - 0.045, 9.4],
    [F + 0.0, 11.4],
    [F + 0.045, 13.4],
  ].map(([a, top]) => ({ a, top, r: t1.r, c: c1 }));
  const rope = { a: F + 1.2, r: t2.r, c: c2, bottom: t1.y1, top: t2.y1 };
  const nestA = F - 0.14;
  const nestL = on(c2, t2.r - 1.1, nestA);
  const nest = { a: nestA, ...toWorld(isl, nestL.x, nestL.z), y: t2.y1 };
  gannet = { isl, ledges, rope, nest, on };
  return gannet;
}

/** Where the chest sits in the old nest, in world coordinates. */
export function gannetNest() {
  const n = gannetCourse().nest;
  return { x: n.x, y: n.y + 0.14, z: n.z };
}

// ---------------------------------------------------------------------------
// Digging
// ---------------------------------------------------------------------------

const _dn = {};

/**
 * Can you dig here? Sand, dirt or grass on an island, not too steep, above
 * the water, and not on the bare-rock islets (except their beaches).
 * Returns the island id, or null.
 */
export function diggableAt(x, z) {
  const isl = islandNear(x, z, 10);
  if (!isl) return null;
  const g = islandGrid(isl);
  if (x < g.minX || z < g.minZ || x > g.minX + (g.nx - 1) * g.cell || z > g.minZ + (g.nz - 1) * g.cell) return null;
  const h = groundAt(x, z, _dn);
  if (h < 0.35 || _dn.y < 0.8) return null;
  if ((isl.id === 'stack' || isl.id === 'sow') && h > 2.3) return null;
  if (isl.id === 'reef' && h < 0.9) return null;
  return isl.id;
}
