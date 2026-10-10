// Food: what grows, what you can cook and how, and what eating it does.
// Shared by the game and the server. Nothing here is shown as a number:
// you judge cooking by how the food looks and sounds, and you find out
// what a dish does by eating it.

import { ITEMS } from './items.js';
import { DAY_LENGTH } from './environment.js';

/**
 * How long things take on the heat, in seconds: [done from, burnt from].
 * In the pan it depends on what's in it (the slowest thing sets the pace);
 * the pot is slower and the same for everything.
 */
export const PAN = { fish: [16, 34], fruit: [9, 22], veg: [12, 26], store: [10, 24], food: [8, 22] };
export const POT = [45, 95];
const PACE = ['fruit', 'store', 'food', 'veg', 'fish'];

/** Where you can cook and what's there: the galley stove has a pan and a pot, each village fire a griddle. */
export const VESSELS = { galley: ['pan', 'pot'], 'fire:cove': ['pan'], 'fire:landing': ['pan'], 'fire:strand': ['pan'] };
export const ROOM = { pan: 2, pot: 3 };

const WHITE_FISH = ['pollock', 'bass', 'plaice', 'mullet', 'wrasse', 'grouper', 'parrotfish'];

/**
 * Dishes. `needs` is a list of slots, each filled by one of the kinds
 * listed; nothing else may be in with them. You know a recipe once
 * somebody tells you, or once you've made it.
 */
export const RECIPES = {
  'mackerel-lime': {
    name: 'Mackerel with lime',
    note: 'Mackerel over a fire, a squeeze of lime on it. Gwen says people fuss.',
    vessel: 'pan',
    needs: [['mackerel'], ['lime']],
    effect: 'night',
  },
  'grilled-plantain': {
    name: 'Grilled plantain',
    note: 'Plantain in the pan on its own, till it goes brown at the edges and soft.',
    vessel: 'pan',
    needs: [['plantain']],
    effect: 'steady',
  },
  'fish-stew': {
    name: 'Fish stew',
    note: 'Any white fish, a coconut and a lime in the pot. Let it bubble till it smells right.',
    vessel: 'pot',
    needs: [WHITE_FISH, ['coconut'], ['lime']],
    effect: 'swim',
  },
  'saltfish-plantain': {
    name: 'Salt fish and plantain',
    note: 'Salt fish and a plantain in the pot. Plain, but it sits well.',
    vessel: 'pot',
    needs: [['saltfish'], ['plantain']],
    effect: 'steady',
  },
  'squid-coconut': {
    name: 'Squid in coconut',
    note: 'Squid and a coconut in the pot. Not long, or it goes to rubber.',
    vessel: 'pot',
    needs: [['squid'], ['coconut']],
    effect: 'swim',
  },
  // The cooks' dishes (shared/restaurants.js). They'll show you, in time.
  'pilchards-oatmeal': {
    name: 'Pilchards in oatmeal',
    note: "Pilchards rolled in oats and into hot fat in the pan. Jenefer says don't touch them till they want turning.",
    vessel: 'pan',
    needs: [['pilchard'], ['oats']],
    effect: 'night',
  },
  'crab-rice': {
    name: 'Crab and rice',
    note: 'A crab, rice and pepper in the pot.',
    vessel: 'pot',
    needs: [['crab'], ['rice'], ['pepper']],
    effect: 'swim',
  },
  'fish-soup': {
    name: 'Fish soup',
    note: 'White fish, a potato and an onion in the pot.',
    vessel: 'pot',
    needs: [WHITE_FISH, ['potato'], ['onion']],
    effect: 'steady',
  },
  kedgeree: {
    name: 'Kedgeree',
    note: 'A kipper, rice and an onion in the pot. Breakfast, Jenefer says, and nothing else.',
    vessel: 'pot',
    needs: [['kipper'], ['rice'], ['onion']],
    effect: 'night',
  },
  'leek-potato': {
    name: 'Leek and potato soup',
    note: "A leek, a potato and an onion in the pot. Loveday says it's the potato does the work.",
    vessel: 'pot',
    needs: [['leek'], ['potato'], ['onion']],
    effect: 'steady',
  },
  'cheese-potato': {
    name: "Potatoes and goat's cheese",
    note: "A potato and a round of Mags's cheese in the pan.",
    vessel: 'pan',
    needs: [['potato'], ['cheese']],
    effect: 'night',
  },
  'cabbage-beans': {
    name: 'Cabbage and beans',
    note: 'A cabbage and dried beans in the pot, a long time.',
    vessel: 'pot',
    needs: [['cabbage'], ['beans']],
    effect: 'swim',
  },
  'fish-curry': {
    name: 'Fish curry',
    note: 'White fish, curry powder and rice in the pot. Loveday learnt it on the mainland.',
    vessel: 'pot',
    needs: [WHITE_FISH, ['curry'], ['rice']],
    effect: 'swim',
  },
};

