import { ISLAND_BY_ID, toWorld } from './world.js';

// The Kittiwake, lying on her port side on Black Ledges. Plain numbers, shared
// with the server, which needs to know where her chest is.
//
// Her own frame (what src/kittiwake.js builds in): x along her, bow +x; z
// across; y up. Rolled onto her side, what was her deck faces +z (inshore),
// her keel sticks out to −z (seaward), her starboard side is uppermost and
// her port side lies on the rock. y = 0 is the rock under her.
//
// In her old upright terms (x, up, across) → here (x, y, z):
//   y = across + HALF   (port side on the rock, starboard on top)
//   z = up − DEPTH / 2  (keel seaward, deck inshore)

export const KW = {
  length: 15,
  stern: -7.4, // her transom
  stem: 7.6,
  half: 2.3, // her half-breadth amidships, at the deck
  depth: 2.6, // keel to deck
  // The hold between her bulkheads, and the water standing in it.
  aftBulkhead: -2.0,
  foreBulkhead: 4.0,
  water: { full: 2.6, empty: 0.55, perStroke: 0.17 },
  // Where she's stove in, on her uppermost side, over the hold.
  hole: { x0: -0.7, x1: 0.9, z0: -0.4, z1: 1.12 },
  // The cabin door in the after bulkhead (an opening, in her lying frame).
  door: { y0: 1.0, y1: 2.4, z0: -0.7, z1: 0.9 },
  // Crates lashed in the forward end of the hold, with the pump beside them.
  crates: { x0: 2.4, x1: 3.9, z0: 0.0, z1: 1.2, top: 2.95 },
  pump: { x: 2.2, z: 0.75 },
  // The chest in the cabin, on what's now the floor.
  chest: { x: -4.6, y: 0.45, z: 0.5 },
};

/** Her half-breadth (upright) at x, at the deck. */
export function kwBreadth(x) {
  const fwd = x > 0.8;
  const t = (x - 0.8) / (fwd ? 6.8 : 9.6); // (to a point at her stem)
  return KW.half * Math.sqrt(Math.max(0, 1 - t * t));
}

/** Where she lies: { x, y, z, yaw } of her frame in the world (yaw as three.js rotation.y). */
export function kittiwakeFrame() {
  const isl = ISLAND_BY_ID.ledges;
  const f = isl.features.kittiwake;
  const p = toWorld(isl, f.x, f.z);
  return { x: p.x, y: f.y, z: p.z, yaw: -(isl.rot + f.yaw) };
}

/** A point in her frame, in the world. */
export function kittiwakePoint(x, y, z) {
  const f = kittiwakeFrame();
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  // three.js rotation.y: x' = c x + s z, z' = −s x + c z.
  return { x: f.x + c * x + s * z, y: f.y + y, z: f.z - s * x + c * z };
}

/** Where her chest is (the server's claim checks against this). */
export function kittiwakeChest() {
  const c = KW.chest;
  return kittiwakePoint(c.x, c.y, c.z);
}
