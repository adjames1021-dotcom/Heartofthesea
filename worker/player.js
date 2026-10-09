// Each player's locker: a Durable Object holding their saved progress. One
// request at a time goes through the rules in worker/rules.js, and the
// result is written to the object's own storage before the reply goes back.

import { DurableObject } from 'cloudflare:workers';
import { apply, freshState, publicState, settle } from './rules.js';
import { cabinLayout } from '../shared/decor.js';

export class Player extends DurableObject {
  async #load() {
    if (!this.s) this.s = (await this.ctx.storage.get('state')) ?? freshState(Date.now() / 1000);
    return this.s;
  }

  /** Do one thing for the player. Calls are queued so two tabs can't interleave. */
  act(action, secret) {
    const run = async () => {
      const before = await this.#load();
      const { state, reply } = await apply(before, action, { secret, now: Date.now() / 1000 });
      if (state !== before) {
        state.rev = (before.rev ?? 0) + 1;
        await this.ctx.storage.put('state', state);
        this.s = state;
      }
      return { state: publicState(this.s), reply };
    };
    this.queue = (this.queue ?? Promise.resolve()).then(run, run);
    return this.queue;
  }

  /** What a visitor sees when they come aboard: the cabin, not the rest. */
  async cabin() {
    const s = structuredClone(await this.#load());
    settle(s); // (if they've not been aboard since the cabin was rebuilt)
    return { decor: cabinLayout(s), upgrades: s.upgrades ?? [] };
  }
}
