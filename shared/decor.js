// Decorating the cabin. Things you've found (and a few you've been given or
// dug up) can be put anywhere below decks: on a table, a shelf, the floor,
// or hung on a wall. Shared by the game and the server, which keeps where
// everything is so anyone who comes aboard sees it the same.
//
// Positions are in the cabin's own frame (src/interior.js): +x toward the
// bow, +z to starboard, y = 0 the floor.

import { ITEMS, FIND_IDS } from './items.js';

/** What can go about the cabin: finds, the cork float, and things of value. */
export const decorable = (kind) => FIND_IDS.includes(kind) || kind === 'corkfloat' || ITEMS[kind]?.kind === 'valuable';

/** Where each find goes when you first bring it aboard (until you move it). */
export const DEFAULT_SPOTS = {
  bottle: { at: [-0.55, 0.73, 0.15], yaw: 0.3 },
  float: { at: [-0.3, 0.73, -0.18], yaw: 0 },
  lead: { at: [-0.05, 0.73, 0.2], yaw: 0.8 },
  cowrie: { at: [0.15, 0.73, -0.12], yaw: 0.4 },
  seaglass: { at: [0.3, 0.73, 0.12], yaw: 0 },
  scallop: { at: [0.42, 0.73, -0.15], yaw: 2.4 },
  pipe: { at: [0.5, 0.73, 0.12], yaw: 1 },
  log: { at: [-2.75, 0.8, 1.3], yaw: 0.2 },
  spyglass: { at: [-2.2, 0.8, 1.32], yaw: -0.3 },
  bell: { at: [-3.64, 1.62, 0.62], yaw: Math.PI / 2, wall: true },
  nameboard: { at: [1.39, 1.79, 0], yaw: -Math.PI / 2, wall: true },
};

/** Inside the cabin, roughly. */
export function inCabin([x, y, z]) {
  return x > -3.8 && x < 4.0 && y >= -0.05 && y < 2.1 && Math.abs(z) < 2.0;
}

export const MAX_DECOR = 60;

/**
 * Everything about the cabin and where it is: what you've put down, and
 * finds not yet moved, in their first places. [{ item, kind, at, yaw, wall }]
 */
export function cabinLayout(s) {
  const out = [...(s.decor ?? [])];
  const placed = new Set(out.map((d) => d.item));
  const stowed = new Set(s.stowed ?? []);
  for (const it of s.items ?? []) {
    if (placed.has(it.id) || stowed.has(it.id) || !DEFAULT_SPOTS[it.kind]) continue;
    const d = DEFAULT_SPOTS[it.kind];
    out.push({ item: it.id, kind: it.kind, at: d.at, yaw: d.yaw, wall: !!d.wall });
  }
  return out;
}

/** Things about the cabin, by item id. */
export const aboutCabin = (s) => new Set(cabinLayout(s).map((d) => d.item));
