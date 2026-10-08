import * as THREE from 'three';
import { ISLANDS, groundAt } from '../shared/world.js';
import { mulberry32 } from '../shared/noise.js';
import { paint, mergeParts, segment } from './props.js';
import { surfaceKind } from './terrain.js';
import { crabModel } from './treasure.js';

// Small life ashore: crabs on the beaches that scuttle off and burrow,
// sandpipers running at the water's edge, butterflies over the grass, goats
// grazing the hills, lizards sunning on the rocks, and fireflies in the woods
// at night. All of it minds its own business until you come close.
//
// Only the islands near the camera are kept moving.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function blob(sx, sy, sz, color, [x, y, z] = [0, 0, 0]) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, color);
}

const mesh = (parts, shadow = true) => {
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = shadow;
  return m;
};

function goatModel(coat) {
  const g = new THREE.Group();
  g.add(mesh([blob(0.22, 0.24, 0.46, coat, [0, 0.62, 0]), blob(0.05, 0.08, 0.06, coat, [0, 0.72, -0.48])]));
  const neck = new THREE.Group();
  neck.position.set(0, 0.74, 0.36);
  const head = [blob(0.1, 0.11, 0.19, coat, [0, 0.18, 0.12]), blob(0.04, 0.07, 0.04, '#d8d2c4', [0, 0.04, 0.24])];
  for (const s of [-1, 1]) {
    head.push(paint(segment(V(s * 0.05, 0.27, 0.08), V(s * 0.1, 0.42, -0.08), 0.022, 0.008, 4), '#5a5046'));
    head.push(blob(0.06, 0.02, 0.035, coat, [s * 0.11, 0.2, 0.06]));
    head.push(blob(0.014, 0.014, 0.012, '#151311', [s * 0.07, 0.22, 0.2]));
  }
  head.push(paint(segment(V(0, 0.15, 0), V(0, 0.08, 0.1), 0.06, 0.07, 6), coat));
  neck.add(mesh(head));
  g.add(neck);
  const legs = [[-0.13, 0.32], [0.13, 0.32], [-0.13, -0.3], [0.13, -0.3]].map(([x, z]) => {
    const p = new THREE.Group();
    p.position.set(x, 0.52, z);
    p.add(mesh([paint(segment(V(0, 0, 0), V(0, -0.52, 0), 0.035, 0.025, 5), coat), blob(0.03, 0.025, 0.035, '#2e2925', [0, -0.52, 0.01])]));
    g.add(p);
    return p;
  });
  g.userData = { neck, legs };
  return g;
}

function piperModel() {
  const g = new THREE.Group();
  const bill = new THREE.ConeGeometry(0.008, 0.07, 4);
  bill.rotateX(Math.PI / 2);
  bill.translate(0, 0.13, 0.13);
  g.add(mesh([blob(0.05, 0.05, 0.09, '#9a8a74', [0, 0.11, 0]), blob(0.045, 0.035, 0.07, '#f2eee4', [0, 0.095, 0.01]), blob(0.035, 0.035, 0.04, '#8c7c66', [0, 0.14, 0.08]), paint(bill, '#2b2621')], false));
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.02, 0.08, 0);
    p.add(mesh([paint(segment(V(0, 0, 0), V(0, -0.08, 0.01), 0.005, 0.005, 3), '#3b3a36')], false));
    g.add(p);
    return p;
  });
  g.userData = { legs };
  return g;
}

const WING_COLORS = ['#f2efe2', '#f2d24b', '#e98a3c', '#a6c6e8'];
function butterflyModel(color) {
  const g = new THREE.Group();
  const wing = (s) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(s * 0.06, 0.05, s * 0.07, 0.01);
    shape.quadraticCurveTo(s * 0.06, -0.05, 0, -0.02);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const p = new THREE.Group();
    p.add(new THREE.Mesh(paint(geo, color), mat));
    g.add(p);
    return p;
  };
  g.add(mesh([blob(0.006, 0.006, 0.03, '#2b2620')], false));
  g.userData = { wings: [wing(1), wing(-1)] };
  return g;
}

