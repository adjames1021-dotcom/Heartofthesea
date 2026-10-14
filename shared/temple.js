import { ISLAND_BY_ID, toWorld } from './world.js';

// The keepers' temple, inside the big hill on Saddle. Its gate is cut into
// the hill's east flank, facing the saddle; from there it goes in under the
// hill and down, a long way, in three legs:
//
//   in, west:  the entrance hall; a hall of swinging blades; a pit crossed on
//              pillars (some give way, one slides); the keepers' hall, where
//              you walk their eight plates in the order you found their keys;
//   down:      a long stair with steps fallen out of it;
//   south:     a corridor whose floor puts up spikes in waves; a room of
//              mirrors to carry a bar of daylight to the door; a cistern you
//              flood to swim up to a door high in its wall;
//   east, then back west: a bridge of slabs over a chasm that fall as you
//              cross; a ramp down that a boulder chases you along;
//   and at the bottom, a door of eight dials (set each to its keeper's count,
//   from the keepers' stones out on the islands) and the cavern at the
//   hill's heart: black water, stepping stones, and the Heart of the Sea on
//   its stone under a shaft of daylight.
//
// A brazier lights at the start of each part, and a trap sends you back to
// the last one lit.
//
// Frames. The temple's own (TF): origin on the floor at the gate, −z into the
// hill, y up from the gate's floor. Each part (a "section") has its own frame
// too, the way the traps are written: origin on its floor where you come in,
// −z the way you go, x across (to your right), y up from its floor. `dir`
// turns a section's frame in the temple's: 0 on (−z), 1 right (+x), 2 back
// (+z), 3 left (−x). Its `at` is where its origin is, in the temple's frame.

// (Where it is, the floor's height, and the cut into the hillside: shared/world.js, saddleIsland.)
const T = ISLAND_BY_ID.saddle.features.temple;

