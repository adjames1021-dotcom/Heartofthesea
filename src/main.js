import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { heightAt, setWaveDamping } from '../shared/waves.js';
import { dampingAt, groundAt, ISLAND_BY_ID, toWorld, gannetNest } from '../shared/world.js';
import { hoursAt, swellScaleAt, cloudCoverAt, windAt, stormAt, nextStormIn, forceStorm } from '../shared/environment.js';
import { Storm } from './storm.js';
import { VERSION, BUILD } from './version.js';
import { Progress } from './progress.js';
import { BOAT } from '../shared/boat.js';
import { Atmosphere } from './atmosphere.js';
import { Ocean } from './ocean.js';
import { Flotsam } from './flotsam.js';
import { Islands } from './islands.js';
import { buildWorldTexture } from './terrain.js';
import { Boat, STATIONS, LAYOUT } from './boat.js';
import { CollisionWorld, Body } from './collision.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { FollowCamera } from './camera.js';
import { Hud } from './hud.js';
import { Treasure, shovelModel } from './treasure.js';
import { Puzzles } from './puzzles.js';
import { Screens } from './screens.js';
import { Interior } from './interior.js';
import { Fishing } from './fishing.js';
import { Wildlife } from './wildlife.js';
import { IslandLife } from './islandlife.js';
import { Villages } from './village.js';
import { Talk } from './talk.js';
import { Journal } from './journal.js';
import { Gathering } from './gather.js';
import { Cooking } from './cooking.js';
import { describe } from '../shared/food.js';
import { QuestWorld } from './questworld.js';
import { WANTS } from '../shared/talk.js';
import { Finds } from './finds.js';
import { Decorating } from './decorate.js';
import { Shops } from './shops.js';
import { Restaurants } from './restaurants.js';
import { WreckCourse } from './course.js';
import { HatchPuzzle } from './hatch.js';
import { StackClimb } from './stack.js';
import { foreTopChest } from '../shared/wreck.js';
import { OceanAudio } from './audio.js';
import { syncClock, worldTime } from './clock.js';
import './style.css';

const params = new URLSearchParams(location.search);

// Your saved progress is on the server. Start fetching it now; the world
// below gets built while it's on its way.
const progress = new Progress();
const progressReady = progress.connect();
const num = (k) => (params.has(k) ? Number(params.get(k)) : null);

// Developer overrides for screenshots and testing only. Normal play takes
// all of these from the shared clock so every player sees the same world.
const dev = {
  hours: num('t'),
  // Run the sea on the simulation's own clock (slow machines, tests).
  simTime: params.has('simtime'),
  swell: num('swell'),
  clouds: num('clouds'),
  fog: num('fog'),
  wind: num('wind'),
  storm: num('storm'),
};

// ---------- World data ----------
const worldTex = buildWorldTexture(); // bakes the seabed/damping grid
setWaveDamping(dampingAt);

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
renderer.shadowMap.enabled = !params.has('noshadow');
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 9000);

const atmosphere = new Atmosphere();
atmosphere.addTo(scene);
const ocean = new Ocean(atmosphere, worldTex);
scene.add(ocean.mesh);
const islands = new Islands();
scene.add(islands.group);

const saddle = ISLAND_BY_ID.saddle;
const buoyAt = toWorld(saddle, saddle.features.buoy.x, saddle.features.buoy.z);
const flotsam = new Flotsam({ buoy: buoyAt });
scene.add(flotsam.group);

// ---------- Collision ----------
const world = new CollisionWorld();
for (const c of islands.colliders) world.addStatic(c);

// ---------- The boat, at anchor in the Saddle Island bay ----------
const bay = toWorld(saddle, saddle.features.bay.x, saddle.features.bay.z + 6);
const boat = new Boat({ x: bay.x, z: bay.z, heading: Math.PI });
scene.add(boat.root);
boat.body = world.addBody(new Body(boat.colliders, 'boat'));
boat.body.climbFromWater = true;
{
  const a = boat.state.anchor;
  a.rode = 32;
  a.set = true;
  a.x = bay.x - 30;
  a.z = bay.z;
}

