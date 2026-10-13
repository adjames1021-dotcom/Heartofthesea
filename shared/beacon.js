import { ISLAND_BY_ID, toWorld, groundAt } from './world.js';

// The watch tower on top of Beacon Island: a round stone tower with a stair
// climbing the inside of its wall round a central post (the newel), the
// lamp floor at the top, and the old signal lamp on an iron post above it.
// Plain numbers, shared with the server, which needs to know where the
// light falls (that's where the chest is buried).
//
// Its own frame: the island's local axes (x, z), y up, y = 0 the ground at
// its foot. Angles go round from +x toward +z.

export const TOWER = {
  r: 4.2, // outside
  inner: 3.6, // inside of the wall
  newel: 0.5, // the post up the middle
  floor: 11.2, // the lamp floor (and the wall top: the parapet's mostly gone)
  door: { a: 0, half: 0.76, h: 2.4 }, // at angle a, half its width (two of the wall's 32 pieces), its height
  // The stair: steps cut into the wall and the newel, one a turn of `turn`
  // further round and `rise` higher than the last, from just past the door.
  steps: { n: 37, rise: 0.3, turn: 0.28, a0: 0.62, thick: 0.26 },
  // Fallen: two gaps to jump; and from step 25 up, the stair's gone, and
  // half the lamp floor with it. A rope hangs from its broken edge.
  gaps: [8, 9, 16, 17],
  fallenFrom: 25,
  lamp: { y: 14.4, post: 0.12 }, // the lamp's height, on its iron post
};

/** Step k: { a (its middle), y (its top) }. */
export function towerStep(k) {
  const s = TOWER.steps;
  return { a: s.a0 + k * s.turn, y: (k + 1) * s.rise };
}

/** Is step k still there? */
export const stepStands = (k) => k < TOWER.fallenFrom && !TOWER.gaps.includes(k);

/** The angles (from, to) the lamp floor is open over: where the stair used to come up. */
export function floorGap() {
  const s = TOWER.steps;
  return { from: towerStep(TOWER.fallenFrom).a - s.turn / 2, to: towerStep(s.n - 1).a + s.turn / 2 };
}

const beacon = () => ISLAND_BY_ID.beacon;

/** Where the tower stands: { x, y, z, yaw } (yaw as three.js rotation.y). */
export function towerFrame() {
  const isl = beacon();
  const t = isl.features.tower;
  const p = toWorld(isl, t.x, t.z);
  return { x: p.x, y: groundAt(p.x, p.z), z: p.z, yaw: -isl.rot };
}

/** The standing stones, in the tower's frame: the hollow's middle, and how far off. */
export function stonesFromTower() {
  const f = beacon().features;
  const dx = f.stones.x - f.tower.x;
  const dz = f.stones.z - f.tower.z;
  return { a: Math.atan2(dz, dx), dist: Math.hypot(dx, dz) };
}

/** The lamp turns in eighths of a turn; aimed `step` eighths round from the stones. */
export const LAMP_STEPS = 8;
export const lampAngle = (step) => stonesFromTower().a + (step * Math.PI * 2) / LAMP_STEPS;

/** Where the chest is buried: in the hollow by the stones, where the light falls. */
export function beaconSpot() {
  const isl = beacon();
  const s = isl.features.stones;
  return toWorld(isl, s.x, s.z);
}
