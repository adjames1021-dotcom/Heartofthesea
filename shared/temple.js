import { ISLAND_BY_ID, toWorld } from './world.js';

// The keepers' temple on Saddle, in the saddle between the two hills: a long
// walled compound on a raised podium, its gate facing the bay. Inside, in
// order: a forecourt; a hall of swinging blades; a pit crossed on pillars
// (some of which give way); a corridor whose floor puts up spikes in a wave;
// a ramp a boulder comes down; and the sanctum, with the Heart of the Sea on
// its stone. A brazier lights at the start of each, and a trap sends you
// back to the last one lit.
//
// The temple's frame: the island's axes, origin on the floor at the middle,
// y = 0 the floor (the podium, flattened in shared/world.js). The gate's at
// +z; you go in toward −z.

// (Where it is, its size and the pit's are the terrain's: shared/world.js, saddleIsland.)
const T = ISLAND_BY_ID.saddle.features.temple;

export const TEMPLE = {
  at: T.at, // island-local, the middle
  half: T.half, // the outer wall's outside
  wall: { h: 5, t: 0.9 },
  gate: { z: 37, half: 2.2, h: 4.2 },
  court: { z0: 29, z1: 37, half: 9 },
  // (Swinging to just short of the walls: get by on the side it isn't.)
  blades: { z0: 15, z1: 29, half: 3, at: [25, 20.5, 16], pivot: 6.6, len: 5.75, swing: 0.38, period: 2.4 },
  pit: { ...T.pit, start: 9, end: -3 },
  // Pillars across the pit: [x, z, top half-size, crumbles?]
  // (Gaps of 1.2–1.9 m between their edges: the widest wants a run at it.)
  pillars: [
    [-3.2, 6.3, 0.7, false],
    [-0.3, 4.9, 0.7, true],
    [3.0, 3.6, 0.75, false],
    [3.2, 0.6, 0.7, true],
    [0.2, -0.6, 0.75, false],
  ],
  spikes: { z0: -19, z1: -5, half: 3, rows: [-7, -9, -11, -13, -15, -17], row: 1.8, period: 3.0, lag: 0.32, up: 0.42 },
  ramp: { z0: -36, z1: -22, half: 3, rise: 3.0, alcoves: [[-26.5, 1], [-30.5, -1], [-34.2, 1]], alcove: { d: 1.4, w: 1.7 } },
  sanctum: { z0: -48, z1: -36, half: 7, heart: { x: 0, z: -43.5, y: 1.25 } },
  // Where you come back to: [x, z, y] in the temple's frame, gate first.
  checkpoints: [
    [0, 31.5, 0],
    [0, 13.0, 0],
    [0, -4.0, 0],
    [0, -20.5, 0],
  ],
};

const saddle = () => ISLAND_BY_ID.saddle;

/** The ramp's height at z (temple frame): 0 at its foot, rise at its top. */
export function rampAt(z) {
  const R = TEMPLE.ramp;
  return z > R.z1 ? 0 : z < R.z0 ? R.rise : (R.rise * (R.z1 - z)) / (R.z1 - R.z0);
}

/** A point in the temple's frame, in the world (y from the floor's height, `base`). */
export function templePoint(x, z, y = 0) {
  const isl = saddle();
  const p = toWorld(isl, TEMPLE.at.x + x, TEMPLE.at.z + z);
  return { x: p.x, y: isl.features.temple.floor + y, z: p.z };
}

/** The temple's frame: { x, y, z, yaw } (yaw as three.js rotation.y). */
export function templeFrame() {
  const p = templePoint(0, 0, 0);
  return { ...p, yaw: -saddle().rot };
}

/** Outside the gate, where you put the keys in. */
export const templeGate = () => templePoint(0, TEMPLE.gate.z + 2.5, 0);

/** The Heart, on its stone in the sanctum. */
export function templeHeart() {
  const h = TEMPLE.sanctum.heart;
  return templePoint(h.x, h.z, TEMPLE.ramp.rise + h.y);
}
