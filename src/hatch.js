import * as THREE from 'three';
import { groundAt } from '../shared/world.js';
import { WRECK, HATCH, stationU, halfBreadth, deckHeight, hatchChest } from '../shared/wreck.js';
import { Body } from './collision.js';
import { paint, mergeParts, segment } from './props.js';

// The Molly Ann's after hatch. When she broke up, the main yard came down
// across it. Somebody rigged a tackle from the yard, over a block on the
// mainmast stump and down the port side to a cargo net, and started weighting
// the net with casks. They got one in. A plank on the stump says how many
// more it needed.
//
// Get enough weight in the net and it sinks, the yard comes up off the hatch,
// the cover slides off, and the chest is in the hatch well.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const ONE = V(1, 1, 1);
const ROPE = '#7d6a4d';
const WOOD = '#5a4a39';
const WOOD_DARK = '#43372b';
const NOTE = ["TWO MORE AND SHE'D", 'HAVE COME UP'];
// Casks lying about: washed up on the cay, adrift in the gap between the
// halves, stranded on the coral west of the stern.
const BARRELS = [
  [262.5, 1.25, -418, 0.3],
  [226, 0.2, -440, 1.2],
  [219, 0.0, -436, 2.1],
];
const SLOTS = [[-0.27, -0.2], [0.27, -0.18], [0, 0.26], [0.2, 0.2]];

