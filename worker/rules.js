// The rules for a player's progress: what each action is allowed to do to
// their saved state. Plain functions with no Cloudflare in them, so the tests
// can run them directly; worker/player.js keeps the state and calls these.
//
// The browser asks ("I dug here", "I caught a mackerel"); these decide.

import { issueMap, dig, near, claim } from './treasure.js';
import { ITEMS, FIND_IDS, VALUABLE_IDS } from '../shared/items.js';
import { TALK, repliesAt, firstValuable, count } from '../shared/talk.js';
import { UPGRADES, HOLD } from '../shared/upgrades.js';
import { decorable, inCabin, MAX_DECOR, LAYOUT_V } from '../shared/decor.js';
import { VILLAGERS } from '../shared/villages.js';
import { QUESTS } from '../shared/quests.js';
import { hoursAt, DAY_LENGTH } from '../shared/environment.js';
import { GATHER, gatherWorld, ripe } from '../shared/gather.js';
import { VESSELS, ROOM, EFFECTS, RECIPES, cookable, goneOff, doneness, recipeFor } from '../shared/food.js';
import { SHOPS, VALUE, FISH_PRICE, NED_FEE, sellableFish, stockFor, openNow } from '../shared/trade.js';
import { dayAt, seasonAt } from '../shared/environment.js';
import { PLACES, onMenu } from '../shared/restaurants.js';

/** A brand-new player. */
export function freshState(now) {
  return {
    v: 1,
    rev: 0,
    created: now,
    given: false, // had their first map
    maps: [], // treasure maps held: { id, island, title, mark, note }
    chests: {}, // dug up or claimed: { [id]: { from, found, delivered } }
    solved: [], // puzzles and climbs whose chest has been had
    finds: [], // things picked up on the islands, in order
    items: [], // what you own: { id, kind, got, kg?, where: 'bear' | 'hold' }
    catches: { counts: {}, biggest: null, last: 0 },
    journal: [], // notes in your own words: { t, quest, text }
    quests: {}, // { [id]: { stage, started, done } }
    met: {}, // who you've talked to
    recipes: [], // dishes you know how to make
    talking: null, // where you are in a conversation: { who, convo, line }
    upgrades: [], // what's been done to your boat (shared/upgrades.js)
    picked: {}, // when each fruit tree was last picked (shared/gather.js)
    cooking: {}, // what's on the heat: { 'galley/pan': { since, items } }
    fed: null, // what you last ate is doing for you: { effect, until }
    decor: [], // things put about the cabin: { item, kind, at: [x, y, z], yaw, wall }
    decorV: LAYOUT_V, // which cabin those positions are for (shared/decor.js)
    stowed: [], // finds put away in the locker rather than out on show
    pence: 0, // money, in pence (shared/trade.js)
    shops: {}, // what you've bought today: { [shop]: { day, bought: { [slot]: n } } }
    meals: {}, // how many times you've eaten at each place (shared/restaurants.js)
    nextId: 1,
  };
}

const fail = (why) => ({ ok: false, why });

/** How full the hold is: food and materials (not keepsakes, not things of value). */
export function holdUsed(s) {
  return s.items.filter((i) => ['fish', 'fruit', 'veg', 'store', 'food', 'dish', 'material', 'junk'].includes(ITEMS[i.kind]?.kind)).length;
}
const holdRoom = (s) => ((s.upgrades ?? []).includes('hold') ? HOLD.big : HOLD.small);

/** A new item in the player's things. */
function give(s, kind, now, extra = {}) {
  const it = { id: `i${s.nextId++}`, kind, got: now, where: 'hold', ...extra };
  s.items.push(it);
  return it;
}

function chestId(s) {
  return `c${s.nextId++}`;
}

/** A small stable number from a string. */
function hashText(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}

const finite = (...v) => v.every((x) => typeof x === 'number' && Number.isFinite(x));

