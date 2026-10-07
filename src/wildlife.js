import * as THREE from 'three';
import { heightAt } from '../shared/waves.js';
import { ISLAND_BY_ID, groundAt, toWorld } from '../shared/world.js';
import { mulberry32 } from '../shared/noise.js';
import { paint, mergeParts } from './props.js';

// Life about the islands: gulls overhead and on the water, gannets diving off
// the Stack, dolphins that come to ride the bow, turtles in the lagoons, seals
// on the rocks, and shoals of small fish in the shallows (drawn by the water
// shader; this file moves them). None of it is shared between players, so it
// runs on its own clock.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

function mesh(parts, { shadow = true } = {}) {
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = shadow;
  return m;
}

function ellipsoid(sx, sy, sz, color, [x, y, z] = [0, 0, 0], detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, color);
}

/** A flat, tapering wing along +x (side 1) or −x (side −1), tip in its own colour. */
function wingGeometry(side, span, chord, base, tip) {
  const s = side;
  const tri = (pts, color) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.computeVertexNormals();
    return paint(g, color);
  };
  const a = span * 0.62;
  const inner = [
    [0, 0, chord * 0.5], [s * a, 0, chord * 0.35], [s * a, 0, -chord * 0.4],
    [0, 0, chord * 0.5], [s * a, 0, -chord * 0.4], [0, 0, -chord * 0.5],
  ];
  const outer = [
    [s * a, 0, chord * 0.35], [s * span, 0.02, -chord * 0.15], [s * a, 0, -chord * 0.4],
  ];
  return mergeParts([tri(inner, base), tri(outer, tip)]);
}

// ---------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------

const BIRDS = {
  gull: { body: '#f3f2ee', wing: '#b9c0c5', tip: '#2a2a2a', head: '#f6f5f1', bill: '#e2b23a', span: 0.72, size: 1 },
  gannet: { body: '#f4f2ea', wing: '#f4f2ea', tip: '#1e1e1e', head: '#e6d49c', bill: '#9aa3a8', span: 0.95, size: 1.2 },
};

function birdModel(kind) {
  const c = BIRDS[kind];
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const parts = [
    ellipsoid(0.1, 0.095, 0.3, c.body),
    ellipsoid(0.075, 0.075, 0.085, c.head, [0, 0.06, 0.26]),
    ellipsoid(0.06, 0.02, 0.12, c.body, [0, 0.01, -0.3]),
  ];
  const bill = new THREE.ConeGeometry(0.022, 0.14, 4);
  bill.rotateX(Math.PI / 2);
  bill.translate(0, 0.05, 0.38);
  parts.push(paint(bill, c.bill));
  const body = mesh(parts);
  root.add(body);
  const wings = [1, -1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.07, 0.04, 0.04);
    pivot.add(mesh([wingGeometry(side, c.span, 0.24, c.wing, c.tip)]));
    root.add(pivot);
    return pivot;
  });
  root.scale.setScalar(c.size);
  return { root, wings };
}

/** Wings: flap (angle swings), glide (held out, a little raised) or folded along the back. */
function poseWings(b, dt, how) {
  b.flap += dt * TAU * (how === 'flap' ? 2.6 : 0);
  let up = 0.1;
  let fold = 0;
  if (how === 'flap') up = Math.sin(b.flap) * 0.75 + 0.15;
  if (how === 'fold') {
    up = 0.15;
    fold = 1.35;
  }
  if (how === 'dive') {
    up = 0.05;
    fold = 0.9;
  }
  const k = 1 - Math.exp(-dt * 12);
  b.wingUp += (up - b.wingUp) * (how === 'flap' ? 1 : k);
  b.wingFold += (fold - b.wingFold) * k;
  b.model.wings[0].rotation.set(0, b.wingFold, b.wingUp);
  b.model.wings[1].rotation.set(0, -b.wingFold, -b.wingUp);
}

