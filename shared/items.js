// Everything a player can own, by kind. Shared by the game and the server so
// both agree on what exists. `name` is how it's written in the journal's
// list ("a mackerel", "three mackerel"); `plural` when it isn't just +s.
//
// Kinds: fish, fruit, food (cooked things), material, valuable, find
// (things picked up on the islands), junk.

export const ITEMS = {
  // --- Fish (see src/fishing.js for where each lives). `cooked`: what it's called once it's done. ---
  mackerel: { kind: 'fish', name: 'mackerel', plural: 'mackerel', kg: [0.3, 0.9], cooked: 'fried mackerel' },
  pollock: { kind: 'fish', name: 'pollock', plural: 'pollock', kg: [0.8, 4], cooked: 'fried pollock' },
  bass: { kind: 'fish', name: 'sea bass', plural: 'sea bass', kg: [0.6, 3.5], cooked: 'fried sea bass' },
  plaice: { kind: 'fish', name: 'plaice', plural: 'plaice', kg: [0.3, 1.6], cooked: 'fried plaice' },
  mullet: { kind: 'fish', name: 'grey mullet', plural: 'grey mullet', kg: [0.5, 2.5], cooked: 'fried mullet' },
  wrasse: { kind: 'fish', name: 'ballan wrasse', plural: 'ballan wrasse', kg: [0.4, 2], cooked: 'fried wrasse' },
  parrotfish: { kind: 'fish', name: 'parrotfish', plural: 'parrotfish', kg: [0.6, 3], cooked: 'fried parrotfish' },
  grouper: { kind: 'fish', name: 'grouper', plural: 'grouper', kg: [3, 14], cooked: 'fried grouper' },
  squid: { kind: 'fish', name: 'squid', plural: 'squid', kg: [0.2, 0.8], cooked: 'fried squid' },
  boot: { kind: 'junk', name: 'old boot', kg: [0.6, 0.6] },

  // --- Materials, things to hand over, things given ---
  copper: { kind: 'material', name: 'sheet of copper', plural: 'sheets of copper' },
  canvas: { kind: 'material', name: 'bale of canvas', plural: 'bales of canvas' },
  rope: { kind: 'material', name: 'coil of rope', plural: 'coils of rope' },
  driftwood: { kind: 'material', name: 'length of driftwood', plural: 'lengths of driftwood' },
  iron: { kind: 'material', name: 'bit of old iron', plural: 'bits of old iron' },
  oil: { kind: 'errand', name: 'can of paraffin', plural: 'cans of paraffin' },
  lantern: { kind: 'errand', name: "Davey Clemo's ship's lantern" },
  cheese: { kind: 'food', name: "round of goat's cheese", plural: "rounds of goat's cheese" },
  corkfloat: { kind: 'find', name: "cork float from Oda's nets", plural: 'cork floats' },
  knife: { kind: 'errand', name: "Gwen's gutting knife" },
  saltfish: { kind: 'food', name: 'salt fish', plural: 'salt fish', cooked: 'fried salt fish' },

  // --- Fruit, off the trees (shared/gather.js) ---
  lime: { kind: 'fruit', name: 'lime', cooked: 'grilled lime' },
  coconut: { kind: 'fruit', name: 'coconut', cooked: 'toasted coconut' },
  plantain: { kind: 'fruit', name: 'plantain', cooked: 'fried plantain' },

  // --- Dishes (shared/food.js) ---
  'mackerel-lime': { kind: 'dish', name: 'mackerel with lime', plural: 'plates of mackerel with lime' },
  'grilled-plantain': { kind: 'dish', name: 'grilled plantain', plural: 'grilled plantains' },
  'fish-stew': { kind: 'dish', name: 'bowl of fish stew', plural: 'bowls of fish stew' },
  'saltfish-plantain': { kind: 'dish', name: 'bowl of salt fish and plantain', plural: 'bowls of salt fish and plantain' },
  'squid-coconut': { kind: 'dish', name: 'bowl of squid in coconut', plural: 'bowls of squid in coconut' },
  fryup: { kind: 'dish', name: 'fry-up', plural: 'fry-ups' },
  potful: { kind: 'dish', name: 'pot of something', plural: 'pots of something' },

  // --- Things of value, from the chests (what the shipwright takes for his time) ---
  shillings: { kind: 'valuable', name: 'purse of silver shillings', plural: 'purses of silver shillings' },
  watch: { kind: 'valuable', name: 'pocket watch', plural: 'pocket watches' },
  ring: { kind: 'valuable', name: 'gold signet ring', plural: 'gold signet rings' },
  snuffbox: { kind: 'valuable', name: 'silver snuff box', plural: 'silver snuff boxes' },
  candlesticks: { kind: 'valuable', name: 'pair of brass candlesticks', plural: 'pairs of brass candlesticks' },
  pearls: { kind: 'valuable', name: 'string of pearls', plural: 'strings of pearls' },
  buttons: { kind: 'valuable', name: 'card of gilt buttons', plural: 'cards of gilt buttons' },
  sextant: { kind: 'valuable', name: 'brass sextant', plural: 'brass sextants' },

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

/** What can be in a chest besides the next map. */
export const VALUABLE_IDS = Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'valuable');

/** Things found on the islands, in the order they're listed. */
export const FIND_IDS = ['log', 'spyglass', 'bell', 'pipe', 'nameboard', 'bottle', 'lead', 'float', 'cowrie', 'seaglass', 'scallop'];

const NUMBERS = ['no', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "a mackerel", "three mackerel", "an old boot". */
export function countOf(kind, n) {
  const it = ITEMS[kind];
  if (!it) return '';
  if (n === 1) return `${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}`.replace(/^a the /, 'the ');
  const word = NUMBERS[n] ?? String(n);
  return `${word} ${it.plural ?? `${it.name}s`}`;
}
