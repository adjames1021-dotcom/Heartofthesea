# Heart of the Sea

A stylised, atmospheric sailing and treasure game in the spirit of *Sea of
Thieves*, built with Three.js and served from a Cloudflare Worker. You play a
small bear with an 11 m sloop, a shovel and a stack of scribbled maps. It's
single player for now; the world is built so a multiplayer server can join
later without changing how anything works.

## The world

Everything is generated from a fixed seed in `shared/`, so the server and
every player build the same world without sending any of it over the wire.
The sea, the time of day, the weather and the wind are pure functions of a
shared clock (`GET /api/time`, 24-minute days).

| Island | What it is |
| --- | --- |
| Saddle Island | The big two-hilled island in the middle. You start at anchor in its bay. |
| Gannet Stack | A tall rock spire on a pebble island, white with seabirds. |
| The Horseshoe | A crescent with a lagoon and a sheer outer cliff. |
| Pell's Bar | A long sandbar with one standing rock at its west end. |
| Molly Ann Reef | A reef with a sand cay and the wreck of a two-master. |
| Sow and Piglets | A round rock with a string of smaller ones off it. |
| Burnt Island | Scorched hills, dead palms and black stumps. |

Water lightens and goes turquoise over the shallows, waves die away near
shore (except where the rock takes the full swell), and the boat slows and
grounds instead of sailing through land.

## Playing

Click to start. Mouse to look, wheel to zoom.

| On foot | |
| --- | --- |
| W A S D | walk (Shift to run) |
| Space | jump; let go of a rope; kick off a net |
| E | pick up / put down, read, take a station, climb aboard |
| F | dig |
| M | hold up your maps (← → to go through them) |

Walking into a waist-high edge pulls you up onto it. Jump at a ledge and you
catch it: W climbs up, S drops, A/D shimmies along it. Walk or swim into a net
or a rope ladder to climb it. Jump for a hanging rope to swing on it (W/S
pumps, Space lets go). Long falls knock you over for a moment; nothing hurts
you.

| Boat stations (E to take one, E to leave) | |
| --- | --- |
| Helm | A/D steer, W/S throttle, R engine, ↑↓ main sheet, ←→ jib sheet, P autopilot, L lights, F horn |
| Halyards (at the mast) | W/S hoist/lower the main, A/D furl/unfurl the jib, R reef |
| Windlass (at the bow) | W raise anchor, S let out chain |

To go ashore: sail in close, let the anchor down with about three times the
depth in chain (the depth sounder is on the helm instruments), and swim. The
swim platform at the stern is where you climb back aboard.

## Treasure