const ACTIONS = {
  /** Just load. */
  async hello() {
    return { ok: true };
  },

  /** Everyone starts with one map. */
  async firstMap(s, a, { secret }) {
    if (s.given) return fail('already');
    const map = await issueMap(secret);
    s.maps.push(map);
    s.given = true;
    return { ok: true, map };
  },

  /** The spare map on the chart table, only when you've none at all. */
  async spareMap(s, a, { secret }) {
    if (s.maps.length) return fail('have maps');
    const map = await issueMap(secret);
    s.maps.push(map);
    s.given = true;
    return { ok: true, map };
  },

  async dig(s, a, { secret, now }) {
    if (!finite(a.x, a.z)) return fail('where');
    const res = await dig(secret, { x: a.x, z: a.z, maps: s.maps.map((m) => m.id) });
    if (res.result !== 'chest') return { ok: true, result: res.result };
    let from = null;
    if (res.map) {
      from = s.maps.find((m) => m.id === res.map)?.island ?? null;
      s.maps = s.maps.filter((m) => m.id !== res.map);
    } else if (res.puzzle) {
      if (s.solved.includes(res.puzzle)) return { ok: true, result: 'nothing' };
      s.solved.push(res.puzzle);
      from = res.puzzle;
    }
    const id = chestId(s);
    s.chests[id] = { from, found: now, delivered: false };
    return { ok: true, result: 'chest', chest: id, from };
  },

  /** Is the ground turned over near here? */
  async near(s, a, { secret }) {
    if (!finite(a.x, a.z)) return fail('where');
    const res = await near(secret, { x: a.x, z: a.z, maps: s.maps.map((m) => m.id) });
    return { ok: true, spots: res.spots.filter((p) => !p.puzzle || !s.solved.includes(p.puzzle)).map(({ x, z }) => ({ x, z })) };
  },

  /** Got the chest down off a climb. */
  async claim(s, a, { now }) {
    if (!finite(a.x, a.y, a.z) || typeof a.course !== 'string') return fail('where');
    const res = claim({ course: a.course, x: a.x, y: a.y, z: a.z });
    if (res.result !== 'chest' || s.solved.includes(a.course)) return { ok: true, result: 'nothing' };
    s.solved.push(a.course);
    const id = chestId(s);
    s.chests[id] = { from: a.course, found: now, delivered: false };
    return { ok: true, result: 'chest', chest: id };
  },

  /** A chest set down on your boat: it opens, and there's usually a map in it. */
  async deliver(s, a, { secret, now }) {
    const c = s.chests[a.chest];
    if (!c || c.delivered) return fail('no chest');
    c.delivered = true;
    const map = await issueMap(secret, { not: c.from ? [c.from] : [] });
    s.maps.push(map);
    // And something of value under the map.
    const kind = VALUABLE_IDS[hashText(`${a.chest}:${s.created}`) % VALUABLE_IDS.length];
    give(s, kind, now);
    return { ok: true, map, kind };
  },

  /** Picked something up on an island. */
  async find(s, a, { now }) {
    if (!FIND_IDS.includes(a.id)) return fail('what');
    if (s.finds.includes(a.id)) return { ok: true, already: true };
    s.finds.push(a.id);
    give(s, a.id, now);
    return { ok: true };
  },

  /** Landed a fish. Within reason: the right size for its kind, and not too often. */
  async catch(s, a, { now }) {
    const it = ITEMS[a.kind];
    if (!it || (it.kind !== 'fish' && it.kind !== 'junk') || !finite(a.kg)) return fail('what');
    if (a.kg < it.kg[0] * 0.95 || a.kg > it.kg[1] * 1.05) return fail('size');
    if (now - s.catches.last < 2.5) return fail('too quick');
    if (holdUsed(s) >= holdRoom(s)) return fail('full');
    s.catches.last = now;
    if (it.kind === 'fish') {
      s.catches.counts[a.kind] = (s.catches.counts[a.kind] ?? 0) + 1;
      if (!s.catches.biggest || a.kg > s.catches.biggest.kg) s.catches.biggest = { kind: a.kind, kg: a.kg };
    }
    give(s, a.kind, now, { kg: Math.round(a.kg * 100) / 100 });
    return { ok: true };
  },

  /** Picked something off a tree. */
  async gather(s, a, { now }) {
    const g = Object.hasOwn(GATHER, a.id) ? GATHER[a.id] : null;
    if (!g || !finite(a.x, a.z)) return fail('what');
    const p = gatherWorld(a.id);
    if (Math.hypot(p.x - a.x, p.z - a.z) > 7) return fail('where');
    s.picked ??= {};
    if (!ripe(a.id, s.picked[a.id], now)) return fail('none left');
    if (holdUsed(s) >= holdRoom(s)) return fail('full');
    s.picked[a.id] = now;
    const it = give(s, g.kind, now);
    return { ok: true, kind: it.kind };
  },

  /** Put something in the pan or the pot. It starts cooking the moment the first thing goes in. */
  async cookPut(s, a, { now }) {
    if (!Object.hasOwn(VESSELS, a.where) || !VESSELS[a.where].includes(a.vessel)) return fail('where');
    const it = s.items.find((i) => i.id === a.item);
    if (!cookable(it)) return fail('not that');
    s.cooking ??= {};
    const key = `${a.where}/${a.vessel}`;
    const c = (s.cooking[key] ??= { since: now, items: [] });
    if (c.items.length >= ROOM[a.vessel]) return fail('full');
    s.items = s.items.filter((i) => i !== it);
    c.items.push(it);
    return { ok: true };
  },

  /**
   * Take it off the heat. How long it's been on decides: too soon and it's
   * still raw (back it goes, as it was); in time and it's done; too long and
   * it's burnt. The right things together make a dish, and you'll know it
   * from then on.
   */
  async cookTake(s, a, { now }) {
    const key = `${a.where}/${a.vessel}`;
    const c = s.cooking?.[key];
    if (!c) return fail('nothing on');
    delete s.cooking[key];
    const kinds = c.items.map((i) => i.kind);
    const result = doneness(a.vessel, kinds, now - c.since, a.where === 'galley' && (s.upgrades ?? []).includes('stove'));
    if (result === 'raw') {
      s.items.push(...c.items);
      return { ok: true, result };
    }
    const recipe = recipeFor(a.vessel, kinds);
    let it;
    if (recipe) it = give(s, recipe, now, { cooked: result, cookedAt: now });
    else if (c.items.length === 1) {
      it = { ...c.items[0], cooked: result, cookedAt: now };
      s.items.push(it);
    } else it = give(s, a.vessel === 'pot' ? 'potful' : 'fryup', now, { cooked: result, cookedAt: now });
    let learned = false;
    if (recipe && result === 'done' && !s.recipes.includes(recipe)) {
      s.recipes.push(recipe);
      learned = true;
    }
    return { ok: true, result, item: it.id, kind: it.kind, recipe, learned };
  },

  /** Put something down somewhere in the cabin (or hang it on a wall). */
  async place(s, a) {
    const it = s.items.find((i) => i.id === a.item);
    if (!it || !decorable(it.kind)) return fail('what');
    if (!Array.isArray(a.at) || a.at.length !== 3 || !finite(...a.at, a.yaw) || !inCabin(a.at)) return fail('where');
    s.decor ??= [];
    s.decor = s.decor.filter((d) => d.item !== it.id);
    if (s.decor.length >= MAX_DECOR) return fail('full');
    const r = (n) => Math.round(n * 1000) / 1000;
    s.decor.push({ item: it.id, kind: it.kind, at: a.at.map(r), yaw: r(a.yaw), wall: !!a.wall });
    s.stowed = (s.stowed ?? []).filter((id) => id !== it.id);
    return { ok: true };
  },

  /** Put something away in the locker. */
  async stow(s, a) {
    const it = s.items.find((i) => i.id === a.item);
    if (!it || !decorable(it.kind)) return fail('what');
    s.decor = (s.decor ?? []).filter((d) => d.item !== it.id);
    s.stowed ??= [];
    if (!s.stowed.includes(it.id)) s.stowed.push(it.id);
    return { ok: true };
  },

  /** Eat something. Good food does you a little good for a while. */
  async eat(s, a, { now }) {
    const it = s.items.find((i) => i.id === a.item);
    if (!it) return fail('what');
    const k = ITEMS[it.kind]?.kind;
    if (!['fish', 'fruit', 'veg', 'food', 'dish'].includes(k)) return fail('not food');
    if (k === 'fish' && !it.cooked && !it.off) return fail('raw');
    s.items = s.items.filter((i) => i !== it);
    if (it.off) return { ok: true, result: 'off' };
    if (it.cooked === 'burnt') return { ok: true, result: 'burnt' };
    let effect = null;
    let hours = 0;
    if (RECIPES[it.kind]) {
      effect = RECIPES[it.kind].effect;
      hours = EFFECTS[effect].hours;
    } else if ((k === 'fish' && it.cooked) || k === 'food') {
      effect = 'steady';
      hours = 4;
    }
    if (!effect) return { ok: true, result: 'plain' };
    s.fed = { effect, until: now + (hours * DAY_LENGTH) / 24 };
    return { ok: true, result: 'fed', effect };
  },
};

