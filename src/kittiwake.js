import * as THREE from 'three';
import { makeBox, Body } from './collision.js';
import { paint, mergeParts, segment } from './props.js';
import { KW, kwBreadth, kittiwakeFrame, kittiwakeChest } from '../shared/kittiwake.js';

// The Kittiwake, on her side on Black Ledges: the pilot cutter whose log is
// in the hut on Saddle and whose bell is in the burnt cottage. She went over
// on the ledge in a blow and stayed there.
//
// A boarding net still hangs down her deck (a wall now, facing inshore) from
// her uppermost rail. Up there, amidships, her planking's stove in: drop
// through into the hold. It's half full of water, and the door aft into the
// captain's cabin won't give against it. On the crates lashed in the forward
// end there's her bilge pump: work it and the water goes down, until the
// door's clear and you can pull it open. Her stern's stove in too, out over
// the gully: the way out with what you find (it's a long drop, and no way
// back up).
//
// Her frame and the numbers are in shared/kittiwake.js.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const H = KW.half;
const D = KW.depth;
const BLACK = '#2c2c2b';
const BLACK2 = '#363533';
const WHITE = '#d9d4c6';
const COPPER = '#6e4a34';
const WEED = '#56603e';
const DECK = '#8c8476';
const DECK2 = '#7d766a';
const WOOD = '#5a4a39';
const WOOD_DARK = '#43372b';
const ROPE = '#7d6a4d';
const NOTE = ['HOLD FULL OF WATER', "AFT DOOR WON'T GIVE", 'TILL SHE IS PUMPED'];

/** A point of her section, upright terms → her lying frame. phi: −π/2 port deck edge … 0 keel … π/2 starboard deck edge. */
function sectionPoint(x, phi, out = new THREE.Vector3()) {
  const b = Math.max(kwBreadth(x), 0.04);
  const s = Math.sin(phi);
  const across = b * Math.sign(s) * Math.abs(s) ** 0.8;
  const up = D * (1 - Math.abs(Math.cos(phi)) ** 1.6);
  return out.set(x, across + H, up - D / 2);
}

const inHole = (x, z, phi) => phi > 0 && x > KW.hole.x0 && x < KW.hole.x1 && z > KW.hole.z0 && z < KW.hole.z1;

export class Kittiwake {
  constructor({ scene, world, treasure, puzzles, progress }) {
    this.world = world;
    this.treasure = treasure;
    const f = kittiwakeFrame();
    this.group = new THREE.Group();
    this.group.name = 'kittiwake';
    this.group.position.set(f.x, f.y, f.z);
    this.group.rotation.y = f.yaw;
    scene.add(this.group);
    this.group.updateMatrixWorld(true);
    this.matrix = this.group.matrixWorld.clone();
    this.inverse = this.matrix.clone().invert();
    this.quat = this.group.quaternion.clone();
    this.center = new THREE.Vector3(f.x, f.y, f.z);

    const parts = [];
    // (A colour paints it; null keeps the colours it already has.)
    const add = (g, c) => parts.push(c ? paint(g, c) : g);
    this.#hull(add);
    this.#deck(add);
    this.#bulkheads(add);
    this.#insides(add);
    this.netGeo(add);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.#colliders();

    // The water in her hold.
    const solved = (progress.state?.solved ?? []).includes('kittiwake');
    this.level = solved ? KW.water.empty : KW.water.full;
    const len = KW.foreBulkhead - KW.aftBulkhead;
    const wg = new THREE.PlaneGeometry(len - 0.05, 2.5);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      wg,
      new THREE.MeshLambertMaterial({ color: '#2f4a4a', transparent: true, opacity: 0.82, depthWrite: false }),
    );
    this.water.position.set((KW.aftBulkhead + KW.foreBulkhead) / 2, this.level, 0.05);
    this.group.add(this.water);