const env = { wind: {}, ground: groundAt, storm: 0, kick: 0 };
// The slope of the water under a point, for surfing down the face of a wave.
const waveNow = { t: 0, swell: 0.62 };
env.waveGrad = (x, z, out = {}) => {
  const e = 0.9;
  out.x = (heightAt(x + e, z, waveNow.t, waveNow.swell) - heightAt(x - e, z, waveNow.t, waveNow.swell)) / (2 * e);
  out.z = (heightAt(x, z + e, waveNow.t, waveNow.swell) - heightAt(x, z - e, waveNow.t, waveNow.swell)) / (2 * e);
  return out;
};

// ---------- Player ----------
const player = new Player(world, params.get('look') ?? 'brown');
scene.add(player.bear.root);
player.bear.setShovel(false, shovelModel());

const input = new Input(renderer.domElement);
const follow = new FollowCamera(camera);
const hud = new Hud();
const finds = new Finds({ scene, world, hud, progress });
const audio = new OceanAudio();
const fishing = new Fishing({ scene, hud, player, audio, progress });
const wildlife = new Wildlife({ scene, audio });
const islandLife = new IslandLife({ scene });
const villages = new Villages({ scene, world });
let hoursNow = 12;
const talk = new Talk({ progress, hours: () => hoursNow });
const journal = new Journal({ progress });
const shops = new Shops({ villages, progress, talk });
const restaurants = new Restaurants({ scene, villages, progress, talk });
const questWorld = new QuestWorld({ scene, progress });
const gathering = new Gathering({ scene, world, progress });
const stormFx = new Storm({ scene, audio });
if (dev.storm !== null) forceStorm(dev.storm);
const weather = { warned: false, wild: false };
await progressReady;
const treasure = new Treasure({ scene, world, hud, progress });
const screens = new Screens();
const interior = new Interior({ boat });
const cooking = new Cooking({ progress, hud, audio, interior, villages });
const decorating = new Decorating({ interior, progress, hud, camera, canvas: renderer.domElement });
// Visiting someone's boat (?visit=<their id>): their cabin and what the yard's done to her.
const visitId = /^[0-9a-f]{16}$/.test(params.get('visit') ?? '') ? params.get('visit') : null;
let visit = null;
if (visitId) {
  try {
    const r = await fetch(`/api/cabin/${visitId}`);
    if (r.ok) visit = await r.json();
  } catch {
    visit = null;
  }
}
if (visit) decorating.visit(visit.decor ?? []);
boat.setUpgrades((visit ?? progress.state)?.upgrades);
interior.setUpgrades((visit ?? progress.state)?.upgrades);
progress.onChange((st) => {
  if (visit) return;
  boat.setUpgrades(st?.upgrades);
  interior.setUpgrades(st?.upgrades);
});
document.getElementById('controls')?.addEventListener('click', () => screens.toggleControls(true));

// Arcade (sails trim themselves, quick and forgiving) or realistic sailing.
const sailingBtn = document.getElementById('sailing');
function setSailing(mode) {
  BOAT.arcade = mode !== 'realistic';
  if (sailingBtn) sailingBtn.textContent = `Sailing: ${BOAT.arcade ? 'Arcade' : 'Realistic'}`;
  try {
    localStorage.setItem('hots.sailing', BOAT.arcade ? 'arcade' : 'realistic');
  } catch {
    // private mode: fine, it just won't be remembered
  }
}
let savedSailing = 'arcade';
try {
  savedSailing = localStorage.getItem('hots.sailing') ?? 'arcade';
} catch {
  // ignore
}
setSailing(savedSailing);
sailingBtn?.addEventListener('click', () => setSailing(BOAT.arcade ? 'realistic' : 'arcade'));
const puzzles = new Puzzles({ scene, world });
const course = new WreckCourse({ scene, world, wreck: islands.wreck });
treasure.placeCourseChest('wreck', foreTopChest());
const hatch = new HatchPuzzle({ scene, world, wreck: islands.wreck, treasure, puzzles });
const stack = new StackClimb({ scene, world });
treasure.placeCourseChest('gannet', gannetNest());

