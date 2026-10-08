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
  // The trading village on Green Island: a store, a quay, a ropewalk, and
  // Abel's bench under the big tree.
  landing: {
    name: 'The Landing',
    island: 'green',
    does: 'trading',
    hub: [-55, 3],
    huts: [
      { id: 'store', at: [-50, -12], face: Math.PI, stilts: false, floor: 3.5 },
      { id: 'jory', at: [-52, -24], face: Math.PI, stilts: false, floor: 3.05 },
      { id: 'abel', at: [-48, 20], face: Math.PI, stilts: false, floor: 3.4 },
      { id: 'martha', at: [-46, 34], face: Math.PI, stilts: false, floor: 3.0 },
    ],
    dock: { from: [-66, 2], to: [-88, 2], y: 1.6, width: 2.6 },
    racks: [[-58, -4, 0.2]],
    boats: [[-63, -8, 1.3], [-62, 16, 2.1]],
    fire: [-56, 10],
    crates: [[-56.2, -14.6, 0.1], [-57.4, -12.8, 0.5], [-55.8, -11.4, -0.2], [-56.8, -13.6, 0.3, 1]],
    rope: [[-52, 30.8], [-51.4, 29.2], [-53.1, 28.6]],
    ropewalk: { from: [-50, 41], to: [-34, 41] },
    spots: {
      fire1: { at: [-54.6, 11], face: [-56, 10], via: [] },
      fire2: { at: [-56.6, 11.5], face: [-56, 10], via: [] },
      fire3: { at: [-57.5, 9.4], face: [-56, 10], via: [] },
      fire4: { at: [-55.4, 8.6], face: [-56, 10], via: [] },
      store: { at: [-54.6, -14.4], face: [-62, -14.4], via: [] },
      crates: { at: [-55.2, -9.9], face: [-56.4, -11.4], via: [] },
      quayEnd: { at: [-86.4, 1.3], face: [-95, 1.3], via: [[-63.6, 2], [-66.5, 2, 1.6]], y: 1.6 },
      quayEnd2: { at: [-85.6, 2.8], face: [-92, 6], via: [[-63.6, 2], [-66.5, 2, 1.6]], y: 1.6 },
      porch: { at: [-53.4, 22.3], face: [-62, 22.3], via: [], bench: true },
      tree: { at: [-2.5, -4.5], face: [-30, -4.5], via: [[-30, 0]], bench: true },
      ropewalk: { at: [-46, 40.2], face: [-46, 41], via: [[-50, 37]] },
      ropewalk2: { at: [-39, 40.2], face: [-39, 41], via: [[-50, 37]] },
      storeBed: { at: [-49.25, -12.4], via: [[-53.9, -12], [-51.4, -12, 3.5]], y: 3.5, lie: Math.PI },
      joryBed: { at: [-51.25, -24.4], via: [[-55.9, -24], [-53.4, -24, 3.05]], y: 3.05, lie: Math.PI },
      abelBed: { at: [-47.25, 19.6], via: [[-51.9, 20], [-49.4, 20, 3.4]], y: 3.4, lie: Math.PI },
      marthaBed: { at: [-45.25, 33.6], via: [[-49.9, 34], [-47.4, 34, 3.0]], y: 3.0, lie: Math.PI },
    },
  },
  // Kettle Island, below the notch: a strand of cottages most people have
  // left. Three still live here.
  strand: {
    name: 'Kettle Strand',
    island: 'kettle',
    does: 'not much, now',
    hub: [-98, 0],
    huts: [
      { id: 'mags', at: [-92, -18], face: Math.PI, stilts: false, floor: 2.55 },
      { id: 'ben', at: [-92, 16], face: Math.PI, stilts: false, floor: 2.6, beds: 2 },
      { id: 'ruin1', at: [-92, -2], face: Math.PI, stilts: false, floor: 3.2, ruin: true },
      { id: 'ruin2', at: [-91, 30], face: Math.PI, stilts: false, floor: 2.55, ruin: true },
      { id: 'ruin3', at: [-93, -32], face: Math.PI, stilts: false, floor: 2.4, ruin: true },
    ],
    dock: { from: [-100, 6], to: [-120, 6], y: 1.25, width: 1.8, broken: true },
    racks: [[-97, -8, 0.3]],
    nets: [[-97, 25, 0.2]],
    boats: [[-101, -11, 0.4]],
    sailboat: [-118, 9.6, 1.6],
    fire: [-99, 12],
    garden: { at: [-88.5, 22.5], w: 4, d: 6 },
    spots: {
      fire1: { at: [-97.6, 13], face: [-99, 12], via: [] },
      fire2: { at: [-99.4, 13.6], face: [-99, 12], via: [] },
      fire3: { at: [-100.5, 11.6], face: [-99, 12], via: [] },
      boat: { at: [-118.6, 6.9], face: [-125, 9.6], via: [[-98.5, 6], [-100.6, 6, 1.25]], y: 1.25 },
      goats: { at: [-84, -26], face: [-72, -26], via: [[-95, -14]] },
      magsBench: { at: [-96.4, -20.2], face: [-110, -20.2], via: [], bench: true },
      benBench: { at: [-96.4, 18.4], face: [-110, 18.4], via: [], bench: true },
      garden: { at: [-90.6, 20.4], face: [-88.5, 21.5], via: [] },
      garden2: { at: [-90.6, 24.8], face: [-88.5, 23.5], via: [] },
      magsBed: { at: [-91.25, -18.4], via: [[-95.9, -18], [-93.4, -18, 2.55]], y: 2.55, lie: Math.PI },
      benBed: { at: [-91.25, 15.6], via: [[-95.9, 16], [-93.4, 16, 2.6]], y: 2.6, lie: Math.PI },
      dorcasBed: { at: [-92.4, 15.6], via: [[-95.9, 16], [-93.4, 16, 2.6]], y: 2.6, lie: Math.PI },
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
  hester: {
    name: 'Hester Pengelly',
    village: 'landing',
    job: 'keeps the store at the Landing and trades with anyone who lands',
    look: { fur: '#9a7f66', patch: '#efe2c8', ear: '#c79f7a', ink: '#3a2c20' },
    wears: 'apron',
    tint: '#5b6e80',
    size: 1.0,
    routine: [
      [6.5, 'store', 'work'],
      [12.5, 'fire1', 'sit'],
      [13.5, 'store', 'work'],
      [18.5, 'fire1', 'sit'],
      [22, 'storeBed', 'sleep'],
    ],
  },
  jory: {
    name: 'Jory Pengelly',
    village: 'landing',
    job: "Hester's boy: hauls crates, fishes off the quay, wants to be somewhere else",
    look: { fur: '#a8865f', patch: '#f3e6cc', ear: '#d2a678', ink: '#43311f' },
    wears: 'beanie',
    tint: '#9c3b2e',
    size: 0.82,
    routine: [
      [6, 'quayEnd', 'fish'],
      [10, 'crates', 'work'],
      [14, 'quayEnd2', 'fish'],
      [19, 'fire2', 'sit'],
      [21.5, 'joryBed', 'sleep'],
    ],
  },
  abel: {
    name: 'Abel Trounson',
    village: 'landing',
    job: 'was a fisherman; sits under the big tree and remembers',
    look: { fur: '#bfb6a8', patch: '#f1ece2', ear: '#cdb2a0', ink: '#4a4238' },
    wears: 'flatcap',
    size: 0.97,
    routine: [
      [8, 'porch', 'sit'],
      [11, 'tree', 'sit'],
      [17, 'fire3', 'sit'],
      [20.5, 'abelBed', 'sleep'],
    ],
  },
  martha: {
    name: 'Martha Vosper',
    village: 'landing',
    job: 'makes rope on the ropewalk',
    look: { fur: '#6f5a48', patch: '#e2d4bc', ear: '#9c7c62', ink: '#2e2319' },
    wears: 'neckerchief',
    tint: '#3f6a8a',
    size: 1.02,
    routine: [
      [6, 'ropewalk', 'work'],
      [12, 'ropewalk2', 'work'],
      [17.5, 'fire4', 'sit'],
      [21, 'marthaBed', 'sleep'],
    ],
  },
  mags: {
    name: 'Mags Rowe',
    village: 'strand',
    job: 'keeps goats, makes cheese, and sails her own boat',
    look: { fur: '#5a5048', patch: '#d8cdbc', ear: '#8a7462', ink: '#231d18' },
    wears: 'neckerchief',
    tint: '#a8322a',
    size: 1.0,
    routine: [
      [5, 'boat', 'work'],
      [8.5, 'goats', 'work'],
      [13, 'magsBench', 'sit'],
      [15, 'goats', 'work'],
      [18, 'fire1', 'sit'],
      [21, 'magsBed', 'sleep'],
    ],
  },
  ben: {
    name: 'Ben Clemo',
    village: 'strand',
    job: 'stayed when everyone left; keeps a lamp in his window for his son',
    look: { fur: '#d6d0c6', patch: '#f6f2ea', ear: '#c9b4a6', ink: '#55504a' },
    wears: 'flatcap',
    tint: '#4d5a44',
    size: 0.95,
    routine: [
      [7, 'benBench', 'sit'],
      [11, 'garden', 'work'],
      [15.5, 'benBench', 'sit'],
      [19, 'fire2', 'sit'],
      [21, 'benBed', 'sleep'],
    ],
  },
  dorcas: {
    name: 'Dorcas Clemo',
    village: 'strand',
    job: "Ben's wife; grows what will grow, and doesn't hear what she doesn't want to",
    look: { fur: '#c2a98e', patch: '#f4ead8', ear: '#d8b49a', ink: '#4a3c2e' },
    wears: 'shawl',
    tint: '#5d6f9a',
    size: 0.9,
    routine: [
      [6, 'garden2', 'work'],
      [12.5, 'benBench', 'sit'],
      [14, 'garden2', 'work'],
      [19, 'fire3', 'sit'],
      [21.5, 'dorcasBed', 'sleep'],
    ],
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
