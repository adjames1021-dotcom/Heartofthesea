import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { heightAt, setWaveDamping } from '../shared/waves.js';
import { dampingAt, groundAt, ISLAND_BY_ID, toWorld, gannetNest } from '../shared/world.js';
import { hoursAt, swellScaleAt, cloudCoverAt, windAt } from '../shared/environment.js';
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
import { WreckCourse } from './course.js';
import { HatchPuzzle } from './hatch.js';
import { StackClimb } from './stack.js';
import { foreTopChest } from '../shared/wreck.js';
import { OceanAudio } from './audio.js';
import { syncClock, worldTime } from './clock.js';
import './style.css';

const params = new URLSearchParams(location.search);
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

const env = { wind: {}, ground: groundAt };

// ---------- Player ----------
const player = new Player(world, params.get('look') ?? 'brown');
scene.add(player.bear.root);
player.bear.setShovel(false, shovelModel());

const input = new Input(renderer.domElement);
const follow = new FollowCamera(camera);
const hud = new Hud();
const audio = new OceanAudio();
const treasure = new Treasure({ scene, world, hud });
const screens = new Screens();
const interior = new Interior({ scene, world });
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
};
ui.sound.addEventListener('click', async () => {
  const on = await audio.toggle();
  ui.sound.textContent = on ? 'Sound on' : 'Sound off';
  ui.sound.setAttribute('aria-pressed', String(on));
});
ui.toggle.addEventListener('click', () => {
  const open = ui.panel.classList.toggle('open');
  ui.toggle.setAttribute('aria-expanded', String(open));
});
renderer.domElement.addEventListener('mousedown', () => ui.start.classList.add('gone'), { once: true });

// ---------- Interactions ----------
const STATION_KEYS = {
  helm: [['A D', 'steer'], ['W S', 'sails up / down (throttle with engine on)'], ['G', 'anchor up / down'], ['R', 'engine'], ['P', 'autopilot'], ['L', 'lights'], ['F', 'horn'], ['E', 'leave']],
  helmRealistic: [['A D', 'steer'], ['W S', 'sails up / down (throttle with engine on)'], ['↑ ↓', 'main sheet'], ['← →', 'jib sheet'], ['G', 'anchor up / down'], ['R', 'engine'], ['P', 'autopilot'], ['L', 'lights'], ['F', 'horn'], ['E', 'leave']],
  halyards: [['W S', 'hoist / lower main'], ['A D', 'furl / unfurl jib'], ['R', 'reef'], ['E', 'leave']],
  windlass: [['W', 'raise anchor'], ['S', 'let out chain'], ['E', 'leave']],
};
const tmpV = new THREE.Vector3();
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

// The companionway: steps down into the cabin, in the front of the cockpit.
const COMPANIONWAY = new THREE.Vector3(-1.35, LAYOUT.cockpit.sole, 0);

function goBelow() {
  interior.inside = true;
  if (player.carrying) player.carrying = null;
  player.place(interior.arrival, null);
  player.heading = Math.PI / 2;
  follow.yaw = player.heading + Math.PI;
  follow.pitch = 0.25;
}

function goUp() {
  interior.inside = false;
  player.place(boat.toWorld(COMPANIONWAY.clone().add(new THREE.Vector3(-0.5, 0.02, 0))), boat.body);
  player.heading = -Math.PI / 2 - boat.state.heading;
}

