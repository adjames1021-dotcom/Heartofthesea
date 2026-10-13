import * as THREE from 'three';
import { makeBox, Body } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { deepenShadows } from './atmosphere.js';
import { hash2 } from '../shared/noise.js';
import { TEMPLE, templeFrame, rampAt } from '../shared/temple.js';
import { TEMPLE as AT_TEMPLE, DONE } from '../shared/story.js';

// The keepers' temple on Saddle (the numbers and the plan: shared/temple.js).
//
// Shut, until you've all eight keys: then they turn in the gate's eight locks
// and it opens. Inside, the keepers' traps, each with a brazier before it
// that lights as you reach it; a trap sends you back to the last one lit
// (nothing worse). Blades swinging across a hall; a pit crossed on pillars,
// two of which sink under you if you stand about; a corridor whose floor
// puts up spikes in a wave; a ramp a boulder comes down (into the alcoves!).
// At the top, the sanctum, and the Heart of the Sea on its stone. Lift it,
// and the story's done (src/cinematic.js does the rest).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const STONE = ['#ada188', '#a89c83', '#b2a68c', '#a59980', '#aa9e85'];
const STONE_DARK = '#8a7e68';
const MOSS = '#7c8a5a';
const FLAGS = ['#a89a80', '#9f9178', '#b0a287'];
const IRON = '#3a3530';
const BRONZE = '#9a7a3a';
const pick = (list, i, j) => list[Math.floor(hash2(i, j, 1301) * list.length) % list.length];

