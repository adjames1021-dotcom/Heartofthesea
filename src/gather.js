import * as THREE from 'three';
import { groundAt } from '../shared/world.js';
import { GATHER, gatherWorld, ripe } from '../shared/gather.js';
import { mulberry32 } from '../shared/noise.js';
import { paint, mergeParts, segment, palm } from './props.js';
import { coconutModel, plantainModel } from './food3d.js';
import { deepenShadows } from './atmosphere.js';
import { worldTime } from './clock.js';

// Fruit trees (shared/gather.js says where): lime trees, plantains and
// coconut palms. The fruit's there to see when there's some to pick, and
// gone for a while after you've had it; the server keeps when you last did.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const mat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const leafMat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));

function limeTree(rand) {
  const parts = [paint(segment(V(0, -0.3, 0), V(0.1, 1.3, 0.05), 0.11, 0.08, 6), '#6e5a44')];
  for (const [x, y, z, r] of [[0, 1.9, 0, 0.95], [0.55, 1.65, 0.2, 0.6], [-0.45, 1.7, -0.25, 0.65], [0.1, 2.4, -0.1, 0.6]]) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    parts.push(paint(g, rand() < 0.5 ? '#3f6e2e' : '#4a7a34'));
  }
  const fruit = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rand();
    // Riper and yellower than the leaves, so they show from a way off.
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), new THREE.MeshLambertMaterial({ color: '#c9d64a', flatShading: true }));
    l.scale.set(1, 0.9, 1.15);
    l.position.set(Math.cos(a) * 0.98, 1.5 + rand() * 0.7, Math.sin(a) * 0.98);
    fruit.add(l);
  }
  return { parts, fruit, leaves: [], height: 2.2, r: 0.2 };
}

function plantain(rand) {
  const parts = [paint(segment(V(0, -0.2, 0), V(0, 2.5, 0), 0.22, 0.14, 7), '#7d7a46')];
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rand() * 0.5;
    // A long leaf arching out and drooping, split a little at the edges.
    const g = new THREE.PlaneGeometry(2.4, 0.65, 6, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k) + 1.2;
      const y = 0.7 * Math.sin((x / 2.4) * Math.PI * 0.8) - 0.35 * (x / 2.4) ** 2;
      p.setXYZ(k, x, y, p.getY(k) * (1 - 0.4 * (x / 2.4)));
    }
    g.rotateY(-a);
    g.translate(0, 2.2 + rand() * 0.3, 0);
    leaves.push(paint(g, i % 2 ? '#6aa04a' : '#5c9140'));
  }
  const fruit = new THREE.Group();
  const stalk = new THREE.Mesh(mergeParts([paint(segment(V(0.15, 2.2, 0), V(0.4, 1.6, 0.05), 0.035, 0.03, 4), '#6b6a3c')]), mat);
  fruit.add(stalk);
  for (let i = 0; i < 7; i++) {
    const f = plantainModel();
    f.position.set(0.38 + (i % 3) * 0.05, 1.62 + Math.floor(i / 3) * 0.12, -0.1 + (i % 3) * 0.1);
    f.rotation.set(0.3, i * 0.6, -1.2);
    f.scale.setScalar(1.6);
    fruit.add(f);
  }
  return { parts, fruit, leaves, height: 2.5, r: 0.26 };
}

function coconutPalm(rand, seed) {
  const pg = palm({ height: 7, lean: 0.35, seed });
  const parts = [pg.trunk];
  for (const c of pg.crowns) {
    const g = c.geometry.clone();
    g.translate(c.top.x, c.top.y, c.top.z);
    parts.push(g);
  }
  // Fallen ones in the sand at the foot.
  const fruit = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const n = coconutModel();
    const a = rand() * TAU;
    n.position.set(Math.cos(a) * (0.9 + i * 0.4), 0.08, Math.sin(a) * (0.9 + i * 0.4));
    fruit.add(n);
  }
  return { parts, fruit, leaves: [], height: 7, r: 0.26 };
}

