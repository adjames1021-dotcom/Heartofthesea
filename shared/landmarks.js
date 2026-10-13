import { ISLANDS, ISLAND_BY_ID, toWorld } from './world.js';
import { VILLAGES } from './villages.js';

// What's marked on your chart (src/screens.js), and which of it you've been
// to. Every island counts once you've set foot on it; these others once
// you've been close (on foot, swimming or aboard). Shared with the server,
// which checks you were really there before it ticks one off.
//
// at: island-local [x, z] (or a function of the island); reach: how close
// counts, in metres; kind: which little drawing marks it on the chart;
// label: where its name goes round the mark, to keep clear of its
// neighbours ([dx, dy] in chart pixels, and which way the text runs).

const F = (id) => ISLAND_BY_ID[id].features;
const hub = (v) => VILLAGES[v].hub;

export const LANDMARKS = {
  cove: { name: 'Head Cove', island: 'head', at: hub('cove'), reach: 35, kind: 'village', label: [-9, -2, 'right'] },
  light: { name: 'the lighthouse', island: 'head', at: () => [F('head').light.x, F('head').light.z], reach: 30, kind: 'light', label: [9, 2, 'left'] },
  landing: { name: 'The Landing', island: 'green', at: hub('landing'), reach: 35, kind: 'village', label: [-9, 4, 'right'] },
  bigtree: { name: 'the big tree', island: 'green', at: () => [F('green').bigTree.x, F('green').bigTree.z], reach: 18, kind: 'tree', label: [9, -6, 'left'] },
  strand: { name: 'Kettle Strand', island: 'kettle', at: hub('strand'), reach: 35, kind: 'village', label: [9, 10, 'left'] },
  crater: { name: 'the crater', island: 'kettle', at: [0, 0], reach: 40, kind: 'crater', label: [-10, -6, 'right'] },
  yard: { name: "Pascoe's yard", island: 'saddle', at: hub('yard'), reach: 35, kind: 'yard', label: [-11, 12, 'right'] },
  hut: { name: 'the hut', island: 'saddle', at: [-44, 180], reach: 18, kind: 'hut', label: [-9, -2, 'right'] },
  cairn: { name: 'the cairn', island: 'saddle', at: [-74, -41], reach: 15, kind: 'cairn', label: [9, -4, 'left'] },
  buoy: { name: 'the lantern buoy', island: 'saddle', at: () => [F('saddle').buoy.x, F('saddle').buoy.z], reach: 25, kind: 'buoy', label: [8, 12, 'left'] },
  wreck: { name: 'the Molly Ann', island: 'reef', at: () => [F('reef').wreck.x, F('reef').wreck.z], reach: 30, kind: 'wreck', label: [-9, 4, 'right'] },
  cottage: { name: 'the burnt cottage', island: 'burnt', at: [-50, 35], reach: 20, kind: 'cottage', label: [9, 10, 'left'] },
  kittiwake: { name: 'the Kittiwake', island: 'ledges', at: () => [F('ledges').kittiwake.x, F('ledges').kittiwake.z], reach: 30, kind: 'wreck', label: [-9, 4, 'right'] },
  tower: { name: 'the watch tower', island: 'beacon', at: () => [F('beacon').tower.x, F('beacon').tower.z], reach: 25, kind: 'tower', label: [9, 2, 'left'] },
  stones: { name: 'the standing stones', island: 'beacon', at: () => [F('beacon').stones.x, F('beacon').stones.z], reach: 15, kind: 'stones', label: [-9, 6, 'right'] },
  zawn: { name: 'the Zawn', island: 'cormorant', at: () => [F('cormorant').pool.x, F('cormorant').pool.z], reach: 35, kind: 'cave', label: [9, -4, 'left'] },
  temple: { name: "the keepers' temple", island: 'saddle', at: () => [F('saddle').temple.at.x, F('saddle').temple.at.z], reach: 40, kind: 'temple', label: [10, 3, 'left'] },
};

/** Where a landmark is in the world: { x, z }. */
export function landmarkAt(id) {
  const m = LANDMARKS[id];
  const [lx, lz] = typeof m.at === 'function' ? m.at() : m.at;
  return toWorld(ISLAND_BY_ID[m.island], lx, lz);
}

/** Every place that can be ticked off: the islands, then the landmarks. */
export const PLACE_IDS = [...ISLANDS.map((i) => i.id), ...Object.keys(LANDMARKS)];

/**
 * Close enough to count as having been to `id` from (x, z)? An island: on its
 * land (within its land radius, and `margin` more); a landmark: within its
 * reach (and `margin`).
 */
export function isAt(id, x, z, margin = 0) {
  if (Object.hasOwn(LANDMARKS, id)) {
    const p = landmarkAt(id);
    return Math.hypot(p.x - x, p.z - z) <= LANDMARKS[id].reach + margin;
  }
  const isl = Object.hasOwn(ISLAND_BY_ID, id) ? ISLAND_BY_ID[id] : null;
  return !!isl && Math.hypot(isl.x - x, isl.z - z) <= isl.land + margin;
}