/** Circle round a centre, banking, flapping now and then and gliding in between. */
function soar(b, dt, time, center) {
  b.ang += (b.dir * b.speed * dt) / b.R;
  const R = b.R * (1 + 0.18 * Math.sin(time * 0.11 + b.seed));
  const x = center.x + Math.cos(b.ang) * R;
  const z = center.z + Math.sin(b.ang) * R;
  const y = center.y + b.alt + Math.sin(time * 0.37 + b.seed * 3) * 2.2;
  const r = b.model.root;
  const vx = x - r.position.x;
  const vz = z - r.position.z;
  const vy = y - r.position.y;
  r.position.set(x, y, z);
  if (vx * vx + vz * vz > 1e-6) {
    r.rotation.y = lerpAngle(r.rotation.y, Math.atan2(vx, vz), Math.min(1, dt * 6));
    r.rotation.x = THREE.MathUtils.lerp(r.rotation.x, -Math.atan2(vy, Math.hypot(vx, vz)) * 0.8, Math.min(1, dt * 4));
  }
  r.rotation.z = THREE.MathUtils.lerp(r.rotation.z, b.dir * 0.32, Math.min(1, dt * 3));
  b.flapT -= dt;
  if (b.flapT <= 0) {
    b.flapping = !b.flapping;
    b.flapT = b.flapping ? 0.8 + Math.random() * 1.2 : 2 + Math.random() * 4;
  }
  poseWings(b, dt, b.flapping || vy > 0.05 ? 'flap' : 'glide');
}

// ---------------------------------------------------------------------------
// Sea creatures
// ---------------------------------------------------------------------------

function dolphinModel() {
  const parts = [
    ellipsoid(0.3, 0.3, 1.05, '#6f7b85', [0, 0, 0], 2),
    ellipsoid(0.24, 0.16, 0.8, '#c9cfd2', [0, -0.13, 0.08], 2),
    ellipsoid(0.11, 0.09, 0.3, '#6f7b85', [0, -0.05, 1.12]),
  ];
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.22, 0.25, 0, 0.6, -0.15, 0, 0.22, -0.35], 3));
  fin.computeVertexNormals();
  parts.push(paint(fin, '#5f6a73'));
  const flukes = new THREE.BoxGeometry(0.75, 0.04, 0.24);
  flukes.translate(0, 0, -1.12);
  parts.push(paint(flukes, '#5f6a73'));
  for (const s of [-1, 1]) {
    const pec = new THREE.BoxGeometry(0.34, 0.03, 0.14);
    pec.rotateZ(s * 0.5);
    pec.translate(s * 0.3, -0.16, 0.45);
    parts.push(paint(pec, '#5f6a73'));
  }
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(mesh(parts));
  return g;
}

function turtleModel() {
  const parts = [
    ellipsoid(0.42, 0.14, 0.52, '#6b6a3c', [0, 0, 0], 1),
    ellipsoid(0.36, 0.06, 0.44, '#c9b98a', [0, -0.07, 0], 1),
    ellipsoid(0.11, 0.09, 0.14, '#7d8a5a', [0, 0.02, 0.6]),
  ];
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(mesh(parts));
  const flippers = [];
  for (const [x, z, l] of [[0.38, 0.28, 0.42], [-0.38, 0.28, 0.42], [0.3, -0.38, 0.22], [-0.3, -0.38, 0.22]]) {
    const p = new THREE.Group();
    p.position.set(x, -0.04, z);
    const f = ellipsoid(l / 2, 0.025, 0.09, '#7d8a5a', [Math.sign(x) * l * 0.45, 0, 0]);
    p.add(mesh([f], { shadow: false }));
    g.add(p);
    flippers.push(p);
  }
  g.userData.flippers = flippers;
  return g;
}

function sealModel() {
  const parts = [
    ellipsoid(0.34, 0.31, 0.72, '#6e675e', [0, 0.3, 0], 2),
    ellipsoid(0.2, 0.17, 0.42, '#6e675e', [0, 0.33, -0.72], 1),
    ellipsoid(0.27, 0.12, 0.6, '#8a8276', [0, 0.12, 0.02], 1),
  ];
  for (const s of [-1, 1]) {
    const f = new THREE.BoxGeometry(0.22, 0.04, 0.16);
    f.rotateY(s * 0.6);
    f.translate(s * 0.14, 0.4, -1.1);
    parts.push(paint(f, '#5c564f'));
    const fore = new THREE.BoxGeometry(0.2, 0.04, 0.12);
    fore.translate(s * 0.36, 0.08, 0.32);
    parts.push(paint(fore, '#5c564f'));
  }
  const g = new THREE.Group();
  g.add(mesh(parts));
  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.64);
  const hp = [ellipsoid(0.18, 0.17, 0.2, '#6e675e'), ellipsoid(0.1, 0.08, 0.1, '#5f5951', [0, -0.03, 0.17])];
  for (const s of [-1, 1]) hp.push(ellipsoid(0.025, 0.025, 0.02, '#141414', [s * 0.09, 0.05, 0.14]));
  head.add(mesh(hp));
  g.add(head);
  g.userData.head = head;
  return g;
}

