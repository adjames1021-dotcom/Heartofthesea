import { ISLAND_BY_ID, groundAt } from '../shared/world.js';
import { LANDMARKS, PLACE_IDS, isAt } from '../shared/landmarks.js';
import { VILLAGERS, VILLAGES } from '../shared/villages.js';
import { SHOPS } from '../shared/trade.js';
import { PLACES as EATING } from '../shared/restaurants.js';

// Where you've been, for the chart (src/screens.js): every island you've set
// foot on and every landmark you've been close to (shared/landmarks.js). The
// server keeps the list; this notices when you get somewhere new and tells it.

/** A place's name: a landmark's, or an island's. */
export const placeName = (id) => LANDMARKS[id]?.name ?? ISLAND_BY_ID[id]?.name ?? id;

// Where the finds are, the climbs and puzzles end, and the quests send you.
const FIND_AT = { log: ['saddle', 'hut'], spyglass: ['saddle', 'cairn'], cowrie: ['saddle'], bell: ['burnt', 'cottage'], seaglass: ['burnt'], pipe: ['horseshoe'], scallop: ['horseshoe'], nameboard: ['reef'], bottle: ['bar'], lead: ['stack'], float: ['sow'] };
const SOLVED_AT = { 'pells-bar': ['bar'], horseshoe: ['horseshoe'], wreck: ['reef', 'wreck'], 'molly-ann': ['reef', 'wreck'], gannet: ['stack'] };
const QUEST_AT = { nets: ['reef'], cairn: ['saddle', 'cairn'], canvas: ['brothers'] };

/**
 * Everywhere a save shows you've been, from before the chart kept count: the
 * finds you've picked up, the chests you've dug, the people you've talked to,
 * the shops and eating places you've used, the quest steps you've done.
 */
export function visitedFrom(s) {
  const out = new Set(s?.visited ?? []);
  if (!s) return out;
  const add = (...ids) => ids.forEach((id) => out.add(id));
  const village = (v) => v && VILLAGES[v] && add(v, VILLAGES[v].island);
  for (const f of s.finds ?? []) add(...(FIND_AT[f] ?? []));
  for (const p of s.solved ?? []) add(...(SOLVED_AT[p] ?? []));
  for (const c of Object.values(s.chests ?? {})) add(...(SOLVED_AT[c.from] ?? (ISLAND_BY_ID[c.from] ? [c.from] : [])));
  for (const [q, st] of Object.entries(s.quests ?? {})) if (QUEST_AT[q] && (st.stage >= 1 || st.done)) add(...QUEST_AT[q]);
  for (const who of Object.keys(s.met ?? {})) {
    village(VILLAGERS[who]?.village);
    if (who === 'silas') add('light');
  }
  for (const id of Object.keys(s.shops ?? {})) village(SHOPS[id]?.village);
  for (const id of Object.keys(s.meals ?? {})) village(EATING[id]?.village);
  if ((s.upgrades ?? []).length) village('yard');
  return out;
}

export class ChartMarks {
  constructor({ progress, hud }) {
    this.progress = progress;
    this.hud = hud;
    this.here = new Set(); // noticed this time round (kept even without a server)
    this.asking = new Set();
    this.t = 2;
  }

  /** Everywhere you've been, as a Set of place ids. */
  get visited() {
    const out = visitedFrom(this.progress.state);
    for (const id of this.here) out.add(id);
    return out;
  }

  /** Once a second: anywhere new? An island counts once you're ashore on it; a landmark once you're close. */
  update(dt, { player, boatBody }) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    if (this.progress.code && !this.progress.state) return; // (not loaded yet)
    const p = player.pos;
    const seen = this.visited;
    const ashore = player.mode === 'ground' && player.platform !== boatBody && groundAt(p.x, p.z) > 0.2;
    for (const id of PLACE_IDS) {
      if (seen.has(id) || this.asking.has(id)) continue;
      if (ISLAND_BY_ID[id] && !ashore) continue;
      if (!isAt(id, p.x, p.z)) continue;
      this.here.add(id);
      this.asking.add(id);
      this.hud.say(`On your chart now: ${placeName(id)}.`, 3);
      this.progress
        .act('visit', { id, x: p.x, z: p.z })
        .catch(() => {})
        .finally(() => this.asking.delete(id));
    }
  }
}
