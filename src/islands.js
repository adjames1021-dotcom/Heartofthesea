import * as THREE from 'three';
import { ISLANDS, ISLAND_BY_ID, toWorld, dirToWorld, groundAt, pellsBar } from '../shared/world.js';
import { mulberry32, hash2 } from '../shared/noise.js';
import { buildTerrain } from './terrain.js';
import { palm, shrub, rock, stump, rockColumn, paint, mergeParts } from './props.js';
import { buildWreck } from './wreck.js';

// Puts the islands in the scene: terrain plus a deliberately small number of
// props per island. Also collects simple colliders (vertical cylinders and
// capsules in world space) for the player and boats.

const TAU = Math.PI * 2;

function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** three.js yaw for an island-frame rotation (our 2D convention is the mirror of Object3D.rotation.y). */
export const yawOf = (rot) => -rot;

export class Islands {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'islands';
    this.colliders = [];
    this.crowns = [];
    this.landmarks = {};
    this.group.add(buildTerrain());

    this.propMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.frondMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

    for (const isl of ISLANDS) this.#populate(isl);
  }

  #populate(isl) {
    const f = isl.features;
    const rand = mulberry32(seedOf(isl.id));
    const parts = [];
    const place = (geo, lx, lz, { sink = 0, yaw = 0, y = null } = {}) => {
      const w = toWorld(isl, lx, lz);
      const gy = y ?? groundAt(w.x, w.z) - sink;
      geo.rotateY(yaw);
      geo.translate(w.x, gy, w.z);
      parts.push(geo);
      return { x: w.x, y: gy, z: w.z };
    };

    (f.palms ?? []).forEach((p, i) => {
      const w = toWorld(isl, p.x, p.z);
      const gy = groundAt(w.x, w.z);
      if (gy < 0.15) return;
      const pg = palm({ height: p.height, lean: p.lean, split: p.split, seed: seedOf(isl.id) + i * 31 });
      pg.trunk.translate(w.x, gy, w.z);
      parts.push(pg.trunk);
      for (const c of pg.crowns) {
        const m = new THREE.Mesh(c.geometry, this.frondMat);
        m.position.set(w.x + c.top.x, gy + c.top.y, w.z + c.top.z);
        m.castShadow = true;
        this.group.add(m);
        this.crowns.push({ mesh: m, phase: rand() * TAU });
      }
      for (const c of pg.colliders) {
        this.colliders.push({
          type: 'capsule',
          a: new THREE.Vector3(w.x + c.a.x, gy + c.a.y, w.z + c.a.z),
          b: new THREE.Vector3(w.x + c.b.x, gy + c.b.y, w.z + c.b.z),
          r: c.r,
        });
      }
      if (p.id) this.landmarks[p.id] = { x: w.x, y: gy, z: w.z, island: isl.id };
    });

    (f.shrubs ?? []).forEach((s, i) => {
      const w = toWorld(isl, s.x, s.z);
      if (groundAt(w.x, w.z) < 0.4) return;
      place(shrub(seedOf(isl.id) + 100 + i), s.x, s.z, { sink: 0.15, yaw: rand() * TAU });
    });
    (f.deadShrubs ?? []).forEach((s, i) => {
      place(shrub(seedOf(isl.id) + 200 + i, true), s.x, s.z, { sink: 0.1, yaw: rand() * TAU });
    });
    (f.stumps ?? []).forEach((s, i) => {
      const at = place(stump(seedOf(isl.id) + 300 + i), s.x, s.z, { sink: 0.1 });
      this.colliders.push({ type: 'cyl', x: at.x, z: at.z, r: 0.3, y0: at.y - 1, y1: at.y + 1.6 });
    });
    (f.rocks ?? []).forEach((r, i) => {
      const color = isl.id === 'burnt' ? '#4f4943' : isl.id === 'reef' ? '#a8977a' : isl.id === 'stack' ? '#7f776c' : '#9b958b';
      const at = place(rock(r.s, seedOf(isl.id) + 400 + i, color), r.x, r.z, { sink: r.s * 0.3 });
      this.colliders.push({ type: 'cyl', x: at.x, z: at.z, r: r.s * 0.85, y0: at.y - r.s, y1: at.y + r.s * 0.5 });
    });

    if (f.spire) this.#spire(isl, parts);
    if (f.rock && isl.id === 'bar') this.#barRock(isl, parts);
    if (isl.id === 'bar') this.#wrackLine(isl, parts);
    if (f.piglets) this.#piglets(isl, parts);
    if (isl.id === 'horseshoe') this.#horseshoeRocks(isl, parts);
    if (f.wreck) this.#wreck(isl);

    if (parts.length) {
      const mesh = new THREE.Mesh(mergeParts(parts), this.propMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `props:${isl.id}`;
      this.group.add(mesh);
    }
  }

  #column(isl, lx, lz, tiers, seed, colors, opts) {
    const geo = rockColumn(tiers, seed, ...(colors ?? []), 11, opts);
    geo.rotateY(yawOf(isl.rot));
    const w = toWorld(isl, lx, lz);
    geo.translate(w.x, 0, w.z);
    for (const t of tiers) {
      const o = dirToWorld(isl, t.ox ?? 0, t.oz ?? 0);
      this.colliders.push({ type: 'cyl', x: w.x + o.x, z: w.z + o.z, r: t.r * 0.97, y0: t.y0, y1: t.y1 });
    }
    return geo;
  }

  #spire(isl, parts) {
    const s = isl.features.spire;
    parts.push(this.#column(isl, s.x, s.z, s.tiers, 7001, ['#867d71', '#70695f'], { guano: true }));
    const w = toWorld(isl, s.x, s.z);
    this.landmarks.spire = { x: w.x, y: 57, z: w.z, island: isl.id };
  }

  #barRock(isl, parts) {
    const r = isl.features.rock;
    const tiers = [
      { r: r.radius, y0: 0.4, y1: 7.4, ox: 0, oz: 0 },
      { r: r.radius * 0.8, y0: 7.2, y1: 14, ox: 0.4, oz: 0.2 },
      { r: r.radius * 0.55, y0: 13.8, y1: r.height, ox: 0.9, oz: 0.3, taper: 0.7 },
    ];
    parts.push(this.#column(isl, r.x, r.z, tiers, 7101, ['#9f998d', '#8b857b']));
    const w = toWorld(isl, r.x, r.z);
    this.landmarks.barRock = { x: w.x, y: r.height, z: w.z, island: isl.id };
  }

  #wrackLine(isl, parts) {
    // A ragged line of dried weed and the odd bleached stick along the beach.
    const { line } = pellsBar();
    const weed = [new THREE.Color('#4a4628'), new THREE.Color('#3c3820'), new THREE.Color('#57502e')];
    const rand = mulberry32(9090);
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i];
      const b = line[i + 1];
      const n = 3;
      for (let k = 0; k < n; k++) {
        const t = (k + rand()) / n;
        const lx = a.x + (b.x - a.x) * t;
        const lz = a.z + (b.z - a.z) * t + (rand() - 0.5) * 0.9;
        const g = paint(new THREE.BoxGeometry(0.5 + rand() * 0.7, 0.06, 0.18 + rand() * 0.2), weed[Math.floor(rand() * 3)]);
        g.rotateY(rand() * Math.PI);
        const w = toWorld(isl, lx, lz);
        g.translate(w.x, groundAt(w.x, w.z) + 0.02, w.z);
        parts.push(g);
        if (rand() < 0.12) {
          const stick = new THREE.CylinderGeometry(0.05, 0.06, 1.2 + rand(), 5);
          stick.rotateZ(Math.PI / 2);
          stick.rotateY(rand() * Math.PI);
          stick.translate(w.x, groundAt(w.x, w.z) + 0.05, w.z + 0.2);
          parts.push(paint(stick, '#cfc4ae'));
        }
      }
    }
  }

  #piglets(isl, parts) {
    // Each piglet: a lumpy stack of two or three boulders on a rock footing.
    isl.features.piglets.forEach((p, i) => {
      const rand = mulberry32(8100 + i);
      const w = toWorld(isl, p.x, p.z);
      const base = rock(p.r * 1.15, 8200 + i, '#958f86', 0.9);
      base.translate(w.x, p.h * 0.18, w.z);
      parts.push(base);
      const mid = rock(p.r * 0.85, 8300 + i, '#a39d93', 0.95);
      mid.translate(w.x + (rand() - 0.5) * 1.2, p.h * 0.55, w.z + (rand() - 0.5) * 1.2);
      parts.push(mid);
      if (p.h > 7) {
        const top = rock(p.r * 0.55, 8400 + i, '#aaa49a', 1.0);
        top.translate(w.x + (rand() - 0.5) * 1.4, p.h * 0.85, w.z + (rand() - 0.5) * 1.4);
        parts.push(top);
      }
      this.colliders.push({ type: 'cyl', x: w.x, z: w.z, r: p.r * 0.95, y0: -4, y1: p.h * 0.8, noClimb: true });
    });
  }

  #horseshoeRocks(isl, parts) {
    const f = isl.features;
    const outer = f.rc + f.w;
    const atAngle = (a, r) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    const rand = mulberry32(5150);
    // Two low, flat-topped boulders on the shelf: somewhere to stand while a set rolls through.
    for (const t of [0.36, 0.7]) {
      const a = f.shelf.a0 + (f.shelf.a1 - f.shelf.a0) * t;
      const p = atAngle(a, outer - 1.9);
      parts.push(this.#column(isl, p.x, p.z, [{ r: 1.35, y0: f.shelf.top - 0.6, y1: f.shelf.top + 1.0, taper: 0.9 }], 5200 + t * 100));
    }
    // A wall of big boulders just off the shelf: the sea gets in, swimmers don't.
    for (let a = f.shelf.a0 + 0.01; a < f.cove.a1 + 0.005; a += 0.031) {
      const p = atAngle(a + (rand() - 0.5) * 0.008, outer + 3.3 + rand() * 0.5);
      const s = 2.0 + rand() * 0.5;
      const at = toWorld(isl, p.x, p.z);
      const g = rock(s, 5300 + Math.round(a * 1000), '#8f8a80', 1.15);
      g.translate(at.x, 0.6, at.z);
      parts.push(g);
      this.colliders.push({ type: 'cyl', x: at.x, z: at.z, r: s * 0.95, y0: -4, y1: 0.6 + s * 1.05, noClimb: true });
    }
    // Close off the seaward side of the cove except where the shelf comes in.
    for (let a = f.cove.a0 + 0.035; a < f.cove.a1 + 0.01; a += 0.026) {
      const p = atAngle(a, outer - 0.6);
      const at = toWorld(isl, p.x, p.z);
      const g = rock(1.8, 5400 + Math.round(a * 1000), '#958f85', 1.1);
      g.translate(at.x, 1.8, at.z);
      parts.push(g);
      this.colliders.push({ type: 'cyl', x: at.x, z: at.z, r: 1.6, y0: -2, y1: 3.6, noClimb: true });
    }
  }

  #wreck(isl) {
    const wr = isl.features.wreck;
    const w = toWorld(isl, wr.x, wr.z);
    const wreck = buildWreck();
    wreck.position.set(w.x, 0, w.z);
    wreck.rotation.y = yawOf(isl.rot + wr.rot);
    this.group.add(wreck);
    this.wreck = wreck;
    this.landmarks.wreck = { x: w.x, y: 4, z: w.z, island: isl.id };
  }

  /** Gentle sway for the palm crowns. */
  update(t, windStrength = 1) {
    for (const c of this.crowns) {
      const s = 0.035 * windStrength;
      c.mesh.rotation.x = Math.sin(t * 0.9 + c.phase) * s;
      c.mesh.rotation.z = Math.sin(t * 0.7 + c.phase * 1.7) * s * 1.2;
    }
  }
}

export { ISLAND_BY_ID, hash2 };
