// The villages and the people in them. Shared by the game (which draws them
// and walks them about) and the server (which keeps who you've met and what
// you've promised them).
//
// Positions are in the island's own frame (see shared/world.js). A spot's
// `via` is the way there from the village's middle (`hub`), so anybody can
// walk anywhere: back out along one spot's via, through the hub, and in
// along the other's. A waypoint with a y is on something built (a dock, a
// hut floor); without one it follows the ground.
//
// A routine is a list of [from hour, spot, what they're doing]; each entry
// runs until the next one starts (and the last wraps round to the first).

export const VILLAGES = {
  cove: {
    name: 'Head Cove',
    island: 'head',
    does: 'fishing',
    hub: [-36.5, 15],
    // Set pieces, built by src/village.js.
    huts: [
      { id: 'oda', at: [-46.5, 4], face: 0, stilts: true, floor: 2.1 },
      { id: 'tam', at: [-45.5, 31], face: 0, stilts: true, floor: 2.0 },
      { id: 'gwen', at: [-31, 30.5], face: -Math.PI / 2, stilts: false, floor: 2.6 },
    ],
    dock: { from: [-38.5, 18], to: [-62, 18], y: 1.3, width: 2.2 },
    racks: [[-38, 8, 0.2], [-37, 27.5, -0.3]],
    nets: [[-41, -3.5, 0.4]],
    boats: [[-42.5, 12, 1.3], [-41.5, 24.5, 1.9]],
    fire: [-35, 22.5],
    pots: [[-40.5, 20.5], [-40.2, 21.4]],
    spots: {
      fire1: { at: [-33.6, 23.5], face: [-35, 22.5], via: [[-35.5, 20]] },
      fire2: { at: [-35.4, 24.1], face: [-35, 22.5], via: [[-36.8, 21.8]] },
      fire3: { at: [-36.6, 22.2], face: [-35, 22.5], via: [] },
      fire4: { at: [-34.2, 21.1], face: [-35, 22.5], via: [[-35.5, 20]] },
      dock: { at: [-46, 18.7], face: [-46, 22], via: [[-38.5, 18], [-40.5, 18, 1.35]], y: 1.35 },
      dockEnd: { at: [-60.5, 17.6], face: [-70, 17.6], via: [[-38.5, 18], [-40.5, 18, 1.35]], y: 1.35 },
      dockEnd2: { at: [-59.5, 19.2], face: [-70, 21], via: [[-38.5, 18], [-40.5, 18, 1.35]], y: 1.35 },
      nets: { at: [-40, -1.8], face: [-41, -3.5], via: [[-39, 6]] },
      rack1: { at: [-37, 9.4], face: [-38, 8], via: [] },
      rack2: { at: [-36.2, 26.3], face: [-37, 27.5], via: [] },
      odaBed: { at: [-47.2, 4.4], via: [[-42.6, 4], [-45.1, 4, 2.1]], y: 2.1, lie: 0 },
      tamBed: { at: [-46.2, 31.4], via: [[-41.6, 31], [-44.1, 31, 2.0]], y: 2.0, lie: 0 },
      gwenBed: { at: [-30.6, 31.25], via: [[-31, 26.6], [-31, 29.1, 2.6]], y: 2.6, lie: -Math.PI / 2 },
    },
  },
  // Not a village: Ned Pascoe's boatyard on the west side of the bay on
  // Saddle Island, where your boat lies at anchor.
  yard: {
    name: "Pascoe's yard",
    island: 'saddle',
    does: 'boats',
    hub: [-42, 213],
    huts: [],
    // The slipway runs down the beach into the bay, with a boat in frame on it.
    slip: { from: [-45, 216], to: [-14, 216], width: 2.6 },
    shed: { at: [-54, 212], w: 6.2, d: 5, floor: 2.55 }, // open to the east (+x)
    timber: [[-46, 226.5, 0.05], [-47.5, 203, -0.1]],
    logs: [[-41.5, 228.5, 0.3]],
    rope: [[-49.6, 218.6], [-50.4, 207.2], [-48.9, 206.4]],
    horse: [-42, 210, 0.1],
    spots: {
      hull: { at: [-36.3, 213.3], face: [-36.3, 216], via: [] },
      hull2: { at: [-31.5, 218.7], face: [-31.5, 216], via: [[-40.5, 220.8]] },
      saw: { at: [-42, 208.6], face: [-42, 210], via: [] },
      bench: { at: [-55.2, 210.6], face: [-57, 210.6], via: [[-49.5, 211.5], [-51.4, 211.5, 2.55]], y: 2.55 },
      seat: { at: [-48.6, 221.4], face: [-38, 221.4], via: [[-46, 219.5]], bench: true },
      bed: { at: [-56.1, 213.9], via: [[-49.5, 211.5], [-51.4, 211.5, 2.55], [-54, 213.2, 2.55]], y: 2.55, lie: 0 },
    },
  },
};