function smallFishModel() {
  const parts = [ellipsoid(0.04, 0.06, 0.16, '#b9c4c8', [0, 0, 0], 1)];
  const tail = new THREE.ConeGeometry(0.06, 0.1, 3);
  tail.rotateX(Math.PI / 2);
  tail.scale(0.3, 1, 1);
  tail.translate(0, 0, -0.18);
  parts.push(paint(tail, '#8c999e'));
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(mesh(parts, { shadow: false }));
  return g;
}

// ---------------------------------------------------------------------------
// Splashes: a handful of white droplets thrown up and falling back.
// ---------------------------------------------------------------------------

class Splashes {
  constructor(scene) {
    this.max = 160;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshLambertMaterial({ color: '#f4f8f8' }), this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.drops = [];
    this.m = new THREE.Matrix4();
    scene.add(this.mesh);
  }

  spawn(x, y, z, n = 10, power = 1) {
    for (let i = 0; i < n && this.drops.length < this.max; i++) {
      const a = Math.random() * TAU;
      const s = (0.6 + Math.random()) * power;
      this.drops.push({ p: V(x, y, z), v: V(Math.cos(a) * s, (2 + Math.random() * 2.5) * power, Math.sin(a) * s), life: 0, size: 0.6 + Math.random() * 0.8 });
    }
  }