// ---------- Dev camera (screenshots) ----------
let controls = null;
const camMode = params.get('cam');
if (camMode === 'free' || camMode === 'island') {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  if (camMode === 'free') {
    const [px, py, pz] = (params.get('pos') ?? '0,400,700').split(',').map(Number);
    const [lx, ly, lz] = (params.get('look') ?? '0,0,0').split(',').map(Number);
    camera.position.set(px, py, pz);
    controls.target.set(lx, ly, lz);
  } else {
    const isl = ISLAND_BY_ID[params.get('id') ?? 'saddle'];
    const az = num('az') ?? 0.6;
    const el = num('el') ?? 0.25;
    const dist = num('dist') ?? 320;
    const lift = num('lift') ?? 8;
    controls.target.set(isl.x, lift, isl.z);
    camera.position.set(isl.x + Math.cos(az) * Math.cos(el) * dist, lift + Math.sin(el) * dist, isl.z + Math.sin(az) * Math.cos(el) * dist);
  }
}

// ---------- Post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Only the sun, its glints and lamps should bloom; white paint in daylight shouldn't.
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.55, 1.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- Settings ----------
const ui = {
  sound: document.getElementById('sound'),
  panel: document.getElementById('panel'),
  toggle: document.getElementById('settings-toggle'),
  start: document.getElementById('start'),
  version: document.getElementById('version'),
};
// A frame-rate readout, for measuring (Settings, or ?fps). Off unless asked for.
const fpsEl = document.createElement('div');
fpsEl.className = 'fps';
document.body.appendChild(fpsEl);
const fpsMeter = { on: params.has('fps'), n: 0, t: 0 };
try {
  fpsMeter.on ||= localStorage.getItem('hots.fps') === 'on';
} catch {
  // fine
}
const fpsBtn = document.getElementById('fps-toggle');
function showFps(on) {
  fpsMeter.on = on;
  fpsEl.style.display = on ? 'block' : 'none';
  fpsBtn.textContent = `Frame rate: ${on ? 'shown' : 'hidden'}`;
  fpsBtn.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem('hots.fps', on ? 'on' : 'off');
  } catch {
    // fine
  }
}
showFps(fpsMeter.on);
fpsBtn.addEventListener('click', () => showFps(!fpsMeter.on));
ui.sound.addEventListener('click', async () => {
  const on = await audio.toggle();
  ui.sound.textContent = on ? 'Sound on' : 'Sound off';
  ui.sound.setAttribute('aria-pressed', String(on));
});
ui.toggle.addEventListener('click', () => {
  const open = ui.panel.classList.toggle('open');
  ui.toggle.setAttribute('aria-expanded', String(open));
});
renderer.domElement.addEventListener('mousedown', () => {
  ui.start.classList.add('gone');
  ui.version.classList.add('gone');
}, { once: true });
// Which version this is, on the start screen (and in Settings and on the H screen).
ui.version.textContent = `Version ${VERSION} · build ${BUILD.hash}${BUILD.date ? ` · ${BUILD.date}` : ''}`;
console.info(`Heart of the Sea ${VERSION} (${BUILD.hash} ${BUILD.date})`);
document.getElementById('settings-version').textContent = `Version ${VERSION} (${BUILD.hash})`;
// Your save code, to carry on somewhere else; and a box to use another one.
document.getElementById('save-code').textContent = progress.online ? progress.code : 'not saving (offline)';
// A link for someone else to come aboard (they see your cabin as you've left it).
document.getElementById('visit-link').addEventListener('click', async (e) => {
  const link = `${location.origin}/?visit=${progress.id}`;
  try {
    await navigator.clipboard.writeText(link);
    e.target.textContent = 'Copied';
  } catch {
    e.target.textContent = link;
  }
});
document.getElementById('load-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('code-input');
  if (await progress.useCode(input.value)) location.reload();
  else hud.say("That code didn't work.", 3);
});

