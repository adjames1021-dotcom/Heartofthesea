// The Heart of the Sea: the main story. Shared by the browser (the letter,
// the journal, the keys) and the server (which hands out the keys and keeps
// your place in it, worker/rules.js).
//
// Before there were villages here there was a temple under the big hill on
// Saddle, and in it a stone as green as deep water. While it was kept, the sea
// was kind. When raiders came, its eight keepers locked the temple, and each
// took a key and hid it where the sea would keep it.
//
// The keepers weren't eight people but eight families, and each kept its key
// for generations after, passed it down, and moved it when it had to: the
// Pells, the Hoskens, the Treloars, the Jagos, the Nances, the Tresizes, the
// Penroses and the Rowes. Each left a stone by its key, with its sign and a
// count of notches; the temple's last door wants the counts.
//
// The boat's last owner, Elowen Tresize, of the pilots' line, spent thirty
// years finding out where the keys had got to. She left a letter on the chart
// table, and a second one at the top of Gannet Stack. One chapter at a time,
// in order: each key is in the chest at one of the eight big places (a chest
// you'd find anyway; the key's only in it when it's that chapter's turn), with
// its family's words, and a tag saying where the next one is. With all eight,
// the temple opens.

import { ISLAND_BY_ID, toWorld, groundAt } from './world.js';

/** Where you are: 0 not begun (the letter's waiting), 1…8 a key to find, 9 the temple, 10 the end. */
export const TEMPLE = 9;
export const DONE = 10;

/**
 * The chapters, in order. `target`: the chest the key's in (a puzzle's dig, or
 * a climb's chest: the ids in worker/treasure.js). `island`: where that is.
 * `key`: what the key's called. `clue`: what's in your journal while you're
 * looking (the tag on the last key, and Elowen's notes). `found`: what's with
 * the key when you find it, in its family's words.
 */
