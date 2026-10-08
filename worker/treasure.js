// Server-side treasure. This file is never shipped to players: the client only
// ever sees a map's drawing (island, an X drawn a few metres out, the note).
//
// Stateless for now: a map id is a random nonce plus an HMAC signature, and the
// spot it points at is derived from the same secret. When multiplayer lands a
// Durable Object can keep track of who has dug up what.

import { ISLAND_BY_ID, toWorld, dirToWorld, pellsBar, horseshoeCove, gannetNest } from '../shared/world.js';
import { sunDirection } from '../shared/environment.js';
import { foreTopChest, hatchChest } from '../shared/wreck.js';

const DIG_RADIUS = 2.2; // metres from the true spot that still finds the chest
const PACE = 0.75;

// ---------------------------------------------------------------------------
// Where treasure can be. Positions are worked out from the island's own
// landmarks so the notes stay true if the islands are ever moved.
// ---------------------------------------------------------------------------

const v = (x, z) => ({ x, z });
const add = (a, b, k = 1) => v(a.x + b.x * k, a.z + b.z * k);
const sub = (a, b) => v(a.x - b.x, a.z - b.z);
const norm = (a) => {
  const l = Math.hypot(a.x, a.z) || 1;
  return v(a.x / l, a.z / l);
};
const lerp2 = (a, b, t) => v(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);

/** World-space direction of the sunrise, turned into an island's frame. */
function sunriseLocal(isl) {
  const s = sunDirection(6);
  const w = norm(v(s.x, s.z));
  return v(isl.cos * w.x + isl.sin * w.z, -isl.sin * w.x + isl.cos * w.z);
}

/** World-space direction of the sunset, turned into an island's frame. */
function sunsetLocal(isl) {
  const s = sunDirection(18);
  const w = norm(v(s.x, s.z));
  return v(isl.cos * w.x + isl.sin * w.z, -isl.sin * w.x + isl.cos * w.z);
}