// ---------- Interactions ----------
const STATION_KEYS = {
  helm: [['A D', 'steer'], ['W S', 'sails up / down'], ['G', 'anchor up / down'], ['R', 'engine (then W S is throttle)'], ['P', 'autopilot'], ['L', 'lights'], ['F', 'horn'], ['E', 'leave']],
  helmRealistic: [['A D', 'steer'], ['W S', 'sails up / down'], ['↑ ↓', 'main sheet'], ['← →', 'jib sheet'], ['G', 'anchor up / down'], ['R', 'engine (then W S is throttle)'], ['P', 'autopilot'], ['L', 'lights'], ['F', 'horn'], ['E', 'leave']],
  halyards: [['W S', 'hoist / lower main'], ['A D', 'furl / unfurl jib'], ['R', 'reef'], ['E', 'leave']],
  windlass: [['W', 'raise anchor'], ['S', 'let out chain'], ['E', 'leave']],
};
const DECOR_KEYS = [['Mouse', 'move it over a surface or a wall'], ['Q', 'turn it (or the wheel)'], ['E', 'put it down (or click)'], ['Esc', 'put it back']];
const tmpV = new THREE.Vector3();
let wasNight = null;
let villagesPlaced = false;
const PLATFORM_LOCAL = new THREE.Vector3(-6.05, LAYOUT.platform.y, 0);

function putDown() {
  const c = player.carrying;
  if (!c) return;
  const f = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  c.held = false;
  c.pos.copy(player.pos).addScaledVector(f, 0.75);
  c.pos.y += player.mode === 'swim' ? 0.6 : 0.35;
  c.vel.set(player.vel.x * 0.5, 0, player.vel.z * 0.5);
  if (player.platformVel) c.vel.add(new THREE.Vector3(player.platformVel.x, 0, player.platformVel.z));
  c.platform = player.platform;
  player.carrying = null;
}

/** Is (x, z) over the boat? (So a cast clears her.) */
const boatInv = new THREE.Matrix4();
function onBoat(p) {
  boatInv.copy(boat.matrix).invert();
  const l = tmpV.set(p.x, boat.matrix.elements[13], p.z).applyMatrix4(boatInv);
  return Math.abs(l.x) < 6.3 && Math.abs(l.z) < 2.5;
}

