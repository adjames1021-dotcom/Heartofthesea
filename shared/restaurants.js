// Places to eat, and the people who cook there. Shared by the game (the
// chalkboard, the cook calling out) and the server (which checks a dish was
// on at that hour and season, and that you paid for it).
//
// A meal there does you the same good as one you've cooked yourself, and
// it's a way to try dishes you can't make yet. Eat at a cook's enough (or
// help their village) and they'll show you how they do their best one.

import { RECIPES } from './food.js';
import { VILLAGERS, routineAt } from './villages.js';
import { hoursAt, seasonAt } from './environment.js';
import { words } from './trade.js';

/** When there's food on: [from, to] in hours. */
export const MEALS = { breakfast: [6.5, 10], lunch: [11.5, 14.5], supper: [17.5, 21] };

/** Which meal it is at hour h (or null between them). */
export function mealAt(h) {
  for (const [m, [a, b]] of Object.entries(MEALS)) if (h >= a && h < b) return m;
  return null;
}

/**
 * Each place: its cook and where they stand to serve, the dish they'll
 * teach you, the quests that count as helping their village, and the menu:
 * for each meal, [dish, price in pence, seasons it's on (or null)].
 */
export const PLACES = {
  kitto: {
    name: "Kitto's",
    village: 'cove',
    cook: 'jenefer',
    spot: 'shack',
    teaches: 'pilchards-oatmeal',
    helped: ['nets', 'knife', 'foretop'],
    menu: {
      breakfast: [
        ['kedgeree', 7, null],
        ['pilchards-oatmeal', 6, [2, 3]],
        ['mackerel-lime', 6, [0, 1]],
      ],
      lunch: [
        ['fish-soup', 6, null],
        ['crab-rice', 10, [0, 1]],
        ['saltfish-plantain', 5, [2, 3]],
      ],
      supper: [
        ['pilchards-oatmeal', 6, null],
        ['fish-stew', 8, null],
        ['squid-coconut', 8, [1, 2]],
        ['crab-rice', 10, [0]],
        ['fish-soup', 6, [3]],
      ],
    },
    // Called out over the counter to anyone passing: by dish.
    calls: {
      kedgeree: "Kedgeree. It's breakfast, whatever the mainland says.",
      'pilchards-oatmeal': 'Pilchards in oatmeal. Hot, and not for long.',
      'mackerel-lime': "Mackerel and lime. Gwen'll tell you it's hers. It isn't.",
      'fish-soup': "Soup's on. Plenty of it.",
      'crab-rice': "Crab and rice. Dear, and worth it.",
      'saltfish-plantain': 'Salt fish and plantain, for them that miss home.',
      'fish-stew': "Fish stew. Tam's caught most of it. Don't tell him.",
      'squid-coconut': "Squid in coconut, while the squid's running.",
    },
    // What she says about each dish once you've had it.
    after: {
      kedgeree: "There. Rice and a kipper. Somebody in India's laughing at me.",
      'pilchards-oatmeal': "Oatmeal, not flour. Flour's for cakes. And people from Truro.",
      'mackerel-lime': "Lime on mackerel. I'll admit Gwen's right about that and nothing else.",
      'fish-soup': "Potato's what holds it together. Like most things.",
      'crab-rice': "Crab's sweetest in spring. You'll be ruined for it now.",
      'saltfish-plantain': "Plain. Some days you want plain.",
      'fish-stew': "Coconut in fish stew. My mother would turn in her grave. She's welcome to.",
      'squid-coconut': "Two minutes in the pot, or you're chewing a boot.",
    },
    // What she says when you come up to the counter, and the rest of it.
    says: {
      serving: {
        breakfast: "Morning. It's on the board.",
        lunch: "Board's there. Soup's always on.",
        supper: "Sit anywhere that isn't Tam's. What'll it be?",
      },
      between: (h) => (h < 7 ? "Fire's not hot yet. Breakfast when it is." : h < 12 ? "Nothing now till half eleven. I'm doing potatoes." : "Supper's at half five. Not before. Not for anybody."),
      broke: 'Then you go hungry. Hester buys fish, over at the Landing. Come back with something in your pocket.',
      offer: "You've been in enough to want to know. The pilchards. Come round this side.",
      ask: 'How do you do the pilchards?',
      // When she shows you how.
      teach: "Pilchards, rolled in oats. Fat hot enough to spit. Then leave them alone. That's the bit nobody can do.",
      learnt: "I'll leave them alone.",
      thanks: 'Thanks, Jenefer.',
    },
  },
};

/** The cook's spot and work: are they at the counter? */
export function cookIn(place, h) {
  const p = PLACES[place];
  const r = routineAt(VILLAGERS[p.cook], h);
  return r.spot === p.spot && r.act === 'work';
}

/**
 * What's on at a place at world time t (and hour h, if it's known apart
 * from t): { meal, dishes: [{ dish, price }] }, or null if the kitchen's shut.
 */
export function menuAt(place, t, h = hoursAt(t)) {
  const meal = mealAt(h);
  if (!meal || !cookIn(place, h)) return null;
  const season = seasonAt(t);
  const dishes = PLACES[place].menu[meal].filter(([, , seasons]) => !seasons || seasons.includes(season)).map(([dish, price]) => ({ dish, price }));
  return { meal, dishes };
}

/** Is this dish on, and at what price? */
export function onMenu(place, dish, t, h) {
  return menuAt(place, t, h)?.dishes.find((d) => d.dish === dish) ?? null;
}

/** Has the cook a reason to show you their dish? (You've eaten there three times, or helped their village.) */
export function willTeach(place, s) {
  const p = PLACES[place];
  if ((s?.recipes ?? []).includes(p.teaches)) return false;
  return (s?.meals?.[place] ?? 0) >= 3 || p.helped.some((q) => s?.quests?.[q]?.done);
}

/** The dish's name for the chalkboard. */
export const dishName = (dish) => RECIPES[dish]?.name ?? dish;

/** Every dish a place ever does. */
export const allDishes = (place) => [...new Set(Object.values(PLACES[place].menu).flat().map(([d]) => d))];

/** The cheapest thing on now (or null). */
export const cheapest = (place, t, h) => {
  const m = menuAt(place, t, h);
  return m?.dishes.length ? Math.min(...m.dishes.map((d) => d.price)) : null;
};

/** How you'd ask for it: "The fish soup. Here's sixpence." */
export const askFor = (dish, price) => `The ${dishName(dish).toLowerCase()}. Here's ${words(price)}.`;