function findInteraction() {
  if (player.mode === 'station' || player.mode === 'dig' || player.flopT > 0 || player.clinging) return null;
  if (interior.inside) return interior.nearLadder(player.pos) ? { key: 'E', label: 'Go up on deck', act: goUp } : null;
  if (player.platform === boat.body && !player.carrying) {
    boat.toWorld(COMPANIONWAY, tmpV);
    if (Math.hypot(tmpV.x - player.pos.x, tmpV.z - player.pos.z) < 0.6) return { key: 'E', label: 'Go below', act: goBelow };
  }
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
  atmosphere.uniforms.uCloudCover.value = dev.clouds ?? cloudCoverAt(t);
  if (dev.fog !== null) atmosphere.fog.density = dev.fog;
  ocean.setWaveScale(swell);
  ocean.update(t, camera);
  flotsam.update(t, dt, swell, atmosphere.uniforms.uNight.value);
  islands.update(t);

  // Boat physics at a fixed rate.
  windAt(t, env.wind);
  if (dev.wind !== null) env.wind.speed = dev.wind;
  acc += dt;
  while (acc >= STEP) {
    boat.step(STEP, env);
    acc -= STEP;
  }
  boat.update(dt, t, swell);
  boat.body.setMatrix(boat.matrix, boat.prevMatrix);
  if (!started) {
    player.place(boat.toWorld(new THREE.Vector3(-2.7, LAYOUT.cockpit.sole + 0.02, 0.45)), boat.body);
    player.heading = Math.PI / 2 - boat.state.heading;
    // Start looking forward along the deck.
    follow.yaw = Math.atan2(-Math.cos(boat.state.heading), -Math.sin(boat.state.heading)) + 0.5;
    started = true;
  }

  course.update(t, dt, swell);
  hatch.update(dt);
  stack.update(t);

  // Player.
  const interaction = findInteraction();
  hud.setPrompt(interaction?.key, interaction?.label);
  if (interaction && input.pressed('KeyE')) {
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
  if (input.pressed('KeyH')) screens.toggleControls();
  if (input.pressed('Tab')) screens.toggleChart();
  screens.update({ boat, player, wind: env.wind, aboard: interior.inside });
  if (player.station !== 'helm') {
    if (input.pressed('ArrowRight')) treasure.flip(1);
    if (input.pressed('ArrowLeft')) treasure.flip(-1);
  }
  player.update(dt, input, { t, waveScale: swell, camBasis: follow.basis() });
  treasure.update(dt, { t, waveScale: swell, boatBody: boat.body, player });
  puzzles.update(player);
  for (const e of player.events) {
    if (e === 'horn') audio.horn();
    if (e === 'splash') audio.splash();
  }
  audio.setEngine(boat.state.engine, boat.state.throttle);

  hud.setKeys(player.mode === 'station' ? STATION_KEYS[player.station === 'helm' && !BOAT.arcade ? 'helmRealistic' : player.station] : null);
  hud.setInstruments(player.station === 'helm' ? boat.state : null);
  interior.update(atmosphere.uniforms.uNight.value);
  const nearBoat = interior.inside || player.platform === boat.body || player.mode === 'station' || Math.hypot(player.pos.x - boat.state.x, player.pos.z - boat.state.z) < 30;
  hud.setAnchor(nearBoat ? boat.state : null);
  boatNotices();
  hud.update(dt);

  // Camera.
  if (controls) {
    controls.update();
  } else {
    const onBoat = player.platform === boat.body || player.mode === 'station';
    const yawDelta = onBoat ? -(boat.body.yaw - boat.body.prevYaw) : 0;
    const target = player.head.clone();
    if (player.station === 'helm') target.y += 1.4;
    if (player.mode === 'swim') target.y += 0.6;
    follow.update(dt, input, target, { context: player.station === 'helm' ? 'helm' : interior.inside ? 'cabin' : 'foot', yawDelta, t, waveScale: swell, world });
    const water = heightAt(camera.position.x, camera.position.z, t, swell);
    if (camera.position.y < water + 0.35) camera.position.y = water + 0.35;
  }

  // Lantern glow on the water.
  flotsam.buoy.lantern.light.getWorldPosition(ocean.uniforms.uLanternPos.value);
  ocean.uniforms.uLanternColor.value.setRGB(1.0, 0.55, 0.2).multiplyScalar(flotsam.buoy.lantern.light.intensity / 20);

  atmosphere.focusShadows(controls ? controls.target : player.pos);
  composer.render(dt);
  input.endFrame();
  requestAnimationFrame(frame);
}

if (params.has('dev')) {
  window.__game = { player, boat, world, follow, camera, input, hud, treasure, puzzles, course, hatch, stack, islands, scene, bloom, THREE };
}

syncClock().finally(() => {
  treasure.start();
  document.body.classList.add('ready');
  requestAnimationFrame((n) => {
    last = n;
    frame(n);
  });
});
