import * as THREE from 'three';
import { RIPPLES, SWELLS, DEFAULT_WAVE_SCALE, wavePhases } from '../shared/waves.js';
import { noiseGLSL, skyGLSL, skyUniformsGLSL } from './glsl.js';
import { HULL_GLSL } from './boat.js';

const GRID = 420;          // vertices per side
const RADIUS = 4500;       // metres from the camera to the mesh edge
const INNER = 130;         // controls vertex density near the camera (~0.6 m)

/**
 * A single square grid whose vertices are packed densely near the centre and
 * stretched out toward the horizon (x = a·u + (R − a)·u³). It follows the
 * camera; displacement is computed from world position so the waves stay put.
 */
function buildGeometry() {
  const n = GRID;
  const pos = new Float32Array(n * n * 3);
  const remap = (u) => Math.sign(u) * (INNER * Math.abs(u) + (RADIUS - INNER) * Math.abs(u) ** 3);
  let p = 0;
  for (let j = 0; j < n; j++) {
    const z = remap((j / (n - 1)) * 2 - 1);
    for (let i = 0; i < n; i++) {
      pos[p++] = remap((i / (n - 1)) * 2 - 1);
      pos[p++] = 0;
      pos[p++] = z;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RADIUS * 1.5);
  return g;
}

const packWaves = (waves) =>
  waves.map((w) => new THREE.Vector4(w.dirX, w.dirZ, w.k, w.steepness));

const NS = SWELLS.length;
const NR = RIPPLES.length;

const waveGLSL = /* glsl */ `
#define NUM_SWELLS ${NS}
#define NUM_RIPPLES ${NR}
uniform vec4 uSwells[NUM_SWELLS];     // dir.xy, k, steepness
uniform float uSwellPhase[NUM_SWELLS];
uniform vec4 uRipples[NUM_RIPPLES];
uniform float uRipplePhase[NUM_RIPPLES];
uniform float uWaveScale;
uniform sampler2D uWorld;   // r: seabed height (m), g: swell damping 0..1
uniform vec3 uWorldRect;    // min x, min z, size

vec2 worldSample(vec2 p) {
  return texture2D(uWorld, (p - uWorldRect.xy) / uWorldRect.z).rg;
}

// Fade a wave out once it gets too small to be resolved at this distance.
float waveFade(float k, float dist, float near, float far) {
  float L = 6.2831853 / k;
  return 1.0 - smoothstep(L * near, L * far, dist);
}
`;

const vertexShader = /* glsl */ `
${waveGLSL}
varying vec3 vWorld;
varying vec2 vGrid;
varying float vHeight;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz;
  float dist = length(p - cameraPosition.xz);
  float damp = worldSample(p).g;
  vec3 disp = vec3(0.0);
  for (int i = 0; i < NUM_SWELLS; i++) {
    vec4 w = uSwells[i];
    float q = w.w * uWaveScale * damp * waveFade(w.z, dist, 30.0, 70.0);
    float a = q / w.z;
    float f = w.z * dot(w.xy, p) - uSwellPhase[i];
    float c = cos(f);
    disp += vec3(w.x * a * c, a * sin(f), w.y * a * c);
  }
  wp.xyz += disp;
  vGrid = p;
  vWorld = wp.xyz;
  vHeight = disp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
${skyUniformsGLSL}
${noiseGLSL}
${skyGLSL}
${waveGLSL}
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uScatter;
uniform float uFogDensity;
uniform float uMaxHeight;
uniform vec3 uLanternPos;
uniform vec4 uShoals[8];   // x, z, heading, radius (radius 0: none)
uniform float uStorm;      // 0 fair … 1 gale: whitecaps everywhere
uniform vec3 uLanternColor;
uniform vec3 uLagoon;
uniform vec3 uSandbed;
uniform mat4 uHullInv;     // world → the boat's own frame
${HULL_GLSL}

varying vec3 vWorld;
varying vec2 vGrid;
varying float vHeight;

void main() {
  // No sea inside the boat (you can see down into her while you're below).
  vec3 hl = (uHullInv * vec4(vWorld, 1.0)).xyz;
  if (abs(hl.x) < 5.75 && abs(hl.z) < 2.0 && hl.y < 1.35 && abs(hl.z) < hullHalf(hl.x, hl.y) - 0.03) discard;

  vec2 p = vGrid;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  vec2 ws = worldSample(p);
  float damp = ws.g;
  float depth = vWorld.y - ws.r; // water above the seabed right here

  // --- Per-pixel Gerstner normal + Jacobian (for crest foam) ---
  vec3 T = vec3(1.0, 0.0, 0.0);
  vec3 B = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < NUM_SWELLS; i++) {
    vec4 w = uSwells[i];
    float q = w.w * uWaveScale * damp * waveFade(w.z, dist, 30.0, 70.0);
    float f = w.z * dot(w.xy, p) - uSwellPhase[i];
    float s = sin(f), c = cos(f);
    T += vec3(-w.x * w.x * q * s, w.x * q * c, -w.x * w.y * q * s);
    B += vec3(-w.x * w.y * q * s, w.y * q * c, -w.y * w.y * q * s);
  }
  float jacobian = T.x * B.z - T.z * B.x;

  // Small chop only bends the normal.
  for (int i = 0; i < NUM_RIPPLES; i++) {
    vec4 w = uRipples[i];
    float q = w.w * (0.6 + 0.6 * uWaveScale) * (0.45 + 0.55 * damp) * waveFade(w.z, dist, 18.0, 60.0);
    float f = w.z * dot(w.xy, p) - uRipplePhase[i];
    float s = sin(f), c = cos(f);
    T += vec3(-w.x * w.x * q * s, w.x * q * c, -w.x * w.y * q * s);
    B += vec3(-w.x * w.y * q * s, w.y * q * c, -w.y * w.y * q * s);
  }
  vec3 N = normalize(cross(B, T));

  // Soften normals with distance: the far sea turns into a glassy mirror.
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(150.0, 2200.0, dist) * 0.85));

  vec3 L = uLightDir;
  float NdV = max(dot(N, V), 0.0);

  // --- Reflection ---
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyColor(R, false);
  // The bright haze around the sun shouldn't turn the whole sea white.
  refl *= 1.0 - 0.4 * pow(max(dot(R, uLightDir), 0.0), 4.0) * (1.0 - uNight);

  // --- Water body: deep colour, brighter where the swell rises ---
  float h01 = clamp(vHeight / uMaxHeight * 0.5 + 0.5, 0.0, 1.0);
  vec3 ambient = mix(uZenith, uHorizon, 0.5);
  float wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);
  vec3 body = mix(uDeep, uShallow, h01 * h01 * 0.9);
  // Shallows: turquoise over sand, paler still right at the waterline.
  float shallow = exp(-max(depth, 0.0) / 3.4);
  float sandy = exp(-max(depth, 0.0) / 0.9);
  body = mix(body, uLagoon, shallow);
  body = mix(body, uSandbed, sandy * 0.55);
  // Light the water mostly by intensity so a pink sky doesn't turn the sea grey.
  vec3 lightIn = uLightColor * 0.32 + ambient * 0.55;
  float lum = dot(lightIn, vec3(0.3, 0.59, 0.11));
  body *= (0.4 + 0.6 * wrap) * mix(vec3(lum), lightIn, 0.35) * 1.15;
  // Soft caustic web on the sand under shallow water.
  if (shallow > 0.03 && dist < 160.0) {
    vec2 warp = vec2(fbm(p * 0.21 + uTime * 0.035), fbm(p * 0.21 - uTime * 0.03 + 5.3));
    vec2 cw = worley(p * 0.9 + vec2(uTime * 0.08, uTime * 0.05) + warp * 1.8);
    float caustic = pow(1.0 - smoothstep(0.0, 0.14, cw.y - cw.x), 4.0) * smoothstep(0.35, 0.65, warp.x);
    body += uLightColor * caustic * shallow * 0.03 * (1.0 - smoothstep(30.0, 120.0, dist));
  }

  // --- Shoals: small dark fish milling just under the surface ---
  if (dist < 150.0) {
    float fishA = 0.0;
    float flash = 0.0;
    for (int s = 0; s < 8; s++) {
      vec4 sh = uShoals[s];
      if (sh.w <= 0.0) continue;
      vec2 d = p - sh.xy;
      if (dot(d, d) > sh.w * sh.w * 1.8) continue;
      for (int i = 0; i < 14; i++) {
        float fi = float(i) + float(s) * 17.0;
        vec2 h = vec2(fract(sin(fi * 12.9898) * 43758.5453), fract(sin(fi * 78.233 + 4.1) * 43758.5453)) * 2.0 - 1.0;
        float ang = uTime * (0.22 + 0.12 * h.x) + h.y * 3.0;
        vec2 off = h * sh.w * 0.72 + vec2(cos(ang), sin(ang)) * sh.w * 0.22;
        float dir = sh.z + 0.35 * sin(uTime * 0.7 + fi);
        vec2 fwd = vec2(cos(dir), sin(dir));
        vec2 q = d - off;
        vec2 lq = vec2(dot(q, fwd), dot(q, vec2(-fwd.y, fwd.x)));
        float len = 0.26 + 0.12 * fract(fi * 0.618);
        lq.y += sin(lq.x * 11.0 - uTime * 14.0 + fi) * 0.03 * smoothstep(0.0, -len, lq.x);
        float e = (lq.x * lq.x) / (len * len) + (lq.y * lq.y) / (len * len * 0.07);
        float tail = step(-len * 1.4, lq.x) * step(lq.x, -len * 0.8) * step(abs(lq.y), (-lq.x - len * 0.8) * 0.8);
        float f = max(1.0 - smoothstep(0.7, 1.0, e), tail);
        fishA = max(fishA, f);
        flash = max(flash, f * step(0.992, sin(uTime * 1.3 + fi * 3.1)));
      }
    }
    float see = (1.0 - smoothstep(70.0, 150.0, dist)) * (0.45 + 0.55 * shallow);
    body = mix(body, body * vec3(0.38, 0.46, 0.5), fishA * 0.8 * see);
    body += vec3(0.55, 0.6, 0.62) * flash * 0.45 * see;
  }

  // --- Subsurface scatter: the glowing jade crests when looking at the sun ---
  vec3 Hs = normalize(L + N * 0.55);
  float back = pow(clamp(dot(V, -Hs), 0.0, 1.0), 3.5);
  float crestMask = smoothstep(0.35, 1.0, h01);
  float sss = (back * 1.6 + 0.18) * crestMask;
  sss *= smoothstep(-0.2, 0.7, 1.0 - NdV); // stronger at grazing angles
  vec3 scatter = uScatter * sss * (uLightColor * 0.42 + ambient * 0.2);

  float fresnel = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  fresnel = min(fresnel, 0.55) * (1.0 - 0.4 * shallow);
  vec3 col = mix(body + scatter, refl, fresnel);

  // --- Sun glitter: sparkly but not blinding (much fainter for the moon) ---
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 900.0);
  spec = smoothstep(0.1, 0.55, spec) * 0.8 + spec * 0.4;
  float glint = mix(1.8, 0.6, uNight) * (1.0 - 0.95 * uStorm); // no sun under storm cloud
  vec3 broad = uLightColor * pow(max(dot(N, H), 0.0), 60.0) * 0.035;
  col += uLightColor * spec * glint + broad;

  // --- Foam: soft, bubbly patches that bloom on crests + marbled veins ---
  float foamFade = 1.0 - smoothstep(60.0, 420.0, dist);
  vec2 drift = vec2(uTime * 0.06, uTime * 0.025);
  float patchN = fbm(p * 0.35 + drift);
  vec2 wl = worley(p * 2.3 + drift * 3.0 + patchN * 2.0);
  float bubbles = smoothstep(0.08, 0.38, wl.x);   // 0 inside the bubble holes
  float foamTex = patchN * 0.75 + bubbles * 0.3;

  float crest = smoothstep(0.8 + 0.06 * uStorm, 0.45, jacobian) * smoothstep(0.54 - 0.06 * uStorm, 0.8, h01);
  crest = clamp(crest * (1.4 + 0.3 * uStorm), 0.0, 1.0);
  // Faint marbling on the open sea, like leftover foam from old breakers.
  // In a gale it's streaked across the whole sea.
  float vein = 1.0 - smoothstep(0.0, 0.028 + 0.02 * uStorm, abs(fbm(p * 0.05 + drift * 0.15) - 0.5));
  float amount = max(crest, vein * (0.38 + 0.3 * uStorm) * foamFade * damp);
  float foam = smoothstep(1.0 - amount, 1.08 - amount, foamTex);
  // Far away, swap the pattern for its average so it doesn't shimmer.
  foam = mix(crest * 0.45, foam, foamFade);

  // Gentle foam where the water runs up onto sand and rock.
  float shoreBand = 1.0 - smoothstep(0.0, 0.6, depth);
  float lap = 0.5 + 0.5 * sin(depth * 9.0 - uTime * 1.4 + patchN * 5.0);
  float shoreFoam = smoothstep(0.5, 0.68, shoreBand * (0.42 + 0.3 * lap) + foamTex * 0.3 * shoreBand);
  shoreFoam = max(shoreFoam, smoothstep(0.9, 0.98, shoreBand) * 0.8);
  foam = max(foam, shoreFoam * 0.8 * (1.0 - smoothstep(250.0, 700.0, dist)));

  vec3 foamCol = uLightColor * 0.26 * wrap + ambient * 0.75 + uSunColor * 0.03;
  col = mix(col, foamCol, foam * 0.92);

  // --- Lantern: warm pool + glitter path on the water (point lights don't
  // reach this custom shader, so it is done by hand) ---
  vec3 toLamp = uLanternPos - vWorld;
  float lampD2 = dot(toLamp, toLamp);
  vec3 Ll = toLamp * inversesqrt(lampD2);
  float lampSpec = pow(max(dot(N, normalize(Ll + V)), 0.0), 220.0);
  col += uLanternColor * (lampSpec * 6.0 + 0.5 * max(dot(N, Ll), 0.0)) / (1.0 + lampD2 * 0.035);

  // --- Aerial perspective: melt into the same horizon the sky paints ---
  vec3 fogDir = normalize(vec3(-V.x, 0.0, -V.z));
  vec3 fogCol = skyGradient(fogDir);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, fogCol, fogF);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Ocean {
  constructor(atmosphere, world) {
    this.atmosphere = atmosphere;
    this.waveScale = DEFAULT_WAVE_SCALE;
    this.swellPhases = new Float32Array(NS);
    this.ripplePhases = new Float32Array(NR);

    const maxHeight = SWELLS.reduce((s, w) => s + w.steepness / w.k, 0);

    this.uniforms = {
      ...atmosphere.uniforms,
      uSwells: { value: packWaves(SWELLS) },
      uSwellPhase: { value: this.swellPhases },
      uRipples: { value: packWaves(RIPPLES) },
      uRipplePhase: { value: this.ripplePhases },
      uWaveScale: { value: this.waveScale },
      uDeep: { value: atmosphere.state.deep },
      uShallow: { value: atmosphere.state.shallow },
      uScatter: { value: atmosphere.state.scatter },
      uFogDensity: { value: 0.0006 },
      uMaxHeight: { value: maxHeight * this.waveScale },
      uLanternPos: { value: new THREE.Vector3() },
      uLanternColor: { value: new THREE.Color(0, 0, 0) },
      uLagoon: { value: atmosphere.state.lagoon },
      uSandbed: { value: atmosphere.state.sandbed },
      uWorld: { value: world.texture },
      uWorldRect: { value: world.rect },
      uShoals: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uStorm: { value: 0 },
      uHullInv: { value: new THREE.Matrix4().makeTranslation(0, -1e5, 0) },
    };
    this.maxHeightUnit = maxHeight;

    this.mesh = new THREE.Mesh(
      buildGeometry(),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader,
        fragmentShader,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  setWaveScale(s) {
    this.waveScale = s;
    this.uniforms.uWaveScale.value = s;
    this.uniforms.uMaxHeight.value = Math.max(this.maxHeightUnit * s, 0.01);
  }

  /** t: shared world clock in seconds (full double precision). */
  update(t, camera) {
    wavePhases(SWELLS, t, this.swellPhases);
    wavePhases(RIPPLES, t, this.ripplePhases);
    this.uniforms.uFogDensity.value = this.atmosphere.fog.density;
    // Follow the camera horizontally. Snapping keeps vertex jitter down.
    const snap = 2;
    this.mesh.position.set(
      Math.round(camera.position.x / snap) * snap,
      0,
      Math.round(camera.position.z / snap) * snap,
    );
  }
}
