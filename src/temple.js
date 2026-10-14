import * as THREE from 'three';
import { makeBox, Body } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { deepenShadows } from './atmosphere.js';
import { hash2 } from '../shared/noise.js';
import { groundAt } from '../shared/world.js';
import { TEMPLE, templeFrame, templeRooms, sectionYaw, stairAt, rampAt } from '../shared/temple.js';
import { TEMPLE as AT_TEMPLE, DONE, KEEPERS } from '../shared/story.js';
import { drawSign } from './story.js';
import { setTerrainHoles } from './terrain.js';

// The keepers' temple, inside the big hill on Saddle (the plan, and the
// numbers: shared/temple.js).
//
// Shut, until you've all eight keys: then they turn in the gate's eight locks
// and it opens. Inside, it goes in under the hill and down, a part at a time,
// each with a brazier at its start that lights as you reach it; a trap sends
// you back to the last one lit (nothing worse). Blades across a hall; a pit
// crossed on pillars; the keepers' plates; a broken stair; spikes in waves; a
// room of mirrors; a cistern to flood; a bridge that falls; a boulder at your
// back; the door of dials; and the black water round the Heart of the Sea.
// Lift it, and the story's done (src/main.js has the film).
//
// Each part is built in its own frame (a Sec, below): in from its doorway
// toward −z, x across, y up from its floor. Its traps and the bear's place in
// it are worked out in that frame too.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const ONE = V(1, 1, 1);
const TAU = Math.PI * 2;
const S = TEMPLE.sections;
const STONE = ['#ada188', '#a89c83', '#b2a68c', '#a59980', '#aa9e85'];
const STONE_DARK = '#8a7e68';
const ROCK = ['#7b766c', '#716b61', '#837d72', '#6a655c'];
const MOSS = '#7c8a5a';
const FLAGS = ['#a89a80', '#9f9178', '#b0a287'];
const IRON = '#3a3530';
const BRONZE = '#9a7a3a';
const WATER = '#14262b';
const SOLID = { noGrab: true, noClimb: true };
const pick = (list, i, j) => list[Math.floor(hash2(i, j, 1301) * list.length) % list.length];
// What you notice as each brazier catches, by its part.
const BRAZIER_HINTS = {
  pit: 'Not every pillar will hold you for long.',
  keepers: 'Eight plates in the floor, and eight keepers round them.',
  stair: 'Steps have fallen out of the stair below. Take it at a run.',
  spikes: 'The floor’s in plates, and they don’t sit still. Watch a wave go by, then run.',
  mirrors: 'A bar of daylight, and bronze mirrors on posts.',
  cistern: 'The way on is high in the far wall.',
  bridge: 'The slabs won’t hold you for long. Keep going.',
  sanctum: 'Black water, and something green beyond it.',
};

/** A box of stone in courses, coloured per face (moss low down). */
function stoneBox(x0, x1, y0, y1, z0, z1, seed, course = 0.5, palette = STONE) {
  const nx = Math.max(1, Math.round((x1 - x0) / 0.9));
  const ny = Math.max(1, Math.round((y1 - y0) / course));
  const nz = Math.max(1, Math.round((z1 - z0) / 0.9));
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, Math.min(nx, 40), Math.min(ny, 40), Math.min(nz, 40));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const ng = g.toNonIndexed();
  const q = ng.attributes.position;
  const col = new Float32Array(q.count * 3);
  const c = new THREE.Color();
  const moss = new THREE.Color(MOSS);
  for (let i = 0; i < q.count; i += 6) {
    const y = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3;
    c.set(pick(palette, i, seed));
    if (palette === STONE && y < 0.6 && y > -0.6) c.lerp(moss, 0.3 * (1 - Math.abs(y) / 0.6));
    for (let m = 0; m < 6 && i + m < q.count; m++) col.set([c.r, c.g, c.b], (i + m) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.deleteAttribute('uv');
  ng.deleteAttribute('normal');
  return ng;
}

/** The eight signs on one strip of canvas, for carvings: sign k (1…8) is the k-th square. */
function signAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');
  for (let k = 1; k <= 8; k++) drawSign(ctx, KEEPERS[k].sign, (k - 0.5) * 128, 64, 104, { fill: '#d6b25e', stroke: '#2e261c', width: 1.4 });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A square showing sign k, facing +z, `size` across. */
function signQuad(k, size) {
  const g = new THREE.PlaneGeometry(size, size);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (k - 1 + uv.getX(i)) / 8);
  return g;
}

/** A part of the temple, in its own frame. */
class Sec {
  constructor(temple, id) {
    const s = S[id];
    this.id = id;
    this.s = s;
    const yaw = sectionYaw(s);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.toTF = new THREE.Matrix4().compose(V(...s.at), q, ONE);
    this.toWorld = this.toTF.clone().premultiply(temple.matrix);
    this.fromWorld = this.toWorld.clone().invert();
    this.quat = temple.quat.clone().multiply(q);
    this.group = new THREE.Group();
    this.group.position.set(...s.at);
    this.group.rotation.y = yaw;
    temple.group.add(this.group);
    this.l = V(0, 0, 0); // the bear, in this frame (updated each frame while it matters)
  }

  w(x, y, z) {
    return V(x, y, z).applyMatrix4(this.toWorld);
  }

  local(p, out = this.l) {
    return out.copy(p).applyMatrix4(this.fromWorld);
  }
}