export class HatchPuzzle {
  constructor({ scene, world, wreck, treasure, puzzles }) {
    this.world = world;
    this.treasure = treasure;
    this.group = new THREE.Group();
    this.group.name = 'puzzle:hatch';
    scene.add(this.group);
    wreck.updateMatrixWorld(true);
    const stern = (this.stern = wreck.userData.stern);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const h = WRECK.hatch;
    const dy = deckHeight(stationU(h.x));
    this.coamingTop = dy + 0.12 + 0.175;

    // The grating that covers the hatch.
    const ch = V(h.w / 2 - 0.04, 0.05, h.d / 2 - 0.04);
    this.cover = this.#part(gratingGeometry(ch), mat, ch, 'hatch-cover');
    this.cover.closed = local(V(h.x, this.coamingTop + 0.05, 0));
    this.cover.open = local(V(h.x + 0.3, dy + 0.62, 1.32), new THREE.Euler(0.95, 0.1, 0));

    // The main yard lying across it.
    const yh = V(3.4, 0.17, 0.17);
    this.yard = this.#part(yardGeometry(yh.x), mat, yh, 'main-yard');
    this.yard.down = local(V(h.x + 0.25, this.coamingTop + 0.1 + 0.17, 0.1), new THREE.Euler(0, 0.42, 0));
    this.yard.up = local(V(h.x + 0.25, this.coamingTop + 2.3, 0.1), new THREE.Euler(0.12, 0.42, 0.18));

    // The cargo net, hung over the port side at the waterline.
    const u = stationU(HATCH.netX);
    const rail = V(HATCH.netX, deckHeight(u) + 0.8, -halfBreadth(u)).applyMatrix4(stern.matrixWorld);
    const out = V(0, 0, -1).transformDirection(stern.matrixWorld);
    out.y = 0;
    out.normalize();
    this.netAt = rail.clone().addScaledVector(out, 1.05);
    this.netTop = -0.05;
    this.netBottom = Math.max(groundAt(this.netAt.x, this.netAt.z) + 0.08, -0.75);
    this.netYaw = Math.atan2(out.x, out.z);
    this.fairlead = rail.clone().add(V(0, 0.12, 0));
    const nh = V(0.6, 0.05, 0.6);
    this.net = this.#part(netGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), nh, 'cargo-net');
    this.block = V(WRECK.mainmast.x - 0.25, 8.6, 0).applyMatrix4(stern.matrixWorld);
    const blockMesh = new THREE.Mesh(blockGeometry(), mat);
    blockMesh.position.copy(this.block);
    this.group.add(blockMesh);

    // The tackle, redrawn as things move.
    const ropeMat = new THREE.MeshLambertMaterial({ color: ROPE });
    this.ropes = Array.from({ length: 7 }, () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4, 1), ropeMat);
      m.matrixAutoUpdate = false;
      this.group.add(m);
      return m;
    });

    // The note nailed to the stump, facing the hatch.
    const dm = deckHeight(stationU(WRECK.mainmast.x));
    puzzles.addPlank(NOTE, 4420, local(V(WRECK.mainmast.x - WRECK.mainmast.r - 0.02, dm + 1.15, 0), new THREE.Euler(0, -Math.PI / 2, 0)).premultiply(stern.matrixWorld));

    // The casks.
    this.solved = treasure.state.puzzles.includes('molly-ann');
    this.barrels = BARRELS.map(([x, y, z, yaw]) => treasure.spawnBarrel(x, y, z, yaw));
    const first = treasure.spawnBarrel(this.netAt.x, this.netTop + 0.1, this.netAt.z, 0.4);
    this.barrels.push(first);
    this.inNet = [];
    this.#pin(first);
    if (this.solved) {
      for (const b of this.barrels.slice(0, HATCH.needed - 1)) this.#pin(b);
    }
    this.drop = this.solved ? 1 : 0;
    this.lift = this.solved ? 1 : 0;
    this.open = this.solved ? 1 : 0;
    this.chestPlaced = this.solved;
    this.t = 0;
    this.update(0);
  }

  /** A moving piece: mesh plus a one-box collision body. */
  #part(geometry, material, half, name) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    const body = this.world.addBody(new Body([{ center: V(0, 0, 0), half }], name));
    return { mesh, body, matrix: new THREE.Matrix4() };
  }

  #set(part, m) {
    part.matrix.copy(m);
    part.mesh.matrix.copy(m);
    part.body.setMatrix(m);
  }

  #pin(b) {
    b.pinned = true;
    b.vel.set(0, 0, 0);
    b.platform = null;
    this.inNet.push(b);
  }

  #inNet(p) {
    const floor = this.netTop - this.drop * (this.netTop - this.netBottom);
    return Math.hypot(p.x - this.netAt.x, p.z - this.netAt.z) < 0.85 && p.y > floor - 0.6 && p.y < floor + 1.6;
  }

  update(dt) {
    this.t += dt;
    // Casks in and out of the net.
    for (const b of this.barrels) {
      if (b.held && b.pinned) {
        b.pinned = false;
        this.inNet = this.inNet.filter((x) => x !== b);
      } else if (!b.held && !b.pinned && this.#inNet(b.pos)) {
        this.#pin(b);
      }
    }
    const load = this.inNet.length;
    if (load >= HATCH.needed) this.solved = true;
    // Once she's gone down, the net's on the bottom and stays there.
    if (this.solved) for (const b of this.inNet) b.stuck = true;
    const k = (r) => 1 - Math.exp(-dt * r);

    // The net sags with each cask; with enough in, it goes to the bottom.
    const dropTo = this.solved ? 1 : load / (HATCH.needed + 1);
    this.drop += (dropTo - this.drop) * k(2);
    const floor = this.netTop - this.drop * (this.netTop - this.netBottom);
    const nq = new THREE.Quaternion().setFromAxisAngle(UP, this.netYaw);
    this.#set(this.net, new THREE.Matrix4().compose(V(this.netAt.x, floor, this.netAt.z), nq, ONE));
    this.inNet.forEach((b, i) => {
      const [sx, sz] = SLOTS[i % SLOTS.length];
      const off = V(sx, 0, sz).applyQuaternion(nq);
      b.pos.set(this.netAt.x + off.x, floor + 0.06 + Math.floor(i / SLOTS.length) * 0.8, this.netAt.z + off.z);
      b.object.position.copy(b.pos);
      b.object.rotation.set(0, -b.yaw, 0);
    });

    // One short, the yard only stirs. Enough, and it comes up off the hatch.
    const stir = load === HATCH.needed - 1 ? 0.04 + 0.02 * Math.sin(this.t * 1.7) : 0;
    this.lift += ((this.solved ? 1 : stir) - this.lift) * k(this.solved ? 0.7 : 3);
    const e = this.lift * this.lift * (3 - 2 * this.lift);
    this.#set(this.yard, this.#blend(this.yard.down, this.yard.up, e));
    if (this.solved && this.lift > 0.7) this.open = Math.min(1, this.open + dt * 0.8);
    const o = this.open * this.open * (3 - 2 * this.open);
    this.#set(this.cover, this.#blend(this.cover.closed, this.cover.open, o));
    if (this.solved && this.open > 0.25 && !this.chestPlaced) {
      this.chestPlaced = true;
      const at = hatchChest();
      this.treasure.placeCourseChest('molly-ann', { x: at.x, y: at.y + 0.35, z: at.z });
    }

    // The tackle: yard sling → block on the stump → over the rail → down to the net.
    const sling = V(0, 0.17, 0).applyMatrix4(this.yard.matrix);
    const hook = V(this.netAt.x, floor + 1.45, this.netAt.z);
    lineBetween(this.ropes[0], sling, this.block);
    lineBetween(this.ropes[1], this.block, this.fairlead);
    lineBetween(this.ropes[2], this.fairlead, hook);
    [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]].forEach(([cx, cz], i) => {
      const c = V(cx, 0.95, cz).applyQuaternion(nq);
      lineBetween(this.ropes[3 + i], hook, V(this.netAt.x + c.x, floor + c.y, this.netAt.z + c.z));
    });
  }

  /** Stern-local transforms a → b, blended, in world space. */
  #blend(a, b, t) {
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    const s = new THREE.Vector3();
    a.decompose(pa, qa, s);
    b.decompose(pb, qb, s);
    return new THREE.Matrix4().compose(pa.lerp(pb, t), qa.slerp(qb, t), ONE).premultiply(this.stern.matrixWorld);
  }
}

