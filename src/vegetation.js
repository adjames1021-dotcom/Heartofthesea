import * as THREE from 'three';
import { ISLANDS, groundAt } from '../shared/world.js';
import { mulberry32, fbm } from '../shared/noise.js';
import { surfaceKind } from './terrain.js';
import { palm, mergeParts, paint, segment } from './props.js';
import { deepenShadows } from './atmosphere.js';
import { clearings } from './finds.js';

// Grass, flowers, bushes and trees, scattered from a fixed seed so everyone
// sees the same islands. Grass and flowers grow everywhere they can. Bushes,
// broadleaf trees and extra palms are only on Saddle Island: the other
// islands' palms and bushes are landmarks the treasure maps refer to, so they
// stay as they are.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function tuftGeometry() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + i * 0.7;
    const h = 0.34 + (i % 3) * 0.1;
    const blade = new THREE.ConeGeometry(0.05, h, 3, 1, true);
    blade.translate(0, h / 2, 0);
    blade.rotateZ(0.22 + (i % 2) * 0.2);
    blade.rotateY(a);
    parts.push(paint(blade, '#ffffff'));
  }
  return mergeParts(parts);
}

function bushGeometry() {
  const parts = [];
  for (const [x, y, z, r] of [[0, 0.35, 0, 0.55], [0.35, 0.28, 0.15, 0.4], [-0.3, 0.25, -0.1, 0.38], [0.05, 0.6, -0.05, 0.36]]) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.translate(x, y, z);
    parts.push(paint(g, '#ffffff'));
  }
  return mergeParts(parts);
}

function canopyGeometry() {
  const parts = [];
  for (const [x, y, z, r] of [[0, 0, 0, 1.5], [0.9, -0.3, 0.4, 1.05], [-0.8, -0.25, -0.5, 1.1], [0.1, 0.65, -0.2, 1.0], [-0.3, -0.2, 0.9, 0.95]]) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.translate(x, y, z);
    parts.push(paint(g, '#ffffff'));
  }
  return mergeParts(parts);
}

function flowerGeometry() {
  const parts = [paint(segment(V(0, 0, 0), V(0, 0.22, 0), 0.01, 0.01, 3), '#6f8f4a')];
  const head = new THREE.IcosahedronGeometry(0.05, 0);
  head.translate(0, 0.24, 0);
  parts.push(paint(head, '#ffffff'));
  return mergeParts(parts);
}

const materials = {};
const material = (key, opts = {}) => (materials[key] ??= deepenShadows(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, ...opts })));

/** An InstancedMesh filled from a list of { m: Matrix4, c: Color }. */
function instanced(geometry, items, { shadow = false, mat = material('plain') } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, mat, items.length);
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, it.c);
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

const GREENS = ['#6f9f45', '#5d8c3c', '#86b153', '#7aa14a', '#9bbf5d'].map((c) => new THREE.Color(c));
const DRY = ['#b5a66a', '#a69a5e', '#c2b47a'].map((c) => new THREE.Color(c));
const HEATH = ['#5a7a3a', '#6b7d43', '#4f6e36'].map((c) => new THREE.Color(c));
const BUSH = ['#4f7f3a', '#5c8c40', '#46733a', '#6a9446'].map((c) => new THREE.Color(c));
const LEAF = ['#5a8a3c', '#4c7d36', '#6b9a44', '#7aa34a'].map((c) => new THREE.Color(c));
const FLOWERS = ['#f4f1e8', '#f2d24b', '#e98bb0', '#b48ad8', '#f08a4b'].map((c) => new THREE.Color(c));
const THRIFT = new THREE.Color('#e7a0bf'); // sea pinks on the rocky islands
const BARK = new THREE.Color('#6b4f36');
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