function spots() {
  const out = [];
  const bar = ISLAND_BY_ID.bar.features;
  const split = bar.palms[0];
  const big = bar.palms[1];
  out.push(
    {
      island: 'bar',
      at: add(split, sunsetLocal(ISLAND_BY_ID.bar), 20 * PACE),
      note: '20 paces from the split palm toward the sunset. NOT the big palm.',
    },
    {
      island: 'bar',
      at: add(lerp2(bar.rock, split, 0.5), v(0, 1), 4 * PACE),
      note: 'Halfway from the rock to the split palm, then 4 paces to the south beach. Maybe 5.',
    },
    {
      island: 'bar',
      at: add(bar.shrubs[1], v(1, 0), 1.2),
      note: 'Under the bush between the two middle palms. East side of it.',
    },
    {
      island: 'bar',
      at: add(big, v(1, 0), 10 * PACE),
      note: 'Big palm. 10 paces along the bar, away from the rock.',
    },
  );

  const burnt = ISLAND_BY_ID.burnt.features;
  const bigRock = burnt.rocks[0];
  const livePalm = burnt.palms[0];
  const [s1, s2, s3] = burnt.stumps;
  out.push(
    {
      island: 'burnt',
      at: add(bigRock, norm(sub(livePalm, bigRock)), 6),
      note: 'Black rock in the middle. 8 paces off it, on the side toward the palm that still has leaves.',
    },
    {
      island: 'burnt',
      at: add(s3, norm(sub(s3, s2)), 6 * PACE),
      note: 'Three burnt stumps in a line. Keep going 6 paces past the end. Not the other end, tried that.',
    },
    {
      island: 'burnt',
      at: lerp2(s1, s2, 0.5),
      note: 'Between the first two stumps. Right between.',
    },
  );

  out.push(
    {
      island: 'sow',
      at: v(-44, -1),
      note: 'Little beach under the Sow. Middle of it. There is not much beach.',
    },
    {
      island: 'sow',
      at: v(-44, -9),
      note: 'Same little beach, the left end as you come ashore. Where the rock starts.',
    },
  );

  const hs = ISLAND_BY_ID.horseshoe.features;
  const landward = (p) => norm(v(p.x, p.z));
  const third = hs.palms[2];
  const shortArm = lerp2(hs.palms[3], hs.palms[4], 0.5);
  out.push(
    {
      island: 'horseshoe',
      at: add(third, landward(third), 3),
      note: 'Inner beach. Third palm along from the tip with the rocks. Behind it, away from the water.',
    },
    {
      island: 'horseshoe',
      at: add(shortArm, landward(shortArm), 2.5),
      note: 'Short arm. Between the two palms, back from the water a little.',
    },
  );

  const stack = ISLAND_BY_ID.stack.features;
  const crooked = stack.palms[0];
  out.push({
    island: 'stack',
    at: add(crooked, norm(sub(v(crooked.x, crooked.z - 9), crooked)), 4),
    note: 'Pebble beach. Crooked palm, 5 paces along the beach to the left of it as you land.',
  });

  const reef = ISLAND_BY_ID.reef.features;
  out.push(
    {
      island: 'reef',
      at: lerp2(reef.palms[0], reef.palms[1], 0.7),
      note: 'On the sand island. Between the two palms, nearer the short one.',
    },
    {
      island: 'reef',
      at: v(reef.cay.x + reef.cay.a * 0.55, reef.cay.z - 1),
      note: 'Sand island, the end facing the wreck. Above the wet sand.',
    },
  );
  // --- The outer islands (maps signed as version 2; see verifyMap). ---
  const head = ISLAND_BY_ID.head.features;
  const door = v(head.light.x - 2.6, head.light.z);
  out.push(
    {
      island: 'head',
      at: add(door, norm(sub(head.cove, door)), 10 * PACE),
      note: 'Old Head. Out of the lighthouse door, then 10 paces straight toward the cove.',
    },
    {
      island: 'head',
      at: add(v(head.cove.x, head.cove.z), norm(sub(v(0, 0), head.cove)), head.cove.r + 7),
      note: 'Old Head, the cove. Back of the beach, right where the grass starts.',
    },
  );
  const kettle = ISLAND_BY_ID.kettle.features;
  out.push({
    island: 'kettle',
    at: v(Math.cos(kettle.notch) * 44, Math.sin(kettle.notch) * 44),
    note: 'Kettle Island. Climb to the low place in the rim, on the side facing Saddle. Dig on the top of it.',
  });
  const bro = ISLAND_BY_ID.brothers.features;
  out.push({
    island: 'brothers',
    at: v(bro.beach.x + 1, bro.beach.z - 1),
    note: 'The Brothers. The shingle beach under the big brother. Right at the back, against the rock.',
  });
  const green = ISLAND_BY_ID.green.features;
  out.push({
    island: 'green',
    at: add(green.bigTree, sunriseLocal(ISLAND_BY_ID.green), 6 * PACE + 1.5),
    note: 'Green Island. The big tree in the middle. 6 paces from it toward the sunrise.',
  });
  return out;
}

export const SPOTS = spots();
// Maps from before the outer islands could only point at the first 14 spots.
const SPOTS_V1 = SPOTS.slice(0, 14);

const BEARINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function bearingFromSaddle(isl) {
  // World north is −z.
  const ang = Math.atan2(isl.x, -isl.z); // clockwise from north
  const i = Math.round(((ang * 180) / Math.PI + 360) / 45) % 8;
  return BEARINGS[i];
}

export function spotWorld(spot) {
  const isl = ISLAND_BY_ID[spot.island];
  return toWorld(isl, spot.at.x, spot.at.z);
}

// Pell's Bar: dig where the rock's late shadow crosses the weed line.
export const PUZZLES = {
  'pells-bar': () => pellsBar().spot,
  horseshoe: () => horseshoeCove().spot,
};

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

const enc = new TextEncoder();
const keys = new Map();

async function hmac(secret, msg) {
  let key = keys.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keys.set(secret, key);
  }
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

const hex = (bytes, n) => [...bytes.slice(0, n)].map((b) => b.toString(16).padStart(2, '0')).join('');
const u32 = (b, o = 0) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