/** A box of stone in courses, coloured per face (moss low down). */
function stoneBox(x0, x1, y0, y1, z0, z1, seed, course = 0.5) {
  const nx = Math.max(1, Math.round((x1 - x0) / 0.9));
  const ny = Math.max(1, Math.round((y1 - y0) / course));
  const nz = Math.max(1, Math.round((z1 - z0) / 0.9));
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, nx, ny, nz);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const ng = g.toNonIndexed();
  const q = ng.attributes.position;
  const col = new Float32Array(q.count * 3);
  const c = new THREE.Color();
  const moss = new THREE.Color(MOSS);
  for (let i = 0; i < q.count; i += 6) {
    const y = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3;
    c.set(pick(STONE, i, seed));
    if (y < 0.6) c.lerp(moss, 0.3 * (1 - y / 0.6));
    for (let m = 0; m < 6 && i + m < q.count; m++) col.set([c.r, c.g, c.b], (i + m) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.deleteAttribute('uv');
  ng.deleteAttribute('normal');
  return ng;
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

    const parts = [];
    this.#walls(parts);
    this.#floors(parts);
    this.#dressing(parts);
    const mat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    this.#gate();
    this.#blades();
    this.#pillars();
    this.#spikes();
    this.#boulder();
    this.#braziers();
    this.#heart();

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
  }

  // -------------------------------------------------------------------------

  /** Temple-frame point → world. */
  #w(p) {
    return p.clone().applyMatrix4(this.matrix);
  }

  #local(p) {
    return _l.copy(p).applyMatrix4(this.inverse);
  }

  #box(x0, x1, y0, y1, z0, z1, flags = {}) {
    this.world.addStatic(makeBox({ center: this.#w(V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), half: V((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), quaternion: this.quat, ...flags }));
  }

  /** A wall: drawn, and solid (no hanging off its top: the traps can't be walked round). */
  #wall(parts, x0, x1, y0, y1, z0, z1, seed) {
    parts.push(stoneBox(x0, x1, y0, y1, z0, z1, seed));
    // (Long walls in pieces, for the collision grid.)
    const n = Math.max(1, Math.ceil(Math.max(x1 - x0, z1 - z0) / 10));
    for (let i = 0; i < n; i++) {
      const along = x1 - x0 > z1 - z0;
      const a0 = along ? x0 + ((x1 - x0) * i) / n : z0 + ((z1 - z0) * i) / n;
      const a1 = along ? x0 + ((x1 - x0) * (i + 1)) / n : z0 + ((z1 - z0) * (i + 1)) / n;
      if (along) this.#box(a0, a1, y0, y1, z0, z1, { noGrab: true, noClimb: true });
      else this.#box(x0, x1, y0, y1, a0, a1, { noGrab: true, noClimb: true });
    }
  }

  // -------------------------------------------------------------------------
  // The plan
  // -------------------------------------------------------------------------

  #walls(parts) {
    const T = TEMPLE;
    const X = T.half.x;
    const t = T.wall.t;
    const H = T.wall.h;
    const zN = T.sanctum.z0;
    const zS = T.gate.z;
    const g = T.gate;
    const bottom = -T.pit.depth - 0.5;
    // The outer wall: south (round the gate), north, east and west (down into the pit where it passes).
    this.#wall(parts, -X, -g.half, -0.5, H, zS, zS + t, 1);
    this.#wall(parts, g.half, X, -0.5, H, zS, zS + t, 2);
    this.#wall(parts, -g.half, g.half, g.h, H, zS, zS + t, 3);
    this.#wall(parts, -X, X, -0.5, H + T.ramp.rise, zN - t, zN, 4);
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -X : X - t;
      const xb = xa + t;
      this.#wall(parts, xa, xb, bottom, H, zN, zS + t, 5 + s);
    }
    // Lintel and posts of the gate, a step higher than the wall.
    parts.push(stoneBox(-g.half - 0.6, g.half + 0.6, g.h, g.h + 0.7, zS - 0.1, zS + t + 0.15, 9));
    for (const s of [-1, 1]) parts.push(stoneBox(s * g.half - 0.35 + s * 0.25, s * g.half + 0.35 + s * 0.25, -0.5, g.h, zS - 0.1, zS + t + 0.15, 10 + s));
    // Cross walls between the parts, each with its doorway in the middle (6 wide).
    const cross = (z, y0, y1, half = 3) => {
      this.#wall(parts, -X + t, -half, y0, y1, z - 0.45, z + 0.45, Math.round(z * 3));
      this.#wall(parts, half, X - t, y0, y1, z - 0.45, z + 0.45, Math.round(z * 3) + 1);
    };
    cross(T.court.z0, -0.5, H);
    cross(T.pit.z1, bottom, H);
    cross(T.pit.z0, bottom, H);
    cross(T.ramp.z0, -0.5, H + T.ramp.rise);
    // Corridor walls: the blade hall, the spikes, the ramp (with alcoves).
    const corridor = (z0, z1, seed, y1 = H) => {
      for (const s of [-1, 1]) this.#wall(parts, s < 0 ? -3.6 : 3, s < 0 ? -3 : 3.6, -0.5, y1, z0, z1, seed + s);
    };
    corridor(T.pit.z1 + 0.45, T.court.z0 - 0.45, 20);
    corridor(T.spikes.z0 - 3, T.pit.z0 - 0.45, 30);
    // The ramp's walls, broken by the alcoves.
    const R = T.ramp;
    for (const s of [-1, 1]) {
      const holes = R.alcoves.filter(([, side]) => side === s).map(([z]) => z).sort((a, b) => a - b);
      let z0 = R.z0 + 0.45;
      for (const hz of [...holes, null]) {
        const z1 = hz === null ? T.spikes.z0 - 3 : hz - R.alcove.w / 2;
        if (z1 > z0) this.#wall(parts, s < 0 ? -3.6 : 3, s < 0 ? -3 : 3.6, -0.5, H + R.rise, z0, z1, 40 + Math.round(z0));
        if (hz === null) break;
        // The alcove: a niche in the wall, its back and sides.
        const a = R.alcove;
        const xa = s < 0 ? -3 - a.d - 0.6 : 3 + a.d;
        this.#wall(parts, xa, xa + 0.6, -0.5, H + R.rise, hz - a.w / 2 - 0.6, hz + a.w / 2 + 0.6, 60 + Math.round(hz));
        for (const e of [-1, 1]) {
          const ez = hz + e * (a.w / 2 + 0.3);
          this.#wall(parts, s < 0 ? -3 - a.d : 3, s < 0 ? -3 : 3 + a.d, -0.5, H + R.rise, ez - 0.3, ez + 0.3, 70 + Math.round(hz) + e);
        }
        z0 = hz + a.w / 2;
      }
    }
  }

  #floors(parts) {
    const T = TEMPLE;
    const X = T.half.x - T.wall.t;
    const flags = (x0, x1, z0, z1, y, seed) => {
      // Flagstones, a little uneven in colour.
      const nx = Math.max(1, Math.round((x1 - x0) / 1.2));
      const nz = Math.max(1, Math.round((z1 - z0) / 1.2));
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const g = new THREE.BoxGeometry((x1 - x0) / nx - 0.03, 0.12, (z1 - z0) / nz - 0.03);
          g.translate(x0 + ((i + 0.5) * (x1 - x0)) / nx, y - 0.06, z0 + ((j + 0.5) * (z1 - z0)) / nz);
          parts.push(paint(g, pick(FLAGS, i * 31 + j, seed)));
        }
      }
      this.#box(x0, x1, y - 0.8, y, z0, z1);
    };
    flags(-X, X, T.court.z0, T.gate.z + T.wall.t + 0.3, 0.05, 1);
    flags(-3, 3, T.pit.z1, T.court.z0, 0.05, 2);
    // The pit's two ledges (full width at the walls' feet), and its floor far below.
    flags(-T.pit.half, T.pit.half, T.pit.start - 0.5, T.pit.z1, 0.05, 3);
    flags(-T.pit.half, T.pit.half, T.pit.z0, T.pit.end + 0.5, 0.05, 4);
    const fl = new THREE.BoxGeometry(2 * X, 0.3, T.pit.z1 - T.pit.z0);
    fl.translate(0, -T.pit.depth + 0.4, (T.pit.z0 + T.pit.z1) / 2);
    parts.push(paint(fl, '#3f3a32'));
    this.#box(-X, X, -T.pit.depth - 1, -T.pit.depth + 0.55, T.pit.z0, T.pit.z1);
    // The pit's sheer sides under its ledges.
    for (const [za, zb] of [[T.pit.start - 0.5, T.pit.z1], [T.pit.z0, T.pit.end + 0.5]]) {
      parts.push(stoneBox(-T.pit.half, T.pit.half, -T.pit.depth, -0.05, za, zb, 80 + za));
      this.#box(-T.pit.half, T.pit.half, -T.pit.depth, -0.05, za, zb, { noGrab: true });
    }
    // Its sides: walls, all the way up (no going round it).
    const P = T.pit.half;
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -X : P;
      this.#wall(parts, xa, xa + X - P, -T.pit.depth, T.wall.h, T.pit.z0 + 0.45, T.pit.z1 - 0.45, 90 + s);
    }
    // Spikes at the bottom of the pit.
    for (let i = 0; i < 70; i++) {
      const x = (hash2(i, 1, 9) - 0.5) * 2 * (X - 0.5);
      const z = T.pit.z0 + 0.5 + hash2(i, 2, 9) * (T.pit.z1 - T.pit.z0 - 1);
      const c = new THREE.ConeGeometry(0.09, 0.7, 4);
      c.translate(x, -T.pit.depth + 0.9, z);
      parts.push(paint(c, IRON));
    }
    flags(-3, 3, T.spikes.z0 - 3, T.pit.z0, 0.05, 5);
    // The ramp: a slope of flags up to the sanctum (and solid under it).
    const R = T.ramp;
    const len = Math.hypot(R.z1 - R.z0, R.rise);
    const pitch = Math.atan2(R.rise, R.z1 - R.z0);
    const rg = new THREE.BoxGeometry(6, 0.5, len, 5, 1, Math.round(len / 1.2));
    rg.translate(0, -0.25, 0);
    rg.rotateX(pitch);
    rg.translate(0, R.rise / 2, (R.z0 + R.z1) / 2);
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
    parts.push(rp);
    const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch).premultiply(this.quat);
    this.world.addStatic(makeBox({ center: this.#w(V(0, R.rise / 2 - 0.25, (R.z0 + R.z1) / 2)), half: V(3, 0.25, len / 2), quaternion: q }));
    parts.push(stoneBox(-3, 3, -0.5, R.rise - 0.4, R.z0, R.z0 + 2, 7));
    // The alcoves' floors, at the ramp's height there.
    for (const [hz, s] of R.alcoves) {
      const y = rampAt(hz);
      const xa = s < 0 ? -3 - R.alcove.d : 3;
      flags(xa, xa + R.alcove.d, hz - R.alcove.w / 2, hz + R.alcove.w / 2, y + 0.05, 100 + hz);
    }
    // The sanctum, up at the ramp's top.
    flags(-X, X, T.sanctum.z0, T.sanctum.z1, R.rise + 0.05, 8);
    parts.push(stoneBox(-X, X, -0.5, R.rise - 0.1, T.sanctum.z0, T.sanctum.z1, 11));
  }

  #dressing(parts) {
    const T = TEMPLE;
    const S = T.sanctum;
    const y = T.ramp.rise;
    // A ring of columns round the Heart, open to the sky.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + TAU / 16;
      const x = S.heart.x + Math.cos(a) * 5.0;
      const z = S.heart.z + Math.sin(a) * 4.0;
      if (z > S.z1 - 1.2) continue;
      const broken = k === 2 || k === 5;
      const h = broken ? 2.2 + hash2(k, 1, 3) : 4.6;
      const c = new THREE.CylinderGeometry(0.42, 0.48, h, 10, Math.round(h / 0.6));
      c.translate(x, y + h / 2, z);
      parts.push(paint(c, pick(STONE, k, 5)));
      const cap = new THREE.BoxGeometry(1.1, 0.3, 1.1);
      cap.translate(x, y + h + 0.15, z);
      if (!broken) parts.push(paint(cap, STONE_DARK));
      else {
        const r = rock(0.5, 7700 + k, STONE[1], 0.6);
        r.translate(x + 1.1, y + 0.3, z + 0.6);
        parts.push(r);
      }
      this.world.addStatic({ type: 'cyl', ...xz(this.#w(V(x, 0, z))), r: 0.45, y0: this.center.y + y - 0.5, y1: this.center.y + y + h });
    }
    // The pedestal for the Heart, carved with waves.
    const ped = new THREE.CylinderGeometry(0.55, 0.75, 1.05, 8);
    ped.translate(S.heart.x, y + 0.525, S.heart.z);
    parts.push(paint(ped, STONE_DARK));
    const top = new THREE.CylinderGeometry(0.7, 0.7, 0.12, 8);
    top.translate(S.heart.x, y + 1.08, S.heart.z);
    parts.push(paint(top, STONE[0]));
    this.world.addStatic({ type: 'cyl', ...xz(this.#w(V(S.heart.x, 0, S.heart.z))), r: 0.7, y0: this.center.y + y - 0.5, y1: this.center.y + y + 1.1 });
    // Brambles and fallen stones in the dead ground between the corridors and the outer wall.
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (4.5 + hash2(i, 3, 2) * 4);
      const z = T.spikes.z0 + hash2(i, 4, 2) * (T.court.z0 - T.spikes.z0);
      if (z > T.pit.z0 - 1 && z < T.pit.z1 + 1) continue;
      const r = rock(0.4 + hash2(i, 5, 2) * 0.5, 7800 + i, i % 3 ? STONE[2] : MOSS, 0.55);
      r.translate(x, 0.1, z);
      parts.push(r);
    }
    // Two pillars either side of the gate, standing up over the wall, a wave cut in each.
    for (const s of [-1, 1]) {
      const x = s * (T.gate.half + 1.25);
      const zp = T.gate.z + T.wall.t + 0.45;
      parts.push(stoneBox(x - 0.55, x + 0.55, -0.5, 7.2, zp - 0.5, zp + 0.5, 500 + s));
      parts.push(stoneBox(x - 0.75, x + 0.75, 7.2, 7.6, zp - 0.7, zp + 0.7, 510 + s));
      for (let k = 0; k < 3; k++) {
        const w = new THREE.TorusGeometry(0.15, 0.035, 3, 8, Math.PI);
        w.translate(x - 0.3 + k * 0.3, 5.6, zp + 0.52);
        parts.push(paint(w, STONE_DARK));
      }
      this.#box(x - 0.55, x + 0.55, -0.5, 7.2, zp - 0.5, zp + 0.5, { noGrab: true, noClimb: true });
    }
  }

  // -------------------------------------------------------------------------
  // The gate and its eight locks
  // -------------------------------------------------------------------------

  #gate() {
    const g = TEMPLE.gate;
    const z = g.z + TEMPLE.wall.t / 2;
    this.gateLeaves = [];
    this.gateBodies = [];
    for (const s of [-1, 1]) {
      const geo = stoneBox(0, g.half, 0, g.h - 0.05, -0.22, 0.22, 200 + s, 0.6);
      if (s < 0) geo.translate(-g.half, 0, 0);
      // Bronze studs.
      const studs = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
        const st = new THREE.SphereGeometry(0.06, 5, 3);
        st.translate((s < 0 ? -g.half : 0) + 0.35 + i * 0.75, 0.6 + j * 0.95, 0.24);
        studs.push(paint(st, BRONZE));
      }
      const leaf = new THREE.Mesh(mergeParts([geo, ...studs]), this.mat);
      leaf.castShadow = true;
      leaf.matrixAutoUpdate = false;
      this.group.add(leaf);
      const body = this.world.addBody(new Body([{ center: V((s * g.half) / 2, g.h / 2, 0), half: V(g.half / 2, g.h / 2, 0.22) }], 'temple-gate'));
      this.gateLeaves.push({ leaf, body, s, hinge: V(s * g.half, 0, z) });
    }
    this.gateOpen = 0;
    this.gateWant = 0;
    this.#setGate();
    // The lock plate: eight keyholes in a stone beside the gate.
    const plate = new THREE.Mesh(paint(new THREE.BoxGeometry(1.5, 1.1, 0.16), STONE_DARK), this.mat);
    plate.position.set(g.half + 1.6, 1.6, g.z + TEMPLE.wall.t + 0.08);
    this.group.add(plate);
    this.holeMat = new THREE.MeshBasicMaterial({ color: '#191512' });
    this.goldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.55) });
    this.keyholes = [];
    for (let i = 0; i < 8; i++) {
      const k = new THREE.Mesh(new THREE.CircleGeometry(0.075, 10), this.holeMat);
      k.position.set(g.half + 1.6 - 0.48 + (i % 4) * 0.32, 1.6 + (i < 4 ? 0.22 : -0.22), g.z + TEMPLE.wall.t + 0.165);
      this.group.add(k);
      this.keyholes.push(k);
    }
  }

  #setGate() {
    const e = this.gateOpen * this.gateOpen * (3 - 2 * this.gateOpen);
    for (const G of this.gateLeaves) {
      const m = new THREE.Matrix4().compose(G.hinge, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), G.s * e * 1.45), V(1, 1, 1));
      const local = new THREE.Matrix4().makeTranslation(-G.s * TEMPLE.gate.half, 0, 0);
      G.leaf.matrix.copy(m).multiply(local);
      G.body.setMatrix(m.clone().multiply(local).premultiply(this.matrix));
    }
  }

  // -------------------------------------------------------------------------
  // The traps
  // -------------------------------------------------------------------------

  #blades() {
    const B = TEMPLE.blades;
    this.bladeList = [];
    const steel = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: '#777777', shininess: 40 });
    B.at.forEach((z, k) => {
      // The beam it hangs from, on two piers above the hall's walls.
      const bp = [];
      for (const s of [-1, 1]) bp.push(stoneBox(s * 3.3 - 0.35, s * 3.3 + 0.35, TEMPLE.wall.h, B.pivot + 0.4, z - 0.35, z + 0.35, 300 + k * 2 + s));
      bp.push(stoneBox(-3.7, 3.7, B.pivot + 0.1, B.pivot + 0.6, z - 0.3, z + 0.3, 310 + k));
      const beam = new THREE.Mesh(mergeParts(bp), this.mat);
      beam.castShadow = true;
      this.group.add(beam);
      // The blade: an arm and a crescent of bronze-edged iron.
      const pivot = new THREE.Group();
      pivot.position.set(0, B.pivot, z);
      const parts = [paint(segment(V(0, 0, 0), V(0, -B.len + 0.6, 0), 0.06, 0.06, 6), IRON)];
      const shape = new THREE.Shape();
      shape.moveTo(-0.95, 0.15);
      shape.quadraticCurveTo(0, -0.95, 0.95, 0.15);
      shape.quadraticCurveTo(0, -0.35, -0.95, 0.15);
      const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
      blade.translate(0, -B.len + 0.55, -0.04);
      parts.push(paint(blade, '#8d9195'));
      const edge = new THREE.TorusGeometry(0.97, 0.025, 3, 16, Math.PI * 0.62);
      edge.rotateZ(Math.PI + Math.PI * 0.19);
      edge.scale(1, 0.95, 1);
      edge.translate(0, -B.len + 0.55 + 0.1, 0);
      parts.push(paint(edge, BRONZE));
      const m = new THREE.Mesh(mergeParts(parts), steel);
      m.castShadow = true;
      pivot.add(m);
      this.group.add(pivot);
      this.bladeList.push({ pivot, z, phase: k * 2.1 });
    });
  }

  #pillars() {
    const T = TEMPLE;
    this.pillarList = T.pillars.map(([x, z, h, crumbles], i) => {
      const g = stoneBox(x - h, x + h, -T.pit.depth, 0.05, z - h, z + h, 400 + i, 0.6);
      // The ones that give: cracked across the top.
      const parts = [g];
      if (crumbles) {
        const crack = new THREE.BoxGeometry(h * 2.02, 0.02, 0.05);
        crack.rotateY(0.6);
        crack.translate(x, 0.06, z);
        parts.push(paint(crack, '#3a332a'));
      }
      const mesh = new THREE.Mesh(mergeParts(parts), this.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      const body = this.world.addBody(new Body([{ center: V(x, -T.pit.depth / 2 + 0.025, z), half: V(h, T.pit.depth / 2 + 0.025, h) }], 'temple-pillar'));
      const p = { x, z, h, crumbles, mesh, body, drop: 0, stood: 0, phase: null, timer: 0 };
      this.#setPillar(p);
      return p;
    });
  }

  #setPillar(p) {
    const m = new THREE.Matrix4().makeTranslation(0, -p.drop, 0);
    p.mesh.matrix.copy(m);
    p.body.setMatrix(m.clone().premultiply(this.matrix));
  }

  #spikes() {
    const S = TEMPLE.spikes;
    this.rows = S.rows.map((z, k) => {
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
      this.group.add(mesh);
      // The slotted plate it comes up through.
      const plate = new THREE.Mesh(paint(new THREE.BoxGeometry(6, 0.04, S.row - 0.1), '#6e665a'), this.mat);
      plate.position.set(0, 0.075, z);
      plate.receiveShadow = true;
      this.group.add(plate);
      return { z, k, mesh, h: 0 };
    });
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
    this.group.add(this.ball);
    this.ballZ = null; // rolling: where it's got to (temple frame z); null = waiting at the top
    this.ballV = 0;
    this.ballWait = 0;
    this.#setBall(TEMPLE.ramp.z0 - 1.4);
  }

  #setBall(z, sink = 0) {
    const R = TEMPLE.ramp;
    this.ball.position.set(0, rampAt(z) + 1.25 - sink, z);
    this.ball.rotation.x = -(z - R.z0) / 1.25;
  }

  #braziers() {
    this.lit = [];
    this.flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.35), transparent: true, opacity: 0.9 });
    TEMPLE.checkpoints.forEach(([x, z], i) => {
      const bx = x + 2.2;
      const parts = [paint(segment(V(bx, 0, z), V(bx, 0.9, z), 0.1, 0.07, 6), IRON)];
      const bowl = new THREE.CylinderGeometry(0.38, 0.2, 0.3, 8, 1, true);
      bowl.translate(bx, 1.05, z);
      parts.push(paint(bowl, BRONZE));
      const m = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
      this.group.add(m);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 6), flameMat);
      flame.position.set(bx, 1.4, z);
      flame.visible = false;
      this.group.add(flame);
      this.flames.push(flame);
      this.lit.push(false);
      this.world.addStatic({ type: 'cyl', ...xz(this.#w(V(bx, 0, z))), r: 0.3, y0: this.center.y - 0.5, y1: this.center.y + 1.2 });
    });
  }

  #heart() {
    const h = TEMPLE.sanctum.heart;
    const y = TEMPLE.ramp.rise + h.y + 0.12;
    this.heartMat = new THREE.MeshPhongMaterial({ color: '#1f8f78', emissive: new THREE.Color('#0c5a48'), specular: '#c8fff0', shininess: 90, flatShading: true });
    this.heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), this.heartMat);
    this.heart.scale.set(1, 1.3, 1);
    this.heart.position.set(h.x, y, h.z);
    this.heart.castShadow = true;
    this.group.add(this.heart);
    // A soft glow round it.
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
    this.group.add(glow);
    this.glow = glow;
    // Once it's lifted: its light, straight up into the sky (and seen from far off).
    const beamGeo = new THREE.CylinderGeometry(0.9, 0.6, 320, 16, 1, true);
    beamGeo.translate(0, 160, 0);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        uniforms: { uK: { value: 0 } },
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
          varying float vUp;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float f = abs(dot(vN, vV)) / max(length(vN) * length(vV), 1e-4);
            float fade = (1.0 - clamp(vUp, 0.0, 1.0)) * (1.0 - clamp(vUp, 0.0, 1.0));
            gl_FragColor = vec4(vec3(0.25, 1.0, 0.75) * uK * f * f * fade, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.position.copy(this.heart.position);
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    this.group.add(this.beam);
    this.heartAt = this.#w(this.heart.position);
  }

  // -------------------------------------------------------------------------
  // Playing
  // -------------------------------------------------------------------------

  /** Caught by a trap: back to the last brazier lit. */
  #fail(player, what) {
    if (this.failT > 0) return;
    this.failT = 1.2;
    const [x, z, y] = TEMPLE.checkpoints[this.checkpoint];
    player.place(this.#w(V(x, y + 0.1, z)), null);
    this.fade.classList.remove('on');
    void this.fade.offsetWidth;
    this.fade.classList.add('on');
    this.say?.(`${what} Back to the last brazier.`, 3);
  }

  interaction(player) {
    if (player.pos.distanceTo(this.center) > 70) return null;
    const l = this.#local(player.pos);
    const g = TEMPLE.gate;
    // At the gate, outside.
    if (!this.open && Math.abs(l.x) < 4.5 && l.z > g.z && l.z < g.z + 5 && Math.abs(l.y) < 1.5) {
      const st = this.story;
      const n = (st.keys ?? []).length;
      if (st.ch !== AT_TEMPLE) return { key: '', label: n ? `Eight keyholes in the gate. You have ${n} of the keys.` : 'Eight keyholes in the gate, and a carving of waves.' };
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
    return null;
  }

  update(dt, { t, player }) {
    this.t += dt;
    this.failT = Math.max(0, this.failT - dt);
    if (this.fade.classList.contains('on') && this.failT < 0.6) this.fade.classList.remove('on');
    // The gate.
    if (this.gateOpen !== this.gateWant) {
      this.gateOpen = Math.min(1, this.gateOpen + dt / 3.5);
      this.#setGate();
    }
    // The Heart, turning slowly, brighter once it's lifted.
    this.heart.rotation.y += dt * 0.6;
    this.heart.position.y = TEMPLE.ramp.rise + TEMPLE.sanctum.heart.y + 0.12 + 0.05 * Math.sin(this.t * 1.3);
    this.heartLit = Math.min(1, (this.heartLit ?? 0) + (this.done ? dt * 0.5 : 0));
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    this.heartMat.emissive.setRGB(0.05 + 0.25 * this.heartLit + 0.05 * pulse, 0.35 + 0.85 * this.heartLit + 0.15 * pulse, 0.28 + 0.6 * this.heartLit + 0.1 * pulse);
    this.glow.material.uniforms.uK.value = 0.25 + 0.15 * pulse + 0.35 * this.heartLit;
    this.beam.visible = this.heartLit > 0.01;
    this.beam.material.uniforms.uK.value = this.heartLit * (0.32 + 0.06 * pulse);

    const armed = this.open && !this.done;
    this.#runBlades(t, armed);
    this.#runSpikes(t, armed);
    if (!player) return;
    const l = this.#local(player.pos).clone();
    const inside = Math.abs(l.x) < TEMPLE.half.x && l.z < TEMPLE.gate.z && l.z > TEMPLE.sanctum.z0;
    // Braziers.
    TEMPLE.checkpoints.forEach(([x, z, y], i) => {
      if (inside && Math.hypot(l.x - x, l.z - z) < 2.6 && Math.abs(l.y - y) < 1.5 && !this.lit[i]) {
        this.lit[i] = true;
        this.flames[i].visible = true;
        if (i > this.checkpoint) this.checkpoint = i;
        if (i > 0) this.say?.('The brazier catches.', 1.8);
      }
    });
    for (let i = 0; i < this.flames.length; i++) if (this.flames[i].visible) this.flames[i].scale.set(1, 0.85 + 0.25 * Math.sin(this.t * 13 + i) * Math.sin(this.t * 7.3 + i * 2), 1);
    this.#runPillars(dt, l, player, armed);
    this.#runBoulder(dt, l, player, armed);
    if (!armed || !inside || player.mode === 'station') return;
    // Caught?
    // (The blade's crescent, in its arm's frame: across ±0.95, from 0.4 below
    // the arm's end to 0.7 above it. The bear's body is checked at three
    // heights against it, a bear's width round it.)
    const B = TEMPLE.blades;
    for (const b of this.bladeList) {
      if (Math.abs(l.z - b.z) > 0.42) continue;
      const a = b.pivot.rotation.z;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      for (const h of [0.3, 0.7, 1.1]) {
        const dx = l.x;
        const dy = l.y + h - B.pivot;
        const ax = c * dx + sn * dy; // into the arm's frame (undo its swing)
        const ay = -sn * dx + c * dy;
        const end = -B.len + 0.55;
        if (Math.abs(ax) < 0.95 + 0.3 && ay > end - 0.95 - 0.3 && ay < end + 0.15 + 0.3) return this.#fail(player, 'The blade catches you and knocks you flying.');
      }
    }
    for (const r of this.rows) {
      if (r.h > 0.4 && Math.abs(l.z - r.z) < TEMPLE.spikes.row / 2 && Math.abs(l.x) < 3 && l.y < 0.5) return this.#fail(player, 'The spikes come up under you.');
    }
    if (l.y < -2.2 && l.z > TEMPLE.pit.z0 && l.z < TEMPLE.pit.z1) return this.#fail(player, 'Down into the pit you go.');
    if (this.ballZ !== null) {
      const bp = this.ball.position;
      if (Math.hypot(l.x - bp.x, l.y + 0.6 - bp.y, l.z - bp.z) < 1.25 + 0.4) return this.#fail(player, 'The boulder rolls right over you.');
    }
  }

  #runBlades(t, armed) {
    const B = TEMPLE.blades;
    for (const b of this.bladeList) {
      // (Asleep, they rest against the wall, out of the way.)
      b.pivot.rotation.z = armed ? B.swing * Math.sin((t / B.period) * TAU + b.phase) : B.swing;
    }
  }

  #runSpikes(t, armed) {
    const S = TEMPLE.spikes;
    for (const r of this.rows) {
      const ph = ((((t - r.k * S.lag) / S.period) % 1) + 1) % 1;
      // Up fast, a moment held, down slower.
      let want = 0;
      if (armed && ph < S.up) want = ph < 0.06 ? ph / 0.06 : ph > S.up - 0.1 ? (S.up - ph) / 0.1 : 1;
      r.h = Math.max(0, Math.min(1, want));
      r.mesh.position.y = r.h * 0.9;
    }
  }

  #runPillars(dt, l, player, armed) {
    for (const p of this.pillarList) {
      if (!p.crumbles) continue;
      const on = armed && player.mode === 'ground' && Math.abs(l.x - p.x) < p.h + 0.1 && Math.abs(l.z - p.z) < p.h + 0.1 && l.y > -p.drop - 0.3 && l.y < -p.drop + 0.4;
      // Gone down into the pit; back up in a while.
      if (p.phase === 'gone') {
        p.timer -= dt;
        p.drop = Math.min(10, p.drop + dt * (4 + p.drop * 2));
        if (p.timer <= 0) p.phase = 'back';
        this.#setPillar(p);
        continue;
      }
      if (p.phase === 'back') {
        p.drop = Math.max(0, p.drop - dt * 6);
        if (p.drop === 0) p.phase = null;
        this.#setPillar(p);
        continue;
      }
      p.stood = on ? p.stood + dt : Math.max(0, p.stood - dt * 2);
      // Shudders, then goes.
      p.mesh.matrix.makeTranslation(on && p.stood > 0.2 ? (Math.random() - 0.5) * 0.04 : 0, 0, 0);
      if (p.stood > 0.65) {
        p.stood = 0;
        p.phase = 'gone';
        p.timer = 3.2;
        this.say?.('The pillar gives under you.', 1.5);
      }
    }
  }

  #runBoulder(dt, l, player, armed) {
    const R = TEMPLE.ramp;
    const onRamp = armed && Math.abs(l.x) < 4.6 && l.z < R.z1 - 1 && l.z > R.z0;
    if (this.ballZ === null) {
      this.ballWait = Math.max(0, this.ballWait - dt);
      if (onRamp && this.ballWait <= 0) {
        this.ballZ = R.z0 - 1.4;
        this.ballV = 1.5;
        if (!this.rumbled) {
          this.rumbled = true;
          this.say?.('Something rumbles at the top of the ramp. Into an alcove, quick.', 2.5);
        }
      }
      return;
    }
    // Down the ramp, faster and faster, and into the slot at its foot.
    this.ballV = Math.min(8.5, this.ballV + dt * 4.2);
    this.ballZ += this.ballV * dt;
    const sink = Math.max(0, this.ballZ - (R.z1 + 0.2)) * 1.6;
    this.#setBall(this.ballZ, sink);
    if (sink > 3) {
      this.ballZ = null;
      this.ballWait = 3.5;
      this.#setBall(R.z0 - 1.4);
    }
    void player;
  }
}

const _l = new THREE.Vector3();
const xz = (p) => ({ x: p.x, z: p.z });