function lizardModel() {
  const tail = new THREE.ConeGeometry(0.02, 0.16, 5);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0.02, -0.15);
  const parts = [blob(0.03, 0.018, 0.08, '#6f7650', [0, 0.02, 0]), blob(0.022, 0.016, 0.03, '#6f7650', [0, 0.025, 0.09]), paint(tail, '#666b48')];
  for (const [x, z] of [[0.035, 0.05], [-0.035, 0.05], [0.035, -0.04], [-0.035, -0.04]]) parts.push(blob(0.025, 0.006, 0.008, '#5f6542', [x, 0.006, z]));
  const g = new THREE.Group();
  g.add(mesh(parts, false));
  return g;
}

// How many of each, island by island.
const PLAN = {
  saddle: { crabs: 8, pipers: 5, butterflies: 10, goats: 4, flies: 40 },
  horseshoe: { crabs: 5, pipers: 4, butterflies: 3 },
  bar: { crabs: 6, pipers: 5 },
  reef: { crabs: 4, pipers: 3 },
  burnt: { crabs: 3, goats: 3, lizards: 3 },
  stack: { lizards: 2 },
  sow: { crabs: 2, lizards: 2 },
  head: { crabs: 3, butterflies: 5, goats: 3 },
  kettle: { crabs: 4, butterflies: 4, goats: 3, lizards: 2 },
  brothers: { crabs: 2, lizards: 2 },
  green: { crabs: 6, pipers: 4, butterflies: 8, flies: 40 },
};

export class IslandLife {
  constructor({ scene }) {
    this.group = new THREE.Group();
    this.group.name = 'island-life';
    scene.add(this.group);
    this.isles = ISLANDS.filter((i) => PLAN[i.id]).map((isl) => this.#populate(isl));
  }

  /** Find spots on an island where kind(...) is true. */
  #spots(isl, n, rand, test) {
    const out = [];
    const nrm = V();
    for (let tries = 0; tries < n * 400 && out.length < n; tries++) {
      const a = rand() * TAU;
      const r = Math.sqrt(rand()) * isl.land;
      const x = isl.x + Math.cos(a) * r;
      const z = isl.z + Math.sin(a) * r;
      const h = groundAt(x, z, nrm);
      if (h < 0.4) continue;
      if (test(surfaceKind(isl, h, nrm.y, x, z), h, nrm.y) && out.every((p) => Math.hypot(p.x - x, p.z - z) > 4)) out.push(V(x, h, z));
    }
    return out;
  }

  #populate(isl) {
    const p = PLAN[isl.id];
    const rand = mulberry32(9100 + isl.id.length * 131 + Math.round(isl.z));
    const g = new THREE.Group();
    this.group.add(g);
    const life = { isl, group: g, crabs: [], pipers: [], butterflies: [], goats: [], lizards: [], flies: null };