  update(dt) {
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life += dt;
      d.v.y -= 9.8 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.life > 1.1) {
        this.drops.splice(i, 1);
        continue;
      }
      const s = d.size * (1 - d.life / 1.1);
      this.m.makeScale(s, s, s).setPosition(d.p);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------

/** Spots in shallow, clear water where shoals live (island, local x, z). */
const SHOAL_HOMES = [
  ['saddle', 10, 262], ['saddle', 40, 228], ['horseshoe', 0, 0], ['horseshoe', 22, 12],
  ['reef', 2, 2], ['bar', 0, 30], ['sow', -60, 2], ['burnt', -120, 0],
];

/** Where gulls wheel about (island, local x, z, altitude, radius, how many). */
const GULL_ROOSTS = [
  ['saddle', 25, 215, 16, 30, 2], ['saddle', -70, -30, 118, 45, 1], ['horseshoe', 0, 0, 34, 60, 2],
  ['bar', 0, 0, 14, 40, 2], ['reef', -30, 18, 12, 35, 2], ['burnt', 0, 0, 48, 60, 1], ['sow', 0, 0, 40, 40, 2],
];

/** Gulls sitting on the water. */
const RAFTS = [['saddle', 0, 275], ['saddle', 46, 258], ['horseshoe', -20, 10], ['bar', 20, -32], ['reef', 30, 30], ['sow', -70, 12]];

/** Seals hauled out on the low rocks round the Piglets. */
const SEALS = [['sow', 44, 14, 2.4], ['sow', 47, -37, 0.6], ['sow', 29, 35, -1.2]];

const TURTLES = [['horseshoe', 10, 4], ['reef', 0, 0]];

const world = (id, x, z) => toWorld(ISLAND_BY_ID[id], x, z);

export class Wildlife {
  constructor({ scene, audio = null }) {
    this.scene = scene;
    this.audio = audio;
    this.time = 0;
    this.group = new THREE.Group();
    this.group.name = 'wildlife';
    scene.add(this.group);
    this.splashes = new Splashes(scene);
    const rand = (this.rand = mulberry32(4242));

    // Shoals: the water shader draws them; this moves them.
    this.shoals = SHOAL_HOMES.map(([id, lx, lz], i) => {
      const h = world(id, lx, lz);
      return { home: V(h.x, 0, h.z), pos: V(h.x, 0, h.z), heading: rand() * TAU, radius: 3 + rand() * 2.5, seed: i * 7.1, flee: 0, leapT: 2 + rand() * 6 };
    });

    // Gulls wheeling over the islands, and two that keep the boat company.
    this.flyers = [];
    for (const [id, lx, lz, alt, R, n] of GULL_ROOSTS) {
      const c = world(id, lx, lz);
      for (let i = 0; i < n; i++) this.#addFlyer('gull', V(c.x, 0, c.z), { alt: alt + rand() * 8, R: R * (0.7 + rand() * 0.6) });
    }
    this.boatGulls = [0, 1].map(() => this.#addFlyer('gull', V(), { alt: 11 + rand() * 4, R: 14 + rand() * 8, boat: true }));

    // Gannets off the Stack: circle high, then fold and plunge.
    const stack = ISLAND_BY_ID.stack;
    const sea = world('stack', 70, 10);
    this.gannets = [0, 1, 2].map((i) => {
      const b = this.#addFlyer('gannet', V(sea.x, 0, sea.z), { alt: 24 + rand() * 8, R: 26 + rand() * 14 });
      b.state = 'soar';
      b.diveT = 6 + i * 5 + rand() * 8;
      b.isle = stack;
      return b;
    });

    // Gulls sitting on the water, who take off if you come too close.
    this.rafts = RAFTS.map(([id, lx, lz]) => {
      const c = world(id, lx, lz);
      const b = this.#addFlyer('gull', V(c.x, 0, c.z), { alt: 9, R: 14 });
      b.state = 'sit';
      b.seat = V(c.x + (rand() - 0.5) * 6, 0, c.z + (rand() - 0.5) * 6);
      b.model.root.position.copy(b.seat);
      b.model.root.rotation.y = rand() * TAU;
      return b;
    });

    // A pod of dolphins.
    const podAng = rand() * TAU;
    this.pod = { ang: podAng, pos: V(Math.cos(podAng) * 380, 0, Math.sin(podAng) * 380), heading: podAng + Math.PI / 2, speed: 4.5, ride: 0, cool: 0 };
    this.dolphins = [[-2.2, 0.5], [2.0, -1.0], [0.3, -3.6]].map(([sx, sz], i) => {
      const m = dolphinModel();
      m.visible = false;
      this.group.add(m);
      return { m, off: V(sx, 0, sz), period: 2.7 + i * 0.35, phase: rand() };
    });

    // Turtles in the lagoons.
    this.turtles = TURTLES.map(([id, lx, lz], i) => {
      const c = world(id, lx, lz);
      const m = turtleModel();
      this.group.add(m);
      return { m, home: V(c.x, 0, c.z), pos: V(c.x, 0, c.z), heading: rand() * TAU, cycle: rand() * 20, seed: i * 3.3 };
    });

    // Seals.
    this.seals = SEALS.map(([id, lx, lz, yaw]) => {
      const c = world(id, lx, lz);
      const m = sealModel();
      m.position.set(c.x, groundAt(c.x, c.z) - 0.04, c.z);
      m.rotation.y = yaw;
      this.group.add(m);
      return { m, seat: m.position.clone(), yaw, state: 'lie', t: rand() * 5, gone: 0 };
    });

    this.leaper = smallFishModel();
    this.leaper.visible = false;
    this.group.add(this.leaper);
    this.leap = null;
    this.callT = 4;
  }

  #addFlyer(kind, center, { alt, R, boat = false }) {
    const model = birdModel(kind);
    this.group.add(model.root);
    const b = {
      kind, model, center, alt, R, boat,
      ang: this.rand() * TAU, dir: this.rand() < 0.5 ? 1 : -1, speed: kind === 'gannet' ? 9 : 7,
      seed: this.rand() * 10, flap: this.rand() * TAU, flapT: this.rand() * 2, flapping: true, wingUp: 0, wingFold: 0, state: 'soar',
    };
    this.flyers.push(b);
    return b;
  }

