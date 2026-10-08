// Things that grow (and wash up) and can be picked: fruit trees for now.
// Each spot gives one at a time and grows another after `regrow` in-game
// days. Shared by the game (which draws the plants and the fruit on them)
// and the server (which says whether there's any on it right now).
//
// `at` is in the island's own frame (see shared/world.js).

import { DAY_LENGTH } from './environment.js';
import { ISLAND_BY_ID, toWorld } from './world.js';

export const GATHER = {
  // Saddle Island, behind the boatyard.
  'saddle-lime-1': { kind: 'lime', plant: 'lime', island: 'saddle', at: [-62, 200], regrow: 0.5 },
  'saddle-lime-2': { kind: 'lime', plant: 'lime', island: 'saddle', at: [-68, 210], regrow: 0.5 },
  'saddle-plantain': { kind: 'plantain', plant: 'plantain', island: 'saddle', at: [-61, 224], regrow: 0.75 },
  'saddle-coconut-1': { kind: 'coconut', plant: 'palm', island: 'saddle', at: [-28, 200], regrow: 1 },
  'saddle-coconut-2': { kind: 'coconut', plant: 'palm', island: 'saddle', at: [-38, 236], regrow: 1 },
  // Head Cove, up behind the huts.
  'cove-lime': { kind: 'lime', plant: 'lime', island: 'head', at: [-25, 17], regrow: 0.5 },
  'cove-plantain-1': { kind: 'plantain', plant: 'plantain', island: 'head', at: [-27, 38], regrow: 0.75 },
  'cove-plantain-2': { kind: 'plantain', plant: 'plantain', island: 'head', at: [-22, 35], regrow: 0.75 },
};

/** World position of a spot. */
export function gatherWorld(id) {
  const g = GATHER[id];
  return toWorld(ISLAND_BY_ID[g.island], g.at[0], g.at[1]);
}

/** Is there something on it at time t (world seconds), given when it was last picked? */
export function ripe(id, picked, t) {
  const g = GATHER[id];
  return !g ? false : picked === undefined || picked === null || t - picked >= g.regrow * DAY_LENGTH;
}
