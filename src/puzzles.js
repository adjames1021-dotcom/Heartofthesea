import * as THREE from 'three';
import { ISLAND_BY_ID, toWorld, dirToWorld, groundAt, pellsBar } from '../shared/world.js';
import { mulberry32 } from '../shared/noise.js';
import { paint, mergeParts, segment } from './props.js';

// The things people left behind that point at a puzzle: a note cut into a
// plank, a skeleton that died pointing. Nothing glows or floats; you find
// them by looking around.

// ---------------------------------------------------------------------------
// Letters cut with a knife: a small stroke font on a 4 × 6 grid.
// ---------------------------------------------------------------------------

const O = [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]];
const P_ = [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]];
const GLYPHS = {
  A: [[[0, 6], [2, 0], [4, 6]], [[1, 3.6], [3, 3.6]]],
  B: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.5], [2.5, 3.5]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]], [[1, 0], [3, 0]], [[1, 6], [3, 6]]],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.3, 2.7], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [O],
  P: [P_],
  Q: [O, [[2.5, 4.5], [4, 6]]],
  R: [P_, [[2, 3], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  0: [O],
  1: [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  3: [[[0, 0], [4, 0], [2, 2.5], [3, 2.5], [4, 3.5], [4, 5], [3, 6], [1, 6], [0, 5]]],
  4: [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  5: [[[4, 0], [0, 0], [0, 2.5], [3, 2.5], [4, 3.5], [4, 5], [3, 6], [0, 6]]],
  6: [[[3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  7: [[[0, 0], [4, 0], [1.5, 6]]],
  8: [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  9: [[[4, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6]]],
  '.': [[[0.3, 5.6], [0.7, 6]]],
  ',': [[[0.6, 5.3], [0.1, 6.6]]],
  "'": [[[0.5, 0], [0.5, 1.5]]],
  '-': [[[0.5, 3], [2.5, 3]]],
};
const NARROW = { '.': 1, ',': 1, "'": 1, '-': 3 };

/** Cut one line of capitals into a canvas. Returns the x where it ended. */
function scratchLine(ctx, text, x, y, size, rand) {
  const s = size / 6;
  let cx = x;
  for (const ch of text.toUpperCase()) {
    if (ch === ' ') {
      cx += s * 3.4;
      continue;
    }
    const strokes = GLYPHS[ch];
    const w = NARROW[ch] ?? 4;
    if (strokes) {
      const tilt = (rand() - 0.5) * 0.14;
      const dy = (rand() - 0.5) * s * 0.7;
      const k = 0.9 + rand() * 0.18;
      const at = ([gx, gy]) => [
        cx + (gx + (3 - gy) * tilt) * s * k + (rand() - 0.5) * s * 0.4,
        y + dy + gy * s * k + (rand() - 0.5) * s * 0.4,
      ];
      for (const stroke of strokes) {
        const pts = stroke.map(at);
        const path = (ox, oy) => {
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
          ctx.stroke();
        };
        // The groove, then the fresh-cut lip catching the light.
        ctx.strokeStyle = 'rgba(38, 25, 14, 0.88)';
        ctx.lineWidth = s * 0.62;
        path(0, 0);
        ctx.strokeStyle = 'rgba(232, 214, 182, 0.5)';
        ctx.lineWidth = s * 0.2;
        path(s * 0.24, s * 0.26);
      }
    }
    cx += s * (w * 1.0 + 1.5);
  }
  return cx;
}

/** A weathered plank with words cut into it. */
export function plankCanvas(lines, { w = 1024, h = 300, seed = 7 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#94826a');
  g.addColorStop(0.45, '#a69378');
  g.addColorStop(1, '#85735c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Grain.
  for (let i = 0; i < 70; i++) {
    const y0 = rand() * h;
    ctx.strokeStyle = `rgba(58, 42, 26, ${0.06 + rand() * 0.14})`;
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let x = 0; x <= w; x += 48) ctx.lineTo(x, y0 + Math.sin(x * 0.005 + i * 1.7) * 5 + (rand() - 0.5) * 2);
    ctx.stroke();
  }
  // A knot, two nail holes with rust runs, a split at one end.
  ctx.fillStyle = 'rgba(70, 48, 28, 0.55)';
  ctx.beginPath();
  ctx.ellipse(w * 0.82, h * 0.7, 22, 9, 0.1, 0, Math.PI * 2);
  ctx.fill();
  for (const nx of [26, w - 30]) {
    ctx.fillStyle = 'rgba(30, 20, 12, 0.9)';
    ctx.fillRect(nx - 5, h / 2 - 5, 10, 10);
    const rust = ctx.createLinearGradient(0, h / 2, 0, h / 2 + 60);
    rust.addColorStop(0, 'rgba(110, 52, 24, 0.55)');
    rust.addColorStop(1, 'rgba(110, 52, 24, 0)');
    ctx.fillStyle = rust;
    ctx.fillRect(nx - 4, h / 2, 8, 60);
  }
  ctx.strokeStyle = 'rgba(30, 20, 12, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w, h * 0.38);
  ctx.lineTo(w - 90, h * 0.42);
  ctx.lineTo(w - 140, h * 0.41);
  ctx.stroke();
  // The words.
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(54, (w - 110) / (longest * 0.92), (h - 50) / (lines.length * 1.55));
  const top = (h - lines.length * size * 1.5) / 2 + size * 0.15;
  lines.forEach((l, i) => scratchLine(ctx, l, 56 + (rand() - 0.5) * 10, top + i * size * 1.5, size, rand));
  // Weathering at the edges.
  const edge = ctx.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, 'rgba(40, 28, 16, 0.35)');
  edge.addColorStop(0.12, 'rgba(40, 28, 16, 0)');
  edge.addColorStop(0.88, 'rgba(40, 28, 16, 0)');
  edge.addColorStop(1, 'rgba(40, 28, 16, 0.4)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function plankModel(canvas, len = 1.25, wid = 0.34) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const side = new THREE.MeshLambertMaterial({ color: '#7d6c56' });
  const face = new THREE.MeshLambertMaterial({ map: tex });
  // Box faces: +x, −x, +y, −y, +z (the cut face), −z.
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, wid, 0.045), [side, side, side, side, face, side]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// A sailor who sat down against a rock and didn't get up. Facing +z, seated,
// right forearm resting on a raised knee and pointing ahead.
// ---------------------------------------------------------------------------

function skeletonModel() {
  const BONE = '#d9d0b8';
  const DARK = '#2a2119';
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const parts = [];
  const bone = (a, b, r0, r1 = r0) => parts.push(paint(segment(a, b, r0, r1, 5), BONE));
  const ball = (p, r, sx = 1, sy = 1, sz = 1, col = BONE, out = parts) => {
    const g = new THREE.SphereGeometry(r, 7, 5);
    g.scale(sx, sy, sz);
    g.translate(p.x, p.y, p.z);
    out.push(paint(g, col));
  };

  // Pelvis on the sand, spine slumped back against the rock.
  ball(V(0, 0.12, -0.02), 0.12, 1.25, 0.55, 0.8);
  const neck = V(0.02, 0.66, -0.2);
  bone(V(0, 0.16, -0.07), neck, 0.024, 0.02);
  for (let i = 0; i < 4; i++) {
    const y = 0.36 + i * 0.075;
    const r = 0.125 - Math.abs(i - 1.4) * 0.014;
    const rib = new THREE.TorusGeometry(r, 0.012, 3, 9, Math.PI * 1.45);
    rib.rotateX(Math.PI / 2);
    rib.rotateY(Math.PI * 1.25); // open at the front
    rib.rotateX(-0.32);
    rib.translate(0.01, y, -0.1 - (y - 0.36) * 0.42);
    parts.push(paint(rib, BONE));
  }
  // Collarbones.
  bone(V(-0.17, 0.6, -0.17), V(0.17, 0.6, -0.17), 0.014);

  // Skull, lolling to one side.
  const skull = [];
  ball(V(0, 0, 0), 0.105, 1, 1.02, 1.12, BONE, skull);
  for (const s of [-1, 1]) ball(V(s * 0.04, 0.005, 0.098), 0.028, 1, 1, 0.6, DARK, skull);
  ball(V(0, -0.04, 0.11), 0.014, 1, 1, 0.6, DARK, skull);
  const jaw = new THREE.BoxGeometry(0.12, 0.035, 0.08);
  jaw.rotateX(0.35);
  jaw.translate(0, -0.095, 0.06);
  skull.push(paint(jaw, BONE));
  const sm = new THREE.Matrix4().compose(
    V(0.05, 0.79, -0.15),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, 0.25, 0.42)),
    V(1, 1, 1),
  );
  for (const g of skull) parts.push(g.applyMatrix4(sm));

  // Legs: the right knee up (the arm rests on it), the left one stretched out.
  const legs = [
    { hip: V(-0.09, 0.12, 0.02), knee: V(-0.13, 0.36, 0.34), ankle: V(-0.15, 0.05, 0.62) },
    { hip: V(0.09, 0.12, 0.02), knee: V(0.13, 0.15, 0.43), ankle: V(0.19, 0.05, 0.84) },
  ];
  for (const l of legs) {
    bone(l.hip, l.knee, 0.028, 0.022);
    bone(l.knee, l.ankle, 0.022, 0.016);
    ball(l.knee, 0.03);
    const foot = new THREE.BoxGeometry(0.07, 0.03, 0.15);
    foot.translate(l.ankle.x, 0.02, l.ankle.z + 0.07);
    parts.push(paint(foot, BONE));
  }

  // Left arm hangs down to the sand.
  bone(V(0.17, 0.6, -0.17), V(0.24, 0.33, -0.08), 0.02, 0.017);
  bone(V(0.24, 0.33, -0.08), V(0.29, 0.07, 0.06), 0.016, 0.013);
  for (let i = 0; i < 3; i++) bone(V(0.29, 0.06, 0.06), V(0.32 + i * 0.02, 0.02, 0.13), 0.007);
  // Right forearm laid along the raised knee, one finger out.
  const elbow = V(-0.15, 0.42, 0.28);
  const wrist = V(-0.17, 0.46, 0.55);
  bone(V(-0.17, 0.6, -0.17), elbow, 0.02, 0.017);
  bone(elbow, wrist, 0.016, 0.013);
  bone(wrist, V(-0.175, 0.465, 0.69), 0.008, 0.006);
  for (let i = 0; i < 3; i++) bone(V(-0.17 + i * 0.012, 0.455, 0.56), V(-0.16 + i * 0.015, 0.42, 0.6), 0.007);

  const mesh = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------

const PELLS_NOTE = ['TIP OF THE ROCKS SHADOW', 'WHERE IT TOUCHES THE WEED', 'AFTERNOON. NOT MORNING'];

export class Puzzles {
  constructor({ scene, world }) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'puzzles';
    scene.add(this.group);
    this.readables = [];
    this.reading = null;
    this.view = document.createElement('div');
    this.view.className = 'map-view note-view';
    this.view.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.view);
    this.#pellsBar();
  }

  /** Place a model on the ground at island-local (lx, lz), facing island-local direction (fx, fz). */
  #place(obj, isl, lx, lz, fx, fz, lift = 0) {
    const w = toWorld(isl, lx, lz);
    const d = dirToWorld(isl, fx, fz);
    obj.position.set(w.x, groundAt(w.x, w.z) + lift, w.z);
    obj.rotation.y = Math.atan2(d.x, d.z);
    this.group.add(obj);
    return obj;
  }

  #pellsBar() {
    const isl = ISLAND_BY_ID.bar;
    const rock = isl.features.rock;
    const { local } = pellsBar();
    // The skeleton sits with its back to the rock, facing up the bar toward
    // where the afternoon shadow ends.
    const dx = local.x - rock.x;
    const dz = local.z - rock.z;
    const l = Math.hypot(dx, dz);
    const fx = dx / l;
    const fz = dz / l;
    const sk = this.#place(skeletonModel(), isl, rock.x + fx * 3.55, rock.z + fz * 3.55, fx, fz, -0.03);
    sk.rotation.z = 0.04;
    const at = sk.position;
    this.world.addStatic({ type: 'cyl', x: at.x, z: at.z, r: 0.42, y0: at.y - 0.5, y1: at.y + 0.35 });

    // The plank leans on the rock at its left hand.
    const a = 0.42;
    const px = fx * Math.cos(a) + fz * Math.sin(a);
    const pz = -fx * Math.sin(a) + fz * Math.cos(a);
    const canvas = plankCanvas(PELLS_NOTE, { seed: 1721 });
    const plank = plankModel(canvas);
    const holder = new THREE.Group();
    plank.position.y = 0.16;
    plank.rotation.x = -0.32; // top leaning back onto the rock
    holder.add(plank);
    this.#place(holder, isl, rock.x + px * 3.5, rock.z + pz * 3.5, px, pz, 0.02);
    this.readables.push({ pos: holder.position.clone(), lines: PELLS_NOTE, seed: 1721 });
  }

  /** Something to read within reach? */
  nearest(p, r = 1.7) {
    let best = null;
    let bd = r;
    for (const n of this.readables) {
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (d < bd && Math.abs(n.pos.y - p.y) < 2) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  read(n) {
    if (this.reading === n) {
      this.close();
      return;
    }
    this.reading = n;
    this.view.innerHTML = '';
    this.view.appendChild(plankCanvas(n.lines, { w: 900, h: 280, seed: n.seed }));
    this.view.classList.add('open');
  }

  close() {
    this.reading = null;
    this.view.classList.remove('open');
  }

  update(player) {
    if (this.reading && Math.hypot(this.reading.pos.x - player.pos.x, this.reading.pos.z - player.pos.z) > 2.6) this.close();
  }
}