export class Temple {
  constructor({ scene, world, progress }) {
    this.world = world;
    this.progress = progress;
    const f = templeFrame();
    this.group = new THREE.Group();
    this.group.name = 'temple';
    this.group.position.set(f.x, f.y, f.z);
    this.group.rotation.y = f.yaw;
    scene.add(this.group);
    this.group.updateMatrixWorld(true);
    this.matrix = this.group.matrixWorld.clone();
    this.inverse = this.matrix.clone().invert();
    this.quat = this.group.quaternion.clone();
    this.center = V(f.x, f.y, f.z);
    this.sec = Object.fromEntries(TEMPLE.order.map((id) => [id, new Sec(this, id)]));

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const atlas = signAtlas();
    this.signMat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.signLitMat = new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(2.2, 1.9, 1.1), transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.parts = [];
    this.signParts = [];
    this.flameParts = [];

    this.#hall();
    this.#bladesHall();
    this.#pitRoom();
    this.#keepersRoom();
    this.#stairRoom();
    this.#spikesRoom();
    this.#mirrorRoom();
    this.#cisternRoom();
    this.#landingRoom();
    this.#bridgeRoom();
    this.#boulderRoom();
    this.#sanctumRoom();

    const mesh = new THREE.Mesh(mergeParts(this.parts), deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (this.signParts.length) {
      const sg = mergeGeos(this.signParts);
      this.group.add(new THREE.Mesh(sg, this.signMat));
    }
    this.flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.35) });
    if (this.flameParts.length) this.group.add(new THREE.Mesh(mergeGeos(this.flameParts), this.flameMat));
    this.parts = this.signParts = this.flameParts = null;

    this.#gate();
    this.#blades();
    this.#pillars();
    this.#plates();
    this.#spikes();
    this.#mirrors();
    this.#cistern();
    this.#slabs();
    this.#boulder();
    this.#dials();
    this.#stones();
    this.#braziers();
    this.#heart();
    this.#cavities();

    this.checkpoint = 0;
    this.failT = 0;
    this.t = 0;
    this.fade = document.createElement('div');
    this.fade.className = 'temple-fade';
    document.body.appendChild(this.fade);
    this.sync();
    progress.onChange?.(() => this.sync());
  }

  /** The story's state now: shut or open, the Heart lifted or not. */
  sync() {
    const st = this.progress.state?.story ?? { ch: 0, keys: [] };
    this.story = st;
    this.open = !!st.open || st.ch === DONE;
    this.done = st.ch === DONE;
    if (this.open && this.gateWant !== 1) this.gateWant = 1;
    for (let i = 0; i < this.keyholes.length; i++) this.keyholes[i].material = (st.keys ?? []).includes(i + 1) ? this.goldMat : this.holeMat;
    this.heartLit = this.done ? 1 : this.heartLit ?? 0;
    // (Once it's all done, the doors inside stand open.)
    if (this.done) {
      this.keepersOpen = this.mirrorOpen = this.dialOpen = true;
    }
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  /** Stone, drawn and (unless solid: false) solid. */
  #stone(sec, x0, x1, y0, y1, z0, z1, seed, { solid = true, flags = SOLID, palette = STONE, course = 0.5 } = {}) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    this.parts.push(stoneBox(x0, x1, y0, y1, z0, z1, seed, course, palette).applyMatrix4(sec.toTF));
    if (solid) this.#col(sec, x0, x1, y0, y1, z0, z1, flags);
  }

  /** Something solid, in a part's frame (long ones in pieces, for the collision grid). */
  #col(sec, x0, x1, y0, y1, z0, z1, flags = {}) {
    const lx = x1 - x0;
    const lz = z1 - z0;
    const n = Math.max(1, Math.ceil(Math.max(lx, lz) / 8));
    for (let i = 0; i < n; i++) {
      const along = lx >= lz;
      const a0 = along ? x0 + (lx * i) / n : z0 + (lz * i) / n;
      const a1 = along ? x0 + (lx * (i + 1)) / n : z0 + (lz * (i + 1)) / n;
      const [bx0, bx1, bz0, bz1] = along ? [a0, a1, z0, z1] : [x0, x1, a0, a1];
      this.world.addStatic(makeBox({ center: sec.w((bx0 + bx1) / 2, (y0 + y1) / 2, (bz0 + bz1) / 2), half: V((bx1 - bx0) / 2, (y1 - y0) / 2, (bz1 - bz0) / 2), quaternion: sec.quat, ...flags }));
    }
  }

  /** Any geometry, painted, in a part's frame. */
  #draw(sec, geo, color) {
    this.parts.push((color ? paint(geo, color) : geo).applyMatrix4(sec.toTF));
  }

  /** A carved sign (1…8) on a face, in a part's frame. */
  #sign(sec, k, x, y, z, size, yaw = 0, pitch = 0) {
    const g = signQuad(k, size);
    if (pitch) g.rotateX(pitch);
    g.rotateY(yaw);
    g.translate(x, y, z);
    this.signParts.push(g.applyMatrix4(sec.toTF));
  }

  /** Flagstones, and the floor under them. */
  #floor(sec, x0, x1, z0, z1, y, seed) {
    const za = Math.min(z0, z1);
    const zb = Math.max(z0, z1);
    const nx = Math.max(1, Math.round((x1 - x0) / 1.2));
    const nz = Math.max(1, Math.round((zb - za) / 1.2));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const g = new THREE.BoxGeometry((x1 - x0) / nx - 0.03, 0.12, (zb - za) / nz - 0.03);
        g.translate(x0 + ((i + 0.5) * (x1 - x0)) / nx, y - 0.06, za + ((j + 0.5) * (zb - za)) / nz);
        this.#draw(sec, g, pick(FLAGS, i * 31 + j, seed));
      }
    }
    this.#col(sec, x0, x1, y - 0.8, y, za, zb);
  }

  /** A slab of ceiling (underside at y). */
  #ceiling(sec, x0, x1, z0, z1, y, seed) {
    this.#stone(sec, x0, x1, y, y + 0.6, Math.min(z0, z1), Math.max(z0, z1), seed, { palette: [STONE_DARK, '#857a64', '#7f745f'], course: 0.6 });
  }

  /** A wall across at z (0.9 thick), from −half to half, with a doorway {half, h, sill, x} in it or none. */
  #across(sec, z, half, y0, y1, seed, door = null, palette = STONE) {
    const z0 = z - 0.45;
    const z1 = z + 0.45;
    const o = { palette };
    if (!door) return this.#stone(sec, -half, half, y0, y1, z0, z1, seed, o);
    const dx = door.x ?? 0;
    const sill = door.sill ?? 0;
    this.#stone(sec, -half, dx - door.half, y0, y1, z0, z1, seed, o);
    this.#stone(sec, dx + door.half, half, y0, y1, z0, z1, seed + 1, o);
    this.#stone(sec, dx - door.half, dx + door.half, sill + door.h, y1, z0, z1, seed + 2, o);
    if (sill > y0) this.#stone(sec, dx - door.half, dx + door.half, y0, sill, z0, z1, seed + 3, { ...o, flags: {} });
  }

  /**
   * The walls down both sides (0.9 thick, outside ±half), from z0 to z1, less
   * any openings: {left: [[za, zb, ya, yb]], right: [...]}, open between ya
   * and yb (all the way up and down if those are left out).
   */
  #sides(sec, z0, z1, y0, y1, half, seed, gaps = {}, palette = STONE) {
    for (const sd of [-1, 1]) {
      const xa = sd < 0 ? -half - 0.9 : half;
      const xb = sd < 0 ? -half : half + 0.9;
      const holes = (gaps[sd < 0 ? 'left' : 'right'] ?? []).map(([a, b, ya = -Infinity, yb = Infinity]) => [Math.max(a, b), Math.min(a, b), ya, yb]).sort((a, b) => b[0] - a[0]);
      let from = Math.max(z0, z1);
      const end = Math.min(z0, z1);
      for (const [ha, hb, ya, yb] of [...holes, [end, end, 0, 0]]) {
        if (from > ha) this.#stone(sec, xa, xb, y0, y1, ha, from, seed + Math.round(from), { palette });
        if (ha > hb) {
          // Wall over and under the opening.
          const za = Math.max(hb, end);
          if (ya > y0) this.#stone(sec, xa, xb, y0, Math.min(ya, y1), za, ha, seed + 500 + Math.round(ha), { palette });
          if (yb < y1) this.#stone(sec, xa, xb, Math.max(yb, y0), y1, za, ha, seed + 600 + Math.round(ha), { palette });
        }
        from = Math.min(from, hb);
      }
    }
  }

  /** A torch in an iron bracket on a wall (side −1 left, 1 right), its flame lit. */
  #torch(sec, x, y, z, side) {
    const out = -side; // away from the wall
    this.#draw(sec, segment(V(x, y - 0.35, z), V(x + out * 0.28, y, z), 0.03, 0.03, 4), IRON);
    const cup = new THREE.CylinderGeometry(0.09, 0.05, 0.14, 6);
    cup.translate(x + out * 0.3, y + 0.05, z);
    this.#draw(sec, cup, IRON);
    const fl = new THREE.ConeGeometry(0.08, 0.3, 5);
    fl.translate(x + out * 0.3, y + 0.27, z);
    this.flameParts.push(fl.applyMatrix4(sec.toTF));
  }

  // --- The entrance hall, and the face of it in the hillside ---------------

  #hall() {
    const sec = this.sec.hall;
    const s = sec.s;
    const H = s.h;
    const g = TEMPLE.gate;
    this.#floor(sec, -s.half, s.half, 2.6, -s.len, 0, 1);
    this.#sides(sec, 0, -s.len, -0.6, H + 0.6, s.half, 10);
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, H, 11);
    this.#across(sec, -s.len, s.half + 0.9, -0.6, Math.max(H, S.blades.h) + 0.6, 12, s.door);
    // The face: big stones round the gate, cut back into the hill.
    this.#stone(sec, -13, -g.half, -0.6, 9.5, 0, 1.4, 20);
    this.#stone(sec, g.half, 13, -0.6, 9.5, 0, 1.4, 21);
    this.#stone(sec, -g.half, g.half, g.h, 9.5, 0, 1.4, 22);
    this.#stone(sec, -13.6, 13.6, 9.5, 10.3, -0.3, 1.9, 23, { palette: [STONE_DARK] });
    // Pillars either side of the gate, a wave cut in each; the lintel over it.
    for (const sd of [-1, 1]) {
      const x = sd * (g.half + 1.3);
      this.#stone(sec, x - 0.6, x + 0.6, -0.6, 9.5, 1.4, 2.3, 24 + sd);
      for (let k = 0; k < 3; k++) {
        const w = new THREE.TorusGeometry(0.15, 0.035, 3, 8, Math.PI);
        w.translate(x - 0.3 + k * 0.3, 6.6, 2.32);
        this.#draw(sec, w, STONE_DARK);
      }
      // And the hillside's last stones, stepping back.
      this.#stone(sec, sd * 13 - 1.2, sd * 13 + 1.2, -0.6, 7.5, -0.4, 2.2, 28 + sd);
    }
    this.#stone(sec, -g.half - 0.7, g.half + 0.7, g.h, g.h + 0.8, 1.4, 1.75, 27, { solid: false });
    // The keepers, carved four to a side as you go in, in their order.
    this.reliefs = [];
    for (let k = 1; k <= 8; k++) {
      const sd = k <= 4 ? -1 : 1;
      const z = -3 - ((k - 1) % 4) * 2.6;
      const x = sd * (s.half - 0.06);
      this.#stone(sec, sd < 0 ? x : x - 0.1, sd < 0 ? x + 0.1 : x, 1.0, 3.4, z - 0.75, z + 0.75, 40 + k, { solid: false, palette: [STONE_DARK] });
      this.#sign(sec, k, x - sd * 0.12, 2.6, z, 0.85, -sd * Math.PI / 2);
      this.reliefs.push({ k, x: x - sd * 0.6, z });
    }
    this.#torch(sec, -s.half, 3.2, -1.3, -1);
    this.#torch(sec, s.half, 3.2, -1.3, 1);
    this.#torch(sec, -s.half, 3.2, -12.5, -1);
    this.#torch(sec, s.half, 3.2, -12.5, 1);
    this.#cap(sec);
  }

  /**
   * The hill put back over the cut the entrance hall's in: rock from the
   * ground (or the hall's roof) up to the hillside either side.
   */
  #cap(sec) {
    const base = this.center.y;
    const hillAt = (x, z) => {
      const a = sec.w(-15, 0, z);
      const b = sec.w(15, 0, z);
      return Math.max(groundAt(a.x, a.z), groundAt(b.x, b.z)) - base;
    };
    const roofAt = (x, z) => {
      if (z > -S.hall.len && Math.abs(x) < S.hall.half + 1.2) return S.hall.h + 0.6;
      if (z <= -S.hall.len && Math.abs(x) < S.blades.half + 1.2) return S.blades.h + 0.6;
      const p = sec.w(x, 0, z);
      return Math.min(groundAt(p.x, p.z) - base - 0.4, 6);
    };
    const nx = 12;
    const nz = 12;
    const x0 = -12.5;
    const x1 = 12.5;
    const z0 = 1.6;
    const z1 = -24;
    const geo = new THREE.BoxGeometry(1, 1, 1, nx, 1, nz);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = x0 + (x1 - x0) * (p.getX(i) + 0.5);
      const z = z0 + (z1 - z0) * (p.getZ(i) + 0.5);
      const b = roofAt(x, z);
      const top = Math.max(hillAt(x, z) + 0.4, b + 1.2);
      const j = hash2(Math.round(x * 3), Math.round(z * 3), 911) - 0.5;
      p.setXYZ(i, x, p.getY(i) > 0 ? top + j * 0.4 : b, z);
    }
    const ng = geo.toNonIndexed();
    ng.computeVertexNormals();
    const q = ng.attributes.position;
    const nrm = ng.attributes.normal;
    const col = new Float32Array(q.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < q.count; i += 3) {
      const up = (nrm.getY(i) + nrm.getY(i + 1) + nrm.getY(i + 2)) / 3;
      c.set(up > 0.6 ? pick(['#7cae4e', '#5f9442', '#6fa047'], i, 5) : pick(ROCK, i, 6));
      for (let m = 0; m < 3; m++) col.set([c.r, c.g, c.b], (i + m) * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ng.deleteAttribute('uv');
    ng.deleteAttribute('normal');
    this.parts.push(ng.applyMatrix4(sec.toTF));
  }

  // --- The blades ----------------------------------------------------------

  #bladesHall() {
    const sec = this.sec.blades;
    const s = sec.s;
    this.#floor(sec, -s.half, s.half, 0, -s.len, 0, 2);
    this.#sides(sec, 0, -s.len, -0.6, s.h + 0.6, s.half, 60);
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, s.h, 61);
    this.#across(sec, -s.len, S.pit.half + 0.9, -0.6, Math.max(s.h, S.pit.h) + 0.6, 62, s.door);
    s.zs.forEach((z, k) => {
      // The beam each one hangs from, across under the roof.
      this.#stone(sec, -s.half, s.half, s.pivot + 0.1, s.pivot + 0.6, z - 0.3, z + 0.3, 300 + k, { solid: false, palette: [STONE_DARK] });
    });
    for (const z of [-2, -12.2, -23.2]) {
      this.#torch(sec, -s.half, 3.0, z, -1);
      this.#torch(sec, s.half, 3.0, z, 1);
    }
  }

  // --- The pit -------------------------------------------------------------

  #pitRoom() {
    const sec = this.sec.pit;
    const s = sec.s;
    const D = s.depth;
    const [a, b] = s.ledges;
    this.#floor(sec, -s.half, s.half, 0, -a, 0, 3);
    this.#floor(sec, -s.half, s.half, -s.len + b, -s.len, 0, 4);
    // The ledges are solid rock down to the bottom, sheer on the pit side.
    this.#stone(sec, -s.half, s.half, -D, -0.05, -a, 0, 80, { flags: { noGrab: true } });
    this.#stone(sec, -s.half, s.half, -D, -0.05, -s.len, -s.len + b, 81, { flags: { noGrab: true } });
    const fl = new THREE.BoxGeometry(2 * s.half, 0.3, s.len - a - b);
    fl.translate(0, -D + 0.15, -a - (s.len - a - b) / 2);
    this.#draw(sec, fl, '#3f3a32');
    this.#col(sec, -s.half, s.half, -D - 1, -D + 0.3, -s.len + b, -a);
    for (let i = 0; i < 90; i++) {
      const x = (hash2(i, 1, 9) - 0.5) * 2 * (s.half - 0.4);
      const z = -a - 0.4 - hash2(i, 2, 9) * (s.len - a - b - 0.8);
      const c = new THREE.ConeGeometry(0.09, 0.7, 4);
      c.translate(x, -D + 0.65, z);
      this.#draw(sec, c, IRON);
    }
    this.#sides(sec, 0, -s.len, -D - 0.6, s.h + 0.6, s.half, 90);
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, s.h, 91);
    this.#across(sec, -s.len, S.keepers.half + 0.9, -0.6, Math.max(s.h, S.keepers.h) + 0.6, 92, s.door);
    for (const z of [-1.5, -28.5]) {
      this.#torch(sec, -s.half, 3.2, z, -1);
      this.#torch(sec, s.half, 3.2, z, 1);
    }
  }

  // --- The keepers' hall ---------------------------------------------------

  #keepersRoom() {
    const sec = this.sec.keepers;
    const s = sec.s;
    this.#floor(sec, -s.half, s.half, 0, -s.len, 0, 5);
    this.#sides(sec, 0, -s.len, -0.6, s.h + 0.6, s.half, 110);
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, s.h, 111);
    this.#across(sec, -s.len, s.half + 0.9, -0.6, s.h + 0.6, 112, s.door);
    // The keepers in stone along the walls, each with their sign on a disc of bronze.
    for (const [k, x, z] of s.statues) {
      const sd = Math.sign(x);
      this.#stone(sec, x - 0.6, x + 0.6, 0, 0.5, z - 0.6, z + 0.6, 120 + k, { flags: { noGrab: true } });
      const body = new THREE.CylinderGeometry(0.36, 0.5, 2.3, 8);
      body.translate(x, 1.65, z);
      this.#draw(sec, body, pick(STONE, k, 7));
      const head = new THREE.IcosahedronGeometry(0.32, 1);
      head.translate(x, 3.05, z);
      this.#draw(sec, head, pick(STONE, k + 3, 7));
      const disc = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 14);
      disc.rotateZ(Math.PI / 2);
      disc.translate(x - sd * 0.42, 2.0, z);
      this.#draw(sec, disc, BRONZE);
      this.#sign(sec, k, x - sd * 0.46, 2.0, z, 0.68, -sd * Math.PI / 2);
      this.world.addStatic({ type: 'cyl', ...xz(sec.w(x, 0, z)), r: 0.55, y0: sec.w(0, 0, 0).y - 0.5, y1: sec.w(0, 3.3, 0).y });
    }
    // Over the far door, a tablet with words cut in it (read it: E).
    this.#stone(sec, -2.4, 2.4, s.door.h + 0.5, s.door.h + 1.6, -s.len + 0.45, -s.len + 0.6, 130, { solid: false, palette: [STONE_DARK] });
    for (const sd of [-1, 1]) {
      this.#torch(sec, sd * s.half, 3.4, -2.2, sd);
      this.#torch(sec, sd * s.half, 3.4, -s.len + 1.5, sd);
    }
  }

  // --- The stair down ------------------------------------------------------

  #stairRoom() {
    const sec = this.sec.stair;
    const s = sec.s;
    const run = (s.top - s.foot) / s.steps;
    const rise = s.drop / s.steps;
    this.#floor(sec, -s.half, s.half, 0, s.top, 0, 6);
    for (let i = 0; i < s.steps; i++) {
      const za = s.top - i * run;
      const zb = za - run;
      const y = -(i + 1) * rise;
      this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, za, zb, y + s.h + rise, 170 + i);
      if (s.gone.includes(i)) {
        // A broken stub at the wall, where the step was.
        this.#stone(sec, -s.half, -s.half + 0.35, y - 0.6, y - 0.15, zb, za, 140 + i, { solid: false });
        continue;
      }
      // (No catching hold of a step's edge: fall short of one and you're down in the dark.)
      this.#stone(sec, -s.half, s.half, y - 1.1, y, zb, za, 140 + i, { flags: { noGrab: true } });
    }
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0.5, s.top, s.h, 168);
    // The landing at the foot, and the dark under the stair.
    this.#floor(sec, -s.half, s.half, s.foot, -s.len, -s.drop, 7);
    this.#ceiling(sec, -s.half - 0.9, s.half, s.foot, -s.len - 0.45, -s.drop + S.spikes.h, 169);
    const pit = new THREE.BoxGeometry(2 * s.half, 0.3, s.top - s.foot);
    pit.translate(0, -s.drop - 4.15, (s.top + s.foot) / 2);
    this.#draw(sec, pit, '#24211d');
    this.#col(sec, -s.half, s.half, -s.drop - 5, -s.drop - 4, s.foot, s.top);
    // Walls down to the dark: the left all the way, the right to the landing (open to the spikes).
    this.#sides(sec, 0, -s.len, -s.drop - 4.6, s.h + 0.6, s.half, 200, { right: [[s.foot, -s.len, -s.drop - 0.8, -s.drop + S.spikes.h + 0.6]] });
    this.#across(sec, -s.len, s.half + 0.9, -s.drop - 0.6, -s.drop + 6.6, 210);
    for (const z of [-1.2, -11, -19]) this.#torch(sec, -s.half, stairAt(z) + 2.8, z, -1);
  }

  // --- The spikes ----------------------------------------------------------

  #spikesRoom() {
    const sec = this.sec.spikes;
    const s = sec.s;
    this.#floor(sec, -s.half, s.half, 0, -s.len, 0, 8);
    this.#sides(sec, 0, -s.len, -0.6, s.h + 0.6, s.half, 220);
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, s.h, 221);
    this.#across(sec, -s.len, S.mirrors.half + 0.9, -0.6, Math.max(s.h, S.mirrors.h) + 0.6, 222, s.door);
    for (const z of [-1.2, -16.9, -31]) {
      this.#torch(sec, -s.half, 3.0, z, -1);
      this.#torch(sec, s.half, 3.0, z, 1);
    }
  }

  // --- The mirrors ---------------------------------------------------------

  #mirrorRoom() {
    const sec = this.sec.mirrors;
    const s = sec.s;
    this.#floor(sec, -s.half, s.half, 0, -s.len, 0, 9);
    this.#sides(sec, 0, -s.len, -0.6, s.h + 0.6, s.half, 240);
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, s.h, 241);
    this.#across(sec, -s.len, S.cistern.half + 2.9, S.cistern.bottom - 0.6, Math.max(s.h, S.cistern.h) + 0.6, 242, s.door);
    // The slot in the left wall the daylight comes through.
    const [bx, bz] = s.beam.from;
    const slot = new THREE.BoxGeometry(0.06, 0.16, 0.5);
    slot.translate(bx + 0.02, s.beam.y, bz);
    this.flameParts.push(slot.applyMatrix4(sec.toTF));
    // Stone posts.
    for (const [x, z, h] of s.posts) {
      this.#stone(sec, x - h, x + h, 0, s.h, z - h, z + h, 250 + Math.round(x * 3 + z), { flags: { noGrab: true } });
    }
    for (const sd of [-1, 1]) this.#torch(sec, sd * s.half, 3.6, -14.5, sd);
  }

  // --- The cistern ---------------------------------------------------------

  #cisternRoom() {
    const sec = this.sec.cistern;
    const s = sec.s;
    const B = s.bottom;
    this.#floor(sec, -s.half, s.half, 0, -s.ledge, 0, 10);
    this.#stone(sec, -s.half, s.half, B, -0.05, -s.ledge, 0, 260, { flags: { noGrab: true } });
    const fl = new THREE.BoxGeometry(2 * s.half, 0.3, s.len - s.ledge);
    fl.translate(0, B - 0.15, -s.ledge - (s.len - s.ledge) / 2);
    this.#draw(sec, fl, '#4a463d');
    this.#col(sec, -s.half, s.half, B - 1, B, -s.len, -s.ledge);
    this.#sides(sec, 0, -s.len, B - 0.6, s.h + 0.6, s.half, 270);
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, s.h, 271);
    this.#across(sec, -s.len, s.half + 0.9, B - 0.6, Math.max(s.h, s.door.sill + S.landing.h) + 0.6, 272, s.door);
    // A tide mark round the walls, high up.
    for (const sd of [-1, 1]) {
      const m = new THREE.BoxGeometry(0.02, 0.25, s.len - s.ledge);
      m.translate(sd * (s.half - 0.01), s.high + 0.1, -s.ledge - (s.len - s.ledge) / 2);
      this.#draw(sec, m, '#5d5a4c');
    }
    // The sluice, a dark mouth high in the left wall.
    const mouth = new THREE.BoxGeometry(0.1, 0.8, 1.2);
    mouth.translate(-s.half + 0.02, 9.2, -8);
    this.#draw(sec, mouth, '#191612');
    // The ladder down the ledge's face.
    const L = s.ladder;
    for (const dx of [-L.w / 2, L.w / 2]) this.#draw(sec, segment(V(L.x + dx, B, -s.ledge - 0.12), V(L.x + dx, 0.6, -s.ledge - 0.12), 0.04, 0.04, 5), IRON);
    for (let y = B + 0.35; y < 0; y += 0.35) this.#draw(sec, segment(V(L.x - L.w / 2, y, -s.ledge - 0.12), V(L.x + L.w / 2, y, -s.ledge - 0.12), 0.025, 0.025, 4), IRON);
    this.world.climbables ??= [];
    this.world.climbables.push({
      o: sec.w(L.x - L.w / 2, B, -s.ledge - 0.2),
      r: dirW(sec, 1, 0, 0),
      u: dirW(sec, 0, 1, 0),
      n: dirW(sec, 0, 0, -1),
      w: L.w,
      h: -B,
      exit: sec.w(L.x, 0.1, -s.ledge + 0.9),
    });
    this.#torch(sec, -s.half, 3.2, -1.2, -1);
    this.#torch(sec, s.half, 3.2, -1.2, 1);
    this.#torch(sec, s.half, 9.0, -12.5, 1);
  }

  // --- The landing, and the bridge -----------------------------------------

  #landingRoom() {
    const sec = this.sec.landing;
    const s = sec.s;
    this.#floor(sec, -s.half, s.half, 0, -s.len, 0, 11);
    this.#sides(sec, 0, -s.len, -0.6, s.h + 0.6, s.half, 280, { right: [[...s.open, -0.8, s.h + 0.6]] });
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, s.h, 281);
    this.#across(sec, -s.len, s.half + 0.9, -0.6, S.bridge.h + 0.6, 282);
    this.#torch(sec, -s.half, 2.8, -5.5, -1);
  }

  #bridgeRoom() {
    const sec = this.sec.bridge;
    const s = sec.s;
    const D = s.depth;
    const [a, b] = s.ledges;
    this.#floor(sec, -s.half, s.half, 0, -a, 0, 12);
    this.#floor(sec, -s.half, s.half, -s.len + b, -s.len, 0, 13);
    this.#stone(sec, -s.half, s.half, -D, -0.05, -a, 0, 290, { flags: { noGrab: true } });
    this.#stone(sec, -s.half, s.half, -D, -0.05, -s.len, -s.len + b, 291, { flags: { noGrab: true } });
    // Far down, rubble.
    const fl = new THREE.BoxGeometry(2 * s.half, 0.3, s.len - a - b);
    fl.translate(0, -D + 0.15, -a - (s.len - a - b) / 2);
    this.#draw(sec, fl, '#2f2b26');
    this.#col(sec, -s.half, s.half, -D - 1, -D + 0.3, -s.len + b, -a);
    for (let i = 0; i < 26; i++) {
      const r = rock(0.4 + hash2(i, 3, 4) * 0.7, 8800 + i, pick(ROCK, i, 3), 0.6);
      r.translate((hash2(i, 1, 4) - 0.5) * 2 * (s.half - 0.6), -D + 0.3, -a - 0.5 - hash2(i, 2, 4) * (s.len - a - b - 1));
      this.#draw(sec, r);
    }
    this.#sides(sec, 0, -s.len, -D - 0.6, s.h + 0.6, s.half, 300, { right: [[-s.len + b, -s.len, -0.8, S.boulder.h + 0.6]] }, ROCK);
    this.#ceiling(sec, -s.half - 0.9, s.half + 0.9, 0, -s.len, s.h, 301);
    this.#across(sec, -s.len, s.half + 0.9, -0.6, s.h + 0.6, 302);
    // Two old ropes along where the slabs are, slack between their posts.
    for (const sd of [-1, 1]) {
      const x = sd * (s.width + 0.25);
      for (const z of [-a + 0.3, -s.len + b - 0.3]) this.#draw(sec, segment(V(x, 0, z), V(x, 1.1, z), 0.06, 0.05, 5), '#5a4a39');
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        pts.push(V(x, 1.05 - Math.sin(t * Math.PI) * 0.9, -a + 0.3 - t * (s.len - a - b - 0.6)));
      }
      for (let i = 0; i < 16; i++) this.#draw(sec, segment(pts[i], pts[i + 1], 0.025, 0.025, 4), '#7d6a4d');
    }
    this.#torch(sec, -s.half, 3.0, -1.2, -1);
    this.#torch(sec, s.half, 3.0, -1.2, 1);
    this.#torch(sec, -s.half, 3.0, -s.len + 1.2, -1);
  }

  // --- The boulder's ramp ----------------------------------------------------

  #boulderRoom() {
    const sec = this.sec.boulder;
    const R = sec.s;
    const H = R.h;
    const [s0, s1] = R.slot;
    this.#floor(sec, -R.half, R.half, 0, R.top, 0, 14);
    this.#floor(sec, -R.half, R.half, R.foot, s0, -R.drop, 15);
    this.#floor(sec, -R.half, R.half, s1, -R.len, -R.drop, 16);
    // The ramp: a slope of flags (and solid under it).
    const len = Math.hypot(R.top - R.foot, R.drop);
    const pitch = -Math.atan2(R.drop, R.top - R.foot);
    const rg = new THREE.BoxGeometry(2 * R.half, 0.5, len, 5, 1, Math.round(len / 1.2));
    rg.translate(0, -0.25, 0);
    rg.rotateX(pitch);
    rg.translate(0, -R.drop / 2, (R.top + R.foot) / 2);
    const rp = rg.toNonIndexed();
    const rc = new Float32Array(rp.attributes.position.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < rp.attributes.position.count; i += 6) {
      c.set(pick(FLAGS, i, 6));
      for (let m = 0; m < 6; m++) rc.set([c.r, c.g, c.b], (i + m) * 3);
    }
    rp.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    rp.deleteAttribute('uv');
    rp.deleteAttribute('normal');
    this.parts.push(rp.applyMatrix4(sec.toTF));
    const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch).premultiply(sec.quat);
    this.world.addStatic(makeBox({ center: sec.w(0, -R.drop / 2 - 0.25, (R.top + R.foot) / 2), half: V(R.half, 0.25, len / 2), quaternion: q }));
    // The slot at its foot the boulder drops into, and the dark under it (and under the ramp).
    this.#col(sec, -R.half - 1.5, R.half + 1.5, -R.drop - 7, -R.drop - 6, -R.len, 0);
    const sl = new THREE.BoxGeometry(2 * R.half, 0.2, s0 - s1);
    sl.translate(0, -R.drop - 6, (s0 + s1) / 2);
    this.#draw(sec, sl, '#1f1c18');
    // Walls (with the alcoves in them), tall enough for the top of the ramp and the bottom of the slot.
    const gaps = { left: [], right: [] };
    for (const [z, sd] of R.alcoves) gaps[sd < 0 ? 'left' : 'right'].push([z + R.alcove.w / 2, z - R.alcove.w / 2, rampAt(z) - 0.8, rampAt(z) + 3.2]);
    this.#sides(sec, 0, -R.len, -R.drop - 7, H + 0.6, R.half, 320, gaps);
    for (const [hz, sd] of R.alcoves) {
      const a = R.alcove;
      const y = rampAt(hz);
      const xa = sd < 0 ? -R.half - a.d : R.half;
      this.#floor(sec, xa, xa + a.d, hz + a.w / 2, hz - a.w / 2, y, 100 + hz);
      this.#stone(sec, sd < 0 ? xa - 0.6 : xa + a.d, sd < 0 ? xa : xa + a.d + 0.6, -R.drop - 1, H + 0.6, hz - a.w / 2 - 0.6, hz + a.w / 2 + 0.6, 330 + Math.round(hz));
      for (const e of [-1, 1]) {
        const ez = hz + e * (a.w / 2 + 0.3);
        this.#stone(sec, sd < 0 ? xa : R.half, sd < 0 ? -R.half : R.half + a.d, -R.drop - 1, H + 0.6, ez - 0.3, ez + 0.3, 340 + Math.round(hz) + e);
      }
      this.#ceiling(sec, sd < 0 ? xa : R.half, sd < 0 ? -R.half : R.half + a.d, hz + a.w / 2, hz - a.w / 2, y + 2.6, 350 + Math.round(hz));
    }
    // The roof, following the ramp down; a dark hatch in it at the top.
    for (let z = 0; z > -R.len; z -= 1) {
      const y = Math.min(rampAt(z), rampAt(z - 1)) + H;
      this.#ceiling(sec, -R.half - 0.9, R.half + 0.9, z, z - 1, Math.max(y, rampAt(z) + H - 0.5), 360 - z);
    }
    const hatch = new THREE.BoxGeometry(2.8, 0.05, 2.4);
    hatch.translate(0, H - 0.02, -1.4);
    this.#draw(sec, hatch, '#15130f');
    this.#torch(sec, -R.half, 3.0, -0.8, -1);
    this.#torch(sec, R.half, rampAt(-15.5) + 2.6, -15.5, 1);
    this.#torch(sec, -R.half, -R.drop + 2.6, -29, -1);
  }

  // --- The door of dials, and the cavern -------------------------------------

  #sanctumRoom() {
    const sec = this.sec.sanctum;
    const s = sec.s;
    const A = s.ante;
    const P = s.pool;
    const dz = s.dial.z;
    // The antechamber: wider than the ramp, its entry wall round the ramp's mouth.
    this.#floor(sec, -A.half, A.half, 0, dz, 0, 17);
    this.#sides(sec, 0, dz, -0.6, A.h + 0.6, A.half, 400);
    this.#ceiling(sec, -A.half - 0.9, A.half + 0.9, 0, dz, A.h, 401);
    this.#across(sec, 0.45, A.half + 0.9, -0.6, A.h + 0.6, 402, { half: S.boulder.half, h: S.boulder.h });
    // The cavern's near wall, the round door in it.
    const r = s.dial.r;
    const wall = new THREE.Shape([new THREE.Vector2(-s.half - 0.9, -3.6), new THREE.Vector2(s.half + 0.9, -3.6), new THREE.Vector2(s.half + 0.9, s.h + 0.6), new THREE.Vector2(-s.half - 0.9, s.h + 0.6)]);
    const hole = new THREE.Path();
    hole.absarc(0, r + 0.02, r, 0, TAU, true);
    wall.holes.push(hole);
    const wg = new THREE.ExtrudeGeometry(wall, { depth: 0.9, bevelEnabled: false, curveSegments: 24 });
    wg.translate(0, 0, dz - 0.45);
    this.#draw(sec, wg, STONE_DARK);
    // (Solid round the door: a square for it, near enough.)
    this.#col(sec, -s.half - 0.9, -r, -3.6, s.h + 0.6, dz - 0.45, dz + 0.45, SOLID);
    this.#col(sec, r, s.half + 0.9, -3.6, s.h + 0.6, dz - 0.45, dz + 0.45, SOLID);
    this.#col(sec, -r, r, 2 * r, s.h + 0.6, dz - 0.45, dz + 0.45, SOLID);
    this.#col(sec, -r, r, -3.6, 0, dz - 0.45, dz + 0.45, SOLID);
    const ring = new THREE.TorusGeometry(r + 0.08, 0.1, 6, 32);
    ring.translate(0, r, dz + 0.47);
    this.#draw(sec, ring, BRONZE);
    // The cavern: rough rock walls and roof, a hole in the roof over the island.
    const z0 = dz;
    const z1 = -s.len;
    this.#sides(sec, z0, z1, P.bottom - 0.6, s.h + 0.6, s.half, 410, {}, ROCK);
    this.#across(sec, z1, s.half + 0.9, P.bottom - 0.6, s.h + 0.6, 411, null, ROCK);
    const I = s.island;
    const sh = 2.2; // the shaft's half-width
    this.#stone(sec, -s.half - 0.9, s.half + 0.9, s.h, s.h + 1.2, I.z + sh, z0, 412, { palette: ROCK, course: 1.2 });
    this.#stone(sec, -s.half - 0.9, s.half + 0.9, s.h, s.h + 1.2, z1, I.z - sh, 413, { palette: ROCK, course: 1.2 });
    this.#stone(sec, -s.half - 0.9, I.x - sh, s.h, s.h + 1.2, I.z - sh, I.z + sh, 414, { palette: ROCK, course: 1.2 });
    this.#stone(sec, I.x + sh, s.half + 0.9, s.h, s.h + 1.2, I.z - sh, I.z + sh, 415, { palette: ROCK, course: 1.2 });
    // The shaft, up through the hill to the sky.
    const top = sec.w(I.x, 0, I.z);
    const shaftH = groundAt(top.x, top.z) + 3 - sec.w(0, s.h, 0).y;
    const tube = new THREE.CylinderGeometry(sh, sh, shaftH, 10, Math.max(1, Math.round(shaftH / 4)), true);
    tube.translate(I.x, s.h + shaftH / 2, I.z);
    const tg = tube.toNonIndexed();
    const tc = new Float32Array(tg.attributes.position.count * 3);
    for (let i = 0; i < tg.attributes.position.count; i += 3) {
      c3.set(pick(ROCK, i, 8));
      for (let m = 0; m < 3; m++) tc.set([c3.r, c3.g, c3.b], (i + m) * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    tg.deleteAttribute('uv');
    tg.deleteAttribute('normal');
    // (Seen from inside, so turned inside out.)
    const ix = tg.attributes.position;
    for (let i = 0; i < ix.count; i += 3) {
      const ax = ix.getX(i + 1);
      const ay = ix.getY(i + 1);
      const az = ix.getZ(i + 1);
      ix.setXYZ(i + 1, ix.getX(i + 2), ix.getY(i + 2), ix.getZ(i + 2));
      ix.setXYZ(i + 2, ax, ay, az);
    }
    this.parts.push(tg.applyMatrix4(sec.toTF));
    this.shaftTop = s.h + shaftH;
    // The pool's bottom, and its water; a step out in front of the door.
    this.#col(sec, -s.half, s.half, P.bottom - 1, P.bottom, z1, z0);
    const pb = new THREE.BoxGeometry(2 * s.half, 0.2, z0 - z1);
    pb.translate(0, P.bottom - 0.1, (z0 + z1) / 2);
    this.#draw(sec, pb, '#1d2124');
    this.#stone(sec, -2.6, 2.6, P.bottom, 0, dz - 1.25, dz - 0.45, 420, { flags: {} });
    this.#floor(sec, -2.6, 2.6, dz - 0.45, dz - 1.25, 0, 18);
    const wtr = new THREE.PlaneGeometry(2 * s.half, z0 - z1);
    wtr.rotateX(-Math.PI / 2);
    wtr.translate(0, P.y, (z0 + z1) / 2);
    this.pondMat = new THREE.MeshPhongMaterial({ color: WATER, specular: '#4a6670', shininess: 90, transparent: true, opacity: 0.9 });
    const pond = new THREE.Mesh(wtr, this.pondMat);
    sec.group.add(pond);
    // The island: a drum of stone, the pedestal on it.
    const drum = new THREE.CylinderGeometry(I.r, I.r + 0.3, I.y - P.bottom, 18, 3);
    drum.translate(I.x, (I.y + P.bottom) / 2, I.z);
    this.#draw(sec, drum, STONE_DARK);
    const deck = new THREE.CylinderGeometry(I.r - 0.05, I.r - 0.05, 0.08, 18);
    deck.translate(I.x, I.y + 0.04, I.z);
    this.#draw(sec, deck, FLAGS[0]);
    const iw = sec.w(I.x, 0, I.z);
    this.world.addStatic({ type: 'cyl', x: iw.x, z: iw.z, r: I.r, y0: sec.w(0, P.bottom, 0).y, y1: sec.w(0, I.y + 0.08, 0).y });
    const ped = new THREE.CylinderGeometry(0.55, 0.75, 1.05, 8);
    ped.translate(I.x, I.y + 0.525, I.z);
    this.#draw(sec, ped, STONE_DARK);
    const pt = new THREE.CylinderGeometry(0.7, 0.7, 0.12, 8);
    pt.translate(I.x, I.y + 1.08, I.z);
    this.#draw(sec, pt, STONE[0]);
    this.world.addStatic({ type: 'cyl', x: iw.x, z: iw.z, r: 0.7, y0: sec.w(0, I.y, 0).y, y1: sec.w(0, I.y + 1.12, 0).y });
    for (let k = 1; k <= 8; k++) this.#sign(sec, k, I.x + Math.sin((k / 8) * TAU) * 0.74, I.y + 0.6, I.z + Math.cos((k / 8) * TAU) * 0.74, 0.3, (k / 8) * TAU);
    // Rock hanging from the roof; rock coming up out of the water at the edges.
    for (let i = 0; i < 46; i++) {
      const x = (hash2(i, 1, 21) - 0.5) * 2 * (s.half - 0.8);
      const z = z0 - 1 - hash2(i, 2, 21) * (z0 - z1 - 2);
      if (Math.hypot(x - I.x, z - I.z) < sh + 1) continue;
      const h = 1 + hash2(i, 3, 21) * 4.5;
      const cn = new THREE.ConeGeometry(0.25 + hash2(i, 4, 21) * 0.5, h, 6);
      cn.rotateX(Math.PI);
      cn.translate(x, s.h - h / 2, z);
      this.#draw(sec, cn, pick(ROCK, i, 22));
    }
    for (let i = 0; i < 18; i++) {
      const sd = i % 2 ? 1 : -1;
      const x = sd * (s.half - 0.8 - hash2(i, 5, 23) * 2.5);
      const z = z0 - 1.5 - hash2(i, 6, 23) * (z0 - z1 - 2.5);
      const h = 1.2 + hash2(i, 7, 23) * 2.5;
      const cn = new THREE.ConeGeometry(0.35 + hash2(i, 8, 23) * 0.4, h, 6);
      cn.translate(x, P.bottom + h / 2, z);
      this.#draw(sec, cn, pick(ROCK, i, 24));
    }
    // A bar of daylight down the shaft.
    const cone = new THREE.CylinderGeometry(sh * 0.9, I.r * 0.9, s.h - I.y, 16, 1, true);
    cone.translate(I.x, (s.h + I.y) / 2, I.z);
    this.shaftLight = new THREE.Mesh(cone, lightShaftMat(0.13));
    this.shaftLight.renderOrder = 2;
    sec.group.add(this.shaftLight);
    this.#torch(sec, -A.half, 2.6, -2.4, -1);
    this.#torch(sec, A.half, 2.6, -2.4, 1);
  }

  // -------------------------------------------------------------------------
  // The moving parts
  // -------------------------------------------------------------------------

  #gate() {
    const sec = this.sec.hall;
    const g = TEMPLE.gate;
    const z = 0.7;
    this.gateLeaves = [];
    for (const sd of [-1, 1]) {
      const geo = stoneBox(0, g.half, 0, g.h - 0.05, -0.22, 0.22, 200 + sd, 0.6);
      if (sd < 0) geo.translate(-g.half, 0, 0);
      const studs = [];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
          const st = new THREE.SphereGeometry(0.06, 5, 3);
          st.translate((sd < 0 ? -g.half : 0) + 0.35 + i * 0.75, 0.6 + j * 0.95, 0.24);
          studs.push(paint(st, BRONZE));
        }
      }
      const leaf = new THREE.Mesh(mergeParts([geo, ...studs]), this.mat);
      leaf.castShadow = true;
      leaf.matrixAutoUpdate = false;
      sec.group.add(leaf);
      const body = this.world.addBody(new Body([{ center: V((sd * g.half) / 2, g.h / 2, 0), half: V(g.half / 2, g.h / 2, 0.22) }], 'temple-gate'));
      this.gateLeaves.push({ leaf, body, sd, hinge: V(sd * g.half, 0, z) });
    }
    this.gateOpen = 0;
    this.gateWant = 0;
    this.#setGate();
    // The lock plate: eight keyholes in a stone beside the gate.
    const plate = new THREE.Mesh(paint(new THREE.BoxGeometry(1.5, 1.1, 0.16), STONE_DARK), this.mat);
    plate.position.set(g.half + 1.3, 1.6, 2.38);
    sec.group.add(plate);
    this.holeMat = new THREE.MeshBasicMaterial({ color: '#191512' });
    this.goldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.55) });
    this.keyholes = [];
    for (let i = 0; i < 8; i++) {
      const k = new THREE.Mesh(new THREE.CircleGeometry(0.075, 10), this.holeMat);
      k.position.set(g.half + 1.3 - 0.48 + (i % 4) * 0.32, 1.6 + (i < 4 ? 0.22 : -0.22), 2.465);
      sec.group.add(k);
      this.keyholes.push(k);
    }
  }

  #setGate() {
    const e = this.gateOpen * this.gateOpen * (3 - 2 * this.gateOpen);
    const sec = this.sec.hall;
    for (const G of this.gateLeaves) {
      // (Swinging in, into the hall.)
      const m = new THREE.Matrix4().compose(G.hinge, new THREE.Quaternion().setFromAxisAngle(UP, -G.sd * e * 1.45), ONE);
      const local = new THREE.Matrix4().makeTranslation(-G.sd * TEMPLE.gate.half, 0, 0);
      G.leaf.matrix.copy(m).multiply(local);
      G.body.setMatrix(m.clone().multiply(local).premultiply(sec.toWorld));
    }
  }

  #blades() {
    const sec = this.sec.blades;
    const B = sec.s;
    this.bladeList = [];
    const steel = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: '#777777', shininess: 40 });
    B.zs.forEach((z, k) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, B.pivot, z);
      const parts = [paint(segment(V(0, 0, 0), V(0, -B.arm + 0.6, 0), 0.06, 0.06, 6), IRON)];
      const shape = new THREE.Shape();
      shape.moveTo(-0.95, 0.15);
      shape.quadraticCurveTo(0, -0.95, 0.95, 0.15);
      shape.quadraticCurveTo(0, -0.35, -0.95, 0.15);
      const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
      blade.translate(0, -B.arm + 0.55, -0.04);
      parts.push(paint(blade, '#8d9195'));
      const edge = new THREE.TorusGeometry(0.97, 0.025, 3, 16, Math.PI * 0.62);
      edge.rotateZ(Math.PI + Math.PI * 0.19);
      edge.scale(1, 0.95, 1);
      edge.translate(0, -B.arm + 0.55 + 0.1, 0);
      parts.push(paint(edge, BRONZE));
      const m = new THREE.Mesh(mergeParts(parts), steel);
      m.castShadow = true;
      pivot.add(m);
      sec.group.add(pivot);
      this.bladeList.push({ pivot, z, period: B.periods[k], phase: B.phases[k] });
    });
  }

  #pillars() {
    const sec = this.sec.pit;
    const P = sec.s;
    this.pillarList = P.pillars.map(([x, z, h, kind], i) => {
      const parts = [stoneBox(-h, h, -P.depth, 0.05, -h, h, 400 + i, 0.6)];
      if (kind === 'crumbles') {
        const crack = new THREE.BoxGeometry(h * 2.02, 0.02, 0.05);
        crack.rotateY(0.6);
        crack.translate(0, 0.06, 0);
        parts.push(paint(crack, '#3a332a'));
      }
      if (kind === 'slides') {
        // A groove in the rock it runs along, and bronze bands round it.
        for (const y of [-0.4, -1.2]) {
          const band = new THREE.BoxGeometry(h * 2.06, 0.12, h * 2.06);
          band.translate(0, y, 0);
          parts.push(paint(band, BRONZE));
        }
      }
      const mesh = new THREE.Mesh(mergeParts(parts), this.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      sec.group.add(mesh);
      const body = this.world.addBody(new Body([{ center: V(0, -P.depth / 2 + 0.025, 0), half: V(h, P.depth / 2 + 0.025, h) }], 'temple-pillar'));
      body.boardable = true;
      const p = { x, z, h, kind, mesh, body, x0: x, drop: 0, stood: 0, phase: null, timer: 0 };
      this.#setPillar(p);
      return p;
    });
    if (P.pillars.some((p) => p[3] === 'slides')) {
      const g = new THREE.BoxGeometry(2 * P.slide.reach + 1.6, 0.1, 0.5);
      g.translate(0, -P.depth + 0.36, P.pillars.find((p) => p[3] === 'slides')[1]);
      const groove = new THREE.Mesh(paint(g, '#2a2620'), this.mat);
      sec.group.add(groove);
    }
  }

  #setPillar(p) {
    const m = new THREE.Matrix4().makeTranslation(p.x, -p.drop, p.z);
    p.mesh.matrix.copy(m);
    p.body.setMatrix(m.clone().premultiply(this.sec.pit.toWorld));
  }

  #plates() {
    const sec = this.sec.keepers;
    const K = sec.s;
    this.plateList = K.plates.map(([k, x, z]) => {
      const g = stoneBox(-K.plate, K.plate, -0.04, 0.06, -K.plate, K.plate, 600 + k, 0.2, [STONE_DARK]);
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.position.set(x, 0, z);
      mesh.receiveShadow = true;
      sec.group.add(mesh);
      const sg = signQuad(k, K.plate * 1.5);
      sg.rotateX(-Math.PI / 2);
      const sign = new THREE.Mesh(sg, this.signMat);
      sign.position.set(x, 0.075, z);
      sec.group.add(sign);
      return { k, x, z, mesh, sign, lit: false, down: 0 };
    });
    this.walked = 0; // how many of them, in order
    this.keepersOpen = false;
    // The portcullis over the far door.
    const D = K.door;
    const bars = [];
    for (let i = 0; i <= 6; i++) bars.push(paint(segment(V(-D.half + (i * 2 * D.half) / 6, 0, 0), V(-D.half + (i * 2 * D.half) / 6, D.h, 0), 0.05, 0.05, 5), IRON));
    for (let j = 1; j < 4; j++) bars.push(paint(segment(V(-D.half, (j * D.h) / 4, 0), V(D.half, (j * D.h) / 4, 0), 0.04, 0.04, 4), IRON));
    this.portcullis = new THREE.Mesh(mergeParts(bars), this.mat);
    this.portcullis.matrixAutoUpdate = false;
    sec.group.add(this.portcullis);
    this.portBody = this.world.addBody(new Body([{ center: V(0, D.h / 2, 0), half: V(D.half, D.h / 2, 0.12) }], 'temple-portcullis'));
    this.portUp = 0;
    this.#setPort();
    // Darts, for when you get it wrong.
    this.darts = [];
    const dg = new THREE.ConeGeometry(0.03, 0.4, 4);
    dg.rotateZ(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ color: IRON }));
      d.visible = false;
      sec.group.add(d);
      this.darts.push({ mesh: d, t: 0, from: V(0, 0, 0), to: V(0, 0, 0) });
    }
  }

  #setPort() {
    const K = S.keepers;
    const e = this.portUp * this.portUp * (3 - 2 * this.portUp);
    const m = new THREE.Matrix4().makeTranslation(0, e * (K.door.h - 0.2), -K.len);
    this.portcullis.matrix.copy(m);
    this.portBody.setMatrix(m.clone().premultiply(this.sec.keepers.toWorld));
  }

  #spikes() {
    const sec = this.sec.spikes;
    const P = sec.s;
    this.rows = P.rows.map(([z, period, lag], k) => {
      const parts = [];
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 3; j++) {
          const c = new THREE.ConeGeometry(0.11, 0.9, 4);
          c.translate(-2.55 + i * 0.85 + (j % 2) * 0.4, -0.45, z - 0.55 + j * 0.55);
          parts.push(paint(c, j % 2 ? IRON : '#4a4540'));
        }
      }
      const mesh = new THREE.Mesh(mergeParts(parts), this.mat);
      mesh.castShadow = true;
      sec.group.add(mesh);
      const plate = new THREE.Mesh(paint(new THREE.BoxGeometry(6, 0.04, P.row - 0.1), '#6e665a'), this.mat);
      plate.position.set(0, 0.075, z);
      plate.receiveShadow = true;
      sec.group.add(plate);
      return { z, k, period, lag, mesh, h: 0 };
    });
  }

  #mirrors() {
    const sec = this.sec.mirrors;
    const M = sec.s;
    const disc = new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16);
    disc.rotateX(Math.PI / 2); // facing +z
    const bronze = new THREE.MeshPhongMaterial({ color: '#c79b4a', specular: '#fff2c8', shininess: 80, flatShading: true });
    this.mirrorList = M.list.map(([x, z, starts], i) => {
      this.#drawPost(sec, x, z);
      const g = new THREE.Group();
      g.position.set(x, M.beam.y, z);
      const m = new THREE.Mesh(disc, bronze);
      m.castShadow = true;
      g.add(m);
      sec.group.add(g);
      const w = sec.w(x, 0, z);
      this.world.addStatic({ type: 'cyl', x: w.x, z: w.z, r: 0.3, y0: sec.w(0, -0.5, 0).y, y1: sec.w(0, M.beam.y + 0.6, 0).y });
      const mr = { i, x, z, state: starts, group: g, turn: starts ? 1 : 0 };
      g.rotation.y = mirrorYaw(mr.turn);
      return mr;
    });
    // The beam: up to a dozen straight runs of light.
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.3, 1.5), transparent: true, opacity: 0.85, depthWrite: false });
    this.beamSegs = [];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1), this.beamMat);
      b.visible = false;
      sec.group.add(b);
      this.beamSegs.push(b);
    }
    // The eye: a crystal in the far door.
    this.eyeMat = new THREE.MeshPhongMaterial({ color: '#2a5a52', emissive: new THREE.Color('#0c2622'), flatShading: true, shininess: 80 });
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), this.eyeMat);
    eye.position.set(M.eye[0], M.beam.y, M.eye[1] + 0.32);
    sec.group.add(eye);
    this.eye = eye;
    // The door the eye's set in: it lifts when the light reaches it.
    const D = M.door;
    const dg = stoneBox(-D.half, D.half, 0, D.h, -0.2, 0.2, 700, 0.5, [STONE_DARK]);
    this.mirrorDoor = new THREE.Mesh(dg, this.mat);
    this.mirrorDoor.matrixAutoUpdate = false;
    sec.group.add(this.mirrorDoor);
    this.mirrorBody = this.world.addBody(new Body([{ center: V(0, D.h / 2, 0), half: V(D.half, D.h / 2, 0.2) }], 'temple-mirror-door'));
    this.mirrorOpen = false;
    this.mirrorUp = 0;
    this.#setMirrorDoor();
    this.#traceBeam();
  }

  #drawPost(sec, x, z) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.08, 0.1, S.mirrors.beam.y, 6), IRON), this.mat);
    post.position.set(x, S.mirrors.beam.y / 2, z);
    g.add(post);
    const foot = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 8), STONE_DARK), this.mat);
    foot.position.set(x, 0.07, z);
    g.add(foot);
    sec.group.add(g);
  }

  #setMirrorDoor() {
    const M = S.mirrors;
    const e = this.mirrorUp * this.mirrorUp * (3 - 2 * this.mirrorUp);
    const m = new THREE.Matrix4().makeTranslation(M.eye[0], e * (M.door.h - 0.15), -M.len);
    this.mirrorDoor.matrix.copy(m);
    this.mirrorBody.setMatrix(m.clone().premultiply(this.sec.mirrors.toWorld));
    this.eye.position.y = M.beam.y + e * (M.door.h - 0.15);
  }

  /** Where the light goes from the slot, mirror to mirror; and whether it reaches the eye. */
  #traceBeam() {
    const M = S.mirrors;
    let [x, z] = M.beam.from;
    let [dx, dz] = M.beam.dir;
    const segs = [];
    let hit = false;
    for (let n = 0; n < 12; n++) {
      // The nearest thing ahead along this line.
      let best = { d: Infinity, kind: 'wall' };
      // The walls.
      const wallD = dx > 0 ? M.half - x : dx < 0 ? x + M.half : dz < 0 ? z + M.len : -z;
      best = { d: wallD, kind: 'wall' };
      for (const m of this.mirrorList) {
        const ax = m.x - x;
        const az = m.z - z;
        const along = ax * dx + az * dz;
        const off = Math.abs(ax * dz - az * dx);
        if (along > 0.01 && off < 0.05 && along < best.d) best = { d: along, kind: 'mirror', m };
      }
      for (const [px, pz, h] of M.posts) {
        const ax = px - x;
        const az = pz - z;
        const along = ax * dx + az * dz;
        const off = Math.abs(ax * dz - az * dx);
        if (along > 0 && off < h && along - h < best.d) best = { d: along - h, kind: 'post' };
      }
      const nx = x + dx * best.d;
      const nz = z + dz * best.d;
      segs.push([x, z, nx, nz]);
      if (best.kind !== 'mirror') {
        hit = best.kind === 'wall' && dz < 0 && Math.abs(nx - M.eye[0]) < 0.5 && nz < -M.len + 0.6;
        break;
      }
      x = nx;
      z = nz;
      // Off the mirror at a right angle: one way or the other, as it's turned.
      const a = best.m.state === 0 ? 1 : -1;
      [dx, dz] = [-a * dz, -a * dx];
    }
    this.beamHit = hit;
    this.beamSegs.forEach((b, i) => {
      const sg = segs[i];
      b.visible = !!sg;
      if (!sg) return;
      const [x0, z0, x1, z1] = sg;
      const len = Math.max(0.05, Math.hypot(x1 - x0, z1 - z0));
      b.position.set((x0 + x1) / 2, M.beam.y, (z0 + z1) / 2);
      b.scale.set(1, 1, len);
      b.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    });
  }

  #cistern() {
    const sec = this.sec.cistern;
    const C = sec.s;
    this.level = C.low;
    this.flood = 'low'; // low, rising, high, falling
    this.floodT = 0;
    const w = new THREE.PlaneGeometry(2 * C.half - 0.02, C.len - C.ledge);
    w.rotateX(-Math.PI / 2);
    this.cisternWater = new THREE.Mesh(w, new THREE.MeshPhongMaterial({ color: '#1f3a3c', specular: '#5b7f86', shininess: 80, transparent: true, opacity: 0.86, depthWrite: false }));
    this.cisternWater.position.set(0, this.level, -C.ledge - (C.len - C.ledge) / 2);
    sec.group.add(this.cisternWater);
    // The water coming in from the sluice.
    const sheet = new THREE.PlaneGeometry(1.0, 1);
    sheet.translate(0, -0.5, 0);
    this.spout = new THREE.Mesh(sheet, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 0.78), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    this.spout.rotation.y = Math.PI / 2;
    this.spout.position.set(-C.half + 0.35, 8.8, -8);
    this.spout.visible = false;
    sec.group.add(this.spout);
    // The wheel that opens it.
    const [wx, wy, wz] = C.wheel;
    const wheel = new THREE.Group();
    wheel.position.set(wx, wy, wz);
    const rim = paint(new THREE.TorusGeometry(0.42, 0.045, 5, 14), IRON);
    const spokes = [];
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.BoxGeometry(0.84, 0.05, 0.05);
      sp.rotateZ((k / 3) * Math.PI);
      spokes.push(paint(sp, IRON));
    }
    const wm = new THREE.Mesh(mergeParts([rim, ...spokes]), this.mat);
    wm.rotation.y = Math.PI / 2; // facing out of the left wall
    wheel.add(wm);
    sec.group.add(wheel);
    this.wheel = wm;
    const axle = paint(segment(V(-C.half, wy, wz), V(wx, wy, wz), 0.05, 0.05, 6), IRON);
    sec.group.add(new THREE.Mesh(axle, this.mat));
  }

  #slabs() {
    const sec = this.sec.bridge;
    const B = sec.s;
    const [a, b] = B.ledges;
    const n = Math.floor((B.len - a - b) / B.slab);
    this.slabList = [];
    for (let i = 0; i < n; i++) {
      if (B.gone.includes(i)) continue;
      const z = -a - (i + 0.5) * B.slab;
      const mesh = new THREE.Mesh(stoneBox(-B.width, B.width, -0.3, 0, -B.slab / 2 + 0.03, B.slab / 2 - 0.03, 800 + i, 0.3), this.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      sec.group.add(mesh);
      const body = this.world.addBody(new Body([{ center: V(0, -0.15, 0), half: V(B.width, 0.15, B.slab / 2 - 0.03) }], 'temple-slab'));
      body.boardable = true;
      const s = { i, z, mesh, body, drop: 0, stood: 0, phase: null, timer: 0 };
      this.#setSlab(s);
      this.slabList.push(s);
    }
  }

  #setSlab(s) {
    const m = new THREE.Matrix4().makeTranslation(0, -s.drop, s.z);
    if (s.phase === 'shake') m.elements[12] = (Math.random() - 0.5) * 0.05;
    s.mesh.matrix.copy(m);
    s.body.setMatrix(m.clone().premultiply(this.sec.bridge.toWorld));
  }

  #boulder() {
    const g = new THREE.IcosahedronGeometry(1.25, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = V(p.getX(i), p.getY(i), p.getZ(i));
      v.multiplyScalar(1 + (hash2(Math.round(v.x * 9), Math.round(v.y * 9) + Math.round(v.z * 81), 77) - 0.5) * 0.12);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    this.ball = new THREE.Mesh(paint(g, '#8f8571'), this.mat);
    this.ball.castShadow = true;
    this.sec.boulder.group.add(this.ball);
    this.ballZ = null; // rolling: where it's got to (its part's z); null = waiting up in the roof
    this.ballV = 0;
    this.ballWait = 0;
    this.ball.visible = false;
  }

  #setBall(z, sink = 0) {
    this.ball.position.set(0, rampAt(z) + 1.25 - sink, z);
    this.ball.rotation.x = -(z + 1.4) / 1.25;
  }

  #dials() {
    const sec = this.sec.sanctum;
    const s = sec.s;
    const dz = s.dial.z;
    // The round door.
    const r = s.dial.r;
    const door = new THREE.CylinderGeometry(r, r, 0.5, 28);
    door.rotateX(Math.PI / 2);
    const parts = [paint(door, STONE[2])];
    for (let k = 1; k <= 8; k++) {
      const a = (k / 8) * TAU;
      const st = new THREE.SphereGeometry(0.07, 5, 3);
      st.translate(Math.sin(a) * (r - 0.25), Math.cos(a) * (r - 0.25), 0.26);
      parts.push(paint(st, BRONZE));
    }
    this.dialDoor = new THREE.Mesh(mergeParts(parts), this.mat);
    this.dialDoor.matrixAutoUpdate = false;
    sec.group.add(this.dialDoor);
    this.dialBody = this.world.addBody(new Body([{ center: V(0, 0, 0), half: V(r, r, 0.25) }], 'temple-round-door'));
    this.dialOpen = false;
    this.dialRoll = 0;
    // Eight dials along the wall, four each side of the door, at a bear's height.
    const xs = [-4.3, -3.6, -2.9, -2.2, 2.2, 2.9, 3.6, 4.3];
    const face = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16);
    face.rotateX(Math.PI / 2);
    const pointer = new THREE.BoxGeometry(0.04, 0.22, 0.03);
    pointer.translate(0, 0.11, 0.06);
    this.dialList = xs.map((x, i) => {
      const k = i + 1;
      const y = 1.25;
      const base = new THREE.Mesh(paint(face.clone(), BRONZE), this.mat);
      base.position.set(x, y, dz + 0.5);
      sec.group.add(base);
      // Eight notches round it.
      const marks = [];
      for (let n = 0; n < 8; n++) {
        const a = (n / 8) * TAU;
        const nm = new THREE.BoxGeometry(0.03, 0.06, 0.02);
        nm.rotateZ(-a);
        nm.translate(Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0.05);
        marks.push(paint(nm, '#3a2f22'));
      }
      base.add(new THREE.Mesh(mergeParts(marks), this.mat));
      const ptr = new THREE.Mesh(paint(pointer.clone(), '#2a221a'), this.mat);
      base.add(ptr);
      const sg = signQuad(k, 0.36);
      const sign = new THREE.Mesh(sg, this.signMat);
      sign.position.set(x, y + 0.48, dz + 0.47);
      sec.group.add(sign);
      return { k, x, y, value: 1, ptr };
    });
    this.#setDials();
  }

  #setDials() {
    for (const d of this.dialList) d.ptr.rotation.z = -((d.value - 1) / 8) * TAU;
    const s = S.sanctum;
    const r = s.dial.r;
    const e = this.dialRoll * this.dialRoll * (3 - 2 * this.dialRoll);
    // (Rolls aside into the wall, to the left.)
    const m = new THREE.Matrix4().compose(V(-e * (2 * r + 0.2), r + 0.02, s.dial.z), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), e * 2.4), ONE);
    this.dialDoor.matrix.copy(m);
    this.dialBody.setMatrix(new THREE.Matrix4().makeTranslation(-e * (2 * r + 0.2), r + 0.02, s.dial.z).premultiply(this.sec.sanctum.toWorld));
  }

  #stones() {
    const sec = this.sec.sanctum;
    const s = sec.s;
    this.stoneList = s.stones.map(([x, z, h, sinks], i) => {
      const g = new THREE.CylinderGeometry(h, h + 0.15, -s.pool.bottom + 0.25, 7);
      g.translate(0, (s.pool.bottom + 0.25) / 2, 0);
      const mesh = new THREE.Mesh(paint(g, sinks ? '#6f675a' : STONE[1]), this.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      sec.group.add(mesh);
      const body = this.world.addBody(new Body([{ center: V(0, (s.pool.bottom + 0.25) / 2, 0), half: V(h * 0.85, (-s.pool.bottom + 0.25) / 2, h * 0.85) }], 'temple-stone'));
      body.boardable = true;
      const st = { x, z, h, sinks, mesh, body, drop: 0, stood: 0, phase: null, timer: 0 };
      this.#setStone(st);
      return st;
    });
  }

  #setStone(st) {
    const m = new THREE.Matrix4().makeTranslation(st.x, -st.drop, st.z);
    st.mesh.matrix.copy(m);
    st.body.setMatrix(m.clone().premultiply(this.sec.sanctum.toWorld));
  }

  #braziers() {
    this.lit = [];
    this.flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.35), transparent: true, opacity: 0.9 });
    TEMPLE.checkpoints.forEach(([id, x, z, y]) => {
      const sec = this.sec[id];
      const half = id === 'sanctum' ? sec.s.ante.half : sec.s.half;
      const bx = x + Math.min(2.2, half - 0.75);
      const parts = [paint(segment(V(bx, y, z), V(bx, y + 0.9, z), 0.1, 0.07, 6), IRON)];
      const bowl = new THREE.CylinderGeometry(0.38, 0.2, 0.3, 8, 1, true);
      bowl.translate(bx, y + 1.05, z);
      parts.push(paint(bowl, BRONZE));
      sec.group.add(new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 6), flameMat);
      flame.position.set(bx, y + 1.4, z);
      flame.visible = false;
      sec.group.add(flame);
      this.flames.push(flame);
      this.lit.push(false);
      const w = sec.w(bx, 0, z);
      this.world.addStatic({ type: 'cyl', x: w.x, z: w.z, r: 0.3, y0: sec.w(0, y - 0.5, 0).y, y1: sec.w(0, y + 1.2, 0).y });
    });
  }

  #heart() {
    const sec = this.sec.sanctum;
    const I = sec.s.island;
    const y = I.y + sec.s.heart.y + 0.12;
    this.heartMat = new THREE.MeshPhongMaterial({ color: '#1f8f78', emissive: new THREE.Color('#0c5a48'), specular: '#c8fff0', shininess: 90, flatShading: true });
    this.heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), this.heartMat);
    this.heart.scale.set(1, 1.3, 1);
    this.heart.position.set(I.x, y, I.z);
    this.heart.castShadow = true;
    sec.group.add(this.heart);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 10),
      new THREE.ShaderMaterial({
        uniforms: { uK: { value: 0.3 } },
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = mat3(modelMatrix) * normal;
            vV = cameraPosition - wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uK;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float f = abs(dot(vN, vV)) / max(length(vN) * length(vV), 1e-4);
            gl_FragColor = vec4(vec3(0.2, 1.0, 0.75) * uK * f * f * f, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.copy(this.heart.position);
    sec.group.add(glow);
    this.glow = glow;
    // Once it's lifted: its light, straight up the shaft and into the sky (and seen from far off).
    const tall = (this.shaftTop ?? 60) + 260;
    const beamGeo = new THREE.CylinderGeometry(0.9, 0.6, tall, 16, 1, true);
    beamGeo.translate(0, tall / 2, 0);
    this.beam = new THREE.Mesh(beamGeo, lightShaftMat(0, [0.25, 1.0, 0.75]));
    this.beam.position.copy(this.heart.position);
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    sec.group.add(this.beam);
    this.heartAt = sec.w(this.heart.position.x, this.heart.position.y, this.heart.position.z);
  }

  /** Where the hill's ground doesn't count: the rooms under it. */
  #cavities() {
    const rooms = templeRooms();
    const corners = [];
    for (const r of rooms) for (const x of [r.x0, r.x1]) for (const z of [r.z0, r.z1]) corners.push(V(x, 0, z).applyMatrix4(this.matrix));
    const xs = corners.map((p) => p.x);
    const zs = corners.map((p) => p.z);
    const inv = this.inverse;
    const p = V(0, 0, 0);
    this.rooms = rooms;
    this.cavity = {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      z0: Math.min(...zs),
      z1: Math.max(...zs),
      contains: (x, y, z) => {
        p.set(x, y, z).applyMatrix4(inv);
        for (const r of rooms) if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1 && p.y > r.y0 && p.y < r.y1) return true;
        return false;
      },
    };
    this.world.addCavity(this.cavity);
    // And the hill's ground isn't drawn in them, where it comes down near the entrance.
    setTerrainHoles(this.inverse, rooms);
  }

  // -------------------------------------------------------------------------
  // Playing
  // -------------------------------------------------------------------------

  /** Is p (world) inside, under the hill? */
  inside(p) {
    const c = this.cavity;
    return p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1 && c.contains(p.x, p.y, p.z);
  }

  /** The water level (world y) in the cistern, if p is in it; else null. */
  poolAt(p) {
    const c = this.cavity;
    if (!(p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1)) return null;
    const C = S.cistern;
    const l = this.sec.cistern.local(p, _l);
    if (Math.abs(l.x) > C.half || l.z > -C.ledge + 0.2 || l.z < -C.len || l.y < C.bottom - 0.5 || l.y > this.level + 1.2) return null;
    return this.sec.cistern.w(0, this.level, 0).y;
  }

  /** Caught by a trap: back to the last brazier lit. */
  #fail(player, what) {
    if (this.failT > 0) return;
    this.failT = 1.2;
    const [id, x, z, y] = TEMPLE.checkpoints[this.checkpoint];
    player.place(this.sec[id].w(x, y + 0.1, z), null);
    this.fade.classList.remove('on');
    void this.fade.offsetWidth;
    this.fade.classList.add('on');
    this.say?.(`${what} Back to the last brazier.`, 3);
    // (The keepers' plates go back to how they were, unless the door's open.)
    if (!this.keepersOpen) this.#resetPlates();
  }

  #resetPlates() {
    this.walked = 0;
    for (const p of this.plateList) {
      p.lit = false;
      p.sign.material = this.signMat;
    }
  }

  interaction(player) {
    if (player.pos.distanceTo(this.center) > 260) return null;
    const hall = this.sec.hall;
    const l = hall.local(player.pos, _a);
    const g = TEMPLE.gate;
    // At the gate, outside.
    if (!this.open && Math.abs(l.x) < 4.5 && l.z > 1.4 && l.z < 7 && Math.abs(l.y) < 1.5) {
      const st = this.story;
      const n = (st.keys ?? []).length;
      if (st.ch !== AT_TEMPLE) return { key: '', label: n ? `Eight keyholes beside the gate. You have ${n} of the keys.` : 'Eight keyholes beside the gate, and a carving of waves.' };
      return {
        key: 'E',
        label: 'Turn the eight keys',
        act: () => {
          this.progress
            .act('templeOpen', { x: player.pos.x, z: player.pos.z })
            .then((res) => {
              if (!res?.ok) return;
              this.gateWant = 1;
              this.say?.('The eight keys turn, one after another, and the gate grinds open.', 4);
            })
            .catch(() => {});
        },
      };
    }
    if (!this.inside(player.pos)) return null;
    // The keepers carved in the entrance hall.
    if (l.z < 0 && l.z > -S.hall.len && Math.abs(l.y) < 1.5) {
      for (const r of this.reliefs) {
        if (Math.hypot(l.x - r.x, l.z - r.z) < 1.0) {
          const K = KEEPERS[r.k];
          return { key: 'E', label: 'Read the carving', act: () => this.say?.(K.carving ?? `A keeper, and the sign of ${K.sign}.`, 5) };
        }
      }
    }
    // The words over the keepers' door.
    const kl = this.sec.keepers.local(player.pos, _b);
    if (!this.keepersOpen && Math.abs(kl.x) < 3 && kl.z < -S.keepers.len + 3.2 && kl.z > -S.keepers.len && Math.abs(kl.y) < 1.5) {
      return { key: 'E', label: 'Read the words over the door', act: () => this.say?.("Cut over the door: 'As you found us, so walk.'", 5) };
    }
    // The cistern's wheel.
    const cl = this.sec.cistern.local(player.pos, _b);
    const [wx, wy, wz] = S.cistern.wheel;
    if (Math.hypot(cl.x - wx, cl.z - wz) < 1.6 && Math.abs(cl.y) < 1.2) {
      if (this.flood !== 'low') return { key: '', label: this.flood === 'rising' ? 'The water pours in.' : 'The wheel won’t turn while the water’s up.' };
      return {
        key: 'E',
        label: 'Turn the wheel',
        act: () => {
          this.flood = 'rising';
          this.say?.('Somewhere above, a sluice grinds open. Water starts to pour in.', 3.5);
        },
      };
    }
    // The mirrors.
    const ml = this.sec.mirrors.local(player.pos, _b);
    if (Math.abs(ml.y) < 1.5 && ml.z < 0 && ml.z > -S.mirrors.len) {
      let near = null;
      let best = 1.5;
      for (const m of this.mirrorList) {
        const d = Math.hypot(ml.x - m.x, ml.z - m.z);
        if (d < best) {
          best = d;
          near = m;
        }
      }
      if (near) {
        return {
          key: 'E',
          label: 'Turn the mirror',
          act: () => {
            near.state = 1 - near.state;
            this.#traceBeam();
          },
        };
      }
    }
    // The dials by the round door.
    const sl = this.sec.sanctum.local(player.pos, _b);
    const s = S.sanctum;
    if (!this.dialOpen && sl.z < s.dial.z + 1.6 && sl.z > s.dial.z && Math.abs(sl.y) < 1.5) {
      let near = null;
      let best = 0.4;
      for (const d of this.dialList) {
        const dd = Math.abs(sl.x - d.x);
        if (dd < best) {
          best = dd;
          near = d;
        }
      }
      if (near) {
        return {
          key: 'E',
          label: `Turn the dial of the ${KEEPERS[near.k].sign} (it's at ${near.value})`,
          act: () => {
            near.value = (near.value % 8) + 1;
            this.#setDials();
            if (this.dialList.every((d) => d.value === KEEPERS[d.k].notches)) {
              this.dialOpen = true;
              this.say?.('The last dial clicks home. The round door rolls aside.', 4);
            }
          },
        };
      }
      if (Math.abs(sl.x) < 1.8) return { key: '', label: 'Eight dials round the door, each with a keeper’s sign.' };
    }
    // The Heart.
    if (this.open && !this.done && !this.lifting && player.pos.distanceTo(this.heartAt) < 2.6) {
      return {
        key: 'E',
        label: 'Lift the Heart of the Sea',
        act: () => {
          this.lifting = true;
          const p = player.pos;
          this.progress
            .act('heart', { x: p.x, y: p.y, z: p.z })
            .then((res) => {
              if (!res?.ok) {
                this.lifting = false;
                return;
              }
              this.onHeart?.();
            })
            .catch(() => {
              this.lifting = false;
            });
        },
      };
    }
    void g;
    return null;
  }

  update(dt, { t, player }) {
    this.t += dt;
    this.failT = Math.max(0, this.failT - dt);
    if (this.fade.classList.contains('on') && this.failT < 0.6) this.fade.classList.remove('on');
    if (this.gateOpen !== this.gateWant) {
      this.gateOpen = Math.min(1, this.gateOpen + dt / 3.5);
      this.#setGate();
    }
    // The Heart, turning slowly, brighter once it's lifted.
    const I = S.sanctum.island;
    this.heart.rotation.y += dt * 0.6;
    this.heart.position.y = I.y + S.sanctum.heart.y + 0.12 + 0.05 * Math.sin(this.t * 1.3);
    this.heartLit = Math.min(1, (this.heartLit ?? 0) + (this.done ? dt * 0.5 : 0));
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    this.heartMat.emissive.setRGB(0.05 + 0.25 * this.heartLit + 0.05 * pulse, 0.35 + 0.85 * this.heartLit + 0.15 * pulse, 0.28 + 0.6 * this.heartLit + 0.1 * pulse);
    this.glow.material.uniforms.uK.value = 0.25 + 0.15 * pulse + 0.35 * this.heartLit;
    this.beam.visible = this.heartLit > 0.01;
    this.beam.material.uniforms.uK.value = this.heartLit * (0.32 + 0.06 * pulse);
    this.flameMat.color.setRGB(2.2 + 0.4 * Math.sin(this.t * 11), 1.1 + 0.2 * Math.sin(this.t * 7.3), 0.35);

    if (!player || player.pos.distanceTo(this.center) > 260) return;
    this.player = player;
    const armed = this.open && !this.done;
    this.#runBlades(t, armed);
    this.#runSpikes(t, armed);
    this.#runDoors(dt);
    this.#runCistern(dt);
    this.#runDarts(dt);
    const inside = this.inside(player.pos);
    // (Should you ever fall right out of a room, the hill's ground would put you
    // on top of it: back to the last brazier instead.)
    if (this.wasIn && !inside && player.pos.y - this.wasIn.y > 4 && this.failT <= 0) {
      this.wasIn = null;
      this.#fail(player, 'You fall into the dark.');
      return;
    }
    this.wasIn = inside ? (this.wasIn ?? V(0, 0, 0)).copy(player.pos) : null;
    // Braziers.
    TEMPLE.checkpoints.forEach(([id, x, z, y], i) => {
      if (this.lit[i] || !inside) return;
      const l = this.sec[id].local(player.pos, _a);
      if (Math.hypot(l.x - x, l.z - z) < 2.6 && Math.abs(l.y - y) < 1.5) {
        this.lit[i] = true;
        this.flames[i].visible = true;
        if (i > this.checkpoint) this.checkpoint = i;
        if (i > 0) this.say?.(`The brazier catches.${BRAZIER_HINTS[id] ? ` ${BRAZIER_HINTS[id]}` : ''}`, BRAZIER_HINTS[id] ? 4 : 1.8);
      }
    });
    for (let i = 0; i < this.flames.length; i++) if (this.flames[i].visible) this.flames[i].scale.set(1, 0.85 + 0.25 * Math.sin(this.t * 13 + i) * Math.sin(this.t * 7.3 + i * 2), 1);
    this.#runPillars(dt, player, armed, t);
    this.#runPlates(player, armed);
    this.#runSlabs(dt, player, armed);
    this.#runBoulder(dt, player, armed);
    this.#runStones(dt, player, armed);
    if (!armed || !inside || player.mode === 'station' || this.failT > 0) return;
    this.#caught(player);
  }

  /** Has a trap got you? */
  #caught(player) {
    // The blades. (The crescent, in its arm's frame: across ±0.95, from 0.4
    // below the arm's end to 0.7 above it. The bear's body is checked at
    // three heights against it, a bear's width round it.)
    const bl = this.sec.blades.local(player.pos, _a);
    const B = S.blades;
    if (bl.z < 0 && bl.z > -B.len && Math.abs(bl.x) < B.half + 0.5) {
      for (const b of this.bladeList) {
        if (Math.abs(bl.z - b.z) > 0.42) continue;
        const a = b.pivot.rotation.z;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        for (const h of [0.3, 0.7, 1.1]) {
          const dx = bl.x;
          const dy = bl.y + h - B.pivot;
          const ax = c * dx + sn * dy;
          const ay = -sn * dx + c * dy;
          const end = -B.arm + 0.55;
          if (Math.abs(ax) < 0.95 + 0.3 && ay > end - 0.95 - 0.3 && ay < end + 0.15 + 0.3) return this.#fail(player, 'The blade catches you and knocks you flying.');
        }
      }
    }
    // The pit.
    const pl = this.sec.pit.local(player.pos, _a);
    const P = S.pit;
    if (Math.abs(pl.x) < P.half + 0.5 && pl.z < -P.ledges[0] + 0.3 && pl.z > -P.len + P.ledges[1] - 0.3 && pl.y < -2.2) return this.#fail(player, 'Down into the pit you go.');
    // The stair's gaps.
    const st = this.sec.stair.local(player.pos, _a);
    const SS = S.stair;
    if (Math.abs(st.x) < SS.half + 0.5 && st.z < SS.top && st.z > SS.foot && st.y < stairAt(st.z) - 2.2) return this.#fail(player, 'You drop through the gap in the stair.');
    // The spikes.
    const sp = this.sec.spikes.local(player.pos, _a);
    const SP = S.spikes;
    if (Math.abs(sp.x) < SP.half && sp.z < 0 && sp.z > -SP.len && sp.y < 0.5) {
      for (const r of this.rows) if (r.h > 0.4 && Math.abs(sp.z - r.z) < SP.row / 2) return this.#fail(player, 'The spikes come up under you.');
    }
    // The bridge.
    const br = this.sec.bridge.local(player.pos, _a);
    const BR = S.bridge;
    if (Math.abs(br.x) < BR.half + 0.5 && br.z < -BR.ledges[0] + 0.3 && br.z > -BR.len + BR.ledges[1] - 0.3 && br.y < -2.5) return this.#fail(player, 'Down into the dark under the bridge.');
    // The boulder, and its slot.
    const bo = this.sec.boulder.local(player.pos, _a);
    const R = S.boulder;
    if (this.ballZ !== null && this.ball.visible) {
      const bp = this.ball.position;
      if (Math.hypot(bo.x - bp.x, bo.y + 0.6 - bp.y, bo.z - bp.z) < 1.25 + 0.4) return this.#fail(player, 'The boulder rolls right over you.');
    }
    if (Math.abs(bo.x) < R.half && bo.z < R.slot[0] + 0.2 && bo.z > R.slot[1] - 0.2 && bo.y < -R.drop - 1.5) return this.#fail(player, 'Down the slot after the boulder.');
    if (Math.abs(bo.x) < R.half + 2 && bo.z < 0 && bo.z > -R.len && bo.y < rampAt(bo.z) - 2.5) return this.#fail(player, 'You drop into the dark under the ramp.');
    // The black water.
    const sa = this.sec.sanctum.local(player.pos, _a);
    const SA = S.sanctum;
    if (sa.z < SA.dial.z - 1.3 && sa.z > -SA.len && Math.abs(sa.x) < SA.half && sa.y < SA.pool.y - 0.35) return this.#fail(player, 'The black water closes over you.');
  }

  #runBlades(t, armed) {
    const B = S.blades;
    for (const b of this.bladeList) b.pivot.rotation.z = armed ? B.swing * Math.sin((t / b.period) * TAU + b.phase) : B.swing;
  }

  #runSpikes(t, armed) {
    const P = S.spikes;
    for (const r of this.rows) {
      const ph = ((((t - r.lag) / r.period) % 1) + 1) % 1;
      let want = 0;
      if (armed && ph < P.up) want = ph < 0.06 ? ph / 0.06 : ph > P.up - 0.1 ? (P.up - ph) / 0.1 : 1;
      r.h = Math.max(0, Math.min(1, want));
      r.mesh.position.y = r.h * 0.9;
    }
  }

  /** The doors that open as you get things right: the portcullis, the mirror door, the round door. */
  #runDoors(dt) {
    const step = (cur, want, rate) => (cur < want ? Math.min(want, cur + dt * rate) : cur > want ? Math.max(want, cur - dt * rate) : cur);
    const pu = step(this.portUp, this.keepersOpen ? 1 : 0, 0.35);
    if (pu !== this.portUp) {
      this.portUp = pu;
      this.#setPort();
    }
    const mu = step(this.mirrorUp, this.mirrorOpen || this.beamHit ? 1 : 0, 0.3);
    if (mu !== this.mirrorUp) {
      this.mirrorUp = mu;
      this.#setMirrorDoor();
    }
    if (this.beamHit && !this.mirrorOpen) {
      this.mirrorOpen = true;
      this.eyeMat.emissive.setRGB(0.6, 1.4, 1.1);
      this.say?.('The light finds the crystal in the door. The door lifts.', 3.5);
    }
    const dr = step(this.dialRoll, this.dialOpen ? 1 : 0, 0.4);
    if (dr !== this.dialRoll) {
      this.dialRoll = dr;
      this.#setDials();
    }
    // The mirrors turn to where they're set.
    for (const m of this.mirrorList) {
      m.turn += (m.state - m.turn) * Math.min(1, dt * 6);
      m.group.rotation.y = mirrorYaw(m.turn);
    }
  }

  #runCistern(dt) {
    const C = S.cistern;
    if (this.flood === 'rising') {
      this.level = Math.min(C.high, this.level + C.rise * dt);
      if (this.level >= C.high) {
        this.flood = 'high';
        this.floodT = C.hold;
        this.say?.('The water stops rising. It won’t stay long.', 2.5);
      }
    } else if (this.flood === 'high') {
      this.floodT -= dt;
      if (this.floodT <= 0) this.flood = 'falling';
    } else if (this.flood === 'falling') {
      this.level = Math.max(C.low, this.level - C.fall * dt);
      if (this.level <= C.low) this.flood = 'low';
    }
    this.cisternWater.position.y = this.level;
    this.spout.visible = this.flood === 'rising';
    if (this.spout.visible) {
      const len = Math.max(0.3, 8.8 - this.level);
      this.spout.scale.y = len;
    }
    if (this.flood === 'rising') this.wheel.rotation.x += dt * 2;
  }

  #runPillars(dt, player, armed, t) {
    const P = S.pit;
    const l = this.sec.pit.local(player.pos, _b);
    for (const p of this.pillarList) {
      if (p.kind === 'slides') {
        p.x = p.x0 + (armed ? P.slide.reach * Math.sin((t / P.slide.period) * TAU) : 0);
        this.#setPillar(p);
        continue;
      }
      if (p.kind !== 'crumbles') continue;
      const on = armed && player.mode === 'ground' && Math.abs(l.x - p.x) < p.h + 0.1 && Math.abs(l.z - p.z) < p.h + 0.1 && l.y > -p.drop - 0.3 && l.y < -p.drop + 0.4;
      if (sinkStep(p, on, dt, { stand: 0.65, back: 3.2, max: 10 })) this.say?.('The pillar gives under you.', 1.5);
      this.#setPillar(p);
    }
  }

  #runPlates(player, armed) {
    if (this.keepersOpen || !armed) return;
    const l = this.sec.keepers.local(player.pos, _b);
    const K = S.keepers;
    if (player.mode !== 'ground' || !player.grounded || l.y > 0.4 || l.y < -0.4) {
      this.onPlate = null;
      return;
    }
    const p = this.plateList.find((q) => Math.abs(l.x - q.x) < K.plate && Math.abs(l.z - q.z) < K.plate);
    if (!p || p === this.onPlate) {
      this.onPlate = p ?? null;
      return;
    }
    this.onPlate = p;
    if (p.lit) return;
    if (p.k === this.walked + 1) {
      p.lit = true;
      p.sign.material = this.signLitMat;
      this.walked++;
      if (this.walked === 8) {
        this.keepersOpen = true;
        this.say?.('The eighth plate sinks a little under you. The portcullis grinds up.', 4);
      }
      return;
    }
    // The wrong one: darts from the keepers' hands.
    for (const [i, d] of this.darts.entries()) {
      const s = K.statues[i % 8];
      d.from.set(s[1] - Math.sign(s[1]) * 0.5, 2.0, s[2]);
      d.to.set(p.x + (Math.random() - 0.5), 1.0, p.z + (Math.random() - 0.5));
      d.t = 0.001;
      d.mesh.visible = true;
    }
    this.dartFail = 0.3;
  }

  #runDarts(dt) {
    for (const d of this.darts ?? []) {
      if (!d.t) continue;
      d.t += dt / 0.3;
      if (d.t >= 1) {
        d.t = 0;
        d.mesh.visible = false;
        continue;
      }
      d.mesh.position.lerpVectors(d.from, d.to, d.t);
      d.mesh.rotation.y = Math.atan2(d.to.x - d.from.x, d.to.z - d.from.z) - Math.PI / 2;
    }
    if (this.dartFail !== undefined && this.dartFail !== null) {
      this.dartFail -= dt;
      if (this.dartFail <= 0) {
        this.dartFail = null;
        if (this.player) this.#fail(this.player, 'Darts fly from the keepers’ hands.');
      }
    }
  }

  #runSlabs(dt, player, armed) {
    const B = S.bridge;
    const l = this.sec.bridge.local(player.pos, _b);
    for (const s of this.slabList) {
      const on = armed && player.mode === 'ground' && Math.abs(l.x) < B.width + 0.1 && Math.abs(l.z - s.z) < B.slab / 2 + 0.05 && l.y > -s.drop - 0.3 && l.y < -s.drop + 0.4;
      if (s.phase === null && on) {
        s.phase = 'shake';
        s.timer = B.fallAfter;
      }
      if (s.phase === 'shake') {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.phase = 'gone';
          s.timer = B.backAfter;
        }
      } else if (s.phase === 'gone') {
        s.timer -= dt;
        s.drop = Math.min(20, s.drop + dt * (5 + s.drop * 2));
        if (s.timer <= 0) s.phase = 'back';
      } else if (s.phase === 'back') {
        s.drop = Math.max(0, s.drop - dt * 8);
        if (s.drop === 0) s.phase = null;
      }
      this.#setSlab(s);
    }
  }

  #runBoulder(dt, player, armed) {
    const R = S.boulder;
    const l = this.sec.boulder.local(player.pos, _b);
    const onRamp = armed && Math.abs(l.x) < R.half + R.alcove.d + 0.5 && l.z < -3.5 && l.z > R.foot && l.y > -R.drop - 1 && l.y < 3;
    if (this.ballZ === null) {
      this.ballWait = Math.max(0, this.ballWait - dt);
      if (onRamp && this.ballWait <= 0) {
        this.ballZ = -1.4;
        this.ballV = 1.5;
        this.ball.visible = true;
        if (!this.rumbled) {
          this.rumbled = true;
          this.say?.('A hatch bangs open in the roof behind you. Run, and into an alcove.', 2.5);
        }
      }
      return;
    }
    // Down the ramp after you, faster and faster, and into the slot at its foot.
    this.ballV = Math.min(8.5, this.ballV + dt * 4.2);
    this.ballZ -= this.ballV * dt;
    const sink = Math.max(0, R.slot[0] - 0.4 - this.ballZ) * 1.6;
    this.#setBall(this.ballZ, sink);
    if (sink > 6) {
      this.ballZ = null;
      this.ballWait = 2.5;
      this.ball.visible = false;
    }
  }

  #runStones(dt, player, armed) {
    const l = this.sec.sanctum.local(player.pos, _b);
    for (const st of this.stoneList) {
      if (!st.sinks) continue;
      const on = armed && player.mode === 'ground' && Math.hypot(l.x - st.x, l.z - st.z) < st.h + 0.1 && l.y > 0.1 - st.drop && l.y < 0.6 - st.drop;
      if (sinkStep(st, on, dt, { stand: 0.8, back: 3.0, max: 1.4, rate: 1.6 })) this.say?.('The stone sinks under you.', 1.5);
      this.#setStone(st);
    }
  }
}

