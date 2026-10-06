import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { heightAt, setWaveDamping } from '../shared/waves.js';
import { dampingAt, ISLAND_BY_ID, toWorld } from '../shared/world.js';
import { hoursAt, swellScaleAt, cloudCoverAt } from '../shared/environment.js';
import { Atmosphere } from './atmosphere.js';
import { Ocean } from './ocean.js';
import { Flotsam } from './flotsam.js';
import { Islands } from './islands.js';
import { buildWorldTexture } from './terrain.js';
import { OceanAudio } from './audio.js';
import { syncClock, worldTime } from './clock.js';
import './style.css';

const params = new URLSearchParams(location.search);
const num = (k) => (params.has(k) ? Number(params.get(k)) : null);

// Developer overrides for screenshots and testing only. Normal play takes
// all of these from the shared clock so every player sees the same world.
const dev = {
  hours: num('t'),
  swell: num('swell'),
  clouds: num('clouds'),
  fog: num('fog'),
};

// ---------- World data ----------
const world = buildWorldTexture(); // bakes the seabed/damping grid
setWaveDamping(dampingAt);

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 9000);

// ---------- World ----------
const atmosphere = new Atmosphere();
atmosphere.addTo(scene);

const ocean = new Ocean(atmosphere, world);
scene.add(ocean.mesh);

const islands = new Islands();
scene.add(islands.group);

const saddle = ISLAND_BY_ID.saddle;
const buoyAt = toWorld(saddle, saddle.features.buoy.x, saddle.features.buoy.z);
const flotsam = new Flotsam({ buoy: buoyAt });
scene.add(flotsam.group);

// ---------- Camera ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 6;
controls.maxDistance = 900;
controls.maxPolarAngle = Math.PI * 0.53;
controls.enablePan = false;

let followBuoy = true;
const camMode = params.get('cam');
if (camMode === 'free') {
  // ?cam=free&pos=x,y,z&look=x,y,z
  const [px, py, pz] = (params.get('pos') ?? '0,400,700').split(',').map(Number);
  const [lx, ly, lz] = (params.get('look') ?? '0,0,0').split(',').map(Number);
  camera.position.set(px, py, pz);
  controls.target.set(lx, ly, lz);
  followBuoy = false;
} else if (camMode === 'island') {
  // ?cam=island&id=horseshoe&az=0.5&el=0.3&dist=300&lift=10
  const isl = ISLAND_BY_ID[params.get('id') ?? 'saddle'];
  const az = num('az') ?? 0.6;
  const el = num('el') ?? 0.25;
  const dist = num('dist') ?? 320;
  const lift = num('lift') ?? 8;
  controls.target.set(isl.x, lift, isl.z);
  camera.position.set(
    isl.x + Math.cos(az) * Math.cos(el) * dist,
    lift + Math.sin(el) * dist,
    isl.z + Math.sin(az) * Math.cos(el) * dist,
  );
  followBuoy = false;
} else {
  camera.position.set(buoyAt.x - 30, 8, buoyAt.z + 22);
  controls.target.set(buoyAt.x, 2.5, buoyAt.z);
}

// ---------- Post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- UI ----------
const ui = {
  sound: document.getElementById('sound'),
  panel: document.getElementById('panel'),
  toggle: document.getElementById('settings-toggle'),
};
const audio = new OceanAudio();
ui.sound.addEventListener('click', async () => {
  const on = await audio.toggle();
  ui.sound.textContent = on ? 'Sound on' : 'Sound off';
  ui.sound.setAttribute('aria-pressed', String(on));
});
ui.toggle.addEventListener('click', () => {
  const open = ui.panel.classList.toggle('open');
  ui.toggle.setAttribute('aria-expanded', String(open));
});

// ---------- Loop ----------
const followTarget = new THREE.Vector3(buoyAt.x, 2.5, buoyAt.z);
const delta = new THREE.Vector3();
const buoyFollow = new THREE.Vector3();
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = worldTime();

  atmosphere.setTimeOfDay(dev.hours ?? hoursAt(t));
  atmosphere.uniforms.uTime.value = t % 3600;
  atmosphere.uniforms.uCloudCover.value = dev.clouds ?? cloudCoverAt(t);
  if (dev.fog !== null) atmosphere.fog.density = dev.fog;
  ocean.setWaveScale(dev.swell ?? swellScaleAt(t));
  ocean.update(t, camera);
  flotsam.update(t, dt, ocean.waveScale, atmosphere.uniforms.uNight.value);
  islands.update(t);

  flotsam.buoy.lantern.light.getWorldPosition(ocean.uniforms.uLanternPos.value);
  ocean.uniforms.uLanternColor.value
    .setRGB(1.0, 0.55, 0.2)
    .multiplyScalar(flotsam.buoy.lantern.light.intensity / 20);

  if (followBuoy) {
    // Ride the swell with the buoy, softened like sea legs.
    const buoy = flotsam.buoy.object.position;
    buoyFollow.set(buoy.x, buoy.y * 0.6 + 2.5, buoy.z);
    followTarget.lerp(buoyFollow, 1 - Math.exp(-dt * 2));
    delta.subVectors(followTarget, controls.target);
    controls.target.add(delta);
    camera.position.add(delta);
  }
  controls.update();

  // Never dip below the surface.
  const water = heightAt(camera.position.x, camera.position.z, t, ocean.waveScale);
  if (camera.position.y < water + 1.2) camera.position.y = water + 1.2;

  atmosphere.focusShadows(controls.target);

  composer.render(dt);
  requestAnimationFrame(frame);
}

syncClock().finally(() => {
  document.body.classList.add('ready');
  requestAnimationFrame((n) => {
    last = n;
    frame(n);
  });
});
