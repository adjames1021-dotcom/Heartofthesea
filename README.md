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
| Saddle Island | The big two-hilled island in the middle, wooded on its lower slopes. You start at anchor in its bay. |
| Gannet Stack | A tall rock spire on a pebble island, white with seabirds. |
| The Horseshoe | A crescent with a lagoon and a sheer outer cliff. |
| Pell's Bar | A long sandbar with one standing rock at its west end. |
| Molly Ann Reef | A reef with a sand cay and the wreck of a two-master. |
| Sow and Piglets | A round rock with a string of smaller ones off it. |
| Burnt Island | Scorched hills, dead palms and black stumps. |
| Old Head | Further out. A whaleback of rock with cliffs at the seaward end, a lighthouse on top, and a cove. |
| Kettle Island | An old volcano: black sand, steep green flanks and a lake in the crater. |
| The Brothers | Two towers of rock with a deep channel between them you can sail through. |
| Green Island | Low and wooded to the water, a white beach all round, one big old tree in the middle. |

## Weather

The weather runs on the shared clock like everything else, so a storm hits
everyone at once. About half the time there's one somewhere in each
12-minute stretch, blowing for two and a half to four and a half minutes.
"The glass is falling" is your warning, a minute ahead. Then the wind gets up to 30–45 knots
and swings about, the sea builds to big breaking swells, the sky closes
over, rain drives across, and lightning comes down onto the sea, with the
thunder arriving later the further away it struck. The lighthouse on Old
Head lights up at night and in storms.

Sailing in a storm is fast and wild: she gets up and planes at 15–20 knots,
surfs down the faces of the seas, heels hard, gets slewed about by gusts
and seas on the quarter, and throws spray over the bow. (Fair-weather
sailing is around 8–10 knots.) `?dev&storm=1` forces a storm for testing.

Ashore there are crabs that scuttle off sideways and burrow, sandpipers
running at the water's edge, butterflies over the grass, goats on the hills
that trot off if you walk up to them, lizards on the rocks, and fireflies in
the woods at night.

There's life about: gulls wheel over the islands and keep the boat company
(and sit on the water until you get too close), gannets fold up and plunge
into the sea off the Stack, dolphins come to ride the bow when you sail
past them, turtles surface in the lagoons, seals haul out on the rocks of
Sow and Piglets (and slip into the sea if you walk up to them), and shoals
of small fish mill about in the shallows. Fish bite quicker over a shoal.

Water lightens and goes turquoise over the shallows, waves die away near
shore (except where the rock takes the full swell), and the boat slows and
grounds instead of sailing through land.

## Playing

Click to start. Mouse to look, wheel to zoom.

| On foot | |
| --- | --- |
| W A S D | walk (Shift to run; Shift swims faster too) |
| Space | jump; let go of a rope; kick off a net |
| E | pick up / put down, read, take a station, climb aboard |
| F | dig |
| Q | fish: cast, then Q again when the float goes under |
| M | hold up your maps (← → to go through them) |
| L | the boat's lights, from anywhere aboard |
| E, then 1 2 3 | talk to someone, and answer |
| J | your journal |

Walking into a waist-high edge pulls you up onto it. Jump at a ledge and you
catch it: W climbs up, S drops, A/D shimmies along it. Walk or swim into a net
or a rope ladder to climb it. Jump for a hanging rope to swing on it (W/S
pumps, Space lets go). Long falls knock you over for a moment; nothing hurts
you.