/** Something that gives if you stand on it too long, and comes back after a while. Returns true as it goes. */
function sinkStep(p, on, dt, { stand, back, max, rate = null }) {
  if (p.phase === 'gone') {
    p.timer -= dt;
    p.drop = Math.min(max, p.drop + dt * (rate ?? 4 + p.drop * 2));
    if (p.timer <= 0) p.phase = 'back';
    return false;
  }
  if (p.phase === 'back') {
    p.drop = Math.max(0, p.drop - dt * 6);
    if (p.drop === 0) p.phase = null;
    return false;
  }
  p.stood = on ? p.stood + dt : Math.max(0, p.stood - dt * 2);
  if (p.stood > stand) {
    p.stood = 0;
    p.phase = 'gone';
    p.timer = back;
    return true;
  }
  return false;
}

/** A mirror's turn (0 or 1, or between as it moves) as its yaw: a quarter-turn apart, both on the diagonal. */
const mirrorYaw = (turn) => Math.PI / 4 + (turn * Math.PI) / 2;

/** A soft shaft of light (additive, fading at its ends). */
function lightShaftMat(k, color = [1.0, 0.95, 0.8]) {
  return new THREE.ShaderMaterial({
    uniforms: { uK: { value: k }, uC: { value: new THREE.Vector3(...color) } },
    vertexShader: /* glsl */ `
      varying float vUp;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUp = uv.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = mat3(modelMatrix) * normal;
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK;
      uniform vec3 uC;
      varying float vUp;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = abs(dot(vN, vV)) / max(length(vN) * length(vV), 1e-4);
        float fade = smoothstep(0.0, 0.25, vUp) * (1.0 - clamp(vUp, 0.0, 1.0) * 0.6);
        gl_FragColor = vec4(uC * uK * f * f * fade, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** A direction in a part's frame, in the world. */
const dirW = (sec, x, y, z) => V(x, y, z).applyQuaternion(sec.quat).normalize();

/** Plain geometries (no colours) merged into one. */
function mergeGeos(list) {
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const g = new THREE.BufferGeometry();
  let n = 0;
  for (const f of flat) n += f.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const f of flat) {
    pos.set(f.attributes.position.array, o * 3);
    uv.set(f.attributes.uv.array, o * 2);
    o += f.attributes.position.count;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const c3 = new THREE.Color();
const _l = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const xz = (p) => ({ x: p.x, z: p.z });
