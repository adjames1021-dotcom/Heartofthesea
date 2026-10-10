// Money and shops. Shared by the game (which lays the goods out and says the
// prices) and the server (which checks what you buy was there, that you can
// pay, and that the shop was open).
//
// Money is old money, kept in pence: twelve pence to the shilling. Tags are
// written the way a shopkeeper would chalk them (4d, 1/6, 2/-); people say it
// the way people do ("fourpence", "one and six", "two shillings"). You earn it
// by selling things to Hester at the Landing. Nothing else gives you money.

import { ITEMS } from './items.js';
import { VILLAGERS, routineAt } from './villages.js';
import { dayAt, seasonAt, hoursAt } from './environment.js';

/** As written on a price tag: 4d, 1/6, 2/-. */
export function tag(p) {
  const s = Math.floor(p / 12);
  const d = p % 12;
  if (!s) return `${d}d`;
  return d ? `${s}/${d}` : `${s}/-`;
}

const ONES = ['nothing', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** A number in words (under a hundred; above that, figures). */
export function numberWord(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  return String(n);
}
const PENCE = ['nothing', 'a penny', 'tuppence', 'threepence', 'fourpence', 'fivepence', 'sixpence', 'sevenpence', 'eightpence', 'ninepence', 'tenpence', 'elevenpence'];

/** As said: "fourpence", "a shilling", "one and six", "twelve shillings". */
export function words(p) {
  const s = Math.floor(p / 12);
  const d = p % 12;
  if (!s) return PENCE[d];
  if (!d) return s === 1 ? 'a shilling' : `${numberWord(s)} shillings`;
  return `${numberWord(s)} and ${numberWord(d)}`;
}

// ---------------------------------------------------------------------------
// Selling to Hester
// ---------------------------------------------------------------------------

/** What Hester gives for things of value, in pence. */
export const VALUE = { shillings: 240, watch: 360, ring: 300, snuffbox: 216, candlesticks: 144, pearls: 480, buttons: 72, sextant: 420 };

/** What she gives for a fresh fish of each kind. */
export const FISH_PRICE = { mackerel: 2, pollock: 3, bass: 5, plaice: 3, mullet: 3, wrasse: 2, parrotfish: 4, grouper: 8, squid: 3, pilchard: 1, crab: 4 };

/** Fresh fish you're carrying that she'd buy. */
export const sellableFish = (s) => (s?.items ?? []).filter((i) => !i.off && !i.cooked && FISH_PRICE[i.kind]);

/** What she'd give for all of them. */
export const fishValue = (s) => sellableFish(s).reduce((t, i) => t + FISH_PRICE[i.kind], 0);

/** Ned's price for his time, if you'd rather pay than hand over something of value. */
export const NED_FEE = 120;

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

/**
 * Each shop: who keeps it and where they stand (it's open while they're
 * there working), its places for goods in order (shelf, basket, hook, as
 * laid out in src/handpieces.js), and what it sells:
 * [kind, price in pence, where it goes, seasons it's in (or null), how many most days].
 */
export const SHOPS = {
  hester: {
    name: "Hester's",
    village: 'landing',
    keeper: 'hester',
    spot: 'store',
    slots: ['shelf', 'shelf', 'shelf', 'shelf', 'shelf', 'shelf', 'shelf', 'shelf', 'shelf', 'shelf', 'shelf', 'shelf', 'basket', 'basket', 'basket', 'basket', 'hook', 'hook', 'hook', 'hook', 'hook'],
    // Things from far off, mostly; what comes in on the boats.
    goods: [
      ['rice', 4, 'shelf', null, 3],
      ['flour', 3, 'shelf', null, 3],
      ['oats', 3, 'shelf', null, 3],
      ['pepper', 6, 'shelf', null, 2],
      ['curry', 9, 'shelf', null, 2],
      ['sugar', 5, 'shelf', null, 2],
      ['beans', 3, 'shelf', null, 3],
      ['coconut', 2, 'basket', null, 4],
      ['lime', 1, 'basket', [0, 1, 2], 6],
      ['ginger', 5, 'basket', [1, 2], 3],
      ['onion', 2, 'basket', null, 5],
      ['onion', 2, 'hook', null, 4],
      ['plantain', 2, 'hook', [1, 2, 3], 3],
      ['saltfish', 4, 'hook', [2, 3, 0], 3],
    ],
    // What she says, in her own words: as things go on the counter, when you
    // pay, when you can't, and when you walk off with something.
    says: {
      first: (p) => `That's ${words(p)}.`,
      more: (p, n) => (n % 2 ? `${cap(words(p))}, then.` : `${cap(words(p))}. Anything else?`),
      thanks: ['There. Mind how you go.', "Ta. Come back when you're rich.", "That's you. Don't let Jory carry it."],
      short: (p) => `You're ${words(p)} short. I'll put them back.`,
      full: "Where are you going to put it? That boat's full.",
      oi: "Oi. That's not paid for.",
      back: "I'll put those back, then.",
    },
  },
};

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** A small stable number in [0, 1) from some numbers. */
function mix(...n) {
  let h = 2166136261;
  for (const x of n) h = Math.imul(h ^ (x & 0xffff), 16777619) ^ Math.imul(x >>> 16, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * What's out today, place by place: [{ kind, price, n }] or null where
 * there's nothing. The same for everyone, and it changes every day (and with
 * the season). A shop never puts the same thing in more than two places.
 */
export function stockFor(shopId, day, season = 0) {
  const shop = SHOPS[shopId];
  const key = shopId.length * 131 + shopId.charCodeAt(0);
  const used = {};
  return shop.slots.map((type, i) => {
    if (mix(day, key, i, 7) < 0.14) return null; // run out, or not come in
    const fits = shop.goods.filter(([kind, , where, seasons]) => where === type && (!seasons || seasons.includes(season)) && (used[kind] ?? 0) < 2);
    if (!fits.length) return null;
    const [kind, price, , , most] = fits[Math.floor(mix(day, key, i, 11) * fits.length)];
    used[kind] = (used[kind] ?? 0) + 1;
    const n = Math.max(1, most + Math.floor(mix(day, key, i, 13) * 3) - 1);
    return { kind, price, n };
  });
}

/** Is the keeper there and working (so the shop's open), at hour h? */
export function openAt(shopId, h) {
  const shop = SHOPS[shopId];
  const r = routineAt(VILLAGERS[shop.keeper], h);
  return r.spot === shop.spot && r.act === 'work';
}

/** Today's stock for a shop, at world time t, less what you've bought of it today. */
export function shelvesAt(shopId, t, s) {
  const day = dayAt(t);
  const stock = stockFor(shopId, day, seasonAt(t));
  const mine = s?.shops?.[shopId];
  const bought = mine?.day === day ? mine.bought : {};
  return stock.map((st, i) => (st ? { ...st, left: Math.max(0, st.n - (bought[i] ?? 0)) } : null));
}

/** For the server: is it open now? (A minute's grace either side, for a slow connection.) */
export function openNow(shopId, t) {
  return openAt(shopId, hoursAt(t)) || openAt(shopId, hoursAt(t - 60)) || openAt(shopId, hoursAt(t + 60));
}

/** Plain name for a kind of goods, for prompts: "the rice", "an onion". */
export function goodsName(kind) {
  const it = ITEMS[kind];
  if (!it) return kind;
  return it.name.startsWith('bag of') || it.name.startsWith('jar of') || it.name.startsWith('twist of') || it.name.startsWith('root of') ? `the ${it.name}` : `${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}`;
}
