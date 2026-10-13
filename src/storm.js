import * as THREE from 'three';
import { LAYOUT, deckAt, halfAt, roofTop, cabinHalf } from './boat.js';

// What a storm looks and sounds like up close: rain driven on the wind,
// lightning forking down onto the sea with the sky lighting up behind it,
// and thunder arriving a few seconds later from however far away it struck.
// Purely local, like the birds: the storm itself (wind, sea, cloud) comes
// from the shared clock in shared/environment.js.
//
// The rain is three things: streaks falling past you (soft, tapering, slanted
// by the wind, worked out on the GPU from the time so they fall the same at
// any frame rate), rings where drops hit the sea round you and splashes on
// her deck, and grey sheets of it drifting across further off.

const DROPS = 14000;
const BOX = 18; // half-size across of the box of rain round the camera
const TALL = 30; // and its height
const RINGS = 96; // on the sea round you at once
const DECK_RINGS = 48; // on her deck
const TAU = Math.PI * 2;

const STREAK_VERT = /* glsl */ `
  attribute vec4 aSeed;
  attribute vec2 aCorner;
  uniform float uTime, uBox, uTall, uFall, uLen, uWidth, uAmount;
  uniform vec3 uCam;
  uniform vec2 uWind;
  varying float vAlong, vAcross, vFade;
  void main() {
    // Only as many drops as the storm calls for.
    if (fract(aSeed.w * 13.37) > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float speed = uFall * (0.8 + 0.4 * aSeed.w);
    vec3 vel = vec3(uWind.x, -speed, uWind.y);
    // Falling through a box that wraps round the camera: fixed in the world
    // (so it slides past as you move), always round you.
    vec3 p = aSeed.xyz * vec3(2.0 * uBox, uTall, 2.0 * uBox) + vel * uTime;
    p.x = uCam.x + mod(p.x - uCam.x + uBox, 2.0 * uBox) - uBox;
    p.z = uCam.z + mod(p.z - uCam.z + uBox, 2.0 * uBox) - uBox;
    p.y = uCam.y + mod(p.y - uCam.y + uTall * 0.6, uTall) - uTall * 0.6;
    // A streak: how far it falls while the eye takes it in, behind the drop.
    vec3 dir = normalize(vel);
    float len = length(vel) * uLen * (0.7 + 0.6 * fract(aSeed.w * 7.31));
    vec3 pos = p - dir * len * aCorner.y;
    vec3 toCam = normalize(uCam - pos);
    // Sideways across the streak as you see it. (Looking straight along a drop's
    // fall that's no direction at all, so fall back on any sideways one rather
    // than make a NaN: a NaN corner can smear a triangle right across the screen.)
    vec3 side = cross(dir, toCam);
    float sl = length(side);
    side = sl > 1e-3 ? side / sl : normalize(cross(dir, vec3(1.0, 0.0, 0.0)));
    float dist = distance(uCam, p);
    // (Never thinner than about a pixel, however far.)
    pos += side * aCorner.x * uWidth * max(1.0, dist / 12.0);
    vAlong = aCorner.y;
    vAcross = aCorner.x;
    // Not the ones right in your face, and thinning out toward the box's edge.
    vFade = smoothstep(0.7, 2.2, dist) * (1.0 - smoothstep(uBox * 0.55, uBox, length(p.xz - uCam.xz)));
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;
const STREAK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlong, vAcross, vFade;
  void main() {
    // Bright at the drop, tailing off behind it; soft at the sides.
    float a = clamp(pow(clamp(1.0 - vAlong, 0.0, 1.0), 0.8) * (1.0 - vAcross * vAcross) * vFade * uOpacity, 0.0, 1.0);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const RING_VERT = /* glsl */ `
  attribute vec4 iPos; // xyz, and when it landed
  attribute vec2 iSize; // how big it spreads, how long it lasts
  attribute vec2 iSlope; // the water's slope there (dy/dx, dy/dz), so it lies on it
  uniform float uTime;
  varying vec2 vUv;
  varying float vAge;
  void main() {
    float age = (uTime - iPos.w) / iSize.y;
    if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vAge = age;
    vUv = position.xy;
    // Flat on the water (or her deck), spreading as it goes.
    float r = iSize.x * (0.25 + 0.75 * sqrt(age));
    vec2 o = position.xy * r;
    vec3 p = iPos.xyz + vec3(o.x, dot(iSlope, o), o.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity, uRing, uSplash;
  varying vec2 vUv;
  varying float vAge;
  void main() {
    float d = length(vUv);
    float ring = smoothstep(0.5, 0.82, d) * (1.0 - smoothstep(0.82, 1.0, d));
    // A little splash in the middle at first.
    float splash = (1.0 - smoothstep(0.0, 0.4, d)) * (1.0 - smoothstep(0.0, 0.3, vAge));
    float fade = clamp(1.0 - vAge, 0.0, 1.0);
    float a = clamp((uRing * ring * fade * fade + uSplash * splash) * uOpacity, 0.0, 1.0);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const SHEET_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SHEET_FRAG = /* glsl */ `
  uniform float uTime, uOpacity, uSlant;
  uniform vec3 uColor;
  varying vec2 vUv;
  // (A hash without sin(): sin of a big number turns to blocks of noise on
  // GPUs that work in lower precision.)
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  // Value noise that wraps every 'per' across (the cylinder's seam).
  float noise(vec2 p, float per) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, per);
    float x1 = mod(i.x + 1.0, per);
    return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x), mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
  }
  void main() {
    // Fine streaks, falling and slanted with the wind...
    float sx = vUv.x * 700.0 + vUv.y * uSlant * 60.0;
    float tt = mod(uTime, 100.0);
    float streak = smoothstep(0.5, 0.95, noise(vec2(sx, vUv.y * 7.0 + mod(tt * 2.2, 64.0)), 700.0));
    // ...in broad sheets of heavier rain that drift round with it.
    float sheet = smoothstep(0.3, 0.85, noise(vec2(vUv.x * 9.0 + tt * 0.03, tt * 0.06), 9.0));
    float fade = smoothstep(0.02, 0.12, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
    float a = clamp(uOpacity * fade * (0.2 + 0.8 * sheet) * (0.55 + 0.45 * streak), 0.0, 1.0);
    gl_FragColor = vec4(uColor, a);
  }
`;

/** Where her deck is, in her own frame, at (x, z): the coachroof, down in the cockpit, or the deck. */
function deckTop(x, z) {
  const c = LAYOUT.cabin;
  const k = LAYOUT.cockpit;
  if (x > c.x0 && x < c.x1 && Math.abs(z) < cabinHalf(x) - 0.1) return roofTop(x);
  if (x > k.x0 && x < k.x1 && Math.abs(z) < k.half - 0.05) return k.sole;
  return deckAt(x);
}

/** A pool of splash rings: spawn(x, y, z) and they spread and fade by themselves. */
class Rings {
  constructor(n, parent, { size, life, ring = 0.8, splash = 0.7 }) {
    this.n = n;
    this.next = 0;
    this.size = size;
    this.life = life;
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2, 2);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4).fill(-1e5), 4);
    this.siz = new THREE.InstancedBufferAttribute(new Float32Array(n * 2).fill(1), 2);
    this.slope = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.slope.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iSize', this.siz);
    g.setAttribute('iSlope', this.slope);
    g.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0.5 }, uRing: { value: ring }, uSplash: { value: splash } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  spawn(x, y, z, now) {
    const i = this.next;
    this.next = (i + 1) % this.n;
    this.pos.setXYZW(i, x, y, z, now);
    this.siz.setXY(i, this.size * (0.6 + 0.8 * Math.random()), this.life * (0.75 + 0.5 * Math.random()));
    this.pos.needsUpdate = true;
    this.siz.needsUpdate = true;
  }

  /** Keep the live ones on the water as it rises, falls and tilts. */
  follow(waterAt, now) {
    const p = this.pos.array;
    const sl = this.slope.array;
    const e = 0.25;
    for (let i = 0; i < this.n; i++) {
      if (now - p[i * 4 + 3] > this.life * 1.3) continue;
      const x = p[i * 4];
      const z = p[i * 4 + 2];
      const h = waterAt(x, z);
      sl[i * 2] = (waterAt(x + e, z) - h) / e;
      sl[i * 2 + 1] = (waterAt(x, z + e) - h) / e;
      p[i * 4 + 1] = h + 0.05;
    }
    this.pos.needsUpdate = true;
    this.slope.needsUpdate = true;
  }
}