function findInteraction() {
  if (player.mode === 'station' || player.mode === 'dig' || player.flopT > 0 || player.clinging) return null;
  if (interior.inside) {
    // Something you're carrying about the cabin to put somewhere.
    if (decorating.holding) {
      if (decorating.nearLocker(player.pos)) return { key: 'E', label: 'Put it in the locker', act: () => decorating.stow() };
      return { key: 'E', label: 'Put it down', act: () => decorating.putDown() };
    }
    if (interior.nearStove(player.pos)) return cooking.open ? null : { key: 'E', label: 'Cook', act: () => cooking.begin('galley') };
    // Things on show about the cabin: pick one up to move it (unless the
    // chart table's nearer, where the maps are).
    if (decorating.nearLocker(player.pos)) return decorating.lockerOpen ? null : { key: 'E', label: 'Open the locker', act: () => decorating.openLocker() };
    const thing = decorating.near(player.pos);
    const chartD = interior.dist(player.pos, interior.chartTable);
    if (thing && (!interior.nearChartTable(player.pos) || thing.d < chartD)) return { key: 'E', label: thing.label, act: () => decorating.pickUp(thing.id) };
    if (interior.nearChartTable(player.pos)) {
      // A spare treasure map is always here if you've run out.
      if (!treasure.state.maps.length) {
        return {
          key: 'E',
          label: 'Take a map',
          act: () =>
            treasure
              .spareMap()
              .then(() => hud.say('Took a map. Press M to look at it.', 4))
              .catch(() => hud.say('No maps here right now.')),
        };
      }
      return { key: 'E', label: 'Look at your maps', act: () => treasure.toggleMap() };
    }
    return null;
  }
  // At a shop: pick things up, take them to the counter, pay.
  const sh = shops.interaction(player);
  if (sh) return sh;
  if (player.carrying) return { key: 'E', label: 'Put down', act: putDown };
  const near = treasure.nearest(player.pos);
  if (near) {
    return {
      key: 'E',
      label: 'Pick up',
      act: () => {
        near.held = true;
        near.platform = null;
        near.rise = null;
        player.carrying = near;
        if (near.course) treasure.claim(near);
      },
    };
  }
  // Something out in the world for a quest you're on.
  const qt = questWorld.near(player.pos);
  if (qt) {
    return {
      key: 'E',
      label: qt.def.label,
      act: async () => {
        const said = await questWorld.look(qt, player.pos);
        if (said) hud.say(said, 7);
      },
    };
  }
  // Right up at the fire in the cove, once it's lit (people sit round it, so
  // standing close means you want the fire, not them).
  const fire = player.mode === 'swim' ? null : cooking.placeAt(player.pos, false);
  if (fire && cooking.near(player.pos, fire) < 1.7) return cooking.open ? null : { key: 'E', label: 'Cook on the fire', act: () => cooking.begin(fire) };
  // Someone to talk to? (Not when they're asleep.)
  const who = player.mode === 'swim' ? null : villages.nearest(player.pos);
  if (who) {
    const first = who.def.name.split(' ')[0];
    if (!who.awakeNow) return { key: '', label: 'Asleep.' };
    if (talk.open) return null;
    return { key: 'E', label: `Talk to ${first}`, act: () => talk.begin(who) };
  }
  if (fire) return cooking.open ? null : { key: 'E', label: 'Cook on the fire', act: () => cooking.begin(fire) };
  // Fruit on a tree.
  const tree = player.mode === 'swim' ? null : gathering.near(player.pos);
  if (tree) {
    return {
      key: 'E',
      label: tree.label,
      act: async () => {
        const r = await gathering.pick(tree, player.pos);
        if (r?.ok) hud.say(`${describe({ kind: r.kind }).replace(/^./, (c) => c.toUpperCase())}.`, 2);
        else if (r?.why === 'full') hud.say("The hold's full.", 2);
      },
    };
  }
  const find = player.mode === 'swim' ? null : finds.near(player.pos);
  if (find) {
    return {
      key: 'E',
      label: find.place.label,
      act: () => finds.take(find),
    };
  }
  const note = player.mode === 'swim' ? null : puzzles.nearest(player.pos);
  if (note) return { key: 'E', label: puzzles.reading === note ? 'Look away' : 'Read', act: () => puzzles.read(note) };
  if (player.mode === 'swim') {
    boat.toWorld(PLATFORM_LOCAL, tmpV);
    if (Math.hypot(tmpV.x - player.pos.x, tmpV.z - player.pos.z) < 2.2) return { key: 'E', label: 'Climb aboard', act: climbAboard };
    return null;
  }
  for (const [name, st] of Object.entries(STATIONS)) {
    boat.toWorld(st.stand, tmpV);
    if (tmpV.distanceTo(player.pos) < 1.1) return { key: 'E', label: st.label, act: () => player.enterStation(boat, name) };
  }
  return null;
}

function climbAboard() {
  boat.toWorld(PLATFORM_LOCAL.clone().add(new THREE.Vector3(0.1, 0.02, 0)), tmpV);
  player.place(tmpV, boat.body);
  player.heading = Math.PI / 2 - boat.state.heading;
}

// Spray off the bow when she's driving hard into a sea.
let sprayT = 0;
const sprayDrift = {};
function bowSpray(dt, t, swell, storm) {
  sprayT -= dt;
  const b = boat.state;
  if (sprayT > 0 || b.sog < 2.5 || storm < 0.2) return;
  sprayT = 0.2 + Math.random() * 0.3;
  const bow = boat.toWorld(tmpV.set(4.8, 1.1, 0));
  const water = heightAt(bow.x, bow.z, t, swell);
  const into = water - (bow.y - 1.3); // how far the bow has buried itself
  if (into > 0 || Math.random() < storm * 0.35) {
    sprayDrift.x = env.wind.x * env.wind.speed * 0.6;
    sprayDrift.z = env.wind.z * env.wind.speed * 0.6;
    wildlife.splashes.spawn(bow.x, Math.max(water, bow.y - 0.7), bow.z, 8 + Math.round(12 * storm), 0.9 + storm, sprayDrift);
  }
}

// A word before a storm, and when it's over.
function stormNotices(t, storm) {
  if (dev.storm !== null) return;
  const soon = nextStormIn(t);
  if (soon > 0 && soon < 50 && !weather.warned) {
    weather.warned = true;
    hud.say('The glass is falling. Storm coming.', 5);
  }
  if (storm > 0.6) weather.wild = true;
  if (weather.wild && storm < 0.25) {
    weather.wild = false;
    weather.warned = false;
    hud.say("The storm's passing.", 4);
  }
}