/** Raw food goes off after a few days. Returns whether anything did. */
function spoil(s, now) {
  let any = false;
  for (const it of s.items) {
    if (!it.off && goneOff(it, now)) {
      it.off = true;
      any = true;
    }
  }
  return any;
}

/**
 * The cabin's been rebuilt (shared/decor.js LAYOUT_V): what was put about
 * the old one goes back to its first place, once. (Things with no first
 * place are in the locker.) Returns whether anything changed.
 */
export function settle(s) {
  if ((s.decorV ?? 1) >= LAYOUT_V) return false;
  s.decor = [];
  s.decorV = LAYOUT_V;
  return true;
}

// Actions that only look.
const READ_ONLY = new Set(['hello', 'near']);

/** Do what a reply in a conversation does. */
function effects(s, list, now) {
  for (const [what, a, b] of list ?? []) {
    if (what === 'met') s.met[a] = true;
    else if (what === 'start' && !s.quests[a]) s.quests[a] = { stage: 0, started: now, done: false };
    else if (what === 'note') s.journal.push({ t: now, quest: a, text: b });
    else if (what === 'stage' && s.quests[a]) s.quests[a].stage = b;
    else if (what === 'done' && s.quests[a]) s.quests[a].done = true;
    else if (what === 'give') give(s, a, now);
    else if (what === 'learn') {
      s.recipes ??= [];
      if (!s.recipes.includes(a)) s.recipes.push(a);
    } else if (what === 'pay') {
      // Something of value if you've got it, or ten shillings.
      const v = firstValuable(s);
      if (v) s.items = s.items.filter((i) => i !== v);
      else if ((s.pence ?? 0) >= NED_FEE) s.pence -= NED_FEE;
    } else if (what === 'sell') {
      // To Hester: the first thing of value you've got, for what it's worth to her.
      const v = firstValuable(s);
      if (v) {
        s.items = s.items.filter((i) => i !== v);
        s.pence = (s.pence ?? 0) + (VALUE[v.kind] ?? 60);
      }
    } else if (what === 'sellFish') {
      const fish = sellableFish(s);
      s.pence = (s.pence ?? 0) + fish.reduce((t, i) => t + FISH_PRICE[i.kind], 0);
      s.items = s.items.filter((i) => !fish.includes(i));
    } else if (what === 'dine') {
      // At a cook's: it has to be on now, and you pay for it. It does you the
      // same good as the dish would if you'd cooked it yourself.
      const d = Object.hasOwn(PLACES, a) ? onMenu(a, b, now) : null;
      if (d && (s.pence ?? 0) >= d.price) {
        s.pence -= d.price;
        s.meals ??= {};
        s.meals[a] = (s.meals[a] ?? 0) + 1;
        const effect = RECIPES[b]?.effect;
        if (effect) s.fed = { effect, until: now + (EFFECTS[effect].hours * DAY_LENGTH) / 24 };
      }
    } else if (what === 'upgrade') {
      s.upgrades ??= [];
      if (UPGRADES[a] && !s.upgrades.includes(a)) s.upgrades.push(a);
    } else if (what === 'takeN') {
      for (let k = 0; k < b; k++) {
        const i = s.items.findIndex((it) => !it.off && !it.cooked && (a === '@fish' ? ITEMS[it.kind]?.kind === 'fish' : it.kind === a));
        if (i >= 0) s.items.splice(i, 1);
      }
    } else if (what === 'take') {
      const i = s.items.findIndex((it) => it.kind === a);
      if (i >= 0) s.items.splice(i, 1);
    }
  }
}