- You start with one map. A map is a drawing of an island's real coastline
  and landmarks, an X put down by hand (so it's a little off), and a note.
- Dig (F) where you think it is. A wrong hole is empty, or has a crab in it.
  The right one gives up a chest.
- Carry the chest back and put it down on the boat. It opens, and there's
  usually a map inside.
- Some treasure isn't on any map:
  - **Pell's Bar.** A skeleton sits against the rock with a plank cut with
    instructions beside it. The chest is buried where the tip of the rock's
    late-afternoon shadow touches the line of dried weed. That happens once a
    day, at about 16:46, and the spot is worked out from the shared sun.
  - **The Horseshoe.** The swell runs straight up the rock shelf under the
    outer cliff. Get caught on it by a sea and you go in the water. Three tall
    boulders are safe to wait on. The chest is in the cove at the end, on the
    sea side of the fallen rock. A scratched stone and a broken lantern mark
    the start.
  - **Molly Ann Reef, the hatch.** The main yard is lying across the after
    hatch, rigged to a cargo net over the side. The net needs three casks in
    it; it has one. The other casks are lying about the reef.
  - **Molly Ann Reef, the climb.** Cross the debris in the pool (it rises and
    falls with the swell), catch the main channel at the top of a swell, swing
    across the gap on the rope off the fore yard, and go up the ratlines to the
    fore top.
  - **Gannet Stack.** Up the footholds on the beach side of the spire, along
    the top of the first drum, up the old rope, and round to the nest.

The server decides all of this. `worker/treasure.js` issues each map signed
with HMAC (the client only gets the drawing, never the spot), decides every
dig, and checks that you're really at a climb's chest before it counts. It
keeps no state, so it costs nothing to run. Progress (maps held, chests found)
is kept in the browser's localStorage under `hots.v1`.

Maps are signed with `TREASURE_SECRET`. `npm run deploy` creates a random
one on the first deploy and never replaces it, because a new secret would
void every map players are holding. Without it the Worker falls back to a
development secret that's in this repository.

## Develop

```bash
npm install
npm run preview   # build, then serve the game and the Worker on http://localhost:8787
npm test          # the shared world and the treasure server's rules
```

For hot reload, keep `npx wrangler dev` running on port 8787 (it answers
`/api`), and run `npm run dev` in a second terminal. Vite proxies `/api` to
it.

Developer URL parameters (append to the game URL):

| Param | Effect |
| --- | --- |
| `?dev` | exposes `window.__game` for poking at things in the console |
| `?t=17.5` | fix the time of day (hours) |
| `?swell=0.8` `?clouds=0.3` `?fog=0.001` `?wind=8` | override the weather |
| `?simtime` | run the sea on the frame clock instead of the shared one (slow machines, tests) |
| `?noshadow` | turn off shadow maps |
| `?cam=free&pos=x,y,z&look=x,y,z` | free orbit camera |
| `?cam=island&id=reef&az=0.6&el=0.25&dist=320` | orbit an island |
| `?look=white` | the white bear |

Debug pages: `dev/bear.html` (the character), `dev/maps.html` (every island's
map sheet), `dev/props.html` and `dev/island-props.html` (props).

To start over, clear `hots.v1` from localStorage.

## Deploy to Cloudflare

```bash
npx wrangler login              # once, opens your browser
npm run deploy                  # test, build, upload, set TREASURE_SECRET if missing
npm run deploy -- --dry-run     # the same, without uploading anything
```

The site goes up at `https://heart-of-the-sea.<your-subdomain>.workers.dev`.

To deploy without a browser login (CI, or a cloud session), set
`CLOUDFLARE_API_TOKEN` to a token made from Cloudflare's "Edit Cloudflare
Workers" template, and `CLOUDFLARE_ACCOUNT_ID` to your account ID, then run
`npm run deploy`.

`wrangler.jsonc` serves `dist/` with Workers Static Assets. Only `/api/*`
requests run the Worker script, so static files are served from Cloudflare's
edge without invoking it.

## Layout

```
shared/waves.js        the sea: Gerstner swell, sampled the same on CPU and GPU
shared/environment.js  clock → sun, swell, clouds, wind
shared/world.js        island shapes and layout, ground and seabed, shallows,
                       digging rules, puzzle geometry (shadow spot, shelf, nest)
shared/wreck.js        the Molly Ann's layout (renderer, course and server share it)
shared/boat.js         sailing physics: sails, keel, rudder, heel, engine, anchor
src/main.js            renderer, loop, interactions, keys
src/player.js          the bear's controller: walk, swim, jump, ledges, nets, ropes
src/bear.js            the bear's model and animation
src/boat.js            the sloop's model, stations, lights and colliders
src/collision.js       collision world: statics, moving bodies, ground probes
src/islands.js         island props; src/terrain.js island meshes
src/treasure.js        maps, digging, chests, crabs, casks; src/mapview.js draws maps
src/puzzles.js         notes and set pieces (Pell's Bar, the Horseshoe)
src/hatch.js           the Molly Ann's hatch, yard, net and casks
src/course.js          the wreck climb; src/stack.js the Gannet Stack climb
src/ocean.js           ocean mesh and water shader; src/atmosphere.js sky and light
worker/index.js        Worker routes: /api/time, /api/maps, /api/dig, /api/claim
worker/treasure.js     treasure spots, map signing, dig and claim decisions
tests/                 node tests for the world and the treasure rules
```

## Toward multiplayer

1. Add a Durable Object (for example `Ocean`) to `wrangler.jsonc`, and route
   `/api/ws` in `worker/index.js` to it as a WebSocket.
2. Run `shared/boat.js` on the server for every boat. It already steps at a
   fixed 60 Hz against the shared sea and seabed, so the server can own boat
   positions while clients predict their own.
3. Broadcast boats, players and loose objects (chests, casks). Nobody needs to
   send the sea, the islands or the weather; they all come from the clock and
   the seed.
4. Move map ownership and dug holes into the Durable Object so treasure and
   puzzle state are shared.

## Licensing note

The player character is modelled on San-X's Rilakkuma, as requested. That
likeness is San-X's intellectual property. Before any public release, either
get a licence from San-X or redesign the character.
