// Cloudflare Worker entry.
//
// Static files (the game client in ./dist) are served directly by Workers
// Static Assets. Only /api/* reaches this script.

import { issueMap, dig } from './treasure.js';

const json = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: { 'cache-control': 'no-store', ...init.headers },
  });

// Set a real one with `npx wrangler secret put TREASURE_SECRET`. Without it,
// treasure still works but anyone who reads this file can find it.
const DEV_SECRET = 'heart-of-the-sea-dev-secret';

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
    const secret = env.TREASURE_SECRET || DEV_SECRET;

    switch (url.pathname) {
      // Authoritative clock: clients derive waves, time of day and weather from it.
      case '/api/time':
        return json({ now: Date.now() });

      case '/api/health':
        return json({ ok: true, service: 'heart-of-the-sea' });

      // A fresh treasure map. Body: { not: [islandId, ...] }
      case '/api/maps': {
        const b = await body(request);
        if (!b) return json({ error: 'POST a JSON body' }, { status: 400 });
        const not = Array.isArray(b.not) ? b.not.filter((s) => typeof s === 'string').slice(0, 8) : [];
        return json(await issueMap(secret, { not }));
      }

      // Somebody dug a hole. Body: { x, z, maps: [mapId, ...] }
      case '/api/dig': {
        const b = await body(request);
        if (!b) return json({ error: 'POST a JSON body' }, { status: 400 });
        const maps = Array.isArray(b.maps) ? b.maps.filter((s) => typeof s === 'string') : [];
        return json(await dig(secret, { x: Number(b.x), z: Number(b.z), maps }));
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