export class Storm {
  constructor({ scene, audio = null, boat = null }) {
    this.audio = audio;
    this.flash = 0; // 0..1, how lit up the sky is right now
    this.time = 0; // the rain's own clock (frame time, wrapped)

    // Rain: streaks, each a quad from the drop back along its fall.
    const seeds = new Float32Array(DROPS * 16);
    const corners = new Float32Array(DROPS * 8);
    const index = new Uint32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) {
      const sd = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < 4; k++) {
        seeds.set(sd, (i * 4 + k) * 4);
        corners.set([k % 2 ? 1 : -1, k < 2 ? 0 : 1], (i * 4 + k) * 2);
      }
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 12), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector2() },
        uBox: { value: BOX },
        uTall: { value: TALL },
        uFall: { value: 9 },
        uLen: { value: 0.05 },
        uWidth: { value: 0.009 },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0.4 },
      },
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide, // (they face whichever way the wind turns them)
    });
    this.rain = new THREE.Mesh(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 10;
    this.rain.visible = false;
    scene.add(this.rain);

    // Rings on the sea round you, and splashes on her deck (in her frame, so they go with her).
    this.seaRings = new Rings(RINGS, scene, { size: 0.36, life: 0.5 });
    this.boat = boat;
    this.deckRings = boat ? new Rings(DECK_RINGS, boat.root, { size: 0.09, life: 0.22, ring: 0.35, splash: 1 }) : null;
    this.ringAcc = 0;
    this.deckAcc = 0;

    // Sheets of rain further off: the inside of a tall ring round the camera.
    this.sheetMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uSlant: { value: 0 }, uColor: { value: new THREE.Color() } },
      vertexShader: SHEET_VERT,
      fragmentShader: SHEET_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.sheets = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 80, 48, 1, true), this.sheetMat);
    this.sheets.frustumCulled = false;
    this.sheets.renderOrder = 8;
    this.sheets.visible = false;
    scene.add(this.sheets);

    // Lightning: one bolt mesh, rebuilt for each strike.
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 3.0), fog: false, transparent: true });
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    scene.add(this.bolt);
    this.strike = null;
    this.nextStrike = 6;
  }

  /**
   * storm: 0..1. camera: the scene camera. wind: { x, z, speed }. inside: in
   * the cabin (no rain indoors, and thunder sounds muffled but still comes).
   * waterAt(x, z): the sea's height there now, for the rings. fog: the
   * scene's fog colour, which the far-off sheets take.
   * Returns the flash (0..1) for the sky and lights.
   */
  update(dt, { storm, camera, wind, inside = false, night = 0, waterAt = null, fog = null }) {
    const cam = camera.position;
    // Rain is grey streaks by day, barely there at night until the lightning catches it.
    const lit = 1 - 0.8 * night + 0.75 * this.flash;
    this.#rain(dt, storm, cam, wind, inside, lit, waterAt, fog);

    // Lightning, once it's properly blowing.
    this.nextStrike -= dt;
    if (storm > 0.55 && this.nextStrike <= 0 && !this.strike) {
      this.#newStrike(cam, storm);
      this.nextStrike = (14 - 9 * storm) * (0.5 + Math.random());
    }
    let flash = 0;
    if (this.strike) {
      const s = this.strike;
      s.t += dt;
      // Flicker: a pattern of on and off, the first stroke brightest.
      let on = 0;
      for (const [t0, t1, k] of s.pattern) if (s.t >= t0 && s.t < t1) on = k;
      this.bolt.visible = s.bolt && on > 0;
      this.boltMat.opacity = on;
      flash = on * s.power;
      if (!s.thundered && s.t > s.delay) {
        s.thundered = true;
        this.audio?.thunder?.(s.dist, inside);
      }
      if (s.t > Math.max(s.delay + 0.1, 1.2)) {
        this.strike = null;
        this.bolt.visible = false;
      }
    }
    // The sky glow fades a little slower than the bolt.
    this.flash = Math.max(flash, this.flash - dt * 6);
    return this.flash;
  }

  #rain(dt, storm, cam, wind, inside, lit, waterAt, fog) {
    const on = storm > 0.25 && !inside;
    const amount = Math.min(1, (storm - 0.25) / 0.6);
    this.rain.visible = on;
    this.seaRings.mesh.visible = on && !!waterAt;
    if (this.deckRings) this.deckRings.mesh.visible = on;
    this.sheets.visible = on && cam.y < 70 && storm > 0.4;
    if (!on) return;
    this.time = (this.time + dt) % 600;
    const T = this.time;
    // Driven on the wind (a gale lays it right over).
    const drift = Math.min(wind.speed * 0.65, 12);
    const u = this.rainMat.uniforms;
    u.uTime.value = T;
    u.uCam.value.copy(cam);
    u.uWind.value.set(wind.x * drift, wind.z * drift);
    u.uAmount.value = amount;
    u.uOpacity.value = 0.22 + 0.24 * storm;
    u.uColor.value.setRGB(0.82 * lit, 0.86 * lit, 0.9 * lit);

    // Drops landing round you: rings on the sea, splashes on her deck.
    const near = 13;
    if (waterAt) {
      const sr = this.seaRings;
      sr.mat.uniforms.uTime.value = T;
      sr.mat.uniforms.uColor.value.setRGB(0.85 * lit, 0.9 * lit, 0.94 * lit);
      sr.mat.uniforms.uOpacity.value = 0.28 + 0.2 * storm;
      this.ringAcc += dt * 190 * amount;
      for (; this.ringAcc >= 1; this.ringAcc--) {
        const a = Math.random() * TAU;
        const r = near * Math.sqrt(Math.random());
        const x = cam.x + Math.cos(a) * r;
        const z = cam.z + Math.sin(a) * r;
        sr.spawn(x, waterAt(x, z) + 0.05, z, T);
      }
      sr.follow(waterAt, T);
    }
    const boat = this.boat;
    if (this.deckRings && boat && boat.root.position.distanceTo(cam) < 30) {
      const dr = this.deckRings;
      dr.mat.uniforms.uTime.value = T;
      dr.mat.uniforms.uColor.value.setRGB(0.9 * lit, 0.92 * lit, 0.95 * lit);
      dr.mat.uniforms.uOpacity.value = 0.45 + 0.3 * storm;
      this.deckAcc += dt * 70 * amount;
      for (; this.deckAcc >= 1; this.deckAcc--) {
        const x = -5.5 + Math.random() * 11;
        const z = (Math.random() * 2 - 1) * (halfAt(x) - 0.12);
        dr.spawn(x, deckTop(x, z) + 0.012, z, T);
      }
    }

    // Sheets of it further off, drifting round with the wind.
    if (this.sheets.visible) {
      this.sheets.position.set(cam.x, 34, cam.z);
      const su = this.sheetMat.uniforms;
      su.uTime.value = T;
      su.uSlant.value = Math.min(1.2, drift / 9);
      su.uOpacity.value = 0.32 * THREE.MathUtils.smoothstep(storm, 0.4, 0.95) * (1 - THREE.MathUtils.smoothstep(cam.y, 40, 70));
      if (fog) su.uColor.value.copy(fog).multiplyScalar(1.08 + 0.4 * this.flash);
      else su.uColor.value.setRGB(0.55 * lit, 0.58 * lit, 0.62 * lit);
    }
  }

  #newStrike(cam, storm) {
    // Somewhere out on the sea, now and then close by.
    const a = Math.random() * TAU;
    const dist = Math.random() < 0.15 ? 120 + Math.random() * 150 : 300 + Math.random() * 1100;
    const x = cam.x + Math.cos(a) * dist;
    const z = cam.z + Math.sin(a) * dist;
    // Sometimes just the cloud lights up with no bolt to be seen.
    const bolt = Math.random() < 0.75;
    if (bolt) this.#buildBolt(x, z, dist);
    const strokes = 1 + Math.floor(Math.random() * 3);
    const pattern = [];
    let t = 0;
    for (let i = 0; i < strokes; i++) {
      const on = 0.05 + Math.random() * 0.07;
      pattern.push([t, t + on, i === 0 ? 1 : 0.55 + Math.random() * 0.4]);
      t += on + 0.04 + Math.random() * 0.12;
    }
    this.strike = {
      t: 0,
      bolt,
      pattern,
      dist,
      delay: dist / 343,
      power: (bolt ? 1 : 0.55) * THREE.MathUtils.clamp(1.3 - dist / 1600, 0.35, 1) * (0.6 + 0.4 * storm),
      thundered: false,
    };
  }

  /** A forked bolt from the cloud base down to the water, as a thin ribbon of tubes. */
  #buildBolt(x, z, dist) {
    const top = 260 + Math.random() * 80;
    const pts = [new THREE.Vector3(x, top, z)];
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const p = pts[i - 1].clone();
      p.y = top * (1 - i / steps);
      p.x += (Math.random() - 0.5) * 34;
      p.z += (Math.random() - 0.5) * 34;
      pts.push(p);
    }
    const r = THREE.MathUtils.clamp(dist / 450, 0.6, 2.6);
    const geos = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 60, r, 4, false)];
    // A fork or two off the main channel.
    for (let f = 0; f < 2; f++) {
      if (Math.random() < 0.35) continue;
      const k = 3 + Math.floor(Math.random() * 6);
      const branch = [pts[k].clone()];
      for (let i = 1; i <= 4; i++) {
        const p = branch[i - 1].clone();
        p.y -= 22 + Math.random() * 18;
        p.x += (Math.random() - 0.5) * 40;
        p.z += (Math.random() - 0.5) * 40;
        branch.push(p);
      }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branch), 16, r * 0.6, 4, false));
    }
    this.bolt.geometry.dispose();
    this.bolt.geometry = mergeTubes(geos);
  }
}

function mergeTubes(geos) {
  let n = 0;
  let m = 0;
  for (const g of geos) {
    n += g.attributes.position.count;
    m += g.index.count;
  }
  const pos = new Float32Array(n * 3);
  const idx = new Uint32Array(m);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