/**
 * Bought at a shop: the things you took to the counter (by where they were
 * on the shelves). It has to be open, they have to have been there today and
 * not already sold to you, you have to have the money and the room.
 */
ACTIONS.buy = async (s, a, { now }) => {
  const shop = Object.hasOwn(SHOPS, a.shop) ? SHOPS[a.shop] : null;
  if (!shop || !Array.isArray(a.slots) || !a.slots.length || a.slots.length > 12) return fail('what');
  if (!openNow(a.shop, now)) return fail('closed');
  const day = dayAt(now);
  const stock = stockFor(a.shop, day, seasonAt(now));
  s.shops ??= {};
  const mine = s.shops[a.shop]?.day === day ? s.shops[a.shop] : { day, bought: {} };
  const want = {};
  for (const i of a.slots) {
    if (!Number.isInteger(i) || !stock[i]) return fail('not there');
    want[i] = (want[i] ?? 0) + 1;
    if (want[i] + (mine.bought[i] ?? 0) > stock[i].n) return fail('sold out');
  }
  const total = a.slots.reduce((t, i) => t + stock[i].price, 0);
  if ((s.pence ?? 0) < total) return fail('short');
  if (holdUsed(s) + a.slots.length > holdRoom(s)) return fail('full');
  s.pence -= total;
  const got = [];
  for (const i of a.slots) {
    const kind = stock[i].kind;
    const kg = ITEMS[kind].kg ? Math.round(((ITEMS[kind].kg[0] + ITEMS[kind].kg[1]) / 2) * 100) / 100 : undefined;
    got.push(give(s, kind, now, kg ? { kg } : {}).kind);
    mine.bought[i] = (mine.bought[i] ?? 0) + 1;
  }
  s.shops[a.shop] = mine;
  return { ok: true, total, got };
};