/** What eating does, for how long (in-game hours), and what it feels like. */
export const EFFECTS = {
  swim: { hours: 10, feel: 'You feel like you could swim to the Brothers.' },
  steady: { hours: 10, feel: 'Your feet feel surer under you.' },
  night: { hours: 10, feel: 'Your eyes feel sharp.' },
};

/** How long raw things keep, in in-game days. Cooked food keeps a while too. */
const KEEPS = { fish: 2, fruit: 4, veg: 6, cooked: 3 };

/** Can this go in a pan or a pot? */
export const cookable = (it) => !!it && !it.off && !it.cooked && ['fish', 'fruit', 'food', 'veg', 'store'].includes(ITEMS[it.kind]?.kind);

/** Has this gone off by time t? */
export function goneOff(it, t) {
  const k = ITEMS[it.kind]?.kind;
  const days = it.cooked ? KEEPS.cooked : KEEPS[k];
  if (!days) return false;
  return t - (it.cookedAt ?? it.got ?? t) > days * DAY_LENGTH;
}

/**
 * [done from, burnt from] for what's in a vessel. A better stove (one of
 * Ned's) keeps a steadier heat: things take as long to cook but much
 * longer to burn.
 */
export function windowFor(vessel, kinds, better = false) {
  let w;
  if (vessel === 'pot') w = POT;
  else {
    let pace = 'fruit';
    for (const k of kinds) {
      const c = ITEMS[k]?.kind;
      if (PACE.indexOf(c) > PACE.indexOf(pace)) pace = c;
    }
    w = PAN[pace];
  }
  return better ? [w[0], w[0] + (w[1] - w[0]) * 1.8] : w;
}

/** How far along something on the heat is: 'raw', 'done' or 'burnt'. */
export function doneness(vessel, kinds, secs, better = false) {
  const [a, b] = windowFor(vessel, kinds, better);
  return secs < a ? 'raw' : secs < b ? 'done' : 'burnt';
}

/** The recipe these ingredients make in this vessel, if any. */
export function recipeFor(vessel, kinds) {
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.vessel !== vessel || r.needs.length !== kinds.length) continue;
    const left = [...kinds];
    let ok = true;
    for (const slot of r.needs) {
      const i = left.findIndex((k) => slot.includes(k));
      if (i < 0) {
        ok = false;
        break;
      }
      left.splice(i, 1);
    }
    if (ok) return id;
  }
  return null;
}

const NUMBERS = ['no', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/**
 * What to call n of a thing you own, as you'd write it: "a fried mackerel",
 * "two burnt limes", "a bowl of fish stew", "a mackerel that's gone off".
 */
export function describe(it, n = 1) {
  const base = ITEMS[it.kind];
  if (!base) return '';
  const many = n > 1;
  const plural = base.plural ?? `${base.name}s`;
  const invariant = plural === base.name;
  let name = many ? plural : base.name;
  if (it.cooked === 'done' && base.cooked && base.kind !== 'dish') name = many && !invariant ? `${base.cooked}s` : base.cooked;
  else if (it.cooked === 'burnt') name = name.includes(' of ') ? name.replace(' of ', ' of burnt ') : `burnt ${name}`;
  if (it.off) name = `${name} that${many ? ' have' : "'s"} gone off`;
  if (!many) return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`.replace(/^a the /, 'the ');
  return `${NUMBERS[n] ?? n} ${name}`;
}

/** Things that are the same as far as the journal's concerned. */
export const sameKey = (it) => `${it.kind}|${it.cooked ?? ''}|${it.off ? 1 : ''}`;