  /** Is there a shoal within r metres of (x, z)? Fish bite quicker there. */
  shoalNear(x, z, r = 12) {
    return this.shoals.some((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < r + s.radius);
  }

  /** Shoal positions for the water shader (vec4: x, z, heading, radius). */
  writeShoals(out) {
    this.shoals.forEach((s, i) => out[i]?.set(s.pos.x, s.pos.z, s.heading, s.radius));
  }

  update(dt, { t, waveScale, camera, player, boat }) {
    this.time += dt;
    const time = this.time;
    const cam = (this.cam = camera.position);
    const water = (x, z) => heightAt(x, z, t, waveScale);
    const near = (p, r) => Math.hypot(p.x - cam.x, p.z - cam.z) < r;
    const swimmer = player?.mode === 'swim' ? player.pos : null;

    // --- Shoals: drift about home, turn away from a swimmer ---
    for (const s of this.shoals) {
      const wx = Math.sin(time * 0.05 + s.seed) * 14 + Math.sin(time * 0.13 + s.seed * 2) * 5;
      const wz = Math.cos(time * 0.04 + s.seed * 1.3) * 14 + Math.cos(time * 0.11 + s.seed) * 5;
      const want = V(s.home.x + wx, 0, s.home.z + wz);
      if (swimmer && Math.hypot(swimmer.x - s.pos.x, swimmer.z - s.pos.z) < 7) {
        s.flee = 2.5;
        s.fleeDir = V(s.pos.x - swimmer.x, 0, s.pos.z - swimmer.z).normalize();
      }
      if (s.flee > 0) {
        s.flee -= dt;
        want.copy(s.pos).addScaledVector(s.fleeDir, 10);
      }
      const d = want.sub(s.pos);
      const speed = s.flee > 0 ? 3.5 : 0.9;
      if (d.lengthSq() > 0.01) {
        s.heading = lerpAngle(s.heading, Math.atan2(d.z, d.x), Math.min(1, dt * 1.5));
        const nx = s.pos.x + Math.cos(s.heading) * speed * dt;
        const nz = s.pos.z + Math.sin(s.heading) * speed * dt;
        if (groundAt(nx, nz) < -1.0) s.pos.set(nx, 0, nz);
        else s.heading += 1.5 * dt;
      }
      // Now and then one jumps clear.
      s.leapT -= dt;
      if (s.leapT <= 0 && !this.leap && near(s.pos, 90)) {
        const a = Math.random() * TAU;
        const from = V(s.pos.x + (Math.random() - 0.5) * s.radius, 0, s.pos.z + (Math.random() - 0.5) * s.radius);
        this.leap = { from, dir: V(Math.cos(a), 0, Math.sin(a)), u: 0 };
        this.splashes.spawn(from.x, water(from.x, from.z), from.z, 4, 0.45);
        s.leapT = 4 + Math.random() * 8;
      }
    }
    this.#updateLeap(dt, water);

    // --- Birds ---
    for (const b of this.flyers) {
      const r = b.model.root;
      if (b.boat && boat) {
        b.center.set(boat.state.x, 0, boat.state.z);
      }
      const far = !near(r.position, 700);
      r.visible = !far;
      if (far && b.state === 'soar') {
        b.ang += (b.dir * b.speed * dt) / b.R;
        continue;
      }
      if (b.kind === 'gannet') this.#gannet(b, dt, time, water);
      else if (b.state === 'sit' || b.state === 'up' || b.state === 'down') this.#raft(b, dt, time, water, player, boat);
      else soar(b, dt, time, b.center);
    }

    // A gull calls now and then when one's close.
    this.callT -= dt;
    if (this.callT <= 0) {
      this.callT = 5 + Math.random() * 10;
      const close = this.flyers.find((b) => b.kind === 'gull' && b.model.root.position.distanceTo(cam) < 45);
      if (close) this.audio?.gull?.();
    }

    this.#updatePod(dt, time, water, boat, near);
    this.#updateTurtles(dt, time, water, near);
    this.#updateSeals(dt, time, water, player);
    this.splashes.update(dt);
  }

  #updateLeap(dt, water) {
    const l = this.leap;
    if (!l) {
      this.leaper.visible = false;
      return;
    }
    l.u += dt / 0.75;
    const k = Math.min(1, l.u);
    const x = l.from.x + l.dir.x * 1.6 * k;
    const z = l.from.z + l.dir.z * 1.6 * k;
    const y = water(x, z) - 0.1 + Math.sin(Math.PI * k) * 0.75;
    this.leaper.visible = true;
    this.leaper.position.set(x, y, z);
    this.leaper.rotation.y = Math.atan2(l.dir.x, l.dir.z);
    this.leaper.rotation.x = -Math.cos(Math.PI * k) * 0.9;
    this.leaper.rotation.z = Math.sin(k * 20) * 0.2;
    if (k >= 1) {
      this.splashes.spawn(x, water(x, z), z, 5, 0.4);
      this.leap = null;
      this.leaper.visible = false;
    }
  }

