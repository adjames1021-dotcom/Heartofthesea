// Decorating the cabin. Things you've found (and a few you've been given or
// dug up) can be put anywhere below decks: on a table, a shelf, the floor,
// or hung on a wall. Shared by the game and the server, which keeps where
// everything is so anyone who comes aboard sees it the same.
//
// Positions are in the cabin's own frame (src/interior.js): the boat's own
// x (toward the bow) and z (to starboard), and y = 0 on the cabin sole.
// The cabin was rebuilt inside the hull in version 2 of the layout; things
// put about the old one went back to their first places (worker/rules.js).

import { ITEMS, FIND_IDS } from './items.js';

/** What can go about the cabin: finds, the cork float, and things of value. */
export const decorable = (kind) => FIND_IDS.includes(kind) || kind === 'corkfloat' || ITEMS[kind]?.kind === 'valuable';

export const LAYOUT_V = 2;

/** Where each find goes when you first bring it aboard (until you move it). */
export const DEFAULT_SPOTS = {
  // On the saloon table.
  bottle: { at: [1.02, 0.745, -0.28], yaw: 0.3 },
  float: { at: [1.12, 0.745, -0.66], yaw: 0 },
  lead: { at: [1.3, 0.745, -0.42], yaw: 0.8 },
  cowrie: { at: [1.52, 0.745, -0.7], yaw: 0.4 },
  seaglass: { at: [1.58, 0.745, -0.3], yaw: 0 },
  scallop: { at: [1.72, 0.745, -0.6], yaw: 2.4 },
  pipe: { at: [1.8, 0.745, -0.22], yaw: 1 },
  // On the chart table.
  log: { at: [-0.85, 0.79, 1.12], yaw: 0.2 },
  spyglass: { at: [0.02, 0.79, 1.3], yaw: -0.3 },
  // On the walls: the bell by the companionway, the nameboard on the bulkhead.
  bell: { at: [-1.13, 1.42, 0.7], yaw: Math.PI / 2, wall: true },
  nameboard: { at: [2.08, 1.0, -0.62], yaw: -Math.PI / 2, wall: true },
};

/** Inside the cabin, roughly. */
export function inCabin([x, y, z]) {
  return x > -1.25 && x < 4.5 && y >= -0.05 && y < 2.15 && Math.abs(z) < 1.95;
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