function local(p, euler = new THREE.Euler()) {
  return new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(euler), ONE);
}

function lineBetween(mesh, a, b) {
  const d = b.clone().sub(a);
  const len = d.length() || 1e-3;
  mesh.matrix.compose(a.clone().lerp(b, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len)), V(1, len, 1));
}

// ---------------------------------------------------------------------------

function gratingGeometry(h) {
  const parts = [];
  const box = (x, y, z, sx, sy, sz, c) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    parts.push(paint(g, c));
  };
  box(0, 0, -h.z + 0.05, h.x * 2, h.y * 2, 0.1, WOOD_DARK);
  box(0, 0, h.z - 0.05, h.x * 2, h.y * 2, 0.1, WOOD_DARK);
  box(-h.x + 0.05, 0, 0, 0.1, h.y * 2, h.z * 2 - 0.2, WOOD_DARK);
  box(h.x - 0.05, 0, 0, 0.1, h.y * 2, h.z * 2 - 0.2, WOOD_DARK);
  for (let i = 0; i < 9; i++) box(-h.x + 0.2 + (i * (h.x * 2 - 0.4)) / 8, 0, 0, 0.07, h.y * 1.8, h.z * 2 - 0.15, '#7a6650');
  for (let i = 0; i < 6; i++) box(0, -0.01, -h.z + 0.2 + (i * (h.z * 2 - 0.4)) / 5, h.x * 2 - 0.15, h.y * 1.4, 0.06, WOOD);
  return mergeParts(parts);
}

function yardGeometry(half) {
  const parts = [paint(segment(V(-half, 0, 0), V(half, 0, 0), 0.15, 0.17, 8), WOOD)];
  // Tapered, splintered ends and a rope sling round the middle.
  parts.push(paint(segment(V(half, 0, 0), V(half + 0.4, 0.04, 0.02), 0.13, 0.03, 5), WOOD));
  parts.push(paint(segment(V(-half, 0, 0), V(-half - 0.3, -0.03, 0.01), 0.12, 0.05, 5), WOOD));
  for (const x of [-0.12, 0.12]) {
    const wrap = new THREE.TorusGeometry(0.19, 0.035, 4, 10);
    wrap.rotateY(Math.PI / 2);
    wrap.translate(x, 0, 0);
    parts.push(paint(wrap, ROPE));
  }
  return mergeParts(parts);
}

function netGeometry() {
  // A square bag of rope netting, open at the top.
  const parts = [];
  const s = 0.55;
  const top = 0.95;
  const line = (a, b) => parts.push(paint(segment(a, b, 0.018, 0.018, 3), ROPE));
  for (let i = 0; i <= 4; i++) {
    const t = -s + (i / 4) * 2 * s;
    line(V(t, 0, -s), V(t, top, -s));
    line(V(t, 0, s), V(t, top, s));
    line(V(-s, 0, t), V(-s, top, t));
    line(V(s, 0, t), V(s, top, t));
    line(V(t, 0, -s), V(t, 0, s));
    line(V(-s, 0, t), V(s, 0, t));
  }
  for (const y of [0.32, 0.64, top]) {
    line(V(-s, y, -s), V(s, y, -s));
    line(V(-s, y, s), V(s, y, s));
    line(V(-s, y, -s), V(-s, y, s));
    line(V(s, y, -s), V(s, y, s));
  }
  return mergeParts(parts);
}

function blockGeometry() {
  const parts = [];
  const shell = new THREE.SphereGeometry(0.16, 8, 6);
  shell.scale(0.7, 1.1, 0.5);
  parts.push(paint(shell, WOOD_DARK));
  const sheave = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10);
  sheave.rotateX(Math.PI / 2);
  parts.push(paint(sheave, '#3a3530'));
  return mergeParts(parts);
}