    // The pump's handle, which goes up and down as you work it.
    const p = KW.pump;
    this.handle = new THREE.Group();
    this.handle.position.set(p.x, KW.crates.top + 0.95, p.z);
    const bar = new THREE.Mesh(paint(segment(V(0, 0, -0.75), V(0, 0, 0.55), 0.035, 0.035, 6), WOOD_DARK), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.handle.add(bar);
    this.group.add(this.handle);
    this.stroke = 0; // 0…1 through a stroke of the pump
    this.strokes = 0;

    // The cabin door: hinged on its inshore edge, swinging into the hold.
    const d = KW.door;
    const dh = V(0.04, (d.y1 - d.y0) / 2 - 0.02, (d.z1 - d.z0) / 2 - 0.02);
    const doorGeo = new THREE.BoxGeometry(dh.x * 2, dh.y * 2, dh.z * 2);
    doorGeo.translate(0, 0, -dh.z); // the hinge at its +z edge
    const dParts = [paint(doorGeo, WOOD)];
    for (const zz of [-0.35, -1.2]) {
      const g = new THREE.BoxGeometry(0.06, dh.y * 2 - 0.1, 0.08);
      g.translate(0.03, 0, zz);
      dParts.push(paint(g, WOOD_DARK));
    }
    this.door = new THREE.Mesh(mergeParts(dParts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.door.castShadow = true;
    this.door.matrixAutoUpdate = false;
    this.group.add(this.door);
    this.doorBody = world.addBody(new Body([{ center: V(0, 0, -dh.z), half: dh }], 'kittiwake-door'));
    this.doorOpen = solved ? 1 : 0;
    this.doorWant = solved ? 1 : 0;
    this.#setDoor();

    // The note, nailed up over the crates.
    const nm = new THREE.Matrix4().compose(V(3.0, 3.6, KW.depth / 2 - 0.04), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), V(1, 1, 1));
    puzzles.addPlank(NOTE, 6120, nm.premultiply(this.matrix));

    // The boarding net down her deck, and a rope down into the hold from the hole.
    world.climbables ??= [];
    const netTop = H + kwBreadth(-0.4) - 0.1;
    world.climbables.push({
      o: this.#w(V(-1.4, 0.05, D / 2 + 0.35)),
      r: this.#d(V(1, 0, 0)),
      u: this.#d(V(0, 1, 0)),
      n: this.#d(V(0, 0, 1)),
      w: 1.6,
      h: netTop,
      exit: this.#w(V(-0.6, netTop + 0.15, D / 2 - 0.5)),
    });
    const ropeTop = H + kwBreadth(0.1) - 0.05;
    world.climbables.push({
      o: this.#w(V(0.05, KW.crates.top, 0.7)),
      r: this.#d(V(1, 0, 0)),
      u: this.#d(V(0, 1, 0)),
      n: this.#d(V(0, 0, 1)),
      w: 0.5,
      h: ropeTop - KW.crates.top,
      rope: true,
      exit: this.#w(V(0.3, ropeTop + 0.1, 0.2)),
    });
    const rope = new THREE.Mesh(paint(segment(V(0.3, KW.crates.top - 0.6, 0.7), V(0.3, ropeTop + 0.05, 0.7), 0.03, 0.03, 5), ROPE), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.add(rope);

    // Her chest, until it's been had.
    if (!solved) {
      const at = kittiwakeChest();
      treasure.placeCourseChest('kittiwake', { x: at.x, y: at.y + 0.3, z: at.z });
    }
    this.solved = solved;
  }

  /** A point in her frame, in the world. */
  #w(p) {
    return p.clone().applyMatrix4(this.matrix);
  }

  /** A direction in her frame, in the world. */
  #d(v) {
    return v.clone().applyQuaternion(this.quat).normalize();
  }

  /** The boarding net's look: ropes in a grid down the deck. */
  netGeo(add) {
    const z = D / 2 + 0.06;
    const top = H + kwBreadth(-0.4) - 0.1;
    for (let i = 0; i <= 5; i++) add(segment(V(-1.4 + i * 0.32, 0.05, z), V(-1.4 + i * 0.32, top, z), 0.018, 0.018, 4), ROPE);
    for (let y = 0.3; y < top; y += 0.35) add(segment(V(-1.4, y, z), V(0.2, y, z), 0.016, 0.016, 4), ROPE);
  }

  // -------------------------------------------------------------------------
  // Her shape
  // -------------------------------------------------------------------------