| At the helm (E to take it, E to leave) | |
| --- | --- |
| A/D | steer |
| W/S | sails up / down (throttle when the engine's on) |
| G | anchor up / down (the windlass does the rest) |
| R | engine on / off |
| P / L / F | autopilot / lights / horn |

At the helm a card at the top shows the wind (the dial: your boat in the
middle, the red mark is where the wind comes from, the shaded arc is too
close to sail), speed, heading and depth.

H shows the controls and a plan of the boat; Tab shows the chart. The
anchor's state is always shown top left while you're aboard, and a black
ball goes up on its halyard in front of the mast when it's holding.
Telltales knotted to the shrouds and the backstay, and the pennant on the
backstay, show where the wind's coming from. The rig is all joined up:
the mainsheet runs from the end of the boom to a traveller in the cockpit,
the jib sheets to the cockpit winches, the halyards back along the
coachroof, and it all moves as she sails. The lights come on by themselves at dusk:
navigation lights under way, the anchor light at anchor, and a floodlight
on the mast and a lamp over the companionway so you can see the deck.

Sailing is arcade by default: the sails trim themselves and she's quick and
forgiving. Settings → Sailing switches to realistic, where you trim the
main and jib sheets yourself (↑↓ and ←→ at the helm). The halyard and
windlass stations still work in both.

The companionway at the front of the cockpit is open: walk forward and down
the steps into the cabin, which is built inside her own hull and moves with
her. Galley to port at the foot of the steps, chart table to starboard, a
saloon with a dinette round the mast to port and a settee to starboard, and
through the bulkhead door a V-berth in the bow. While you're below, the decks
over you are cut away and the camera looks in from above, with the sea going
by outside. It's dim by day (the deck's shadow is real) and lamplit at night.
Walk back up the steps to come out. There's always a spare treasure map on
the chart table if you've run out, and the galley stove is for cooking (below).

There are eleven things to find on the islands, some in plain sight, some
not: a fisherman's hut, a cairn on the summit, a burnt-out cottage, an
upturned dinghy, an old anchor, and small things washed up on the beaches.
E picks them up or reads them. Tab lists what you've found, and it's kept
aboard, on show in the cabin, where you can move it about (below).

Fishing works from the deck, a beach or a rock: face the water and press Q.
What bites depends on where you are (reef fish on the reef, flatfish over
sand, mackerel and pollock in open water, squid at night). Tab shows what
you've caught.

To go ashore: sail in close, press G at the helm, and swim. The swim
platform at the stern is where you climb back aboard.

## People and places

Three villages, each its own sort of place, and a boatyard:

| Where | Who |
| --- | --- |
| **Head Cove**, on Old Head. Fishing: stilt huts of driftwood and old ship's timber, a dock, drying racks hung with split fish, nets, a gutting table, gulls. | Oda Penhale (nets), Tam Ruddock (fishes off the dock, talks), Gwen Tallack (salts the catch), and Silas Hendy, who keeps the light up the hill. |
| **The Landing**, on Green Island. Trading: every house its own faded colour, Hester's stall under an old sail, goods about, a derrick on the quay, a ropewalk. | Hester Pengelly (the store), her boy Jory, Abel Trounson (under the big tree), Martha Vosper (rope). |
| **Kettle Strand**, below the notch on Kettle Island. Half empty: cottages falling in and overgrown, a jetty with boards missing, Dorcas's fenced garden. | Mags Rowe (goats, cheese, her own boat), Ben and Dorcas Clemo. |
| **Pascoe's yard**, on the west side of the bay on Saddle. A tarred shed open to the slip, timber seasoning, a steam box, a capstan. | Ned Pascoe, shipwright. |

Everything in them is built by hand (src/kit.js, src/handvillage.js,
src/handpieces.js): boards of uneven widths, walls that lean, roofs that sag
and are patched with old sail, salt low down, moss on the shady side, paint
bleached by the sun. Each place has its own colours, muted. Windows light up
at night with real (flickering) lamplight, chimneys smoke morning and
evening, and from far off each village is drawn as a few plain blocks.

Everyone keeps their own hours on the shared clock: down at the dock at
dawn, at work through the day, round the fire at dusk, asleep at night (and
you can't talk to someone who's asleep). E talks to someone; 1, 2, 3 (or a
click) picks what you say. Someone with something to say turns to you and
waves. There are no markers over anyone.