/** Something out in the world for a quest (shared/quests.js): only counts at the right stage. */
ACTIONS.quest = async (s, a, { now }) => {
  const qd = Object.hasOwn(QUESTS, a.id) ? QUESTS[a.id] : null;
  const step = qd && Object.hasOwn(qd.steps, a.step) ? qd.steps[a.step] : null;
  const st = s.quests[a.id];
  if (!step || !st || st.done || st.stage !== step.stage) return fail('not now');
  if (!finite(a.x, a.z) || Math.hypot(a.x - step.at[0], a.z - step.at[1]) > step.reach + 3) return fail('where');
  effects(s, step.do, now);
  return { ok: true, say: step.say };
};

/**
 * Pick a reply in a conversation. A conversation can only be opened when its
 * `when` says so; after that you can only carry on along it, one reply at a
 * time (it's fine for the reply you pick to change what `when` would say).
 */
ACTIONS.talk = async (s, a, { now, secret }) => {
  if (!Object.hasOwn(VILLAGERS, a.who) || !Object.hasOwn(TALK, a.who)) return fail('who');
  const convo = TALK[a.who].find((c) => c.id === a.convo);
  const at = String(a.line);
  if (!convo) return fail('what');
  const h = hoursAt(now);
  if (at === '0') {
    if (!convo.when(s, h, now)) return fail('not now');
  } else {
    const t = s.talking;
    if (!t || t.who !== a.who || t.convo !== a.convo || t.line !== at) return fail('not now');
  }
  const line = Object.hasOwn(convo.lines, at) ? convo.lines[at] : null;
  if (!line) return fail('what');
  // By its id if it has one (a dish on a menu), else by where it is in the list.
  const list = repliesAt(line, s, h, now);
  const reply = typeof a.rid === 'string' ? list.find((r) => r.id === a.rid) : list[a.pick];
  if (!reply) return fail('no such reply');
  effects(s, reply.do, now);
  // A treasure map, from someone who couldn't make it out.
  for (const [what] of reply.do ?? []) if (what === 'map') s.maps.push(await issueMap(secret));
  s.journal = s.journal.slice(-200);
  const to = reply.to ?? null;
  s.talking = to !== null && convo.lines[to] ? { who: a.who, convo: a.convo, line: String(to) } : null;
  return { ok: true, to };
};

/**
 * Apply one action to a copy of the state. Returns { state, reply }; state is
 * the same object as before when nothing changed.
 */
export async function apply(state, action, ctx) {
  const fn = action && typeof action.type === 'string' && Object.hasOwn(ACTIONS, action.type) ? ACTIONS[action.type] : null;
  if (!fn) return { state, reply: fail('unknown action') };
  const s = structuredClone(state);
  const spoiled = spoil(s, ctx.now);
  const moved = settle(s);
  const reply = await fn(s, action, ctx);
  if (!reply.ok || READ_ONLY.has(action.type)) {
    if (!spoiled && !moved) return { state, reply };
    // Nothing done, but something in the hold has gone off meanwhile (or the cabin's new).
    const kept = structuredClone(state);
    spoil(kept, ctx.now);
    settle(kept);
    return { state: kept, reply };
  }
  return { state: s, reply };
}

/** What the browser gets to see of the state. */
export function publicState(s) {
  const { nextId, catches, talking, ...rest } = s;
  return { ...rest, catches: { counts: catches.counts, biggest: catches.biggest } };
}