    for (const at of this.#spots(isl, p.crabs ?? 0, rand, (k, h) => (k === 'sand' || k === 'wet' || k === 'dune') && h < 2.2)) {
      const m = crabModel();
      m.scale.setScalar(0.7 + rand() * 0.5);
      g.add(m);
      life.crabs.push({ m, home: at, pos: at.clone(), state: 'idle', t: rand() * 5, dir: V(), yaw: rand() * TAU });
    }
    // Sandpipers keep together in a little flock.
    const beach = this.#spots(isl, 1, rand, (k, h) => (k === 'sand' || k === 'wet') && h < 1.4)[0];
    if (beach && p.pipers) {
      for (let i = 0; i < p.pipers; i++) {
        const m = piperModel();
        g.add(m);
        const home = beach.clone().add(V((rand() - 0.5) * 4, 0, (rand() - 0.5) * 4));
        life.pipers.push({ m, home, pos: home.clone(), goal: home.clone(), t: rand() * 2, yaw: rand() * TAU, fly: 0, phase: rand() * 10 });
      }
    }
    for (const at of this.#spots(isl, p.butterflies ?? 0, rand, (k) => k === 'grass')) {
      const m = butterflyModel(WING_COLORS[Math.floor(rand() * WING_COLORS.length)]);
      g.add(m);
      life.butterflies.push({ m, home: at, seed: rand() * 100 });
    }
    for (const at of this.#spots(isl, p.goats ?? 0, rand, (k, h, ny) => (k === 'grass' || k === 'scrub' || k === 'dirt') && ny > 0.75 && h > 3)) {
      const m = goatModel(rand() < 0.6 ? '#ece6d8' : rand() < 0.5 ? '#8a6a4a' : '#4a403a');
      g.add(m);
      life.goats.push({ m, home: at, pos: at.clone(), goal: at.clone(), state: 'graze', t: rand() * 6, yaw: rand() * TAU, step: 0 });
    }
    for (const at of this.#spots(isl, p.lizards ?? 0, rand, (k, h, ny) => (k === 'rock' || k === 'dirt' || k === 'sand') && ny > 0.7)) {
      const m = lizardModel();
      m.position.copy(at);
      m.rotation.y = rand() * TAU;
      g.add(m);
      life.lizards.push({ m, home: at, gone: 0, dart: 0, dir: V() });
    }
    if (p.flies) {
      const spots = this.#spots(isl, 6, rand, (k) => k === 'grass');
      const n = p.flies;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const base = [];
      for (let i = 0; i < n; i++) {
        const s = spots[i % Math.max(1, spots.length)] ?? V(isl.x, 2, isl.z);
        base.push({ x: s.x + (rand() - 0.5) * 14, y: s.y + 0.5 + rand() * 1.5, z: s.z + (rand() - 0.5) * 14, seed: rand() * 100 });
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false;
      g.add(pts);
      life.flies = { pts, base };
    }
    return life;
  }