export const TEMPLE = {
  gate: { half: 2.2, h: 4.2 },
  sections: {
    hall: { at: [0, 0, 0], dir: 0, len: 14, half: 5, h: 7, door: { half: 2, h: 4 } },
    blades: {
      at: [0, 0, -14], dir: 0, len: 30, half: 3, h: 8.5, door: { half: 2, h: 4 },
      // (Swinging to just short of the walls: get by on the side it isn't.)
      zs: [-4, -9.5, -15, -20.5, -26], pivot: 6.6, arm: 5.75, swing: 0.38,
      periods: [2.3, 1.9, 2.5, 1.8, 2.1], phases: [0, 2.1, 4.2, 1.0, 3.1],
    },
    pit: {
      at: [0, 0, -44], dir: 0, len: 30, half: 5.5, h: 9, depth: 10, door: { half: 2, h: 4 },
      ledges: [3, 3], // how far the ledge at each end comes out
      // Pillars across: [x, z, top half-size, kind]: solid, crumbles (sinks if you
      // stand about), or slides (back and forth across the pit).
      // (Gaps of 1.2–1.9 m between their edges: the widest want a run at them.)
      pillars: [
        [-3.0, -4.6, 0.7, 'solid'],
        [-0.4, -6.4, 0.7, 'crumbles'],
        [2.6, -8.0, 0.75, 'solid'],
        [2.8, -10.9, 0.7, 'crumbles'],
        [0.0, -12.9, 0.75, 'slides'],
        [-2.8, -14.8, 0.75, 'solid'],
        [-2.6, -17.7, 0.7, 'crumbles'],
        [0.2, -19.5, 0.7, 'solid'],
        [2.9, -21.3, 0.7, 'crumbles'],
        [0.7, -23.4, 0.75, 'solid'],
        [-1.2, -25.4, 0.7, 'solid'],
      ],
      slide: { reach: 2.6, period: 5.5 },
    },
    keepers: {
      at: [0, 0, -74], dir: 0, len: 18, half: 8, h: 10, door: { half: 1.6, h: 3.6 },
      // The eight keepers, in stone along the walls: [key, x, z].
      statues: [[4, -7, -4.5], [1, -7, -8], [6, -7, -11.5], [3, -7, -15], [7, 7, -4.5], [2, 7, -8], [8, 7, -11.5], [5, 7, -15]],
      // Their plates in the floor: [key, x, z]. Walk them in the order you found the keys.
      plates: [[5, -3.6, -7.5], [1, -1.2, -7.5], [8, 1.2, -7.5], [3, 3.6, -7.5], [6, -3.6, -11.5], [2, -1.2, -11.5], [7, 1.2, -11.5], [4, 3.6, -11.5]],
      plate: 0.75,
    },
    stair: {
      at: [0, 0, -92], dir: 0, len: 28, half: 2.5, h: 4.5,
      // Down 12 m in 24 steps, from z −2 to −22; a landing at the foot (its right side open to the spikes). Some steps have fallen out.
      top: -2, foot: -22, drop: 12, steps: 24, gone: [8, 9, 15, 16],
    },
    spikes: {
      at: [2.5, -12, -117], dir: 1, len: 32, half: 3, h: 6, door: { half: 2, h: 4 },
      // Rows of spikes, each [z, period, lag]: up in a wave, then a quicker wave further on.
      // (Each wave can be run straight through, if you go just as its first row drops;
      // there's room to stop between the two.)
      rows: [
        [-3, 2.6, 0.0], [-5.2, 2.6, 0.3], [-7.4, 2.6, 0.6], [-9.6, 2.6, 0.9], [-11.8, 2.6, 1.2], [-14, 2.6, 1.5], [-16.2, 2.6, 1.8],
        [-19.6, 2.2, 0.0], [-21.8, 2.2, 0.3], [-24, 2.2, 0.6], [-26.2, 2.2, 0.9], [-28.4, 2.2, 1.2], [-30.6, 2.2, 1.5],
      ],
      row: 1.8, up: 0.45,
    },
    mirrors: {
      at: [34.5, -12, -117], dir: 1, len: 16, half: 8, h: 10, door: { half: 1.6, h: 3.6 },
      // A bar of daylight comes in through a slot in the left wall and has to
      // reach the eye over the far door. Mirrors on posts turn between two
      // ways (each sends it off at a right angle): [x, z, starts].
      beam: { from: [-8, -3], dir: [1, 0], y: 1.6 },
      list: [[-3, -3, 1], [-3, -9, 1], [3, -9, 1], [3, -13, 0], [3, -3, 0], [0, -13, 0]],
      // Stone posts the light can't pass: [x, z, half].
      posts: [[0, -6, 0.45], [6, -9, 0.45], [-6, -13, 0.45]],
      eye: [0, -16],
    },
    cistern: {
      at: [50.5, -12, -117], dir: 1, len: 14, half: 6, h: 14,
      ledge: 2.5, bottom: -4, low: -1, high: 5.6,
      // The way on: a door high up the far wall (its sill this high).
      door: { half: 1.4, h: 2.6, sill: 6 },
      wheel: [-5.3, 1.3, -1.2],
      ladder: { x: 3.6, w: 1.0 },
      rise: 0.26, hold: 14, fall: 0.5,
    },
    // (Its right side's open from 2.5 m in: the bridge goes off that way.)
    landing: { at: [64.5, -6, -117], dir: 1, len: 10.5, half: 3, h: 10, open: [-2.5, -10.5] },
    bridge: {
      at: [71, -6, -114], dir: 2, len: 32.5, half: 4, h: 10, depth: 18,
      // The far ledge is long: the ramp goes off its right side.
      ledges: [2.5, 6],
      // Slabs across, 1.25 m each, 1.6 wide; these ones already gone.
      slab: 1.25, width: 0.8, gone: [6, 13],
      fallAfter: 0.4, backAfter: 5,
    },
    boulder: {
      at: [67, -6, -84.5], dir: 3, len: 30, half: 3, h: 6,
      // Down 12 m from z −2 to −26; the slot it drops into at the foot.
      top: -2, foot: -26, drop: 12, slot: [-26.4, -28],
      alcoves: [[-7, -1], [-12.5, 1], [-18, -1], [-23, 1]], alcove: { d: 1.4, w: 1.8 },
    },
    sanctum: {
      at: [37, -18, -84.5], dir: 3, len: 22, half: 13, h: 22,
      // The antechamber, and the door of eight dials at its end.
      ante: { len: 5, half: 5, h: 6 },
      dial: { z: -5, r: 1.7 },
      pool: { y: -0.5, bottom: -3 },
      island: { x: 3, z: -15.5, r: 3.4, y: 0.3 },
      // Stepping stones from the door round to the island: [x, z, half, sinks?].
      stones: [
        [0.0, -6.9, 0.7, false],
        [-1.8, -8.3, 0.55, false],
        [-3.3, -10.0, 0.55, true],
        [-2.4, -11.9, 0.55, false],
        [-3.6, -13.8, 0.5, true],
        [-2.3, -15.6, 0.55, false],
        [-1.0, -17.4, 0.5, true],
      ],
      heart: { y: 1.25 },
    },
  },
  // The way through, in order.
  order: ['hall', 'blades', 'pit', 'keepers', 'stair', 'spikes', 'mirrors', 'cistern', 'landing', 'bridge', 'boulder', 'sanctum'],
  // Where you come back to: [section, x, z, y] in its frame. A brazier by each.
  checkpoints: [
    ['hall', 0, -3, 0],
    ['pit', 0, -1.5, 0],
    ['keepers', 0, -2, 0],
    ['stair', 0, -1, 0],
    ['spikes', 0, -1.2, 0],
    ['mirrors', 0, -1.5, 0],
    ['cistern', 0, -1.2, 0],
    ['bridge', 0, -1.2, 0],
    ['boulder', 0, -0.9, 0],
    ['sanctum', 0, -2.4, 0],
  ],
};

