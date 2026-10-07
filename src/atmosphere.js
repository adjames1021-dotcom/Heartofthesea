import * as THREE from 'three';
import { sunDirection } from '../shared/environment.js';
import { noiseGLSL, skyGLSL, skyUniformsGLSL } from './glsl.js';

// Colour keyframes indexed by sun elevation (sunDir.y). Everything that sets
// the mood lives here: tweak these to repaint the whole world.
const KEYS = [
  {
    e: -1.0,
    zenith: '#050c22', horizon: '#1b2c4e', haze: '#000000', sun: '#000000',
    light: '#8fa6dc', lightI: 0.9,
    deep: '#020d1c', shallow: '#0a3452', scatter: '#14808a',
    lagoon: '#0a3a4a', sandbed: '#1c2a33',
    cloudLit: '#3a4a6e', cloudShade: '#0b1224', fog: 0.0008, night: 1,
  },
  {
    e: -0.18,
    zenith: '#07102a', horizon: '#1e2d52', haze: '#0a0a14', sun: '#000000',
    light: '#8fa6dc', lightI: 0.9,
    deep: '#030f1f', shallow: '#0b3654', scatter: '#14808a',
    lagoon: '#0b3f50', sandbed: '#1e2d37',
    cloudLit: '#3a4a6e', cloudShade: '#0c1328', fog: 0.0008, night: 1,
  },
  {
    e: -0.06,
    zenith: '#141c45', horizon: '#6b3f5e', haze: '#7a3a36', sun: '#ff6a3d',
    light: '#ff8a5c', lightI: 0.2,
    deep: '#041627', shallow: '#0b3a55', scatter: '#16808a',
    lagoon: '#1d5a66', sandbed: '#4a4a52',
    cloudLit: '#a3546a', cloudShade: '#2a2346', fog: 0.0008, night: 0.6,
  },
  {
    e: 0.03,
    zenith: '#2c4f8f', horizon: '#ff9a5a', haze: '#ff7a3a', sun: '#ffb070',
    light: '#ffa060', lightI: 1.4,
    deep: '#06263f', shallow: '#0d4f68', scatter: '#20a39a',
    lagoon: '#2f9c98', sandbed: '#c8a07c',
    cloudLit: '#ffc08a', cloudShade: '#6a4f78', fog: 0.0007, night: 0.0,
  },
  {
    e: 0.18,
    zenith: '#3d79c7', horizon: '#f5cf9e', haze: '#ffb36b', sun: '#ffd6a0',
    light: '#ffd2a0', lightI: 2.3,
    deep: '#053049', shallow: '#0a5b78', scatter: '#25c2ac',
    lagoon: '#36bfb2', sandbed: '#e2cfa4',
    cloudLit: '#fff1dc', cloudShade: '#8a8fb0', fog: 0.0006, night: 0,
  },
  {
    e: 0.45,
    zenith: '#2c78d8', horizon: '#b8dcf2', haze: '#ffe3b8', sun: '#fff1dc',
    light: '#fff3e2', lightI: 2.8,
    deep: '#04354f', shallow: '#086683', scatter: '#24d1b5',
    lagoon: '#33cdbd', sandbed: '#e8ddb6',
    cloudLit: '#ffffff', cloudShade: '#9cb2cf', fog: 0.0005, night: 0,
  },
  {
    e: 1.0,
    zenith: '#1f6ad0', horizon: '#a6d4f2', haze: '#fff0d0', sun: '#fff8ee',
    light: '#fffaf2', lightI: 3.0,
    deep: '#03374f', shallow: '#086a88', scatter: '#24d6b8',
    lagoon: '#30d2c2', sandbed: '#ebe1bb',
    cloudLit: '#ffffff', cloudShade: '#a3b9d6', fog: 0.0005, night: 0,
  },
];

const COLOR_FIELDS = [
  'zenith', 'horizon', 'haze', 'sun', 'light',
  'deep', 'shallow', 'scatter', 'cloudLit', 'cloudShade', 'lagoon', 'sandbed',
];
for (const k of KEYS) for (const f of COLOR_FIELDS) k[f] = new THREE.Color(k[f]);

