// Cloudflare Worker entry.
//
// Static files (the game client in ./dist) are served directly by Workers
// Static Assets. Only /api/* reaches this script.

import { DurableObject } from 'cloudflare:workers';
import { issueMap, dig, near, claim } from './treasure.js';
import { Player } from './player.js';

export { Player };

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

// ---------------------------------------------------------------------------
// Players. A player is a save code (16 letters and digits, shown as four
// groups of four). Their locker is found by a hash of the code with the
// server's secret, so the code itself is never stored anywhere and the
// public id (for visit links) can't be turned back into it.
// ---------------------------------------------------------------------------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const c = [...bytes].map((b) => CODE_CHARS[b % 32]).join('');
  return c.match(/.{4}/g).join('-');
}

/** 'abcd efgh-jklm…' → 'ABCD-EFGH-JKLM-NPQR', or null if it isn't a code. */
export function normalCode(code) {
  if (typeof code !== 'string') return null;
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 16 || [...c].some((ch) => !CODE_CHARS.includes(ch))) return null;
  return c.match(/.{4}/g).join('-');
}

const enc = new TextEncoder();
async function playerId(secret, code) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`player:${code}`)));
  return [...sig.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

      // Is a buried chest close by? Body: { x, z, maps: [mapId, ...] }
      case '/api/near': {
        const secret = await treasureSecret(env);
        const b = await body(request);
        if (!b) return json({ error: 'POST a JSON body' }, { status: 400 });
        const maps = Array.isArray(b.maps) ? b.maps.filter((s) => typeof s === 'string') : [];
        return json(await near(secret, { x: Number(b.x), z: Number(b.z), maps }));
      }

      // Somebody picked up the chest at the top of a climb. Body: { course, x, y, z }
      case '/api/claim': {
        const b = await body(request);
        if (!b) return json({ error: 'POST a JSON body' }, { status: 400 });
        return json(claim({ course: String(b.course), x: Number(b.x), y: Number(b.y), z: Number(b.z) }));
      }

      // A new player: here's your save code.
      case '/api/player/new': {
        const secret = await treasureSecret(env);
        const code = newCode();
        return json({ code, id: await playerId(secret, code) });
      }

      // Do something as a player. Body: { code, action: { type, ... } }
      case '/api/player': {
        const secret = await treasureSecret(env);
        const b = await body(request);
        const code = normalCode(b?.code);
        if (!code || !b.action || typeof b.action !== 'object') return json({ error: 'POST { code, action }' }, { status: 400 });
        const id = await playerId(secret, code);
        const stub = env.PLAYER.get(env.PLAYER.idFromName(id));
        return json({ id, ...(await stub.act(b.action, secret)) });
      }

      // Placeholder for the future multiplayer socket, e.g.:
      //   const id = env.OCEAN.idFromName('main');
      //   return env.OCEAN.get(id).fetch(request);
      case '/api/ws':
        return json({ error: 'multiplayer not available yet' }, { status: 501 });
    }

    // Someone else's cabin, to look round: /api/cabin/<public id>
    const visit = url.pathname.match(/^\/api\/cabin\/([0-9a-f]{16})$/);
    if (visit) {
      const stub = env.PLAYER.get(env.PLAYER.idFromName(visit[1]));
      return json(await stub.cabin());
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