export const CHAPTERS = [
  null,
  {
    title: 'The keeper who told the time',
    target: 'pells-bar',
    island: 'bar',
    key: 'the shadow key',
    clue: "Elowen's letter says the first keeper was a Pell's Bar man who 'knew the hour by shadows', and hid his key on the bar. Something about where the big rock's shadow falls, late in the day.",
    found: "Round the shadow key, a scrap of oilcloth, the pencil on it gone faint: 'Kept by the Pells since the gate shut. I'm the last of us, and I've no one to give it to. The shadow knows where. J. Pell.'",
  },
  {
    title: 'The keeper below decks',
    target: 'molly-ann',
    island: 'reef',
    key: 'the ship key',
    clue: "The shadow key has a tag of lead wired to its bow, scratched: MOLLY ANN, BELOW. The wreck on the reef. Somewhere down inside her.",
    found: "In the hatch well with it, a master's ticket gone soft with damp: 'Not to leave the vessel. If she's lost, it's lost with her. W. Hosken, master.' She was lost. The key wasn't.",
  },
  {
    title: 'The keeper of the ledge',
    target: 'horseshoe',
    island: 'horseshoe',
    key: 'the cliff key',
    clue: "The ship key's tag says: HORSESHOE. ALONG THE LEDGE, BETWEEN SEAS. The cove on Horseshoe Island, out along the ledge under the cliff, where the sea comes in.",
    found: 'Tied to it with tarred twine, a pebble with a hole worn through it, and TRELOAR scratched on the pebble. The Treloars kept the ledges, out where the two seas meet.',
  },
  {
    title: 'The keeper of the birds',
    target: 'gannet',
    island: 'stack',
    key: 'the gannet key',
    clue: "The cliff key's tag: WHERE THE GANNETS NEST. The top of Gannet Stack, then, and it's a long way up.",
    found: "Under it in the nest, in among the feathers, a folded page in a hand you know: Elowen's. She got up here once. It's a second letter.",
  },
  {
    title: 'The lookout',
    target: 'wreck',
    island: 'reef',
    key: "the lookout's key",
    clue: "The gannet key's tag: HIGHEST ON THE MOLLY ANN. Back to the wreck, and this time up: her crow's nest. Elowen's second letter says to read the keepers' stones as you go.",
    found: 'Scratched inside its bow, small: NANCE KEPT WATCH. Under that, newer and rougher: SO DID I. The Nances kept watch from the highest place they had, whatever it was.',
  },
  {
    title: 'The pilot',
    target: 'kittiwake',
    island: 'ledges',
    key: "the pilot's key",
    clue: "The lookout's key's tag: THE PILOT'S CABIN. The Kittiwake, the pilot cutter: Elowen's father's boat, on her side on Black Ledges, a long sail out. Her cabin's aft.",
    found: 'On a nail in the cabin, on a cord knotted the way Elowen knots hers: the pilot’s key. The Tresizes brought the boats in for longer than anyone wrote down. Her father kept it here.',
  },
  {
    title: 'The lamp keeper',
    target: 'beacon',
    island: 'beacon',
    key: 'the lamp key',
    clue: "The pilot's key's tag: THE LAMP KNOWS WHERE. The old watch tower on Beacon Island, a long sail out. Elowen has written underneath: 'The tower's stair is fallen. Mind it.'",
    found: "In a tin behind the lamp: the lamp key, and a card. 'For whoever comes after. The light was ours to keep, and we kept it. M. Penrose.' The Penroses kept the lamp till it went out.",
  },
  {
    title: 'The smuggler',
    target: 'zawn',
    island: 'cormorant',
    key: "the smuggler's key",
    clue: "The lamp key's tag: UNDER THE BIRDS' CLIFF, AT LOW WATER. Cormorant Island, a long sail out, where the cliffs are. Elowen: 'There's a way in from the sea on the north side. Only when the tide's out.'",
    found: 'Wrapped in oilskin in the cellar: the last key, and a tally stick with eight cuts, seven of them crossed through. The Rowes kept the tides, and kept count. Mags Rowe at Kettle is the last of them.',
  },
];

/**
 * The eight keepers' families, by their keys. `sign`: what's on the bow of the
 * key, and on the family's stone and statue. `notches`: the count cut under
 * the sign on their stone (where their keeper stood round the Heart), which is
 * where their dial goes on the temple's last door. `stone`: where the stone
 * is, near where the key was (island, and [x, z] in its frame).
 */
export const KEEPERS = [
  null,
  { sign: 'sun', notches: 3, family: 'Pell', kept: 'kept the hours', stone: { island: 'bar', at: [-70.2, 3.8] } },
  { sign: 'ship', notches: 7, family: 'Hosken', kept: 'kept the boats', stone: { island: 'reef', at: [-22, 15] } },
  { sign: 'ring', notches: 1, family: 'Treloar', kept: 'kept the ledges', stone: { island: 'horseshoe', at: [47.5, 103.3] } },
  { sign: 'wing', notches: 5, family: 'Jago', kept: 'kept the birds', stone: { island: 'stack', at: [-7, -5] } },
  { sign: 'star', notches: 8, family: 'Nance', kept: 'kept watch', stone: { island: 'reef', at: [-34, 22] } },
  { sign: 'anchor', notches: 2, family: 'Tresize', kept: 'brought the boats in', stone: { island: 'ledges', at: [38, 18] } },
  { sign: 'flame', notches: 6, family: 'Penrose', kept: 'kept the light', stone: { island: 'beacon', at: [6.5, 3.8] } },
  { sign: 'wave', notches: 4, family: 'Rowe', kept: 'kept the tides', stone: { island: 'cormorant', at: [6, 25.5] } },
];
/** A family's name, all of them: the Pells, the Tresizes. */
export const families = (k) => (/(s|x|z|ch|sh)$/.test(k.family) ? `${k.family}es` : `${k.family}s`);
for (const k of KEEPERS) if (k) k.carving = `Carved under the sign of the ${k.sign}: the ${families(k)}, who ${k.kept}.`;

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** What a family's stone says, for the journal. */
export function stoneNote(n) {
  const k = KEEPERS[n];
  const isl = ISLAND_BY_ID[k.stone.island];
  return `${isl.name}: the ${families(k)}' stone. The sign of the ${k.sign}, and under it ${NUMBERS[k.notches]} notch${k.notches === 1 ? '' : 'es'}.`;
}