  update(dt, { t, camera, player, night = 0 }) {
    const cam = camera.position;
    const me = player?.mode === 'station' ? null : player?.pos;
    for (const life of this.isles) {
      const isl = life.isl;
      const near = Math.hypot(isl.x - cam.x, isl.z - cam.z) < isl.land + 180;
      life.group.visible = near;
      if (!near) continue;
      const dist = (p) => (me ? Math.hypot(me.x - p.x, me.z - p.z) : Infinity);

      // Crabs: potter about; scuttle sideways away from you and burrow.
      for (const c of life.crabs) {
        c.t -= dt;
        if (c.state === 'idle') {
          if (dist(c.pos) < 3.2) {
            c.state = 'run';
            c.t = 1.1;
            c.dir.set(c.pos.x - me.x, 0, c.pos.z - me.z).normalize();
          } else if (c.t <= 0) {
            c.state = 'potter';
            c.t = 0.5 + Math.random() * 0.8;
            const a = Math.random() * TAU;
            c.dir.set(Math.cos(a), 0, Math.sin(a));
          }
        } else if (c.state === 'potter' || c.state === 'run') {
          const sp = c.state === 'run' ? 2.2 : 0.4;
          const nx = c.pos.x + c.dir.x * sp * dt;
          const nz = c.pos.z + c.dir.z * sp * dt;
          const h = groundAt(nx, nz);
          if (h > 0.3 && Math.hypot(nx - c.home.x, nz - c.home.z) < 8) c.pos.set(nx, h, nz);
          c.yaw = Math.atan2(c.dir.x, c.dir.z) + Math.PI / 2; // crabs go sideways
          if (c.t <= 0) {
            if (c.state === 'run') {
              c.state = 'burrow';
              c.t = 0.6;
            } else {
              c.state = 'idle';
              c.t = 2 + Math.random() * 5;
            }
          }
        } else if (c.state === 'burrow') {
          if (c.t <= 0) {
            c.state = 'gone';
            c.t = 15 + Math.random() * 15;
          }
        } else if (c.state === 'gone' && c.t <= 0 && dist(c.home) > 8) {
          c.state = 'idle';
          c.pos.copy(c.home);
          c.t = 2;
        }
        const sink = c.state === 'burrow' ? (1 - c.t / 0.6) * 0.2 : 0;
        c.m.visible = c.state !== 'gone';
        c.m.position.set(c.pos.x, c.pos.y - sink, c.pos.z);
        c.m.rotation.y = c.yaw + (c.state === 'idle' ? 0 : Math.sin(t * 30) * 0.08);
      }

      // Sandpipers: quick little runs and pecks; up and away if you come near.
      for (const b of life.pipers) {
        b.t -= dt;
        const d = dist(b.pos);
        if (b.fly <= 0 && d < 5) {
          b.fly = 1.4;
          const away = V(b.pos.x - me.x, 0, b.pos.z - me.z).normalize().multiplyScalar(9 + Math.random() * 4);
          const to = b.pos.clone().add(away);
          if (groundAt(to.x, to.z) > 0.3) b.goal.copy(to);
          else b.goal.copy(b.home);
          b.from = b.pos.clone();
        }
        let y = 0;
        if (b.fly > 0) {
          b.fly -= dt;
          const k = 1 - Math.max(0, b.fly) / 1.4;
          b.pos.lerpVectors(b.from, b.goal, k);
          y = Math.sin(Math.PI * k) * 2;
          if (b.fly <= 0) b.home.copy(b.goal);
        } else if (b.t <= 0) {
          // Pick a spot nearby on the sand and run to it.
          b.t = 0.6 + Math.random() * 1.6;
          const a = Math.random() * TAU;
          const to = b.home.clone().add(V(Math.cos(a) * 3, 0, Math.sin(a) * 3));
          if (groundAt(to.x, to.z) > 0.3) b.goal.copy(to);
        } else {
          const dx = b.goal.x - b.pos.x;
          const dz = b.goal.z - b.pos.z;
          const l = Math.hypot(dx, dz);
          if (l > 0.05) {
            const step = Math.min(l, 1.6 * dt);
            b.pos.x += (dx / l) * step;
            b.pos.z += (dz / l) * step;
            b.yaw = Math.atan2(dx, dz);
          }
        }
        b.pos.y = groundAt(b.pos.x, b.pos.z);
        const running = b.fly <= 0 && Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z) > 0.05;
        b.m.position.set(b.pos.x, b.pos.y + y, b.pos.z);
        b.m.rotation.set(running || y > 0 ? 0 : Math.max(0, Math.sin(t * 3 + b.phase)) * 0.5, b.yaw, 0);
        const [l, r] = b.m.userData.legs;
        l.rotation.x = running ? Math.sin(t * 30) * 0.8 : 0;
        r.rotation.x = running ? -Math.sin(t * 30) * 0.8 : 0;
      }

      // Butterflies: flutter about over the grass.
      for (const f of life.butterflies) {
        const s = f.seed;
        const x = f.home.x + Math.sin(t * 0.31 + s) * 3 + Math.sin(t * 0.73 + s * 2) * 1.2;
        const z = f.home.z + Math.cos(t * 0.27 + s * 1.3) * 3 + Math.cos(t * 0.81 + s) * 1.2;
        const y = groundAt(x, z) + 0.6 + 0.4 * Math.sin(t * 1.3 + s) + 0.15 * Math.sin(t * 7 + s);
        const m = f.m;
        const vx = x - m.position.x;
        const vz = z - m.position.z;
        m.position.set(x, y, z);
        if (vx * vx + vz * vz > 1e-6) m.rotation.y = Math.atan2(vx, vz);
        const flap = Math.sin(t * 22 + s) * 1.1;
        m.userData.wings[0].rotation.z = flap;
        m.userData.wings[1].rotation.z = -flap;
      }

      // Goats: graze, wander a little, and trot off if you walk up to them.
      for (const gt of life.goats) {
        gt.t -= dt;
        const d = dist(gt.pos);
        if (d < 7 && gt.state !== 'flee') {
          gt.state = 'flee';
          gt.t = 2.2;
          const away = V(gt.pos.x - me.x, 0, gt.pos.z - me.z).normalize().multiplyScalar(12);
          gt.goal.copy(gt.pos).add(away);
        } else if (gt.t <= 0) {
          if (gt.state === 'graze') {
            gt.state = 'walk';
            gt.t = 4 + Math.random() * 4;
            const a = Math.random() * TAU;
            gt.goal.copy(gt.home).add(V(Math.cos(a) * 10, 0, Math.sin(a) * 10));
          } else {
            gt.state = 'graze';
            gt.t = 5 + Math.random() * 8;
          }
        }
        let speed = 0;
        if (gt.state !== 'graze') {
          const dx = gt.goal.x - gt.pos.x;
          const dz = gt.goal.z - gt.pos.z;
          const l = Math.hypot(dx, dz);
          speed = gt.state === 'flee' ? 3 : 0.7;
          if (l > 0.3) {
            const nx = gt.pos.x + (dx / l) * speed * dt;
            const nz = gt.pos.z + (dz / l) * speed * dt;
            const h = groundAt(nx, nz);
            const nrm = V();
            groundAt(nx, nz, nrm);
            if (h > 1.5 && nrm.y > 0.6) gt.pos.set(nx, h, nz);
            else gt.goal.copy(gt.home);
            gt.yaw = lerpAngle(gt.yaw, Math.atan2(dx, dz), Math.min(1, dt * 4));
          } else speed = 0;
        }
        gt.step += dt * speed * 5;
        const m = gt.m;
        m.position.copy(gt.pos);
        m.rotation.y = gt.yaw;
        const { neck, legs } = m.userData;
        const grazing = gt.state === 'graze';
        neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, grazing ? 1.0 + Math.sin(t * 2 + gt.home.x) * 0.1 : 0, Math.min(1, dt * 3));
        const sw = speed > 0 ? Math.sin(gt.step) * 0.5 : 0;
        legs[0].rotation.x = sw;
        legs[3].rotation.x = sw;
        legs[1].rotation.x = -sw;
        legs[2].rotation.x = -sw;
      }