const saddle = () => ISLAND_BY_ID.saddle;
const SIN = [0, -1, 0, 1]; // sin(−dir·π/2)
const COS = [1, 0, -1, 0];

/** A point in a section's frame → the temple's frame: [x, y, z]. */
export function inTemple(sec, x, y, z) {
  const s = typeof sec === 'string' ? TEMPLE.sections[sec] : sec;
  const c = COS[s.dir];
  const n = SIN[s.dir];
  return [s.at[0] + x * c + z * n, s.at[1] + y, s.at[2] - x * n + z * c];
}

/** The section's turn in the temple's frame (as three.js rotation.y). */
export const sectionYaw = (sec) => (-(typeof sec === 'string' ? TEMPLE.sections[sec] : sec).dir * Math.PI) / 2;

/** A point in the temple's frame, in the world. */
export function templePoint(x, z, y = 0) {
  const c = Math.cos(T.turn);
  const s = Math.sin(T.turn);
  const p = toWorld(saddle(), T.gate.x + x * c + z * s, T.gate.z - x * s + z * c);
  return { x: p.x, y: T.floor + y, z: p.z };
}

/** A point in a section's frame, in the world. */
export function sectionPoint(sec, x, z, y = 0) {
  const [tx, ty, tz] = inTemple(sec, x, y, z);
  return templePoint(tx, tz, ty);
}

/** The temple's frame: { x, y, z, yaw } (yaw as three.js rotation.y). */
export function templeFrame() {
  const p = templePoint(0, 0, 0);
  return { ...p, yaw: T.turn - saddle().rot };
}

/** Outside the gate, where you put the keys in. */
export const templeGate = () => templePoint(0, 2.5, 0);

/** The Heart, on its stone in the cavern. */
export function templeHeart() {
  const S = TEMPLE.sections.sanctum;
  return sectionPoint('sanctum', S.island.x, S.island.z, S.island.y + S.heart.y);
}

/** The stair's floor at z (its frame): 0 at the top, −drop at the foot. */
export function stairAt(z, S = TEMPLE.sections.stair) {
  if (z >= S.top) return 0;
  if (z <= S.foot) return -S.drop;
  const run = (S.top - S.foot) / S.steps;
  const i = Math.min(S.steps - 1, Math.floor((S.top - z) / run));
  return -(i + 1) * (S.drop / S.steps);
}

/** The boulder's ramp at z (its frame): 0 at the top, −drop at the foot. */
export function rampAt(z, R = TEMPLE.sections.boulder) {
  return z > R.top ? 0 : z < R.foot ? -R.drop : (-R.drop * (R.top - z)) / (R.top - R.foot);
}

/**
 * The room each section takes up under the hill, in the temple's frame:
 * { x0, x1, y0, y1, z0, z1 } (a little over, for its walls). Inside these,
 * the hill's own ground doesn't count: the temple's floors do.
 */
export function templeRooms() {
  return TEMPLE.order.map((id) => {
    const s = TEMPLE.sections[id];
    const below = (s.depth ?? 0) + (s.drop ?? 0) + 4;
    const pts = [];
    for (const x of [-s.half - 2.5, s.half + 2.5]) for (const z of [1, -s.len - 1]) pts.push(inTemple(s, x, 0, z));
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[2]);
    return { id, x0: Math.min(...xs), x1: Math.max(...xs), y0: s.at[1] - below, y1: s.at[1] + s.h + 1.5, z0: Math.min(...zs), z1: Math.max(...zs) };
  });
}