Things people ask of you come out of talking to them, and go in your
journal (J) in your own words, with what's in the hold, the dishes you know
and what's been done to the boat. Some lead on to each other: Oda's nets
take you to the Molly Ann, and her copper is what Ned wants; once that's done
Tam sends you up the wreck's foremast; Gwen's knife has Silas mention a sail
with no lights, which takes you to Kettle and the Landing and ends in a
treasure map; Abel's cairn is where the spyglass is; Martha's canvas becomes
your bigger sail; Ben's lamp ends with his son's lantern on your bow.
Directions are given the way people give them. People remember what you've
done for them.

**The yard.** Ned will do things to your boat that show: doubled planking
and a copper stem (she slides off the sand instead of sticking), a bigger
mainsail on a longer boom (faster), a second lantern up forward, crates on
deck and a bigger hold (room for twice as much), and a cast-iron galley
stove (much harder to burn things on). Each costs materials from the world
(copper, canvas, rope, driftwood, old iron) and something of value from a
chest. He says what he wants; nothing's listed, nothing has a number.

**Food.** Fish from the line, fruit off the trees (limes, plantains,
coconuts, which grow back after a while), salt fish and cheese from people,
and trades at the Landing. Cook on the galley stove (a pan and a pot) or a
village fire once it's lit: put things in, watch them and listen, and take
them off when they look and sound right. Pale and quiet is raw; golden and
sizzling is done; black, smoking and crackling is burnt. The right things
together make a dish; you learn dishes by being told or by getting one
right. Eating a good dish helps a little for a while (a stronger swimmer,
steadier on a heeling deck, better eyes at night). Raw food goes off after a
few days. Nothing else: no hunger, no starving.

**Money and Hester's.** Money is old money: pennies and shillings, twelve
to the shilling. The only way to come by any is to sell to Hester at the
Landing: something of value out of a chest, or the fish you've caught. Her
stall is open while she's at it (from early till evening); at night it's
covered over. Walk round it: the day's goods are on the shelves, in the
baskets and hung on hooks, each with a price written on a bit of card (4d,
1/6). Pick a thing up (E), carry it to the counter and put it down; she says
what it comes to. Pay at the counter, or walk off and it goes back. What's out
changes every day and with the season, and when it's gone it's gone till
tomorrow. She sells food and things to cook with, nothing else. Ned will take
coin for his time instead of something of value.

**The cabin.** Everything you find is on show below. Walk up to something
and press E to pick it up; the mouse moves it over whatever's under it (a
table, a shelf, the floor) or hangs it on a wall. Q or the wheel turns it, E
or a click puts it down, Esc puts it back. The locker under the berth holds
what isn't out. Things rock a little with the boat. Settings has a link for
someone else to come aboard and look round your cabin as you've left it.
(When the cabin moved into the hull, things you'd put about the old one went
back to their first places, once; anything without one is in the locker.)

## Your progress

