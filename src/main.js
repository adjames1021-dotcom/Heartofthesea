import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { heightAt } from '../shared/waves.js';
import { Atmosphere } from './atmosphere.js';
import { Ocean } from './ocean.js';
import { Flotsam } from './flotsam.js';
import { OceanAudio } from './audio.js';
import { syncClock, worldTime } from './clock.js';
import './style.css';

const params = new URLSearchParams(location.search);

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 12000);
camera.position.set(27, 6.5, -6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 6;
controls.maxDistance = 260;
controls.maxPolarAngle = Math.PI * 0.53;
controls.target.set(0, 2.5, 0);
controls.enablePan = false;

// ---------- World ----------
const atmosphere = new Atmosphere();
atmosphere.addTo(scene);

const ocean = new Ocean(atmosphere);
scene.add(ocean.mesh);

const flotsam = new Flotsam();
scene.add(flotsam.group);

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
  time: document.getElementById('time'),
  timeLabel: document.getElementById('time-label'),
  waves: document.getElementById('waves'),
  clouds: document.getElementById('clouds'),
  cycle: document.getElementById('cycle'),
  sound: document.getElementById('sound'),
  panel: document.getElementById('panel'),
  hide: document.getElementById('hide'),
};

let timeOfDay = Number(params.get('t') ?? 17.4);
let cycling = !params.has('still');
ui.time.value = timeOfDay;
ui.cycle.checked = cycling;
if (params.has('waves')) ui.waves.value = params.get('waves');
ocean.setWaveScale(Number(ui.waves.value));
atmosphere.uniforms.uCloudCover.value = Number(ui.clouds.value);

ui.time.addEventListener('input', () => (timeOfDay = Number(ui.time.value)));
ui.waves.addEventListener('input', () => ocean.setWaveScale(Number(ui.waves.value)));
ui.clouds.addEventListener('input', () => (atmosphere.uniforms.uCloudCover.value = Number(ui.clouds.value)));
ui.cycle.addEventListener('change', () => (cycling = ui.cycle.checked));

const audio = new OceanAudio();
ui.sound.addEventListener('click', async () => {
  const on = await audio.toggle();
  ui.sound.textContent = on ? 'Sound: on' : 'Sound: off';
  ui.sound.setAttribute('aria-pressed', String(on));
});
ui.hide.addEventListener('click', () => ui.panel.classList.toggle('collapsed'));

const fmtTime = (h) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

// ---------- Loop ----------
const followTarget = new THREE.Vector3(0, 2.5, 0);
const delta = new THREE.Vector3();
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = worldTime();

  if (cycling) {
    // One in-game hour per 40 real seconds.
    timeOfDay = (timeOfDay + dt / 40) % 24;
    ui.time.value = timeOfDay;
  }
  ui.timeLabel.textContent = fmtTime(timeOfDay);

  atmosphere.setTimeOfDay(timeOfDay);
  atmosphere.uniforms.uTime.value = t % 3600;
  ocean.update(t, camera);
  flotsam.update(t, dt, ocean.waveScale, atmosphere.uniforms.uNight.value);
  flotsam.buoy.lantern.light.getWorldPosition(ocean.uniforms.uLanternPos.value);
  ocean.uniforms.uLanternColor.value
    .setRGB(1.0, 0.55, 0.2)
    .multiplyScalar(flotsam.buoy.lantern.light.intensity / 20);

  // Let the camera ride the swell with the buoy, softened like a sea legs sway.
  const buoy = flotsam.buoy.object.position;
  followTarget.lerp(new THREE.Vector3(buoy.x, buoy.y * 0.6 + 2.5, buoy.z), 1 - Math.exp(-dt * 2));
  delta.subVectors(followTarget, controls.target);
  controls.target.add(delta);
  camera.position.add(delta);
  controls.update();

  // Never dip below the surface.
  const water = heightAt(camera.position.x, camera.position.z, t, ocean.waveScale);
  if (camera.position.y < water + 1.2) camera.position.y = water + 1.2;

  // Keep the sun/moon light aimed at the play area.
  atmosphere.light.target.position.copy(controls.target);
  atmosphere.light.position.copy(controls.target).addScaledVector(atmosphere.lightDir, 100);

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
