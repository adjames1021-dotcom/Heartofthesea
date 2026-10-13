import { ISLAND_BY_ID, toWorld, tidalReach } from './world.js';
import { tideAt } from './environment.js';

// The Zawn on Cormorant Island: a slot in the north cliff, under an arch the
// sea fills from a little above half tide, into a pool hidden in the rock.
// The smugglers' landing is there: a quay, a winch that lowered a gangway
// over deep water to a ledge, and a cellar door in the rock behind it. The
// winch's handle they kept dry in a cleft in the pool wall, whose mouth is
// only open at low water. The terrain is shaped in shared/world.js
// (cormorantIsland); this is the rest, in the island's own frame.

const isl = () => ISLAND_BY_ID.cormorant;
const F = () => isl().features;

export const ZAWN = {
  // The gangway: hinged on the quay's edge, its far end on the ledge when down.
  gangway: { hingeX: -12.2, z: 23.5, half: 0.55, raised: 1.43, len: 5.95 },
  winch: { x: -10.6, z: 21.4 },
  handle: { x: 32.4, z: 38.3 }, // on the dry shelf at the back of the cleft
  lever: { x: -21.2, z: 19.9, top: 1.3 }, // up on a rock at the ledge's end (above the ledge)
  door: { x: -25, z0: 22.8, z1: 24.4, h: 2.3 }, // the cellar's, in its front wall
  chest: { x: -29.2, z: 23.6 },
};

/** Where the cellar chest is (the server's claim checks against this). */
export function zawnChest() {
  const f = F();
  const p = toWorld(isl(), ZAWN.chest.x, ZAWN.chest.z);
  return { x: p.x, y: f.ledge.y + 0.3, z: p.z };
}

/** The sea's mean level in the Zawn at time t (the tide, here at its full). */
export function zawnWater(t) {
  const i = isl();
  return tidalReach(i.x, i.z) * tideAt(t);
}

/** Is there room to get under a roof at `roof` at time t? (Swimming, your head's about 0.3 above the water.) */
export const roomUnder = (roof, t) => zawnWater(t) + 0.3 < roof;