const tmpA = new THREE.Color();
const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

// How much of the sky's fill light survives in full sun-shadow, for the
// materials that opt in (terrain and island props). Low sun makes long, weak
// shadows on flat ground; taking some sky light away keeps them readable.
export const shadowFill = { value: 0.6 };
const SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

export function deepenShadows(material) {
  material.onBeforeCompile = (shader) => {
    if (!THREE.ShaderChunk.lights_fragment_begin.includes(SHADOW_LINE)) return;
    shader.uniforms.uShadowFill = shadowFill;
    const begin = THREE.ShaderChunk.lights_fragment_begin.replace(
      SHADOW_LINE,
      SHADOW_LINE.replace('directLight.color *=', 'sunShadow =') + '\n\t\tdirectLight.color *= sunShadow;',
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uShadowFill;')
      .replace('#include <lights_fragment_begin>', 'float sunShadow = 1.0;\n' + begin)
      // Only ground facing the sky loses fill in shadow; cliffs and trunks keep it.
      .replace(
        '#include <lights_fragment_maps>',
        'float upness = clamp( dot( geometryNormal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ), 0.0, 1.0 );\n' +
          'irradiance *= mix( mix( 1.0, uShadowFill, upness * upness ), 1.0, sunShadow );\n#include <lights_fragment_maps>',
      );
  };
  return material;
}

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

    // Real lights for regular meshes (islands, props, boats). The sun (or moon)
    // casts shadows in a box that follows whatever the camera is looking at.
    this.light = new THREE.DirectionalLight(0xffffff, 2);
    this.light.position.set(0, 100, 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    const sc = this.light.shadow.camera;
    sc.left = -95;
    sc.right = 95;
    sc.top = 95;
    sc.bottom = -95;
    sc.near = 1;
    sc.far = 700;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.12;
    this.shadowFocus = new THREE.Vector3();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x0a3550, 0.6);

    this.fog = new THREE.FogExp2(0x000000, 0.0006);
  }

  addTo(scene) {
    scene.add(this.dome, this.light, this.light.target, this.hemi);
    scene.fog = this.fog;
  }

  /** hours: 0..24 time of day. */
  setTimeOfDay(hours) {
    // Same sun as the server and the puzzles (shared/environment.js).
    sunDirection(hours, this.sunDir);
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
    this.hemi.color.copy(s.zenith).lerp(s.horizon, 0.5);
    // Light bouncing back up off sand and sea, so shaded sides aren't black.
    this.hemi.groundColor.copy(s.sandbed).lerp(s.shallow, 0.35).multiplyScalar(0.7);
    this.hemi.intensity = 1.5 + 1.6 * (1 - s.night);
    shadowFill.value = THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.42, 0.72, THREE.MathUtils.smoothstep(e, 0.08, 0.6)), 0.8, s.night);

    this.fog.color.copy(s.horizon);
    this.fog.density = s.fog;
  }

  /** Centre the shadow box on a point of interest (snapped to shadow texels to stop shimmer). */
  focusShadows(point) {
    const cam = this.light.shadow.camera;
    const texel = (cam.right - cam.left) / this.light.shadow.mapSize.x;
    const f = this.shadowFocus.copy(point);
    // Snap in light space so moving the camera doesn't make shadow edges crawl.
    const up = Math.abs(this.lightDir.y) > 0.99 ? _X : _Y;
    _right.crossVectors(up, this.lightDir).normalize();
    _up.crossVectors(this.lightDir, _right);
    const r = Math.round(f.dot(_right) / texel) * texel - f.dot(_right);
    const u = Math.round(f.dot(_up) / texel) * texel - f.dot(_up);
    f.addScaledVector(_right, r).addScaledVector(_up, u);
    this.light.target.position.copy(f);
    this.light.position.copy(f).addScaledVector(this.lightDir, 300);
    this.light.target.updateMatrixWorld();
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
