// The rules for a player's progress: what each action is allowed to do to
// their saved state. Plain functions with no Cloudflare in them, so the tests
// can run them directly; worker/player.js keeps the state and calls these.
//
// The browser asks ("I dug here", "I caught a mackerel"); these decide.

import { issueMap, dig, near, claim } from './treasure.js';
import { ITEMS, FIND_IDS } from '../shared/items.js';

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
    journal: [],
    nextId: 1,
  };
}

const fail = (why) => ({ ok: false, why });

/** A new item in the player's things. */
function give(s, kind, now, extra = {}) {
  const it = { id: `i${s.nextId++}`, kind, got: now, where: 'hold', ...extra };
  s.items.push(it);
  return it;
}

function chestId(s) {
  return `c${s.nextId++}`;
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
  async deliver(s, a, { secret }) {
    const c = s.chests[a.chest];
    if (!c || c.delivered) return fail('no chest');
    c.delivered = true;
    const map = await issueMap(secret, { not: c.from ? [c.from] : [] });
    s.maps.push(map);
    return { ok: true, map };
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
    s.catches.last = now;
    if (it.kind === 'fish') {
      s.catches.counts[a.kind] = (s.catches.counts[a.kind] ?? 0) + 1;
      if (!s.catches.biggest || a.kg > s.catches.biggest.kg) s.catches.biggest = { kind: a.kind, kg: a.kg };
    }
    give(s, a.kind, now, { kg: Math.round(a.kg * 100) / 100 });
    return { ok: true };
  },

  /** Fry a fish on the galley stove (until proper cooking arrives). */
  async cookOne(s, a, { now }) {
    const fish = s.items.find((i) => ITEMS[i.kind]?.kind === 'fish');
    if (!fish) return fail('no fish');
    s.items = s.items.filter((i) => i !== fish);
    return { ok: true, kind: fish.kind, now };
  },
};

// Actions that only look.
const READ_ONLY = new Set(['hello', 'near']);

/**
 * Apply one action to a copy of the state. Returns { state, reply }; state is
 * the same object as before when nothing changed.
 */
export async function apply(state, action, ctx) {
  const fn = action && typeof action.type === 'string' && Object.hasOwn(ACTIONS, action.type) ? ACTIONS[action.type] : null;
  if (!fn) return { state, reply: fail('unknown action') };
  const s = structuredClone(state);
  const reply = await fn(s, action, ctx);
  if (!reply.ok || READ_ONLY.has(action.type)) return { state, reply };
  return { state: s, reply };
}

/** What the browser gets to see of the state. */
export function publicState(s) {
  const { nextId, catches, ...rest } = s;
  return { ...rest, catches: { counts: catches.counts, biggest: catches.biggest } };
}
