import * as THREE from 'three';
import { makeBox, Body } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { deepenShadows } from './atmosphere.js';
import { ISLAND_BY_ID } from '../shared/world.js';
import { tideFallsTo } from '../shared/environment.js';
import { hash2 } from '../shared/noise.js';
import { ZAWN, zawnChest, roomUnder, HEADROOM } from '../shared/zawn.js';

// The Zawn on Cormorant Island, and the smugglers' landing in the pool it
// leads to (the terrain's shaped in shared/world.js; the numbers are in
// shared/zawn.js).
//
// In under the arch at low water (it's under the sea from a little below
// half tide). On the quay, the winch that lowered the gangway over the deep
// water to the ledge, but no handle on it; a note says where they kept it:
// in the cleft across the pool, whose mouth is only open at low water too.
// Wind the gangway down, cross; on the rock at the end of the ledge a lever
// drops the counterweight that lifts the cellar door. The chest's inside.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ROCK = ['#8f8a82', '#858078', '#7d7870', '#77736c'];
const WEED = '#4b5038';
const BARNACLE = '#9a978c';
const STONE = ['#8c8579', '#837d72', '#7a746a'];
const WOOD = '#6a5640';
const WOOD_DARK = '#4a3c2e';
const IRON = '#34302c';
const ROPE = '#7d6a4d';
const NOTE = ['NO HANDLE? IT IS KEPT', 'DRY IN THE CLEFT ACROSS', 'THE POOL. LOW WATER ONLY.'];

const pick = (list, i, j) => list[Math.floor(hash2(i, j, 991) * list.length) % list.length];

/**
 * A mass of rock, x0…x1 by z0…z1, from bottom(x, z) up to top(x, z):
 * jittered, weed and barnacles below the high-water mark.
 */
