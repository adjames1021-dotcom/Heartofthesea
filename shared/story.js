// The Heart of the Sea: the main story. Shared by the browser (the letter,
// the journal, the keys) and the server (which hands out the keys and keeps
// your place in it, worker/rules.js).
//
// Before there were villages here there was a temple on Saddle, and in it a
// stone as green as deep water. While it was kept, the sea was kind. When
// raiders came, its eight keepers locked the temple, and each took a key and
// hid it where the sea would keep it. None came back for them.
//
// The boat's last owner, Elowen Tresize, spent thirty years finding out where.
// She left a letter on the chart table. One chapter at a time, in order: each
// key is in the chest at one of the eight big places (a chest you'd find
// anyway; the key's only in it when it's that chapter's turn), and each has a
// tag saying where the next one is. With all eight, the temple opens.

/** Where you are: 0 not begun (the letter's waiting), 1…8 a key to find, 9 the temple, 10 the end. */
export const TEMPLE = 9;
export const DONE = 10;

/**
 * The chapters, in order. `target`: the chest the key's in (a puzzle's dig, or
 * a climb's chest: the ids in worker/treasure.js). `island`: where that is.
 * `key`: what the key's called. `clue`: what's in your journal while you're
 * looking (the tag on the last key, and Elowen's notes).
 */
export const CHAPTERS = [
  null,
  {
    title: 'The keeper who told the time',
    target: 'pells-bar',
    island: 'bar',
    key: 'the shadow key',
    clue: "Elowen's letter says the first keeper was a Pell's Bar man who 'knew the hour by shadows', and hid his key on the bar. Something about where the big rock's shadow falls, late in the day.",
  },
  {
    title: 'The keeper below decks',
    target: 'molly-ann',
    island: 'reef',
    key: 'the ship key',
    clue: "The shadow key has a tag of lead wired to its bow, scratched: MOLLY ANN, BELOW. The wreck on the reef. Somewhere down inside her.",
  },
  {
    title: 'The keeper of the ledge',
    target: 'horseshoe',
    island: 'horseshoe',
    key: 'the cliff key',
    clue: "The ship key's tag says: HORSESHOE. ALONG THE LEDGE, BETWEEN SEAS. The cove on Horseshoe Island, out along the ledge under the cliff, where the sea comes in.",
  },
  {
    title: 'The keeper of the birds',
    target: 'gannet',
    island: 'stack',
    key: 'the gannet key',
    clue: "The cliff key's tag: WHERE THE GANNETS NEST. The top of Gannet Stack, then, and it's a long way up.",
  },
  {
    title: 'The lookout',
    target: 'wreck',
    island: 'reef',
    key: "the lookout's key",
    clue: "The gannet key's tag: HIGHEST ON THE MOLLY ANN. Back to the wreck, and this time up: her crow's nest.",
  },
  {
    title: 'The pilot',
    target: 'kittiwake',
    island: 'ledges',
    key: "the pilot's key",
    clue: "The lookout's key's tag: THE PILOT'S CABIN. The Kittiwake was the pilot cutter: she's on her side on Black Ledges, a long sail out. Her cabin's aft.",
  },
  {
    title: 'The lamp keeper',
    target: 'beacon',
    island: 'beacon',
    key: 'the lamp key',
    clue: "The pilot's key's tag: THE LAMP KNOWS WHERE. The old watch tower on Beacon Island, a long sail out. Elowen has written underneath: 'The tower's stair is fallen. Mind it.'",
  },
  {
    title: 'The smuggler',
    target: 'zawn',
    island: 'cormorant',
    key: "the smuggler's key",
    clue: "The lamp key's tag: UNDER THE BIRDS' CLIFF, AT LOW WATER. Cormorant Island, a long sail out, where the cliffs are. Elowen: 'There's a way in from the sea on the north side. Only when the tide's out.'",
  },
];

/** What the eighth key's tag says, and the temple. */
export const TEMPLE_CLUE =
  "All eight keys. The last one's tag says only: HOME. Elowen's letter said the temple's on Saddle, up in the saddle between the two hills, under the turf and the brambles. Eight keyholes in the gate.";

export const DONE_NOTE = 'The Heart of the Sea is back where it belongs, and the sea knows it.';

/** The ids of the chests the keys are in, in order. */
export const TARGETS = CHAPTERS.slice(1).map((c) => c.target);

/** Is `from` (a chest's puzzle or climb id) the one this chapter's key is in? */
export const keyIn = (story, from) => !!story && story.ch >= 1 && story.ch <= 8 && CHAPTERS[story.ch].target === from;

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
