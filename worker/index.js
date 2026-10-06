// Cloudflare Worker entry.
//
// Static files (the game client in ./dist) are served directly by Workers
// Static Assets. Only /api/* reaches this script — this is where the
// multiplayer server (e.g. a Durable Object per ocean/server) will plug in.

const json = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: { 'cache-control': 'no-store', ...init.headers },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    switch (url.pathname) {
      // Authoritative clock: clients derive the wave phase from this so
      // everyone sees the same ocean.
      case '/api/time':
        return json({ now: Date.now() });

      case '/api/health':
        return json({ ok: true, service: 'heart-of-the-sea' });

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