  #gannet(b, dt, time, water) {
    const r = b.model.root;
    if (b.state === 'soar') {
      soar(b, dt, time, b.center);
      b.diveT -= dt;
      if (b.diveT <= 0) {
        b.state = 'dive';
        b.vel = V(Math.sin(r.rotation.y) * 6, -4, Math.cos(r.rotation.y) * 6);
      }
    } else if (b.state === 'dive') {
      // Wings back, straight down like a dart.
      b.vel.y = Math.max(b.vel.y - 14 * dt, -24);
      b.vel.x *= 1 - dt * 0.8;
      b.vel.z *= 1 - dt * 0.8;
      r.position.addScaledVector(b.vel, dt);
      r.rotation.x = THREE.MathUtils.lerp(r.rotation.x, 1.35, Math.min(1, dt * 5));
      r.rotation.z = 0;
      poseWings(b, dt, 'dive');
      const w = water(r.position.x, r.position.z);
      if (r.position.y <= w) {
        this.splashes.spawn(r.position.x, w, r.position.z, 14, 1.1);
        if (r.position.distanceTo(this.cam) < 60) this.audio?.splash(0.25, 1300, 0.5);
        b.state = 'under';
        b.t = 1.6 + Math.random();
        r.visible = false;
      }
    } else if (b.state === 'under') {
      b.t -= dt;
      r.visible = false;
      if (b.t <= 0) {
        b.state = 'float';
        b.t = 3 + Math.random() * 3;
      }
    } else if (b.state === 'float') {
      r.visible = true;
      b.t -= dt;
      r.position.y = water(r.position.x, r.position.z) + 0.02;
      r.rotation.x = 0;
      r.rotation.z = 0;
      poseWings(b, dt, 'fold');
      if (b.t <= 0) {
        b.state = 'climb';
        b.t = 0;
      }
    } else if (b.state === 'climb') {
      // Patter off the water and climb back up to the others.
      b.t += dt;
      const target = V(b.center.x + Math.cos(b.ang) * b.R, b.center.y + b.alt, b.center.z + Math.sin(b.ang) * b.R);
      const d = target.clone().sub(r.position);
      const step = Math.min(d.length(), 8 * dt);
      const heading = Math.atan2(d.x, d.z);
      r.rotation.y = lerpAngle(r.rotation.y, heading, Math.min(1, dt * 2));
      r.rotation.x = THREE.MathUtils.lerp(r.rotation.x, -0.35, Math.min(1, dt * 3));
      r.position.addScaledVector(d.normalize(), step);
      poseWings(b, dt, 'flap');
      if (step < 0.05 || b.t > 12) {
        b.state = 'soar';
        b.diveT = 10 + Math.random() * 18;
      }
    }
  }