      // Lizards: still as stone, then gone in a blink.
      for (const lz of life.lizards) {
        if (lz.gone > 0) {
          lz.gone -= dt;
          if (lz.gone <= 0 && dist(lz.home) > 6) {
            lz.m.visible = true;
            lz.m.position.copy(lz.home);
          } else lz.gone = Math.max(lz.gone, 0.01);
          continue;
        }
        if (lz.dart > 0) {
          lz.dart -= dt;
          lz.m.position.addScaledVector(lz.dir, 3 * dt);
          lz.m.position.y = groundAt(lz.m.position.x, lz.m.position.z);
          if (lz.dart <= 0) {
            lz.m.visible = false;
            lz.gone = 15 + Math.random() * 10;
          }
        } else if (dist(lz.m.position) < 2.5) {
          lz.dart = 0.4;
          lz.dir.set(lz.m.position.x - me.x, 0, lz.m.position.z - me.z).normalize();
          lz.m.rotation.y = Math.atan2(lz.dir.x, lz.dir.z);
        } else {
          // A little push-up now and then.
          lz.m.position.y = lz.home.y + Math.max(0, Math.sin(t * 2 + lz.home.x)) * 0.015;
        }
      }

      // Fireflies, after dark.
      if (life.flies) {
        const on = night > 0.55;
        life.flies.pts.visible = on;
        if (on) {
          const pos = life.flies.pts.geometry.attributes.position;
          const col = life.flies.pts.geometry.attributes.color;
          life.flies.base.forEach((b, i) => {
            pos.setXYZ(i, b.x + Math.sin(t * 0.4 + b.seed) * 1.5, b.y + Math.sin(t * 0.7 + b.seed * 2) * 0.4, b.z + Math.cos(t * 0.35 + b.seed) * 1.5);
            const blink = Math.max(0, Math.sin(t * (1.5 + (b.seed % 1.3)) + b.seed)) ** 6;
            col.setXYZ(i, 1.6 * blink, 2.2 * blink, 0.6 * blink);
          });
          pos.needsUpdate = true;
          col.needsUpdate = true;
        }
      }
    }
  }
}