/** A length of driftwood on the sand, bleached and twisted. (It's all "fruit": gone when you've had it.) */
function driftwood(rand) {
  const fruit = new THREE.Group();
  const parts = [];
  let prev = V(-1.1, 0.1, 0);
  for (let i = 1; i <= 5; i++) {
    const p = V(-1.1 + i * 0.45, 0.1 + (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.25);
    parts.push(paint(segment(prev, p, 0.11 - i * 0.008, 0.1 - i * 0.008, 6), i % 2 ? '#c8bfae' : '#b8ae9a'));
    prev = p;
  }
  parts.push(paint(segment(V(-0.3, 0.12, 0), V(-0.1, 0.32, 0.35), 0.04, 0.025, 4), '#c8bfae'));
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = true;
  fruit.add(m);
  return { parts: [], fruit, leaves: [], height: 0, r: 0 };
}

/** Rusted iron: a bar, a ring and a bit of chain, where something burned or broke up. */
function oldIron(rand) {
  const fruit = new THREE.Group();
  const parts = [];
  parts.push(paint(segment(V(-0.45, 0.05, -0.1), V(0.4, 0.07, 0.15), 0.035, 0.035, 5), '#6e4a33'));
  const ring = new THREE.TorusGeometry(0.16, 0.025, 5, 12);
  ring.rotateX(Math.PI / 2 - 0.2);
  ring.translate(0.1, 0.04, -0.3);
  parts.push(paint(ring, '#5e3f2c'));
  for (let i = 0; i < 4; i++) {
    const l = new THREE.TorusGeometry(0.05, 0.014, 4, 8);
    l.rotateY(i % 2 ? Math.PI / 2 : 0);
    l.rotateX(Math.PI / 2 * (i % 2));
    l.translate(-0.3 + i * 0.08, 0.03, 0.25 + rand() * 0.04);
    parts.push(paint(l, '#7a5238'));
  }
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = true;
  fruit.add(m);
  return { parts: [], fruit, leaves: [], height: 0, r: 0 };
}

const LABEL = { lime: 'Pick a lime', plantain: 'Cut a plantain', coconut: 'Pick up a coconut', driftwood: 'Pick up the driftwood', iron: 'Pick up the old iron' };

export class Gathering {
  constructor({ scene, world, progress }) {
    this.progress = progress;
    this.group = new THREE.Group();
    this.group.name = 'fruit-trees';
    scene.add(this.group);
    this.spots = [];
    let seed = 41;
    for (const [id, g] of Object.entries(GATHER)) {
      const rand = mulberry32(seed++ * 7919);
      const at = gatherWorld(id);
      const y = groundAt(at.x, at.z);
      const make = { lime: limeTree, plantain, palm: (r) => coconutPalm(r, seed), driftwood, iron: oldIron }[g.plant];
      const plant = make(rand);
      const root = new THREE.Group();
      root.position.set(at.x, y, at.z);
      root.rotation.y = rand() * TAU;
      if (plant.parts.length) {
        const m = new THREE.Mesh(mergeParts(plant.parts), mat);
        m.castShadow = true;
        m.receiveShadow = true;
        root.add(m);
      }
      if (plant.leaves.length) {
        const l = new THREE.Mesh(mergeParts(plant.leaves), leafMat);
        l.castShadow = true;
        root.add(l);
      }
      // Coconuts lie on the sand, whatever the slope.
      if (g.plant === 'palm') for (const n of plant.fruit.children) n.position.y = groundAt(at.x + n.position.x, at.z + n.position.z) - y + 0.08;
      root.add(plant.fruit);
      this.group.add(root);
      if (plant.r) world.addStatic({ type: 'cyl', x: at.x, z: at.z, r: plant.r, y0: y - 1, y1: y + Math.min(plant.height, 2.4) });
      this.spots.push({ id, def: g, at, y, fruit: plant.fruit, label: LABEL[g.kind] });
    }
    this.t = 0;
  }

  /** Show fruit where there's some to pick. */
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const now = worldTime();
    const picked = this.progress.state?.picked ?? {};
    for (const s of this.spots) s.fruit.visible = ripe(s.id, picked[s.id], now);
  }

  /** A tree with something on it, close enough to reach. */
  near(pos) {
    for (const s of this.spots) {
      if (!s.fruit.visible) continue;
      if (Math.hypot(pos.x - s.at.x, pos.z - s.at.z) < 2.6 && Math.abs(pos.y - s.y) < 2) return s;
    }
    return null;
  }

  async pick(s, pos) {
    s.fruit.visible = false;
    try {
      const r = await this.progress.act('gather', { id: s.id, x: pos.x, z: pos.z });
      if (!r?.ok) this.t = 0;
      return r;
    } catch {
      this.t = 0;
      return null;
    }
  }
}