  #raft(b, dt, time, water, player, boat) {
    const r = b.model.root;
    const threats = [player?.pos, boat ? V(boat.state.x, 0, boat.state.z) : null].filter(Boolean);
    const close = threats.some((p) => Math.hypot(p.x - b.seat.x, p.z - b.seat.z) < (p === player?.pos ? 9 : 16));
    if (b.state === 'sit') {
      r.position.x = b.seat.x + Math.sin(time * 0.2 + b.seed) * 0.4;
      r.position.z = b.seat.z + Math.cos(time * 0.17 + b.seed) * 0.4;
      r.position.y = water(r.position.x, r.position.z) + 0.03;
      r.rotation.x = 0;
      r.rotation.z = Math.sin(time * 1.3 + b.seed) * 0.08;
      poseWings(b, dt, 'fold');
      if (close) {
        b.state = 'up';
        b.t = 0;
        b.center.copy(b.seat);
        b.ang = Math.atan2(r.position.z - b.seat.z, r.position.x - b.seat.x);
        this.splashes.spawn(r.position.x, r.position.y, r.position.z, 3, 0.35);
      }
    } else if (b.state === 'up') {
      b.t += dt;
      soar(b, dt, time, b.center);
      // Ease up from the water rather than snap to the circle.
      const lift = Math.min(1, b.t / 3);
      r.position.y = THREE.MathUtils.lerp(water(r.position.x, r.position.z) + 0.1, r.position.y, lift);
      if (b.t > 25 && !close) {
        b.state = 'down';
        b.t = 0;
      }
    } else if (b.state === 'down') {
      // Glide back in and settle.
      const d = b.seat.clone().sub(r.position);
      d.y = water(b.seat.x, b.seat.z) - r.position.y;
      const l = d.length();
      if (l < 0.3) {
        b.state = 'sit';
        return;
      }
      r.position.addScaledVector(d.normalize(), Math.min(l, 6 * dt));
      r.rotation.y = lerpAngle(r.rotation.y, Math.atan2(d.x, d.z), Math.min(1, dt * 3));
      r.rotation.x = 0.15;
      r.rotation.z = 0;
      poseWings(b, dt, l < 3 ? 'flap' : 'glide');
      if (close) b.state = 'up';
    }
  }

  #updatePod(dt, time, water, boat, near) {
    const p = this.pod;
    const b = boat?.state;
    const sog = b ? b.sog : 0;
    const boatPos = b ? V(b.x, 0, b.z) : null;
    p.cool = Math.max(0, p.cool - dt);
    if (b && p.ride <= 0 && p.cool <= 0 && sog > 2 && boatPos.distanceTo(V(p.pos.x, 0, p.pos.z)) < 160) p.ride = 50 + Math.random() * 40;
    let target;
    if (p.ride > 0 && b) {
      // Ride the bow wave, just off to one side.
      p.ride -= dt;
      if (p.ride <= 0 || sog < 1) {
        p.ride = 0;
        p.cool = 120;
      }
      const f = V(Math.cos(b.heading), 0, Math.sin(b.heading));
      target = boatPos.clone().addScaledVector(f, 7).add(V(-f.z, 0, f.x).multiplyScalar(3.2));
      p.speed = THREE.MathUtils.lerp(p.speed, Math.max(4, sog + (target.distanceTo(p.pos) > 4 ? 2.5 : 0)), Math.min(1, dt));
    } else {
      // Otherwise a long loop round the outside of the islands.
      p.ang += dt * 0.006;
      target = V(Math.cos(p.ang) * 380, 0, Math.sin(p.ang) * 380);
      p.speed = THREE.MathUtils.lerp(p.speed, 4.5, Math.min(1, dt * 0.5));
    }
    const d = target.clone().sub(p.pos);
    if (d.lengthSq() > 1) p.heading = lerpAngle(p.heading, Math.atan2(d.z, d.x), Math.min(1, dt * 1.2));
    p.pos.x += Math.cos(p.heading) * p.speed * dt;
    p.pos.z += Math.sin(p.heading) * p.speed * dt;
    const f = V(Math.cos(p.heading), 0, Math.sin(p.heading));
    const side = V(-f.z, 0, f.x);
    const show = near(p.pos, 500);
    for (const d of this.dolphins) {
      const k = ((time / d.period + d.phase) % 1 + 1) % 1;
      const x = p.pos.x + side.x * d.off.x + f.x * d.off.z;
      const z = p.pos.z + side.z * d.off.x + f.z * d.off.z;
      // Up for a breath for a third of each cycle; under the rest of it.
      const u = k / 0.36;
      if (!show || u > 1 || groundAt(x, z) > -3) {
        d.m.visible = false;
        d.up = false;
        continue;
      }
      const w = water(x, z);
      d.m.visible = true;
      d.m.position.set(x + f.x * (u - 0.5) * 1.5, w - 0.55 + Math.sin(Math.PI * u) * 0.95, z + f.z * (u - 0.5) * 1.5);
      d.m.rotation.y = Math.atan2(f.x, f.z);
      d.m.rotation.x = Math.cos(Math.PI * u) * -0.55;
      if (!d.up && near(d.m.position, 80)) this.splashes.spawn(x, w, z, 4, 0.5);
      d.up = true;
    }
  }

  #updateTurtles(dt, time, water, near) {
    for (const tu of this.turtles) {
      tu.cycle = (tu.cycle + dt) % 22;
      const up = tu.cycle < 8;
      // Paddle slowly round the lagoon.
      const wx = Math.sin(time * 0.02 + tu.seed) * 18;
      const wz = Math.cos(time * 0.025 + tu.seed) * 18;
      const d = V(tu.home.x + wx - tu.pos.x, 0, tu.home.z + wz - tu.pos.z);
      tu.heading = lerpAngle(tu.heading, Math.atan2(d.x, d.z), Math.min(1, dt * 0.4));
      const nx = tu.pos.x + Math.sin(tu.heading) * 0.5 * dt;
      const nz = tu.pos.z + Math.cos(tu.heading) * 0.5 * dt;
      if (groundAt(nx, nz) < -1.2) tu.pos.set(nx, 0, nz);
      else tu.heading += dt;
      const m = tu.m;
      m.visible = up && near(tu.pos, 300);
      if (!m.visible) continue;
      const rise = Math.min(1, tu.cycle / 1.2, (8 - tu.cycle) / 1.2);
      m.position.set(tu.pos.x, water(tu.pos.x, tu.pos.z) - 0.42 + 0.32 * rise, tu.pos.z);
      m.rotation.y = tu.heading;
      m.rotation.x = Math.sin(time * 0.6 + tu.seed) * 0.05;
      const [a, b, c, e] = m.userData.flippers;
      const s = Math.sin(time * 1.6 + tu.seed) * 0.5;
      a.rotation.set(0, s * 0.6, s);
      b.rotation.set(0, -s * 0.6, -s);
      c.rotation.z = s * 0.4;
      e.rotation.z = -s * 0.4;
    }
  }

  #updateSeals(dt, time, water, player) {
    for (const s of this.seals) {
      const m = s.m;
      const close = player && player.mode !== 'station' && Math.hypot(player.pos.x - s.seat.x, player.pos.z - s.seat.z) < 7;
      if (s.state === 'lie') {
        s.t += dt;
        // Lift the head and look round every so often.
        const look = Math.max(0, Math.sin(s.t * 0.35));
        m.userData.head.rotation.x = -0.5 * look;
        m.userData.head.rotation.y = Math.sin(s.t * 0.5) * 0.6 * look;
        m.scale.y = 1 + Math.sin(s.t * 1.4) * 0.015;
        if (close) {
          // Off into the sea: shuffle toward deeper water.
          s.state = 'flee';
          let best = null;
          for (let a = 0; a < TAU; a += TAU / 16) {
            const p = V(s.seat.x + Math.cos(a) * 6, 0, s.seat.z + Math.sin(a) * 6);
            if (!best || groundAt(p.x, p.z) < groundAt(best.x, best.z)) best = p;
          }
          s.to = best;
        }
      } else if (s.state === 'flee') {
        const d = s.to.clone().sub(m.position);
        d.y = 0;
        m.rotation.y = lerpAngle(m.rotation.y, Math.atan2(d.x, d.z), Math.min(1, dt * 4));
        m.position.addScaledVector(d.normalize(), 1.8 * dt);
        const g = groundAt(m.position.x, m.position.z);
        const w = water(m.position.x, m.position.z);
        m.position.y = Math.max(g - 0.04, w - 0.3);
        if (w - g > 0.5) {
          this.splashes.spawn(m.position.x, w, m.position.z, 8, 0.7);
          s.state = 'gone';
          s.gone = 40 + Math.random() * 30;
          m.visible = false;
        }
      } else if (s.state === 'gone') {
        s.gone -= dt;
        const away = !player || Math.hypot(player.pos.x - s.seat.x, player.pos.z - s.seat.z) > 25;
        if (s.gone <= 0 && away) {
          s.state = 'lie';
          m.visible = true;
          m.position.copy(s.seat);
          m.rotation.y = s.yaw;
        }
      }
    }
  }
}

