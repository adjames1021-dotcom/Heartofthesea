import * as THREE from 'three';
import { noiseGLSL, skyGLSL, skyUniformsGLSL } from './glsl.js';

// Colour keyframes indexed by sun elevation (sunDir.y). Everything that sets
// the mood lives here: tweak these to repaint the whole world.
const KEYS = [
  {
    e: -1.0,
    zenith: '#050c22', horizon: '#1b2c4e', haze: '#000000', sun: '#000000',
    light: '#8fa6dc', lightI: 0.9,
    deep: '#020d1c', shallow: '#0a3452', scatter: '#14808a',
    cloudLit: '#3a4a6e', cloudShade: '#0b1224', fog: 0.0008, night: 1,
  },
  {
    e: -0.18,
    zenith: '#07102a', horizon: '#1e2d52', haze: '#0a0a14', sun: '#000000',
    light: '#8fa6dc', lightI: 0.9,
    deep: '#030f1f', shallow: '#0b3654', scatter: '#14808a',
    cloudLit: '#3a4a6e', cloudShade: '#0c1328', fog: 0.0008, night: 1,
  },
  {
    e: -0.06,
    zenith: '#141c45', horizon: '#6b3f5e', haze: '#7a3a36', sun: '#ff6a3d',
    light: '#ff8a5c', lightI: 0.2,
    deep: '#041627', shallow: '#0b3a55', scatter: '#16808a',
    cloudLit: '#a3546a', cloudShade: '#2a2346', fog: 0.0008, night: 0.6,
  },
  {
    e: 0.03,
    zenith: '#2c4f8f', horizon: '#ff9a5a', haze: '#ff7a3a', sun: '#ffb070',
    light: '#ffa060', lightI: 1.4,
    deep: '#06263f', shallow: '#0d4f68', scatter: '#20a39a',
    cloudLit: '#ffc08a', cloudShade: '#6a4f78', fog: 0.0007, night: 0.0,
  },
  {
    e: 0.18,
    zenith: '#3d79c7', horizon: '#f5cf9e', haze: '#ffb36b', sun: '#ffd6a0',
    light: '#ffd2a0', lightI: 2.3,
    deep: '#053049', shallow: '#0a5b78', scatter: '#25c2ac',
    cloudLit: '#fff1dc', cloudShade: '#8a8fb0', fog: 0.0006, night: 0,
  },
  {
    e: 0.45,
    zenith: '#2c78d8', horizon: '#b8dcf2', haze: '#ffe3b8', sun: '#fff1dc',
    light: '#fff3e2', lightI: 2.8,
    deep: '#04354f', shallow: '#086683', scatter: '#24d1b5',
    cloudLit: '#ffffff', cloudShade: '#9cb2cf', fog: 0.0005, night: 0,
  },
  {
    e: 1.0,
    zenith: '#1f6ad0', horizon: '#a6d4f2', haze: '#fff0d0', sun: '#fff8ee',
    light: '#fffaf2', lightI: 3.0,
    deep: '#03374f', shallow: '#086a88', scatter: '#24d6b8',
    cloudLit: '#ffffff', cloudShade: '#a3b9d6', fog: 0.0005, night: 0,
  },
];

const COLOR_FIELDS = [
  'zenith', 'horizon', 'haze', 'sun', 'light',
  'deep', 'shallow', 'scatter', 'cloudLit', 'cloudShade',
];
for (const k of KEYS) for (const f of COLOR_FIELDS) k[f] = new THREE.Color(k[f]);

const tmpA = new THREE.Color();

export class Atmosphere {
  constructor() {
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.state = {};
    for (const f of COLOR_FIELDS) this.state[f] = new THREE.Color();

    // Uniform objects shared (by reference) with the ocean material.
    this.uniforms = {
      uSunDir: { value: this.sunDir },
      uLightDir: { value: this.lightDir },
      uLightColor: { value: new THREE.Color() },
      uSunColor: { value: this.state.sun },
      uZenith: { value: this.state.zenith },
      uHorizon: { value: this.state.horizon },
      uHaze: { value: this.state.haze },
      uCloudLit: { value: this.state.cloudLit },
      uCloudShade: { value: this.state.cloudShade },
      uNight: { value: 0 },
      uCloudCover: { value: 0.45 },
      uTime: { value: 0 },
    };

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            // Centre on the camera and push to the far plane.
            vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */ `
          ${skyUniformsGLSL}
          ${noiseGLSL}
          ${skyGLSL}
          varying vec3 vDir;
          void main() {
            vec3 dir = normalize(vDir);
            vec3 col = skyColor(dir, true);
            // Tiny dither to kill gradient banding.
            col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
            gl_FragColor = vec4(col, 1.0);
          }`,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;

    // Real lights for regular meshes (barrels, the buoy, later: ships).
    this.light = new THREE.DirectionalLight(0xffffff, 2);
    this.light.position.set(0, 100, 0);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x0a3550, 0.6);

    this.fog = new THREE.FogExp2(0x000000, 0.0006);
  }

  addTo(scene) {
    scene.add(this.dome, this.light, this.light.target, this.hemi);
    scene.fog = this.fog;
  }

  /** hours: 0..24 time of day. */
  setTimeOfDay(hours) {
    const theta = ((hours - 6) / 24) * Math.PI * 2;
    // Sun rises in the east (+x), arcs high to the south-ish, sets in the west.
    this.sunDir.set(Math.cos(theta), Math.sin(theta) * 0.92, 0.38).normalize();
    this.#interpolate(this.sunDir.y);

    const s = this.state;
    const u = this.uniforms;

    // Dominant light: the sun until it is well below the horizon, then the moon.
    // Both intensities pass through ~0 at the switch so there is no pop.
    const e = this.sunDir.y;
    let lightI;
    if (e > -0.08) {
      this.lightDir.copy(this.sunDir);
      lightI = s.lightI * THREE.MathUtils.smoothstep(e, -0.08, 0.02);
    } else {
      this.lightDir.copy(this.sunDir).negate();
      lightI = 0.9 * THREE.MathUtils.smoothstep(-e, 0.08, 0.25);
    }
    if (this.lightDir.y < 0.05) {
      this.lightDir.y = 0.05;
      this.lightDir.normalize();
    }
    u.uLightColor.value.copy(s.light).multiplyScalar(lightI);
    u.uNight.value = s.night;

    this.light.color.copy(s.light);
    this.light.intensity = lightI;
    this.light.position.copy(this.lightDir).multiplyScalar(100);
    this.hemi.color.copy(s.zenith).lerp(s.horizon, 0.5);
    this.hemi.groundColor.copy(s.deep);
    this.hemi.intensity = 0.6 + 0.6 * (1 - s.night);

    this.fog.color.copy(s.horizon);
    this.fog.density = s.fog;
  }

  #interpolate(e) {
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((e - a.e) / (b.e - a.e), 0, 1);
    const st = t * t * (3 - 2 * t);
    for (const f of COLOR_FIELDS) {
      this.state[f].copy(a[f]).lerp(tmpA.copy(b[f]), st);
    }
    this.state.lightI = THREE.MathUtils.lerp(a.lightI, b.lightI, st);
    this.state.fog = THREE.MathUtils.lerp(a.fog, b.fog, st);
    this.state.night = THREE.MathUtils.lerp(a.night, b.night, st);
  }
}