export function buildVegetation({ colliders }) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const counts = { tufts: 0, flowers: 0, bushes: 0, trees: 0 };
  const n = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const tq = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const matrix = (x, y, z, yaw, sx, sy = sx, tilt = null) => {
    q.setFromAxisAngle(UP, yaw);
    if (tilt) q.premultiply(tq.setFromUnitVectors(UP, tilt));
    return new THREE.Matrix4().compose(pos.set(x, y, z), q, s.set(sx, sy, sx));
  };
  const geo = { tuft: tuftGeometry(), flower: flowerGeometry(), bush: bushGeometry(), canopy: canopyGeometry() };
  // Leave the huts, ruins and cairns some room.
  const clear = clearings();
  const cleared = (x, z) => clear.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);
  const trunkGeo = paint(segment(V(0, 0, 0), V(0, 3.4, 0), 0.26, 0.17, 6), '#ffffff');

  for (const isl of ISLANDS) {
    const rand = mulberry32(5000 + isl.id.length * 977 + Math.round(isl.x));
    const R = isl.land * 1.05;
    const lush = isl.id === 'saddle';
    const bare = isl.id === 'stack' || isl.id === 'sow';
    const burnt = isl.id === 'burnt';
    const tufts = [];
    const flowers = [];
    const bushes = [];
    const trees = [];
    const tries = Math.round(R * R * (lush ? 0.9 : 0.7));
    for (let i = 0; i < tries; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * R;
      const x = isl.x + Math.cos(a) * r;
      const z = isl.z + Math.sin(a) * r;
      const h = groundAt(x, z, n);
      if (h < 0.7 || cleared(x, z)) continue;
      const kind = surfaceKind(isl, h, n.y, x, z);
      const clump = fbm(x * 0.05, z * 0.05, 211, 2);
      const r1 = rand();
      if (kind === 'grass' || kind === 'scrub' || kind === 'dune' || (kind === 'sand' && r1 < 0.03)) {
        // Tufts, thicker where the noise says it's lusher.
        if (rand() < (kind === 'grass' ? 0.2 + 0.7 * clump : 0.3)) {
          const pal = burnt || kind === 'dune' || kind === 'sand' ? DRY : kind === 'scrub' ? HEATH : GREENS;
          const c = pick(pal, rand()).clone().multiplyScalar(0.88 + rand() * 0.24);
          const k = 0.8 + rand() * 0.9;
          tufts.push({ m: matrix(x, h - 0.03, z, rand() * 6.28, k, k * (0.8 + rand() * 0.5), n.clone()), c });
        }
        // Wildflowers in patches.
        if (!burnt && kind === 'grass' && clump > 0.6 && rand() < 0.12) {
          const c = (bare ? THRIFT : pick(FLOWERS, fbm(x * 0.02, z * 0.02, 7, 1))).clone();
          const k = 0.9 + rand() * 0.6;
          flowers.push({ m: matrix(x, h - 0.01, z, rand() * 6.28, k), c });
        }
        // Saddle Island only: bushes and small woods.
        if (lush && kind !== 'dune' && kind !== 'sand') {
          if (clump > 0.45 && rand() < 0.012) {
            const k = 0.8 + rand() * 1.1;
            bushes.push({ m: matrix(x, h - 0.15, z, rand() * 6.28, k, k * 0.9), c: pick(BUSH, rand()).clone() });
          }
          if (kind === 'grass' && n.y > 0.8 && clump > 0.56 && h < 60 && rand() < 0.016 && trees.length < 260) {
            trees.push({ x, y: h, z, s: 1.0 + rand() * 0.8, yaw: rand() * 6.28, c: pick(LEAF, rand()) });
          }
        }
      }
      // A few palms along Saddle's beaches.
      if (lush && kind === 'sand' && h > 1.2 && rand() < 0.01 && trees.length < 300) trees.push({ palm: true, x, y: h, z, seed: Math.floor(rand() * 1e6) });
    }

    const g = new THREE.Group();
    g.name = `vegetation:${isl.id}`;
    if (tufts.length) g.add(instanced(geo.tuft, tufts, { mat: material('tuft', { side: THREE.DoubleSide }) }));
    if (flowers.length) g.add(instanced(geo.flower, flowers, { mat: material('flower', { vertexColors: true }) }));
    if (bushes.length) g.add(instanced(geo.bush, bushes, { shadow: true }));

    const trunks = [];
    const canopies = [];
    const palmParts = [];
    const frondParts = [];
    for (const t of trees) {
      if (t.palm) {
        const pg = palm({ height: 6 + (t.seed % 30) / 10, lean: 0.25 + (t.seed % 7) / 20, seed: t.seed });
        pg.trunk.translate(t.x, t.y, t.z);
        palmParts.push(pg.trunk);
        for (const c of pg.crowns) {
          const fg = c.geometry.clone();
          fg.translate(t.x + c.top.x, t.y + c.top.y, t.z + c.top.z);
          frondParts.push(fg);
        }
        for (const c of pg.colliders) colliders.push({ type: 'capsule', a: V(t.x + c.a.x, t.y + c.a.y, t.z + c.a.z), b: V(t.x + c.b.x, t.y + c.b.y, t.z + c.b.z), r: c.r });
        continue;
      }
      const height = 3.2 * t.s;
      trunks.push({ m: matrix(t.x, t.y - 0.2, t.z, t.yaw, t.s), c: BARK });
      canopies.push({ m: matrix(t.x, t.y + height + 0.6 * t.s, t.z, t.yaw, t.s, t.s * 0.85), c: t.c.clone().multiplyScalar(0.92 + (t.yaw % 0.2)) });
      colliders.push({ type: 'cyl', x: t.x, z: t.z, r: 0.28 * t.s, y0: t.y - 1, y1: t.y + height });
    }
    if (trunks.length) {
      g.add(instanced(trunkGeo, trunks, { shadow: true }));
      g.add(instanced(geo.canopy, canopies, { shadow: true }));
    }
    if (palmParts.length) {
      const trunkMesh = new THREE.Mesh(mergeParts(palmParts), material('palm', { vertexColors: true }));
      const fronds = new THREE.Mesh(mergeParts(frondParts), material('frond', { vertexColors: true, side: THREE.DoubleSide }));
      trunkMesh.castShadow = fronds.castShadow = true;
      g.add(trunkMesh, fronds);
    }
    if (g.children.length) group.add(g);
    counts.tufts += tufts.length;
    counts.flowers += flowers.length;
    counts.bushes += bushes.length;
    counts.trees += trees.length;
  }
  return { group, counts };
}