function rockMass(x0, x1, z0, z1, bottom, top, seed, nx = 8, nz = 6) {
  const g = new THREE.BoxGeometry(1, 1, 1, nx, 2, nz);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5;
    const w = p.getZ(i) + 0.5;
    const v = p.getY(i) + 0.5;
    const x = x0 + (x1 - x0) * u;
    const z = z0 + (z1 - z0) * w;
    const b = bottom(x, z);
    const t = Math.max(top(x, z), b + 1);
    const j = (k) => hash2(Math.round(x * 4), Math.round(z * 4) + k * 1000, seed) - 0.5;
    // (The underside only ever jitters up, so what you bump on is where it looks.)
    const y = v === 0 ? b + Math.abs(j(1)) * 0.25 : v === 1 ? t + j(2) * 0.6 : (b + t) / 2 + j(3) * 0.8;
    const edge = u === 0 || u === 1 || w === 0 || w === 1;
    p.setXYZ(i, x + (edge ? j(4) * 0.5 : 0), y, z + (edge ? j(5) * 0.5 : 0));
  }
  const ng = g.toNonIndexed();
  const q = ng.attributes.position;
  const col = new Float32Array(q.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < q.count; i += 3) {
    const y = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3;
    const k = Math.floor(i / 3);
    c.set(y < 0.6 ? WEED : y < 1.2 ? BARNACLE : pick(ROCK, k, seed));
    for (let m = 0; m < 3; m++) col.set([c.r, c.g, c.b], (i + m) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.deleteAttribute('uv');
  ng.deleteAttribute('normal');
  return ng;
}

export class Zawn {
  constructor({ scene, world, treasure, puzzles, progress }) {
    this.world = world;
    this.treasure = treasure;
    const isl = ISLAND_BY_ID.cormorant;
    this.isl = isl;
    this.f = isl.features;
    // Everything's built in the island's own frame.
    this.group = new THREE.Group();
    this.group.name = 'zawn';
    this.group.position.set(isl.x, 0, isl.z);
    this.group.rotation.y = -isl.rot;
    scene.add(this.group);
    this.group.updateMatrixWorld(true);
    this.matrix = this.group.matrixWorld.clone();
    this.inverse = this.matrix.clone().invert();
    this.quat = this.group.quaternion.clone();
    const pf = this.f.pool;
    this.center = this.#w(V(pf.x, 0, pf.z + 20));

    this.post = { x: ZAWN.winch.x - 0.6, z: ZAWN.gangway.z + ZAWN.gangway.half + 1.0 };
    const parts = [];
    this.#arch(parts);
    this.#cave(parts);
    this.#quay(parts);
    this.#cellar(parts);
    this.#winchFrame(parts);
    const mat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.#moving();

    const solved = (progress.state?.solved ?? []).includes('zawn');
    this.solved = solved;
    this.hasHandle = solved;
    this.handleMesh.visible = !solved;
    this.crank.visible = solved;
    this.down = solved ? 1 : 0; // the gangway, 0 up … 1 down
    this.downWant = this.down;
    this.doorUp = solved ? 1 : 0;
    this.doorWant = this.doorUp;
    this.leverDown = solved;
    this.#setGangway();
    this.#setDoor();
    this.#setLever();

    // The note by the winch.
    const nm = new THREE.Matrix4().compose(V(this.post.x + 0.16, this.f.quay.y + 1.4, this.post.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2), V(1, 1, 1));
    puzzles.addPlank(NOTE, 4417, nm.premultiply(this.matrix));

    if (!solved) {
      const at = zawnChest();
      treasure.placeCourseChest('zawn', { x: at.x, y: at.y + 0.3, z: at.z });
    }
    this.told = {};
  }

  /** Island-local point → world. */
  #w(p) {
    return p.clone().applyMatrix4(this.matrix);
  }

  #box(cx, cy, cz, hx, hy, hz, yaw = 0, flags = {}) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).premultiply(this.quat);
    this.world.addStatic(makeBox({ center: this.#w(V(cx, cy, cz)), half: V(hx, hy, hz), quaternion: q, ...flags }));
  }

  // -------------------------------------------------------------------------
  // The arch over the slot, and the roof of the tide cave
  // -------------------------------------------------------------------------

  #arch(parts) {
    const { zawn: Z, arch: A } = this.f;
    const h = (x, z) => this.isl.height(x, z);
    const x0 = Z.x - Z.w - 4.5;
    const x1 = Z.x + Z.w + 4.5;
    const z0 = A.z - A.depth / 2;
    const z1 = A.z + A.depth / 2;
    // Up to the cliff top either side of the slot.
    const top = (x, z) => Math.max(h(x, z), h(Z.x - Z.w - 5, z), h(Z.x + Z.w + 5, z)) + 0.4;
    parts.push(rockMass(x0, x1, z0, z1, () => A.roof, top, 31, 8, 6));
    const tMin = Math.min(top(Z.x, z0), top(Z.x, z1));
    this.#box((x0 + x1) / 2, (A.roof + tMin) / 2, A.z, (x1 - x0) / 2, (tMin - A.roof) / 2, A.depth / 2, 0, { noGrab: true, noClimb: true });
  }

  #cave(parts) {
    const C = this.f.cave;
    const h = (x, z) => this.isl.height(x, z);
    const z0 = C.z - C.w - 1.6;
    const z1 = C.z + C.w + 1.6;
    // A low lip of rock over the mouth, then the chamber's roof higher up.
    const under = (x) => (x < C.mouth ? C.roof : C.top);
    const top = (x) => Math.max(h(x, z0 - 0.5), h(x, z1 + 0.5), under(x) + 1.4) + 0.3;
    parts.push(rockMass(C.lip, C.mouth, z0, z1, () => C.roof, (x) => top(x), 41, 3, 5));
    parts.push(rockMass(C.mouth, C.x1 + 0.6, z0, z1, () => C.top, (x) => top(x), 42, 8, 5));
    for (let x = C.lip; x < C.x1 + 0.6; x += 1) {
      const xb = Math.min(x + 1, C.x1 + 0.6);
      const b = under((x + xb) / 2);
      const t = Math.min(top(x), top(xb));
      this.#box((x + xb) / 2, (b + t) / 2, C.z, (xb - x) / 2, (t - b) / 2, (z1 - z0) / 2, 0, { noGrab: true, noClimb: true });
    }
    // The handle, on the shelf at the back.
    const hp = [];
    hp.push(paint(segment(V(0, 0, 0), V(0, 0, 0.42), 0.025, 0.025, 6), IRON));
    hp.push(paint(segment(V(0, 0, 0.42), V(0.28, 0, 0.42), 0.022, 0.022, 6), IRON));
    hp.push(paint(segment(V(0.28, 0, 0.42), V(0.28, 0, 0.62), 0.03, 0.03, 6), WOOD));
    const sq = new THREE.BoxGeometry(0.07, 0.07, 0.08);
    hp.push(paint(sq, IRON));
    this.handleGeo = mergeParts(hp);
    this.handleMesh = new THREE.Mesh(this.handleGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const hz = ZAWN.handle;
    this.handleMesh.position.set(hz.x, C.shelf + 0.05, hz.z);
    this.handleMesh.rotation.set(Math.PI / 2, 0.6, 0);
    this.handleMesh.castShadow = true;
    this.group.add(this.handleMesh);
    // A crate and an old lamp up there with it.
    const cr = new THREE.BoxGeometry(0.7, 0.5, 0.55);
    cr.translate(hz.x + 0.6, C.shelf + 0.25, hz.z - 1.1);
    parts.push(paint(cr, WOOD_DARK));
  }

  // -------------------------------------------------------------------------
  // The quay and the ledge
  // -------------------------------------------------------------------------

  #quay(parts) {
    const { quay: Q, ledge: L, gap: G } = this.f;
    // A face of dressed stone along the quay's water edge and its end over the gap.
    const wall = (x0, x1, z0, z1, y0, y1, seed) => {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, Math.max(1, Math.round((x1 - x0) / 0.9)), Math.max(1, Math.round((y1 - y0) / 0.45)), Math.max(1, Math.round((z1 - z0) / 0.9)));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const ng = g.toNonIndexed();
      const q = ng.attributes.position;
      const col = new Float32Array(q.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < q.count; i += 6) {
        const y = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3;
        c.set(y < 0.7 ? WEED : y < 1.3 ? BARNACLE : pick(STONE, i, seed));
        for (let m = 0; m < 6 && i + m < q.count; m++) col.set([c.r, c.g, c.b], (i + m) * 3);
      }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
      ng.deleteAttribute('uv');
      ng.deleteAttribute('normal');
      parts.push(ng);
      this.#box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, 0, { noGrab: true });
    };
    wall(Q.x0, 8.4, Q.z1 - 0.2, Q.z1 + 0.5, -3, Q.y, 1);
    wall(Q.x0 - 0.5, Q.x0 + 0.2, Q.z0 - 1, Q.z1 + 0.5, -3, Q.y, 2);
    // The ledge's face over the gap: too high to climb out onto.
    wall(G.x0 - 0.7, G.x0, Q.z0 - 3, Q.z1 + 1.5, -3, L.y, 3);
    // Steps down into the water at the quay's east end.
    const n = 9;
    const rise = (Q.y + 1.3) / n;
    for (let i = 0; i < n; i++) {
      const top = Q.y - rise * (i + 1);
      const z0 = Q.z1 + 0.5 + i * 0.45;
      const g = new THREE.BoxGeometry(3.0, top + 3, 0.45);
      g.translate(10.1, (top - 3) / 2, z0 + 0.225);
      parts.push(paint(g, top < 0.7 ? WEED : top < 1.3 ? BARNACLE : pick(STONE, i, 7)));
      this.#box(10.1, (top - 3) / 2, z0 + 0.225, 1.5, (top + 3) / 2, 0.225);
    }
    wall(8.4, 8.6, Q.z1 - 0.2, Q.z1 + 0.5 + n * 0.45, -3, Q.y, 4);
    wall(11.6, 11.8, Q.z1 - 0.2, Q.z1 + 0.5 + n * 0.45, -3, Q.y, 5);
    // Bollards, a mooring ring, barrels.
    for (const x of [-6, 0, 6]) {
      parts.push(paint(segment(V(x, Q.y, Q.z1 - 0.6), V(x, Q.y + 0.65, Q.z1 - 0.6), 0.16, 0.13, 8), IRON));
      this.world.addStatic({ type: 'cyl', ...xz(this.#w(V(x, 0, Q.z1 - 0.6))), r: 0.16, y0: Q.y - 1, y1: Q.y + 0.65 });
    }
    for (const [x, z, s] of [[3.2, 21.0, 0], [3.9, 21.4, 1], [-3.5, 21.2, 2]]) {
      const b = new THREE.CylinderGeometry(0.32, 0.32, 0.85, 10);
      b.translate(x, Q.y + 0.425, z);
      parts.push(paint(b, s % 2 ? WOOD : WOOD_DARK));
      for (const yy of [0.15, 0.7]) {
        const r = new THREE.TorusGeometry(0.325, 0.02, 3, 12);
        r.rotateX(Math.PI / 2);
        r.translate(x, Q.y + yy, z);
        parts.push(paint(r, IRON));
      }
      this.world.addStatic({ type: 'cyl', ...xz(this.#w(V(x, 0, z))), r: 0.32, y0: Q.y - 1, y1: Q.y + 0.85 });
    }
    // The rock at the end of the ledge, with the lever on top.
    const lv = ZAWN.lever;
    const lr = rock(1.1, 8801, ROCK[2], 0.9);
    lr.scale(1.15, 1.0, 1.0);
    lr.translate(lv.x, L.y + 0.45, lv.z);
    parts.push(lr);
    this.#box(lv.x, L.y + lv.top / 2 - 0.3, lv.z, 0.75, lv.top / 2 + 0.3, 0.65);
    const slab = new THREE.BoxGeometry(1.4, 0.18, 1.2);
    slab.translate(lv.x, L.y + lv.top - 0.08, lv.z);
    parts.push(paint(slab, ROCK[1]));
  }

  // -------------------------------------------------------------------------
  // The cellar, built into the rock behind the ledge
  // -------------------------------------------------------------------------

  #cellar(parts) {
    const { cellar: C, ledge: L } = this.f;
    const D = ZAWN.door;
    const y0 = L.y - 0.6;
    const y1 = L.y + 3.0;
    const block = (x0, x1, z0, z1, a, b, seed, collide = true) => {
      const g = new THREE.BoxGeometry(x1 - x0, b - a, z1 - z0, Math.max(1, Math.round((x1 - x0) / 0.8)), Math.max(1, Math.round((b - a) / 0.4)), Math.max(1, Math.round((z1 - z0) / 0.8)));
      g.translate((x0 + x1) / 2, (a + b) / 2, (z0 + z1) / 2);
      const ng = g.toNonIndexed();
      const q = ng.attributes.position;
      const col = new Float32Array(q.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < q.count; i += 6) {
        c.set(pick(STONE, i, seed));
        for (let m = 0; m < 6 && i + m < q.count; m++) col.set([c.r, c.g, c.b], (i + m) * 3);
      }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
      ng.deleteAttribute('uv');
      ng.deleteAttribute('normal');
      parts.push(ng);
      if (collide) this.#box((x0 + x1) / 2, (a + b) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (b - a) / 2, (z1 - z0) / 2, 0, { noGrab: true });
    };
    const t = 0.45;
    // Front wall round the door; back and sides; the roof.
    block(C.x1 - t, C.x1, C.z0 - t, D.z0, y0, y1, 11);
    block(C.x1 - t, C.x1, D.z1, C.z1 + t, y0, y1, 12);
    block(C.x1 - t, C.x1, D.z0, D.z1, L.y + D.h, y1, 13);
    block(C.x0 - t, C.x0, C.z0 - t, C.z1 + t, y0, y1, 14);
    block(C.x0, C.x1 - t, C.z0 - t, C.z0, y0, y1, 15);
    block(C.x0, C.x1 - t, C.z1, C.z1 + t, y0, y1, 16);
    block(C.x0 - t - 0.2, C.x1 + 0.3, C.z0 - t - 0.2, C.z1 + t + 0.2, y1, y1 + 0.85, 17); // (thick enough to hide the door, lifted)
    // A floor of flags.
    const fl = new THREE.BoxGeometry(C.x1 - C.x0 - t, 0.1, C.z1 - C.z0);
    fl.translate((C.x0 + C.x1 - t) / 2, L.y + 0.03, (C.z0 + C.z1) / 2);
    parts.push(paint(fl, '#6f6a62'));
    // The door's frame and the slot it lifts into.
    const fr = (z, w) => {
      const g = new THREE.BoxGeometry(0.62, D.h + 0.3, w);
      g.translate(C.x1 - t / 2, L.y + (D.h + 0.3) / 2, z);
      parts.push(paint(g, '#5d5850'));
    };
    fr(D.z0 - 0.08, 0.16);
    fr(D.z1 + 0.08, 0.16);
    // The counterweight chain, up the front wall to a pulley.
    for (let k = 0; k < 12; k++) {
      const l = new THREE.TorusGeometry(0.05, 0.012, 3, 6);
      if (k % 2) l.rotateY(Math.PI / 2);
      l.translate(C.x1 + 0.08, L.y + 0.8 + k * 0.17, D.z0 - 0.4);
      parts.push(paint(l, IRON));
    }
    // Inside: barrels and kegs, a table, coils of rope.
    for (const [x, z, s] of [[C.x0 + 0.6, C.z0 + 0.5, 1], [C.x0 + 0.6, C.z0 + 1.2, 2], [C.x0 + 1.3, C.z0 + 0.5, 3], [C.x0 + 0.6, C.z1 - 0.6, 4]]) {
      const b = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10);
      b.translate(x, L.y + 0.4, z);
      parts.push(paint(b, s % 2 ? WOOD : WOOD_DARK));
      this.world.addStatic({ type: 'cyl', ...xz(this.#w(V(x, 0, z))), r: 0.3, y0: L.y - 0.5, y1: L.y + 0.8 });
    }
    const top = new THREE.BoxGeometry(1.2, 0.07, 0.75);
    top.translate(C.x1 - t - 1.2, L.y + 0.78, C.z1 - 0.7);
    parts.push(paint(top, WOOD));
    for (const [dx, dz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) parts.push(paint(segment(V(C.x1 - t - 1.2 + dx, L.y, C.z1 - 0.7 + dz), V(C.x1 - t - 1.2 + dx, L.y + 0.75, C.z1 - 0.7 + dz), 0.035, 0.035, 4), WOOD_DARK));
    this.#box(C.x1 - t - 1.2, L.y + 0.4, C.z1 - 0.7, 0.6, 0.4, 0.38);
    const coil = new THREE.TorusGeometry(0.28, 0.07, 4, 12);
    coil.rotateX(Math.PI / 2);
    coil.translate(C.x0 + 1.4, L.y + 0.08, C.z1 - 0.7);
    parts.push(paint(coil, ROPE));
  }

  // -------------------------------------------------------------------------
  // The winch
  // -------------------------------------------------------------------------

  #winchFrame(parts) {
    const Q = this.f.quay;
    const W = ZAWN.winch;
    const y = Q.y;
    // The derrick: a post, a boom out over the gap, a brace.
    // (The post stands to one side of the gangway, not in the way onto it.)
    const P = this.post;
    parts.push(paint(segment(V(P.x, y, P.z), V(P.x, y + 4.6, P.z), 0.14, 0.12, 6), WOOD));
    this.boomTip = V(ZAWN.gangway.hingeX - 3.4, y + 5.1, ZAWN.gangway.z);
    parts.push(paint(segment(V(P.x, y + 4.5, P.z), this.boomTip, 0.09, 0.07, 6), WOOD));
    parts.push(paint(segment(V(P.x, y + 2.6, P.z), V(P.x - 1.2, y + 4.6, P.z - 0.6), 0.06, 0.06, 5), WOOD_DARK));
    const pulley = new THREE.TorusGeometry(0.14, 0.04, 4, 10);
    pulley.translate(this.boomTip.x, this.boomTip.y - 0.12, this.boomTip.z);
    parts.push(paint(pulley, IRON));
    // The drum between two A-frames, its axle's square end out to the side (for the handle).
    for (const dz of [-0.55, 0.55]) {
      parts.push(paint(segment(V(W.x - 0.45, y, W.z + dz), V(W.x, y + 0.95, W.z + dz), 0.05, 0.05, 4), WOOD_DARK));
      parts.push(paint(segment(V(W.x + 0.45, y, W.z + dz), V(W.x, y + 0.95, W.z + dz), 0.05, 0.05, 4), WOOD_DARK));
    }
    const drum = new THREE.CylinderGeometry(0.22, 0.22, 1.0, 10);
    drum.rotateX(Math.PI / 2);
    drum.translate(W.x, y + 0.9, W.z);
    parts.push(paint(drum, WOOD));
    parts.push(paint(segment(V(W.x, y + 0.9, W.z - 0.75), V(W.x, y + 0.9, W.z + 0.75), 0.03, 0.03, 4), IRON));
    this.#box(W.x, y + 0.5, W.z, 0.5, 0.5, 0.65);
    this.world.addStatic({ type: 'cyl', ...xz(this.#w(V(P.x, 0, P.z))), r: 0.15, y0: y - 1, y1: y + 4.6 });
  }

  /** The things that move: the gangway, the door, the lever, the handle on the winch, the rope. */
  #moving() {
    const G = ZAWN.gangway;
    const Q = this.f.quay;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // The gangway: planks on two stringers, cleats across; drawn along −x from its hinge.
    const gp = [];
    for (const dz of [-G.half + 0.06, G.half - 0.06]) {
      const s = new THREE.BoxGeometry(G.len, 0.14, 0.09);
      s.translate(-G.len / 2, -0.04, dz);
      gp.push(paint(s, WOOD_DARK));
    }
    for (let k = 0; k < 11; k++) {
      const b = new THREE.BoxGeometry(G.len / 11 - 0.03, 0.05, G.half * 2);
      b.translate(-(k + 0.5) * (G.len / 11), 0.05, 0);
      gp.push(paint(b, hash2(k, 1, 5) < 0.5 ? WOOD : '#76614a'));
    }
    for (let k = 1; k < 8; k++) {
      const c = new THREE.BoxGeometry(0.05, 0.05, G.half * 2 - 0.1);
      c.translate(-(k * G.len) / 8, 0.1, 0);
      gp.push(paint(c, WOOD_DARK));
    }
    this.gangway = new THREE.Mesh(mergeParts(gp), mat);
    this.gangway.castShadow = true;
    this.gangway.receiveShadow = true;
    this.gangway.matrixAutoUpdate = false;
    this.group.add(this.gangway);
    this.gangwayBody = this.world.addBody(new Body([{ center: V(-G.len / 2, 0, 0), half: V(G.len / 2, 0.08, G.half) }], 'zawn-gangway'));
    this.hinge = V(G.hingeX, Q.y + 0.04, G.z);

    // The rope from the boom down to the gangway's end.
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4), new THREE.MeshLambertMaterial({ color: ROPE }));
    this.group.add(this.rope);

    // The cellar door: oak with iron bands, lifting up in its frame.
    const D = ZAWN.door;
    const L = this.f.ledge;
    const C = this.f.cellar;
    const dp = [];
    const w = D.z1 - D.z0;
    const slab = new THREE.BoxGeometry(0.14, D.h, w);
    dp.push(paint(slab, WOOD_DARK));
    for (const yy of [-0.75, 0, 0.75]) {
      const band = new THREE.BoxGeometry(0.17, 0.08, w);
      band.translate(0, yy, 0);
      dp.push(paint(band, IRON));
    }
    this.door = new THREE.Mesh(mergeParts(dp), mat);
    this.door.castShadow = true;
    this.door.matrixAutoUpdate = false;
    this.group.add(this.door);
    this.doorBody = this.world.addBody(new Body([{ center: V(0, 0, 0), half: V(0.08, D.h / 2, w / 2) }], 'zawn-door'));
    this.doorAt = V(C.x1 - 0.22, L.y + D.h / 2, (D.z0 + D.z1) / 2);

    // The lever.
    const lv = ZAWN.lever;
    this.lever = new THREE.Group();
    this.lever.position.set(lv.x, L.y + lv.top + 0.05, lv.z);
    const lp = [paint(segment(V(0, 0, 0), V(0, 0.85, 0), 0.03, 0.025, 5), IRON)];
    const knob = new THREE.SphereGeometry(0.06, 6, 4);
    knob.translate(0, 0.85, 0);
    lp.push(paint(knob, '#5a4632'));
    this.lever.add(new THREE.Mesh(mergeParts(lp), mat));
    const bracket = new THREE.Mesh(paint(new THREE.BoxGeometry(0.2, 0.12, 0.3), IRON), mat);
    bracket.position.set(lv.x, L.y + lv.top + 0.04, lv.z);
    this.group.add(bracket);
    this.group.add(this.lever);

    // The handle, when it's on the winch's axle.
    this.crank = new THREE.Mesh(this.handleGeo, mat);
    const W = ZAWN.winch;
    this.crank.position.set(W.x, Q.y + 0.9, W.z - 0.8);
    this.crank.rotation.set(Math.PI, 0, 0);
    this.group.add(this.crank);
  }

  #setGangway() {
    const G = ZAWN.gangway;
    const L = this.f.ledge;
    const Q = this.f.quay;
    const flat = Math.asin((L.y + 0.05 - Q.y) / G.len);
    const e = this.down * this.down * (3 - 2 * this.down);
    const th = G.raised + (flat - G.raised) * e;
    const m = new THREE.Matrix4().compose(this.hinge, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -th), V(1, 1, 1));
    this.gangway.matrix.copy(m);
    this.gangwayBody.setMatrix(m.clone().premultiply(this.matrix));
    // The rope: boom tip to the gangway's far end.
    const end = this.hinge.clone().add(V(-Math.cos(th) * G.len, Math.sin(th) * G.len, 0));
    const d = end.clone().sub(this.boomTip);
    this.rope.position.copy(this.boomTip).addScaledVector(d, 0.5);
    this.rope.scale.set(1, d.length(), 1);
    this.rope.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  }

  #setDoor() {
    const e = this.doorUp * this.doorUp * (3 - 2 * this.doorUp);
    const m = new THREE.Matrix4().makeTranslation(this.doorAt.x, this.doorAt.y + e * 1.4, this.doorAt.z);
    this.door.matrix.copy(m);
    this.doorBody.setMatrix(m.clone().premultiply(this.matrix));
  }

  #setLever() {
    this.lever.rotation.z = this.leverDown ? -1.0 : 0.55;
  }

  // -------------------------------------------------------------------------

  /** p (world) in island-local terms. */
  #local(p) {
    return _l.copy(p).applyMatrix4(this.inverse);
  }

  interaction(player) {
    if (player.pos.distanceTo(this.center) > 60) return null;
    const l = this.#local(player.pos);
    const Q = this.f.quay;
    const L = this.f.ledge;
    const C = this.f.cave;
    // The handle, in the cleft.
    if (!this.hasHandle && Math.hypot(l.x - ZAWN.handle.x, l.z - ZAWN.handle.z) < 1.6 && l.y > C.shelf - 0.5) {
      return {
        key: 'E',
        label: 'Take the winch handle',
        act: () => {
          this.hasHandle = true;
          this.handleMesh.visible = false;
          this.say?.('An iron crank handle, greased and wrapped in sacking. It will fit a winch.', 3.5);
        },
      };
    }
    // The winch.
    const W = ZAWN.winch;
    if (Math.hypot(l.x - W.x, l.z - W.z) < 1.7 && Math.abs(l.y - Q.y) < 0.8 && player.mode === 'ground') {
      if (this.downWant) return this.down < 1 ? null : { key: '', label: 'The gangway is down.' };
      if (!this.hasHandle) return { key: '', label: "The winch's handle is gone." };
      return {
        key: 'E',
        label: 'Fit the handle and wind',
        act: () => {
          this.crank.visible = true;
          this.downWant = 1;
          this.winding = player;
          player.animOverride = 'crank';
          player.effort = 1;
          this.say?.('The drum turns, and the gangway comes down over the water.', 3);
        },
      };
    }
    // The lever, up on the rock.
    const lv = ZAWN.lever;
    if (!this.leverDown && Math.hypot(l.x - lv.x, l.z - lv.z) < 1.4 && l.y > L.y + lv.top - 0.4 && player.mode === 'ground') {
      return {
        key: 'E',
        label: 'Pull the lever',
        act: () => {
          this.leverDown = true;
          this.#setLever();
          this.doorWant = 1;
          this.say?.('Somewhere in the rock a weight drops, and the cellar door grinds up.', 3.5);
        },
      };
    }
    return null;
  }

  update(dt, { t, player }) {
    if (this.down !== this.downWant) {
      this.down = Math.min(1, this.down + dt / 3.2);
      this.#setGangway();
      if (this.crank.visible) this.crank.rotation.z += dt * 6;
      if (this.down >= 1 && this.winding) {
        this.winding.animOverride = null;
        this.winding.effort = 0;
        this.winding = null;
      }
    }
    if (this.doorUp !== this.doorWant) {
      this.doorUp = Math.min(1, this.doorUp + dt / 2.6);
      this.#setDoor();
    }
    if (player) this.#tide(t, player);
  }

  /** Under water at the arch, or the cave's mouth: say when it'll clear. */
  #tide(t, player) {
    const l = this.#local(player.pos);
    const { zawn: Z, arch: A, cave: C } = this.f;
    const near = (k, inside) => {
      if (!inside) {
        this.told[k] = false;
        return;
      }
      if (this.told[k]) return;
      this.told[k] = true;
      const roof = k === 'arch' ? A.roof : C.roof;
      if (roomUnder(roof, t)) return;
      const mins = Math.max(1, Math.round(tideFallsTo(t, roof - HEADROOM - 0.02) / 60));
      const where = k === 'arch' ? "The arch is under water: the tide's too high to get through." : k === 'cave' ? "The cleft's mouth is under water." : "The tide's over the cleft's mouth: you're shut in.";
      this.say?.(`${where} Low enough in about ${mins} minute${mins === 1 ? '' : 's'}.`, 4.5);
    };
    const low = l.y < 2.5;
    near('arch', low && Math.abs(l.x - Z.x) < Z.w + 3 && Math.abs(l.z - A.z) < A.depth / 2 + 6);
    near('cave', low && Math.abs(l.z - C.z) < C.w + 2 && l.x > C.lip - 4 && l.x < C.lip + 0.5);
    near('shut', low && Math.abs(l.z - C.z) < C.w + 1 && l.x > C.back && l.x < C.x1);
  }
}

const _l = new THREE.Vector3();
const xz = (p) => ({ x: p.x, z: p.z });
