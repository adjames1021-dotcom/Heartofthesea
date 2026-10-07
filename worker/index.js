// Cloudflare Worker entry.
//
// Static files (the game client in ./dist) are served directly by Workers
// Static Assets. Only /api/* reaches this script.

import { DurableObject } from 'cloudflare:workers';
import { issueMap, dig, claim } from './treasure.js';

const json = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: { 'cache-control': 'no-store', ...init.headers },
  });

// The key maps are signed with. Nobody has to set it: the first request makes
// a random one and the Keeper stores it for good. (A TREASURE_SECRET variable,
// if someone sets one, takes priority.)
export class Keeper extends DurableObject {
  async secret() {
    let s = await this.ctx.storage.get('secret');
    if (!s) {
      s = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      await this.ctx.storage.put('secret', s);
    }
    return s;
  }
}

let cached = null;
async function treasureSecret(env) {
  if (env.TREASURE_SECRET) return env.TREASURE_SECRET;
  if (!cached) {
    const keeper = env.KEEPER.get(env.KEEPER.idFromName('treasure'));
    cached = keeper.secret().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

async function body(request) {
  if (request.method !== 'POST') return null;
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    return JSON.parse(text || '{}');
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    switch (url.pathname) {
      // Authoritative clock: clients derive waves, time of day and weather from it.
      case '/api/time':
        return json({ now: Date.now() });

      case '/api/health':
        return json({ ok: true, service: 'heart-of-the-sea' });

      // A fresh treasure map. Body: { not: [islandId, ...] }
      case '/api/maps': {
        const secret = await treasureSecret(env);
        const b = await body(request);
        if (!b) return json({ error: 'POST a JSON body' }, { status: 400 });
        const not = Array.isArray(b.not) ? b.not.filter((s) => typeof s === 'string').slice(0, 8) : [];
        return json(await issueMap(secret, { not }));
      }

      // Somebody dug a hole. Body: { x, z, maps: [mapId, ...] }
      case '/api/dig': {
        const secret = await treasureSecret(env);
        const b = await body(request);
        if (!b) return json({ error: 'POST a JSON body' }, { status: 400 });
        const maps = Array.isArray(b.maps) ? b.maps.filter((s) => typeof s === 'string') : [];
        return json(await dig(secret, { x: Number(b.x), z: Number(b.z), maps }));
      }

      // Somebody picked up the chest at the top of a climb. Body: { course, x, y, z }
      case '/api/claim': {
        const b = await body(request);
        if (!b) return json({ error: 'POST a JSON body' }, { status: 400 });
        return json(claim({ course: String(b.course), x: Number(b.x), y: Number(b.y), z: Number(b.z) }));
      }

      // Placeholder for the future multiplayer socket, e.g.:
      //   const id = env.OCEAN.idFromName('main');
      //   return env.OCEAN.get(id).fetch(request);
      case '/api/ws':
        return json({ error: 'multiplayer not available yet' }, { status: 501 });
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