/** The people. look: fur colours for src/bear.js; wears: what's on their head. */
export const VILLAGERS = {
  oda: {
    name: 'Oda Penhale',
    village: 'cove',
    job: 'mends the nets and fishes the cove',
    look: { fur: '#8c7b69', patch: '#e8dfcf', ear: '#c99a6a', ink: '#3e3328' },
    wears: 'souwester',
    size: 1.0,
    routine: [
      [4.5, 'dock', 'work'],
      [7, 'dockEnd', 'fish'],
      [12, 'nets', 'work'],
      [17.5, 'fire1', 'sit'],
      [21.5, 'odaBed', 'sleep'],
    ],
  },
  tam: {
    name: 'Tam Ruddock',
    village: 'cove',
    job: 'fishes off the end of the dock, and talks',
    look: { fur: '#c9a06a', patch: '#f4ead2', ear: '#e0b070', ink: '#5a3e1e' },
    wears: 'beanie',
    size: 0.92,
    routine: [
      [5.5, 'dock', 'work'],
      [8, 'dockEnd2', 'fish'],
      [15.5, 'rack2', 'work'],
      [18, 'fire2', 'sit'],
      [22.5, 'tamBed', 'sleep'],
    ],
  },
  gwen: {
    name: 'Gwen Tallack',
    village: 'cove',
    job: 'salts and dries the catch',
    look: { fur: '#d8d1c3', patch: '#fbf6ea', ear: '#e3b6b0', ink: '#6a5e50' },
    wears: 'shawl',
    size: 0.95,
    routine: [
      [6, 'fire3', 'sit'],
      [8.5, 'rack1', 'work'],
      [17, 'fire3', 'sit'],
      [21, 'gwenBed', 'sleep'],
    ],
  },
  silas: {
    name: 'Silas Hendy',
    village: 'cove',
    job: 'keeps the light on Old Head',
    look: { fur: '#5e4430', patch: '#d9c7a8', ear: '#a87a52', ink: '#2a1c12' },
    wears: 'cap',
    size: 1.05,
    // He keeps the light all night, sleeps in the morning, and sits outside
    // the door in the afternoon. (Away: up the tower or asleep inside it.)
    routine: [
      [6.5, 'lightAway', 'away'],
      [14, 'lightBench', 'sit'],
      [19.5, 'lightAway', 'away'],
    ],
    // His spots are up at the lighthouse, not in the cove.
    spots: {
      lightBench: { at: [52.2, 4.6], face: [40, 4.6], via: [], ground: true, bench: true },
      lightAway: { at: [55.6, 2], via: [], hidden: true },
    },
  },
  ned: {
    name: 'Ned Pascoe',
    village: 'yard',
    job: 'builds and mends boats, and has opinions about yours',
    look: { fur: '#7a6656', patch: '#d8c9b0', ear: '#a0806a', ink: '#33281f' },
    wears: 'apron',
    size: 1.08,
    routine: [
      [5.5, 'bench', 'work'],
      [7, 'hull', 'work'],
      [10, 'saw', 'work'],
      [12.5, 'seat', 'sit'],
      [13.5, 'hull2', 'work'],
      [17.5, 'bench', 'work'],
      [19, 'seat', 'sit'],
      [21, 'bed', 'sleep'],
    ],
  },
};

/** What someone's doing at hour h: { spot, act }. */
export function routineAt(v, h) {
  const r = v.routine;
  let cur = r[r.length - 1];
  for (const e of r) if (h >= e[0]) cur = e;
  return { spot: cur[1], act: cur[2] };
}

/** Awake and about (not asleep, not up the tower)? */
export function awake(v, h) {
  const { act } = routineAt(v, h);
  return act !== 'sleep' && act !== 'away';
}