Everything that lasts (maps, finds, the hold, what people have asked of you,
the journal, the boat's upgrades, the cabin) is kept on the server, not in
the browser. Each player has their own little store on Cloudflare (a Durable
Object called `Player`): one at a time, every request goes through the rules
in `worker/rules.js`, which decide what's allowed, and the result is written
before the answer goes back. The browser asks; the server decides.

You don't sign in. The first time you play you're given a save code
(Settings shows it, like `K7QM-XA2P-...`). The browser remembers it; to carry
on somewhere else, type it into Settings there. Anyone with the code can play
as you, so keep it to yourself. The visit link uses a different, public id
that can only look at your cabin.

## Treasure

- You start with one map (press M to look at it). Maps can send you to the
  outer islands too. A map is a drawing of an island's real coastline
  and landmarks, an X put down by hand (so it's a little off), and a note.
- Dig (F) where you think it is. A wrong hole is empty, or has a crab in it.
  The right one gives up a chest.
- Look at the ground as you get close: over a buried chest the earth has
  been turned, a slightly darker, lumpy patch with a few clods. You only
  notice it within a few paces (for the puzzle chests, only right on top of
  it), and the server only tells the game where once you're that close.
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
dig, and checks that you're really at a climb's chest before it counts. What
you hold and have found is kept with the rest of your progress on the server
(below). A chest has something of value in it as well as the next map: a
pocket watch, a string of pearls, a brass sextant.

Maps are signed with a random key the Worker makes for itself the first time
it runs and keeps in a Durable Object (`Keeper`), so there's nothing to set up.
## Versions

The start screen, Settings and the controls screen (H) show the version and
the commit it was built from. `src/version.js` has the list of versions and
what each changed; bump it (and `version` in package.json, which a test
checks) with every update.

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

To start over, clear `hots.player` from localStorage (you'll be given a new
save code; the old one still works if you type it back in).

## Deploy to Cloudflare

```bash
npx wrangler login              # once, opens your browser
npm run deploy                  # test, build, upload
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
shared/items.js        everything you can own, and how it's written
shared/villages.js     villages, people and their days; shared/talk.js what they say
shared/quests.js       the steps of things people ask that are out in the world
shared/food.js         cooking times, recipes, what eating does, going off
shared/trade.js        money, what Hester pays, the shops and what's out each day
shared/gather.js       where fruit, driftwood and iron are; shared/upgrades.js the yard
shared/decor.js        what can go about the cabin, and where finds first go
src/main.js            renderer, loop, interactions, keys
src/progress.js        your save code, and asking the server to do things
src/village.js         villages and the yard, and the people walking their day
src/handvillage.js     the villages built by hand; src/handpieces.js the stall, shed, garden and the rest; src/kit.js boards, walls, roofs, weathering
src/talk.js            the talk card; shared/talk.js has everything people say
src/journal.js         the journal (J)
src/shops.js           shops you walk round; src/goods3d.js the goods and price tags
src/questworld.js      things out in the world for quests (the copper, the bales)
src/cooking.js         stove, pans, pot and fires; src/food3d.js food models
src/gather.js          fruit trees, driftwood and old iron
src/decorate.js        moving things about the cabin, the locker, visits
src/player.js          the bear's controller: walk, swim, jump, ledges, nets, ropes
src/bear.js            the bear's model and animation
src/boat.js            the sloop's model, stations, lights and colliders
src/collision.js       collision world: statics, moving bodies, ground probes
src/islands.js         island props; src/terrain.js island meshes; src/vegetation.js grass and trees
src/fishing.js         rod, float, bites and the catch log
src/islandlife.js      crabs, sandpipers, butterflies, goats, lizards, fireflies
src/version.js         version number and what each version changed
src/storm.js           rain, lightning and the flash; the storm's strength is shared/environment.js
src/lighthouse.js      the lighthouse, the crater lake and the big tree
src/wildlife.js        birds, dolphins, turtles, seals, shoals (the shoals are drawn in src/ocean.js)
src/finds.js           the hut, cairn, ruin, dinghy, anchor and the things to find
src/interior.js        the cabin below, inside the hull; src/screens.js the controls and chart screens
src/treasure.js        maps, digging, chests, crabs, casks; src/mapview.js draws maps
src/puzzles.js         notes and set pieces (Pell's Bar, the Horseshoe)
src/hatch.js           the Molly Ann's hatch, yard, net and casks
src/course.js          the wreck climb; src/stack.js the Gannet Stack climb
src/ocean.js           ocean mesh and water shader; src/atmosphere.js sky and light
worker/index.js        Worker routes: /api/time, /api/player, /api/player/new, /api/cabin/<id>
worker/player.js       the Player Durable Object: one per save code
worker/rules.js        what each action may do to your progress (all the server's rules)
worker/treasure.js     treasure spots, map signing, dig and claim decisions
tests/                 node tests for the world, the treasure and the progress rules
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
4. Each player's progress already lives in its own Durable Object
   (`worker/player.js`); a shared `Ocean` object would hold what everyone
   sees at once (boats, loose chests), and visits could become real boarding.

## Licensing note

The player character is modelled on San-X's Rilakkuma, as requested. That
likeness is San-X's intellectual property. Before any public release, either
get a licence from San-X or redesign the character.