  #hull(add) {
    const NX = 34;
    const NP = 24;
    const xs = Array.from({ length: NX + 1 }, (_, i) => KW.stern + ((KW.stem - KW.stern) * i) / NX);
    const ph = Array.from({ length: NP + 1 }, (_, j) => -Math.PI / 2 + (Math.PI * j) / NP);
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const e = new THREE.Vector3();
    const g = new THREE.Vector3();
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NP; j++) {
        sectionPoint(xs[i], ph[j], a);
        sectionPoint(xs[i + 1], ph[j], b);
        sectionPoint(xs[i + 1], ph[j + 1], e);
        sectionPoint(xs[i], ph[j + 1], g);
        const xm = (xs[i] + xs[i + 1]) / 2;
        const pm = (ph[j] + ph[j + 1]) / 2;
        if (inHole(xm, (a.z + e.z) / 2, pm)) continue;
        // Below her old waterline: copper paint and weed; above it black, with a white strake at the sheer.
        const up = D * (1 - Math.abs(Math.cos(pm)) ** 1.6);
        if (up < 1.25) c.set(j % 2 ? COPPER : WEED).lerp(new THREE.Color(WEED), Math.max(0, 0.6 - up / 2));
        else if (Math.abs(pm) > Math.PI / 2 - 0.12) c.set(WHITE);
        else c.set(j % 2 ? BLACK : BLACK2);
        for (const q of [a, b, e, a, e, g]) {
          pos.push(q.x, q.y, q.z);
          col.push(c.r, c.g, c.b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    add(geo, null);
    // Her keel, sticking out to seaward, and the rudder at its after end.
    const keel = new THREE.BoxGeometry(KW.length - 2.4, 0.22, 0.7);
    keel.translate(-0.4, H, -D / 2 - 0.35);
    add(keel, COPPER);
    const rudder = new THREE.BoxGeometry(1.0, 0.12, 1.6);
    rudder.translate(KW.stern + 0.2, H, -D / 2 - 0.2);
    add(rudder, WOOD_DARK);
    // Her transom, stove in.
    const t = KW.stern;
    const outline = [];
    for (let j = 0; j <= 16; j++) {
      const p = sectionPoint(t, -Math.PI / 2 + (Math.PI * j) / 16);
      outline.push(new THREE.Vector2(p.z, p.y));
    }
    const shape = new THREE.Shape(outline);
    const hole = new THREE.Path([V(-0.75, 0.42), V(0.85, 0.42), V(0.95, 1.55), V(0.2, 1.85), V(-0.8, 1.6)].map((p) => new THREE.Vector2(p.x, p.y)));
    shape.holes.push(hole);
    const tg = new THREE.ShapeGeometry(shape);
    tg.rotateY(-Math.PI / 2);
    tg.translate(t, 0, 0);
    add(tg, BLACK2);
    // Sprung planks round the hole up top and the stern, splintered ends.
    for (const [x0, x1, z] of [[KW.hole.x0 - 0.1, KW.hole.x0 + 0.5, KW.hole.z0], [KW.hole.x1 - 0.6, KW.hole.x1 + 0.1, KW.hole.z1]]) {
      const y = H + kwBreadth(0) + 0.02;
      add(segment(V(x0, y, z), V(x1, y + 0.18, z + 0.05), 0.05, 0.03, 4), WOOD);
    }
  }

  #deck(add) {
    // Her deck: a wall now, planked, with the main hatch boarded over.
    const z = D / 2;
    const NX = 30;
    const NY = 10;
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    for (let i = 0; i < NX; i++) {
      const xa = KW.stern + ((KW.stem - KW.stern) * i) / NX;
      const xb = KW.stern + ((KW.stem - KW.stern) * (i + 1)) / NX;
      for (let j = 0; j < NY; j++) {
        const ya = (k) => H + kwBreadth(k) * (-1 + (2 * j) / NY);
        const yb = (k) => H + kwBreadth(k) * (-1 + (2 * (j + 1)) / NY);
        c.set(j % 2 ? DECK : DECK2);
        const q = [[xa, ya(xa)], [xb, ya(xb)], [xb, yb(xb)], [xa, ya(xa)], [xb, yb(xb)], [xa, yb(xa)]];
        for (const [x, y] of q) {
          pos.push(x, y, z);
          col.push(c.r, c.g, c.b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    add(geo, null);
    // The hatch, boarded, and its coaming; the stump of her mast.
    const hatch = new THREE.BoxGeometry(1.6, 1.3, 0.2);
    hatch.translate(1.8, H - 0.2, z + 0.1);
    add(hatch, WOOD_DARK);
    for (let k = 0; k < 4; k++) {
      const g = new THREE.BoxGeometry(1.5, 0.08, 0.04);
      g.translate(1.8, H - 0.75 + k * 0.34, z + 0.22);
      add(g, WOOD);
    }
    add(segment(V(1.0, H, z), V(1.0, H, z + 1.6), 0.2, 0.17, 8), WOOD);
    add(segment(V(1.0, H, z + 1.6), V(1.05, H + 0.12, z + 1.75), 0.17, 0.12, 6), '#a08c70');
    // Her rails, the top one (starboard) and the one on the rock (port).
    for (const s of [-1, 1]) {
      const pts = [];
      for (let x = KW.stern + 0.2; x < KW.stem - 0.3; x += 0.9) pts.push(V(x, H + s * (kwBreadth(x) - 0.06), z + 0.25));
      for (let k = 0; k + 1 < pts.length; k++) add(segment(pts[k], pts[k + 1], 0.06, 0.06, 4), WOOD_DARK);
    }
  }

  #bulkheads(add) {
    const section = (x) => {
      const pts = [];
      for (let j = 0; j <= 16; j++) {
        const p = sectionPoint(x, -Math.PI / 2 + (Math.PI * j) / 16);
        pts.push(new THREE.Vector2(p.z, p.y));
      }
      return pts;
    };
    // Aft, with the door opening.
    const aft = new THREE.Shape(section(KW.aftBulkhead));
    const d = KW.door;
    aft.holes.push(new THREE.Path([new THREE.Vector2(d.z0, d.y0), new THREE.Vector2(d.z1, d.y0), new THREE.Vector2(d.z1, d.y1), new THREE.Vector2(d.z0, d.y1)]));
    for (const [x, sh] of [[KW.aftBulkhead, aft], [KW.foreBulkhead, new THREE.Shape(section(KW.foreBulkhead))]]) {
      const g = new THREE.ShapeGeometry(sh);
      g.rotateY(-Math.PI / 2);
      g.translate(x, 0, 0);
      add(g, WOOD);
    }
    // The door frame.
    for (const [z0, z1, y0, y1] of [[d.z0 - 0.06, d.z1 + 0.06, d.y0 - 0.06, d.y0], [d.z0 - 0.06, d.z1 + 0.06, d.y1, d.y1 + 0.06], [d.z0 - 0.06, d.z0, d.y0, d.y1], [d.z1, d.z1 + 0.06, d.y0, d.y1]]) {
      const g = new THREE.BoxGeometry(0.1, y1 - y0, z1 - z0);
      g.translate(KW.aftBulkhead - 0.02, (y0 + y1) / 2, (z0 + z1) / 2);
      add(g, WOOD_DARK);
    }
  }

  /** The hold and the cabin: crates and the pump forward, the captain's things aft. */
  #insides(add) {
    const c = KW.crates;
    const floor = (x) => H - kwBreadth(x) + 0.05;
    // Crates, lashed, stacked up to the platform you stand on.
    for (const [x, z, w, d, k] of [[3.1, 0.6, 1.5, 1.2, 0], [3.25, 0.3, 1.1, 0.9, 1]]) {
      const y0 = floor(x) + (k ? c.top - floor(x) - 0.6 : 0);
      const y1 = k ? c.top : c.top - 0.6;
      const g = new THREE.BoxGeometry(w, y1 - y0, d);
      g.translate(x, (y0 + y1) / 2, z);
      add(g, k ? '#7a6248' : '#6a543d');
    }
    // The pump: a barrel and a post, the handle (moving) on top.
    const p = KW.pump;
    add(segment(V(p.x, floor(p.x), p.z), V(p.x, c.top + 0.9, p.z), 0.11, 0.11, 8), '#5b5148');
    add(segment(V(p.x, c.top + 0.9, p.z), V(p.x, c.top + 1.05, p.z), 0.05, 0.05, 6), '#3a3430');
    // The cabin: the captain's bunk (on its side), a sea chest, his table.
    const bunk = new THREE.BoxGeometry(1.8, 0.08, 0.7);
    bunk.translate(-5.0, 2.6, -0.4);
    add(bunk, WOOD);
    const table = new THREE.BoxGeometry(0.9, 0.6, 0.06);
    table.translate(-3.3, 1.2, 1.0);
    add(table, WOOD_DARK);
    const chart = new THREE.BoxGeometry(0.6, 0.45, 0.01);
    chart.translate(-3.3, 1.2, 0.96);
    add(chart, '#d8cba8');
  }

  // -------------------------------------------------------------------------
  // What you bump into
  // -------------------------------------------------------------------------

  #box(cx, cy, cz, hx, hy, hz, rotX = 0, flags = {}) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotX).premultiply(this.quat);
    this.world.addStatic(makeBox({ center: this.#w(V(cx, cy, cz)), half: V(hx, hy, hz), quaternion: q, ...flags }));
  }

  #colliders() {
    // Her shell, as plates along each chord of her section, station by
    // station (with the hole's ends among the stations, so it's cut cleanly).
    const stations = [];
    const run = (a, b) => {
      const n = Math.max(1, Math.round((b - a) / 1.2));
      for (let k = 0; k < n; k++) stations.push(a + ((b - a) * k) / n);
    };
    run(KW.stern, KW.hole.x0);
    run(KW.hole.x0, KW.hole.x1);
    run(KW.hole.x1, KW.stem - 0.5);
    stations.push(KW.stem - 0.5);
    const NP = 16;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i + 1 < stations.length; i++) {
      const x0 = stations[i];
      const x1 = stations[i + 1];
      const xm = (x0 + x1) / 2;
      for (let j = 0; j < NP; j++) {
        const p0 = -Math.PI / 2 + (Math.PI * j) / NP;
        const p1 = -Math.PI / 2 + (Math.PI * (j + 1)) / NP;
        sectionPoint(xm, p0, a);
        sectionPoint(xm, p1, b);
        const pm = (p0 + p1) / 2;
        if (inHole(xm, (a.z + b.z) / 2, pm)) continue;
        const dz = b.z - a.z;
        const dy = b.y - a.y;
        const len = Math.hypot(dz, dy);
        // Its outward normal (away from her middle), and the plate 0.2 thick
        // just outside the planking, so the inside face is where you see it.
        let ny = dz / len;
        let nz = -dy / len;
        const my = (a.y + b.y) / 2;
        const mz = (a.z + b.z) / 2;
        if (ny * (my - H) + nz * mz < 0) {
          ny = -ny;
          nz = -nz;
        }
        // (No hanging off her planking: the net's the way up.)
        this.#box(xm, my + ny * 0.1, mz + nz * 0.1, (x1 - x0) / 2 + 0.02, 0.1, len / 2 + 0.03, Math.atan2(-dy, dz), { noClimb: true, noGrab: true });
      }
    }
    // Her deck (a wall).
    for (let i = 0; i + 1 < stations.length; i++) {
      const xm = (stations[i] + stations[i + 1]) / 2;
      const b2 = kwBreadth(xm);
      this.#box(xm, H, D / 2 + 0.1, (stations[i + 1] - stations[i]) / 2 + 0.02, b2, 0.1, 0, { noClimb: true, noGrab: true });
    }
    // The bulkheads: forward solid; aft round the door opening.
    const d = KW.door;
    const top = H + kwBreadth(KW.aftBulkhead);
    const bot = H - kwBreadth(KW.aftBulkhead);
    const xa = KW.aftBulkhead;
    for (const [y0, y1, z0, z1] of [[bot, d.y0, -D / 2, D / 2], [d.y1, top, -D / 2, D / 2], [d.y0, d.y1, -D / 2, d.z0], [d.y0, d.y1, d.z1, D / 2]]) {
      this.#box(xa, (y0 + y1) / 2, (z0 + z1) / 2, 0.06, (y1 - y0) / 2, (z1 - z0) / 2, 0);
    }
    const tf = H + kwBreadth(KW.foreBulkhead);
    const bf = H - kwBreadth(KW.foreBulkhead);
    this.#box(KW.foreBulkhead, (tf + bf) / 2, 0, 0.06, (tf - bf) / 2, D / 2, 0);
    // The transom, round the hole in it.
    const ts = KW.stern + 0.05;
    for (const [y0, y1, z0, z1] of [[0, 0.42, -D / 2, D / 2], [1.85, 4.0, -D / 2, D / 2], [0.42, 1.85, -D / 2, -0.75], [0.42, 1.85, 0.95, D / 2]]) {
      this.#box(ts, (y0 + y1) / 2, (z0 + z1) / 2, 0.06, (y1 - y0) / 2, (z1 - z0) / 2, 0, { noClimb: true });
    }
    // The crates in the hold, the pump post.
    const c = KW.crates;
    const floor = H - kwBreadth(3.1);
    this.#box(3.1, (floor + c.top) / 2, 0.6, 0.75, (c.top - floor) / 2, 0.6, 0);
    this.world.addStatic({ type: 'cyl', ...xz(this.#w(V(KW.pump.x, 0, KW.pump.z))), r: 0.12, y0: this.center.y, y1: this.center.y + c.top + 1.0 });
  }

  // -------------------------------------------------------------------------

  #setDoor() {
    const d = KW.door;
    const o = this.doorOpen;
    const e = o * o * (3 - 2 * o);
    const m = new THREE.Matrix4().compose(
      V(KW.aftBulkhead + 0.04, (d.y0 + d.y1) / 2, d.z1),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -e * 1.75),
      V(1, 1, 1),
    );
    this.door.matrix.copy(m);
    this.doorBody.setMatrix(m.clone().premultiply(this.matrix));
  }

  /** The water level in her hold (world y), if p is in it; else null. */
  poolAt(p) {
    if (Math.abs(p.x - this.center.x) > 12 || Math.abs(p.z - this.center.z) > 12) return null;
    const l = _l.copy(p).applyMatrix4(this.inverse);
    if (l.x < KW.aftBulkhead || l.x > KW.foreBulkhead || l.z < -D / 2 || l.z > D / 2 || l.y > 4.8 || l.y < -0.5) return null;
    return this.center.y + this.level;
  }

  /** Something to do here: work the pump, or try the door. */
  interaction(player) {
    if (player.pos.distanceTo(this.center) > 14) return null;
    const l = _l.copy(player.pos).applyMatrix4(this.inverse);
    // At the pump, standing on the crates.
    if (Math.hypot(l.x - KW.pump.x, l.z - KW.pump.z) < 1.0 && l.y > KW.crates.top - 0.3 && player.mode === 'ground') {
      if (this.level <= KW.water.empty + 0.01) return { key: '', label: 'She sucks dry.' };
      return { key: 'E', label: 'Work the pump', act: () => this.#pump(player) };
    }
    // At the door.
    const d = KW.door;
    if (this.doorOpen < 0.5 && Math.abs(l.x - KW.aftBulkhead) < 1.3 && l.z > d.z0 - 0.4 && l.z < d.z1 + 0.4 && l.y > d.y0 - 1.6 && l.y < d.y1) {
      return {
        key: 'E',
        label: 'Pull the door',
        act: () => {
          if (this.level > d.y0 - 0.05) {
            this.say?.("It won't give: there's too much water against it.", 3);
            return;
          }
          this.doorWant = 1;
          this.say?.('The door comes open.', 2.5);
        },
      };
    }
    return null;
  }

  #pump(player) {
    if (this.stroke > 0) return;
    this.stroke = 1e-4;
    this.player = player;
    player.animOverride = 'crank';
    player.effort = 1;
  }

  update(dt, { player }) {
    // A stroke of the pump: down and up, and the water goes down a little.
    if (this.stroke > 0) {
      this.stroke += dt / 0.9;
      this.handle.rotation.x = -0.5 * Math.sin(Math.min(1, this.stroke) * Math.PI);
      if (this.stroke >= 1) {
        this.stroke = 0;
        this.handle.rotation.x = 0;
        this.strokes++;
        this.level = Math.max(KW.water.empty, this.level - KW.water.perStroke);
        if (this.player) {
          this.player.animOverride = null;
          this.player.effort = 0;
        }
        const d = KW.door;
        if (this.level <= d.y0 - 0.05 && this.level + KW.water.perStroke > d.y0 - 0.05) this.say?.("The water's down below the door.", 3);
        else if (this.level <= KW.water.empty + 0.01) this.say?.('She sucks dry.', 2.5);
      }
    }
    this.water.position.y = this.level;
    // The door.
    if (this.doorOpen !== this.doorWant) {
      this.doorOpen = Math.min(1, this.doorOpen + dt * 0.9);
      this.#setDoor();
    }
    void player;
  }
}

const _l = new THREE.Vector3();
const xz = (p) => ({ x: p.x, z: p.z });