export async function verifyMap(secret, id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{16}\.[0-9a-f]{16}$/.test(id)) return null;
  const [nonce, sig] = id.split('.');
  // Version 2 maps can lead anywhere; version 1 maps keep their old spots.
  let list = null;
  if (hex(await hmac(secret, `map2:${nonce}`), 8) === sig) list = SPOTS;
  else if (hex(await hmac(secret, `map:${nonce}`), 8) === sig) list = SPOTS_V1;
  if (!list) return null;
  const pick = await hmac(secret, `spot:${nonce}`);
  return { nonce, spot: list[u32(pick) % list.length], bytes: pick };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** A new map. `not`: island ids to avoid (e.g. the one you just dug up). */
export async function issueMap(secret, { not = [] } = {}) {
  for (let tries = 0; tries < 12; tries++) {
    const nonce = hex(crypto.getRandomValues(new Uint8Array(8)), 8);
    const id = `${nonce}.${hex(await hmac(secret, `map2:${nonce}`), 8)}`;
    const m = await verifyMap(secret, id);
    if (not.includes(m.spot.island) && tries < 11) continue;
    const isl = ISLAND_BY_ID[m.spot.island];
    const truth = spotWorld(m.spot);
    // The X is drawn by hand: up to a couple of metres out.
    const ang = (u32(m.bytes, 4) / 2 ** 32) * Math.PI * 2;
    const r = 0.8 + (u32(m.bytes, 8) / 2 ** 32) * 1.8;
    return {
      id,
      island: isl.id,
      title: `${isl.name}, ${bearingFromSaddle(isl)} of Saddle`,
      mark: { x: truth.x + Math.cos(ang) * r, z: truth.z + Math.sin(ang) * r },
      note: m.spot.note,
    };
  }
  throw new Error('unreachable');
}

/**
 * Someone dug at (x, z) holding these maps. The server alone decides.
 * Returns { result: 'chest', map | puzzle } | { result: 'crab' } | { result: 'nothing' }.
 */
export async function dig(secret, { x, z, maps = [] }) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { result: 'nothing' };
  for (const id of maps.slice(0, 20)) {
    const m = await verifyMap(secret, id);
    if (!m) continue;
    const p = spotWorld(m.spot);
    if (Math.hypot(p.x - x, p.z - z) <= DIG_RADIUS) return { result: 'chest', map: id };
  }
  for (const [name, at] of Object.entries(PUZZLES)) {
    const p = at();
    if (p && Math.hypot(p.x - x, p.z - z) <= DIG_RADIUS) return { result: 'chest', puzzle: name };
  }
  // Same patch of sand, same answer: about one hole in four has a crab in it.
  const c = await hmac(secret, `crab:${Math.round(x / 2)}:${Math.round(z / 2)}`);
  return { result: c[0] < 64 ? 'crab' : 'nothing' };
}

// Close up, the ground over a buried chest looks a little different: turned
// earth, settled unevenly. Only tell the client where once the player is
// standing near enough to notice. The puzzles' spots show only right up close
// so working them out still matters.
const NEAR = 9;
const NEAR_PUZZLE = 3.5;

/** Spots of buried chests (for maps held, and the puzzles) close to (x, z). */
export async function near(secret, { x, z, maps = [] }) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { spots: [] };
  const spots = [];
  const r2 = (n) => Math.round(n * 100) / 100;
  for (const id of maps.slice(0, 20)) {
    const m = await verifyMap(secret, id);
    if (!m) continue;
    const p = spotWorld(m.spot);
    if (Math.hypot(p.x - x, p.z - z) <= NEAR) spots.push({ x: r2(p.x), z: r2(p.z), map: id });
  }
  for (const [name, at] of Object.entries(PUZZLES)) {
    const p = at();
    if (p && Math.hypot(p.x - x, p.z - z) <= NEAR_PUZZLE) spots.push({ x: r2(p.x), z: r2(p.z), puzzle: name });
  }
  return { spots };
}

// Chests that sit at the top of a climb rather than in a hole.
export const COURSES = {
  wreck: () => foreTopChest(),
  'molly-ann': () => hatchChest(),
  gannet: () => gannetNest(),
};

/** Is the player really up there with the chest? */
export function claim({ course, x, y, z }) {
  const at = Object.hasOwn(COURSES, course) ? COURSES[course]() : null;
  if (!at || ![x, y, z].every(Number.isFinite)) return { result: 'nothing' };
  if (Math.hypot(at.x - x, at.y - y, at.z - z) > 3) return { result: 'nothing' };
  return { result: 'chest', course };
}

export { dirToWorld };