/** Where family n's stone stands, in the world: { x, y, z }. */
export function stonePoint(n) {
  const st = KEEPERS[n].stone;
  const p = toWorld(ISLAND_BY_ID[st.island], st.at[0], st.at[1]);
  return { x: p.x, y: groundAt(p.x, p.z), z: p.z };
}

/** What the eighth key's tag says, and the temple. */
export const TEMPLE_CLUE =
  "All eight keys. The last one's tag says only: HOME. The temple's under the big hill on Saddle: the gate's at the hill's foot, on its east side, facing the saddle. Eight keyholes by it. Elowen: 'The last door wants the stones' counts. Go carefully.'";

export const DONE_NOTE = 'The Heart of the Sea is back where it belongs, and the sea knows it.';

/** The ids of the chests the keys are in, in order. */
export const TARGETS = CHAPTERS.slice(1).map((c) => c.target);

/** Is `from` (a chest's puzzle or climb id) the one this chapter's key is in? */
export const keyIn = (story, from) => !!story && story.ch >= 1 && story.ch <= 8 && CHAPTERS[story.ch].target === from;

/** Elowen's second letter, at the top of Gannet Stack with the fourth key. */
export const LETTER2 = [
  'If you’re reading this, you’ve four of the keys, and you’ve climbed further than my knees would take me but once. I left this up here that time, for whoever came after.',
  'I should have told you in the first letter. The keepers weren’t eight people. They were eight families, and each kept its key long after the gate shut, and passed it down, and moved it when it had to. Mine were the pilots. The pilot’s key was my father’s.',
  'He kept it in his cabin on the Kittiwake, and he went over with her on Black Ledges the winter I was twelve. I never went back to her. You’ll have to, for me.',
  'Each family left a stone by where their key was, with their sign on it and a count of notches cut under the sign. My grandmother said the count is where each keeper stood round the Heart. The temple’s last door wants them. Read the stones as you go, and go back for any you’ve passed.',
  'And the temple isn’t out in the open, where people have dug for it. It’s under the big hill. The gate’s at the foot, on the east side, facing the saddle. I found it the spring before I wrote to you, and I didn’t go in.',
  '',
  'Four more. Go carefully.',
  'E. T.',
];

/** What goes in the journal, with the gannet key. */
export const LETTER2_NOTE =
  "With the gannet key, a second letter from Elowen. The keepers were eight families; hers were the pilots, and the pilot's key was her father's. Each family left a stone by its key, with its sign and a count of notches: the temple's last door wants them.";

/** Elowen's letter, left on the chart table. Lines; an empty one is a gap. */
export const LETTER = [
  'To whoever has her now,',
  '',
  'She was mine for thirty years, and in all of them I was looking for the keepers’ keys. Before there were villages on these islands there was a temple on Saddle, and in it the Heart of the Sea: a stone as green as deep water. While it was kept, the sea was kind to us.',
  'When the raiders came, the eight keepers locked the temple and each took a key away and hid it where the sea would keep it. None of them came back for them. The sea has not been kind since.',
  'I found out where they are. I never had the legs to fetch them.',
  'The first keeper was a man of Pell’s Bar, who knew the hour by shadows. Start there, when the sun is low. Each key will tell you where the next one is.',
  'Go carefully in the temple. The keepers did not want it easy.',
  '',
  'Fair winds,',
  'Elowen Tresize',
];
