// Everything a player can own, by kind. Shared by the game and the server so
// both agree on what exists. `name` is how it's written in the journal's
// list ("a mackerel", "three mackerel"); `plural` when it isn't just +s.
//
// Kinds: fish, fruit, food (cooked things), material, valuable, find
// (things picked up on the islands), junk.

export const ITEMS = {
  // --- Fish (see src/fishing.js for where each lives) ---
  mackerel: { kind: 'fish', name: 'mackerel', plural: 'mackerel', kg: [0.3, 0.9] },
  pollock: { kind: 'fish', name: 'pollock', plural: 'pollock', kg: [0.8, 4] },
  bass: { kind: 'fish', name: 'sea bass', plural: 'sea bass', kg: [0.6, 3.5] },
  plaice: { kind: 'fish', name: 'plaice', plural: 'plaice', kg: [0.3, 1.6] },
  mullet: { kind: 'fish', name: 'grey mullet', plural: 'grey mullet', kg: [0.5, 2.5] },
  wrasse: { kind: 'fish', name: 'ballan wrasse', plural: 'ballan wrasse', kg: [0.4, 2] },
  parrotfish: { kind: 'fish', name: 'parrotfish', plural: 'parrotfish', kg: [0.6, 3] },
  grouper: { kind: 'fish', name: 'grouper', plural: 'grouper', kg: [3, 14] },
  squid: { kind: 'fish', name: 'squid', plural: 'squid', kg: [0.2, 0.8] },
  boot: { kind: 'junk', name: 'old boot', kg: [0.6, 0.6] },

  // --- Things found on the islands (src/finds.js) ---
  log: { kind: 'find', name: "the Kittiwake's log" },
  spyglass: { kind: 'find', name: 'brass spyglass' },
  bell: { kind: 'find', name: "the Kittiwake's bell" },
  pipe: { kind: 'find', name: 'clay pipe and tobacco tin' },
  nameboard: { kind: 'find', name: "the Molly Ann's name board" },
  bottle: { kind: 'find', name: 'message in a bottle' },
  lead: { kind: 'find', name: 'sounding lead' },
  float: { kind: 'find', name: 'glass fishing float' },
  cowrie: { kind: 'find', name: 'cowrie shell' },
  seaglass: { kind: 'find', name: 'piece of sea glass', plural: 'pieces of sea glass' },
  scallop: { kind: 'find', name: 'scallop shell' },
};

/** Things found on the islands, in the order they're listed. */
export const FIND_IDS = Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'find');

const NUMBERS = ['no', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "a mackerel", "three mackerel", "an old boot". */
export function countOf(kind, n) {
  const it = ITEMS[kind];
  if (!it) return '';
  if (n === 1) return `${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}`.replace(/^a the /, 'the ');
  const word = NUMBERS[n] ?? String(n);
  return `${word} ${it.plural ?? `${it.name}s`}`;
}
