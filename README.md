# Heart of the Sea

A stylised, atmospheric open ocean in the spirit of *Sea of Thieves*, built with
Three.js and served from a Cloudflare Worker. This is the base world for a future
multiplayer game.

## What's in it

- **Gerstner swell**: 8 large waves displace the mesh, and 8 small ripples add
  per-pixel detail. The wave math lives in `shared/waves.js` and is plain JS, so
  the browser and the Worker (later a Durable Object) compute the same sea.
- **Water shading**: reflections of the same sky the dome draws, jade
  subsurface glow on backlit crests, sun glitter, soft bubbly whitecaps that
  form where the waves pinch together, faint marbled foam, and fog that blends
  into the horizon.
- **Sky**: a day/night cycle with sunrise and sunset colors, painted clouds
  with self-shadowing and silver linings, a moon, and twinkling stars.
- **Flotsam**: barrels, crates and a moored lantern buoy ride the waves using
  the shared wave function. At night the lantern casts a warm glow on the water.
- **Sound**: procedural surf and wind made with WebAudio. Click *Sound* to turn
  it on. There are no audio files.
- **Shared clock**: the sea is a pure function of time. Clients sync to
  `GET /api/time`, so every player sees the same waves without streaming the
  ocean.

## Develop

```bash
npm install
npm run dev       # Vite dev server with hot reload (clock falls back to local time)
npm run preview   # production build served by the real Worker via `wrangler dev`
```

Useful URL params: `?t=18` (time of day in hours), `?waves=1.0` (swell
strength), and `?still` (pause the day/night cycle).

## Deploy to Cloudflare

```bash
npx wrangler login
npm run deploy    # vite build + wrangler deploy
```

`wrangler.jsonc` serves `dist/` with Workers Static Assets. Only `/api/*`
requests run the Worker script (`worker/index.js`). Static files never do, so
they are served for free from Cloudflare's edge.

## Layout

```
shared/waves.js     wave model shared by client and server
src/main.js         renderer, camera, loop, UI
src/ocean.js        ocean mesh and water shader
src/atmosphere.js   sky dome, day/night palette, lights, fog
src/glsl.js         shared GLSL (noise, sky model)
src/flotsam.js      floating props and buoyancy
src/audio.js        procedural ocean ambience
src/clock.js        server clock sync
worker/index.js     Cloudflare Worker (/api/time, /api/health, /api/ws stub)
```

## Toward multiplayer

1. Add a Durable Object (for example `Ocean`) to `wrangler.jsonc`, and route
   `/api/ws` in `worker/index.js` to it as a WebSocket.
2. Simulate ships on the server using `sampleSurface` and `heightAt` from
   `shared/waves.js`. The server then has authority over buoyancy, while every
   client renders the same sea from the synced clock.
3. Broadcast ship transforms. Clients interpolate them, and nobody needs to
   send ocean state.