// Short, flat notices for things you can't see from where you're standing.
const watch = { set: true, dragging: false, aground: false, deep: false };
function boatNotices() {
  const a = boat.state.anchor;
  if (a.set && !watch.set) hud.say('Anchor down.');
  if (!a.set && watch.set && a.rode > 0.5) hud.say('Anchor off the bottom.');
  if (a.rode <= 0.01 && watch.rode > 0.01) hud.say('Anchor up.');
  const deep = !a.set && a.rode >= BOAT.rodeMax - 0.01;
  if (deep && !watch.deep) hud.say('Too deep to anchor.');
  if (a.dragging && !watch.dragging) hud.say('Anchor dragging.');
  if (boat.state.aground && !watch.aground) hud.say('Aground.');
  watch.set = a.set;
  watch.dragging = a.dragging;
  watch.aground = boat.state.aground;
  watch.deep = deep;
  watch.rode = a.rode;
}

// ---------- Loop ----------
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
let started = false;
let simT = null;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  let t = worldTime();
  if (dev.simTime) {
    simT = (simT ?? t) + dt;
    t = simT;
  }
  const swell = dev.swell ?? swellScaleAt(t);

  atmosphere.setTimeOfDay(dev.hours ?? hoursAt(t));
  atmosphere.uniforms.uTime.value = t % 3600;
  // Past 1 the cloud closes up completely: a storm sky.
  atmosphere.uniforms.uCloudCover.value = dev.clouds ?? cloudCoverAt(t) + 0.7 * stormAt(t);
  if (dev.fog !== null) atmosphere.fog.density = dev.fog;
  ocean.setWaveScale(swell);
  ocean.update(t, camera);
  flotsam.update(t, dt, swell, atmosphere.uniforms.uNight.value);
  const storm = stormAt(t);
  islands.update(t, 1 + 3 * storm);
  wildlife.update(dt, { t, waveScale: swell, camera, player, boat });
  islandLife.update(dt, { t, camera, player, night: atmosphere.uniforms.uNight.value });
  if (!villagesPlaced) {
    villages.place(dev.hours ?? hoursAt(t));
    villagesPlaced = true;
  }
  hoursNow = dev.hours ?? hoursAt(t);
  // Anyone with something to say to you turns and waves.
  for (const p of villages.people) p.wantsToTalk = !!WANTS[p.id]?.(progress.state);
  villages.update(dt, { t, hours: hoursNow, player, night: atmosphere.uniforms.uNight.value, camera, wind: env.wind });
  talk.update(input, player);
  shops.update(dt, { player, hours: hoursNow, camera });
  restaurants.update(dt, { player, hours: hoursNow, wind: env.wind, night: atmosphere.uniforms.uNight.value });
  gathering.update(dt);
  decorating.update(dt, { input, boat, player, inside: interior.inside });
  cooking.update(dt, { input, player, inside: interior.inside });
  // What you last ate, while it lasts: a stronger swimmer, steadier on deck, or better eyes at night.
  const fed = progress.state?.fed;
  const eff = fed && worldTime() < fed.until ? fed.effect : null;
  player.swimBoost = eff === 'swim' ? 1.3 : 1;
  player.steady = eff === 'steady';
  renderer.toneMappingExposure = 0.88 * (eff === 'night' ? 1 + 0.7 * atmosphere.uniforms.uNight.value : 1);
  wildlife.writeShoals(ocean.uniforms.uShoals.value);

  // Boat physics at a fixed rate.
  windAt(t, env.wind);
  if (dev.wind !== null) env.wind.speed = dev.wind;
  waveNow.t = t;
  waveNow.swell = swell;
  env.storm = storm;
  // Gusts knock her head about in a gale.
  env.kick = storm * (0.6 * Math.sin(t * 0.83) + 0.4 * Math.sin(t * 2.1 + 1.3));

  // The storm itself: rain, lightning, a dark sea, the wind howling.
  const flash = stormFx.update(dt, { storm, camera, wind: env.wind, inside: interior.inside, night: atmosphere.uniforms.uNight.value });
  atmosphere.setWeather(storm, flash);
  // Below decks: the deck over you keeps the sun off (its shadow does that)
  // and much of the sky's light; the lamps and the companionway do the rest.
  atmosphere.hemi.intensity *= 1 - 0.35 * interior.cutK;
  ocean.uniforms.uStorm.value = storm;
  audio.setWeather(storm, env.wind.speed);
  islands.lighthouse?.update(dt, Math.max(atmosphere.uniforms.uNight.value, storm * 0.9));
  stormNotices(t, storm);
  acc += dt;
  while (acc >= STEP) {
    boat.step(STEP, env);
    acc -= STEP;
  }
  boat.update(dt, t, swell);
  boat.body.setMatrix(boat.matrix, boat.prevMatrix);
  ocean.uniforms.uHullInv.value.copy(boat.matrix).invert();
  bowSpray(dt, t, swell, storm);
  if (!started) {
    player.place(boat.toWorld(new THREE.Vector3(-2.7, LAYOUT.cockpit.sole + 0.02, 0.45)), boat.body);
    player.heading = Math.PI / 2 - boat.state.heading;
    // Start looking forward along the deck.
    follow.yaw = Math.atan2(-Math.cos(boat.state.heading), -Math.sin(boat.state.heading)) + 0.5;
    started = true;
    // Come to visit: straight down to look round their cabin.
    if (visit) {
      player.place(interior.toWorld(interior.foot), boat.body);
      player.heading = Math.PI / 2 - boat.state.heading;
      follow.yaw = Math.atan2(-Math.cos(boat.state.heading), -Math.sin(boat.state.heading)) + 0.5;
      hud.say("Someone else's boat. Have a look round.", 4);
    }
    // Your first map; and chests dug up last time but not got home are
    // waiting in the cockpit (now the boat is where it should be).
    treasure.start(() => boat.toWorld(new THREE.Vector3(-2.6 - Math.random() * 1.2, LAYOUT.cockpit.sole + 0.1, (Math.random() - 0.5) * 0.8)));
  }

  course.update(t, dt, swell);
  hatch.update(dt);
  stack.update(t);

  // Player.
  const interaction = findInteraction();
  hud.setPrompt(interaction?.key, interaction?.label);
  if (interaction?.act && input.pressed('KeyE')) {
    interaction.act();
    input.hits.delete('KeyE');
  }
  // Digging and the map.
  if (input.pressed('KeyF') && player.mode === 'ground' && player.grounded && !player.carrying && !player.platform) {
    const p = player.digPoint;
    if (treasure.canDig(p.x, p.z)) {
      player.startDig(async (x, z) => {
        const res = await treasure.dig(x, z);
        if (res.result === 'crab') player.startle();
      });
    } else if (groundAt(p.x, p.z) > 0.2) {
      hud.say('Too hard to dig here.');
    }
  }
  if (input.pressed('KeyM')) treasure.toggleMap();
  if (input.pressed('KeyH')) {
    journal.toggle(false);
    screens.toggleControls();
  }
  if (input.pressed('KeyJ')) {
    screens.toggleControls(false);
    screens.chart.classList.remove('open');
    journal.toggle();
  }
  if (journal.open && input.pressed('Escape')) journal.toggle(false);
  journal.update(input);
  // Lights: L anywhere aboard. They come on by themselves at dusk and go off at dawn.
  const nightNow = atmosphere.uniforms.uNight.value > 0.5;
  if (nightNow !== wasNight) {
    boat.state.lights = nightNow;
    wasNight = nightNow;
    document.body.classList.toggle('night', nightNow);
  }
  if (input.pressed('KeyL') && (interior.inside || player.platform === boat.body || player.mode === 'station')) {
    boat.state.lights = !boat.state.lights;
    hud.say(boat.state.lights ? 'Lights on.' : 'Lights off.', 2);
  }
  if (input.pressed('KeyQ') && !decorating.holding) {
    const ready = !interior.inside && player.mode === 'ground' && player.grounded && !player.carrying;
    fishing.press({ t, waveScale: swell, night: atmosphere.uniforms.uNight.value > 0.5, canFish: ready, onBoat, shoalNear: (p) => wildlife.shoalNear(p.x, p.z) });
  }
  if (input.pressed('Tab')) {
    journal.toggle(false);
    screens.toggleChart();
  }
  screens.update({ boat, player, wind: env.wind, aboard: interior.inside, catchLog: fishing.summary(), finds: finds.summary() });
  if (player.station !== 'helm') {
    if (input.pressed('ArrowRight')) treasure.flip(1);
    if (input.pressed('ArrowLeft')) treasure.flip(-1);
  }
  player.sheltered = interior.inside;
  player.update(dt, input, { t, waveScale: swell, camBasis: follow.basis() });
  fishing.update(dt, { t, waveScale: swell, night: atmosphere.uniforms.uNight.value > 0.5, camYaw: follow.yaw });
  treasure.update(dt, { t, waveScale: swell, boatBody: boat.body, player });
  puzzles.update(player);
  for (const e of player.events) {
    if (e === 'horn') audio.horn();
    if (e === 'splash') audio.splash();
  }
  audio.setEngine(boat.state.engine, boat.state.throttle);

  hud.setKeys(decorating.holding ? DECOR_KEYS : player.mode === 'station' ? STATION_KEYS[player.station === 'helm' && !BOAT.arcade ? 'helmRealistic' : player.station] : null);
  hud.setInstruments(player.station === 'helm' ? boat.state : null);
  interior.update(dt, { night: atmosphere.uniforms.uNight.value, camera, player });
  const nearBoat = interior.inside || player.platform === boat.body || player.mode === 'station' || Math.hypot(player.pos.x - boat.state.x, player.pos.z - boat.state.z) < 30;
  hud.setAnchor(nearBoat ? boat.state : null);
  boatNotices();
  hud.update(dt);

  // Camera.
  if (controls) {
    controls.update();
  } else if (cooking.open) {
    // Cooking: look down into the pan from beside the stove.
    const v = cooking.view(player);
    camera.position.lerp(v.eye, 1 - Math.exp(-dt * 6));
    camera.lookAt(v.target);
  } else {
    const onBoat = player.platform === boat.body || player.mode === 'station';
    const yawDelta = onBoat ? -(boat.body.yaw - boat.body.prevYaw) : 0;
    const target = player.head.clone();
    if (player.station === 'helm') target.y += 1.4;
    target.y += 0.6 * (player.swimLift ?? 0);
    follow.update(dt, input, target, { context: player.station === 'helm' ? 'helm' : interior.inside ? 'cabin' : 'foot', yawDelta, t, waveScale: swell, world });
    const water = heightAt(camera.position.x, camera.position.z, t, swell);
    if (camera.position.y < water + 0.35) camera.position.y = water + 0.35;
  }

  // Lantern glow on the water.
  flotsam.buoy.lantern.light.getWorldPosition(ocean.uniforms.uLanternPos.value);
  ocean.uniforms.uLanternColor.value.setRGB(1.0, 0.55, 0.2).multiplyScalar(flotsam.buoy.lantern.light.intensity / 20);

  atmosphere.focusShadows(controls ? controls.target : player.pos);
  composer.render(dt);
  if (fpsMeter.on) {
    // Real time, not the clamped step, so slow machines read true.
    fpsMeter.n++;
    fpsMeter.since ??= now;
    if (now - fpsMeter.since >= 500) {
      const fps = (fpsMeter.n * 1000) / (now - fpsMeter.since);
      fpsEl.textContent = `${fps < 10 ? fps.toFixed(1) : Math.round(fps)} fps`;
      fpsMeter.n = 0;
      fpsMeter.since = now;
    }
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

if (params.has('dev')) {
  window.__game = { shops, restaurants, player, boat, world, follow, camera, input, hud, treasure, puzzles, course, hatch, stack, islands, scene, bloom, fishing, interior, screens, wildlife, islandLife, villages, talk, journal, questWorld, gathering, cooking, decorating, finds, ocean, controls, stormFx, atmosphere, env, progress, THREE };
}

syncClock().finally(() => {
  document.body.classList.add('ready');
  requestAnimationFrame((n) => {
    last = n;
    frame(n);
  });
});
