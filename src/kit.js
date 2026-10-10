import * as THREE from 'three';
import { mulberry32, hash2 } from '../shared/noise.js';
import { paint, mergeParts, segment } from './props.js';
import { deepenShadows } from './atmosphere.js';

// Hand-built pieces for villages: boards that aren't quite the same width,
// walls that lean, roofs that sag and have been patched with whatever was
// to hand, and weathering (salt low down, moss on the shady side, sun
// bleaching on the sunny side) painted into the vertex colours. Each piece
// takes its own seed, so no two huts come out the same.
//
// Also here: things there are lots of, drawn as instances (fish on racks,
// floats, pots, crates); windows that light up at night and throw real
// light; chimney smoke; and hand-painted signs.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/** Each village's colours: muted, nothing bright. */
export const PALETTES = {
  cove: {
    // Driftwood and old ship's timber gone silver-grey in the salt and sun.
    wood: ['#968d7f', '#8f8678', '#a09686', '#877e70', '#9a9183'],
    dark: ['#6a6256', '#5f584d', '#736a5d'],
    tar: ['#4a433c', '#524a42', '#463f39'],
    paint: ['#71857c', '#8c6a5c', '#6f7b84', '#a49a83'], // what's left of old paint, on salvaged boards
    canvas: ['#b3a78c', '#a39780', '#bcb196'],
    rope: '#a8956c',
    rust: ['#7a4f35', '#6b4430', '#83563a'],
    stone: ['#7f786c', '#6f695f', '#87806f'],
    salt: '#c8c5ba',
    moss: '#56663a',
    path: '#bfb08f',
  },
  // The Landing trades: more paint about, faded, every house its own colour,
  // awnings made of old sails.
  landing: {
    wood: ['#9c8a70', '#a39276', '#8f7d64', '#ab977a', '#968366'],
    dark: ['#6b5a46', '#5f5040', '#74624c'],
    tar: ['#4c4038', '#55473d', '#433932'],
    paint: ['#86604f', '#6a7a82', '#9a8a5a', '#74846e', '#93705f', '#6f7f84'],
    canvas: ['#c2b392', '#b5a482', '#cbbd9e'],
    stripe: ['#86604f', '#6a7a82', '#7f8762'],
    rope: '#b09a6e',
    rust: ['#7a4f35', '#6b4430', '#83563a'],
    stone: ['#8d8576', '#7d7669', '#958d7d'],
    salt: '#cfcabd',
    moss: '#5f6e40',
    path: '#b8a888',
    pathDark: 0.9,
  },
  // Kettle Strand: half empty. Timber gone grey and green, black sand, the
  // paint all but gone, and the island growing back over it.
  strand: {
    wood: ['#6f6d66', '#77746c', '#686660', '#7c786e', '#625f59'],
    dark: ['#504e48', '#47453f', '#56544c'],
    tar: ['#3e3c38', '#45423d', '#383632'],
    paint: ['#6a7466', '#7a6458', '#6b6f75'],
    canvas: ['#9a9484', '#8c8676'],
    rope: '#8f8466',
    rust: ['#6e4a36', '#5f4232'],
    stone: ['#5a5853', '#64615b', '#4f4d49'],
    salt: '#8f8d85',
    moss: '#4f6a34',
    path: '#5a564f',
    pathDark: 1.08,
  },
  // Pascoe's yard: new oak and old, shavings, tar.
  yard: {
    wood: ['#a08a68', '#957f5e', '#ab9472', '#8c7656', '#b39c78'],
    dark: ['#5e4e3c', '#54463a', '#66553f'],
    tar: ['#3a3530', '#433d36', '#35302b'],
    paint: ['#5f6f78', '#8a5a48', '#7a7a62'],
    canvas: ['#b8aa8c', '#a99b7c'],
    rope: '#ad9568',
    rust: ['#7a4f35', '#6b4430'],
    stone: ['#8a8478', '#7c776c'],
    salt: '#cdc8bb',
    moss: '#5c6b3e',
    path: '#c4b48e',
    pathDark: 0.9,
  },
};

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

export class Kit {
  constructor(seed, pal) {
    this.rand = mulberry32(seed);
    this.pal = pal;
    this.parts = [];
    this.windows = []; // { pos, normal, w, h, owner }
    this.chimneys = []; // smoke sources
  }

  r(a = 0, b = 1) {
    return a + (b - a) * this.rand();
  }

  pick(list) {
    return list[Math.floor(this.rand() * list.length)];
  }

  /** A colour from a palette entry, a little lighter or darker than the last. */
  col(c, vary = 0.07) {
    const k = new THREE.Color(Array.isArray(c) ? this.pick(c) : c);
    const f = 1 + this.r(-vary, vary) * 2;
    return k.multiplyScalar(f);
  }

  /**
   * A board from a to b: w across, t thick along n (its face). It sags by
   * `sag` (negative n) in the middle and isn't quite even along its length.
   */
  board(a, b, w, t, n, color, { sag = 0, segs = 1, taper = 0 } = {}) {
    const dir = _x.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-3) return;
    dir.normalize();
    _y.copy(n).addScaledVector(dir, -n.dot(dir)).normalize();
    _z.crossVectors(dir, _y);
    const g = new THREE.BoxGeometry(len, t, w, Math.max(segs, sag ? 3 : 1), 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = p.getX(i) / len + 0.5;
      if (sag) p.setY(i, p.getY(i) - sag * 4 * s * (1 - s));
      if (taper) p.setZ(i, p.getZ(i) * (1 - taper * s));
    }
    _m.makeBasis(dir, _y, _z).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    g.applyMatrix4(_m);
    this.parts.push(paint(g, color));
  }

  /** A post or pole from a to b, never quite round or straight. */
  post(a, b, r, color, sides = 6) {
    const mid = a.clone().lerp(b, 0.5).add(V(this.r(-0.03, 0.03), 0, this.r(-0.03, 0.03)));
    const r1 = r * this.r(0.8, 1.05);
    this.parts.push(paint(segment(a, mid, r, (r + r1) / 2, sides), color));
    this.parts.push(paint(segment(mid, b, (r + r1) / 2, r1, sides), color));
  }

  /** A box (for things that are just blocks), turned by yaw. */
  block(c, w, h, d, color, yaw = 0, tilt = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateZ(tilt);
    g.rotateY(yaw);
    g.translate(c.x, c.y, c.z);
    this.parts.push(paint(g, color));
  }

  /**
   * A wall of boards over the rectangle at o, along u for W, up v for H,
   * facing n. Boards run up and down (or across if `across`), uneven widths,
   * ragged tops, the odd salvaged painted one and a patch nailed over.
   * holes: [{ a0, a1, b0, b1 }] in metres along u and up v.
   */
  wall(o, u, v, n, W, H, { across = false, holes = [], t = 0.05, base = 0.2, salvage = 0.18, colors = null, odd = null, missing = 0 } = {}) {
    const woods = colors ?? this.pal.wood;
    const odds = odd ?? this.pal.paint;
    const inHole = (a0, a1, b0, b1) => holes.filter((h) => a1 > h.a0 && a0 < h.a1 && b1 > h.b0 && b0 < h.b1);
    const at = (a, b, out = 0) => o.clone().addScaledVector(u, a).addScaledVector(v, b).addScaledVector(n, out);
    if (!across) {
      for (let a = 0; a < W - 0.02; ) {
        const w = Math.min(W - a, base * this.r(0.7, 1.4));
        const a0 = a + 0.006;
        const a1 = a + w - 0.006;
        const am = (a0 + a1) / 2;
        const color = this.rand() < salvage ? this.col(odds, 0.05) : this.col(woods);
        const gone = this.rand() < missing;
        const bottom = this.r(-0.04, 0.02);
        const top = H + this.r(-0.07, 0.05);
        // Cut round any opening.
        let spans = [[bottom, top]];
        for (const h of inHole(a0, a1, bottom, top)) {
          spans = spans.flatMap(([s0, s1]) => [[s0, Math.min(s1, h.b0)], [Math.max(s0, h.b1), s1]]).filter(([s0, s1]) => s1 - s0 > 0.05);
        }
        const out = this.r(0, 0.012);
        // A ruin's lost boards: gone altogether, or just the top half.
        if (gone && this.rand() < 0.5) spans = spans.map(([s0, s1]) => [s0, s0 + (s1 - s0) * this.r(0.2, 0.6)]);
        if (!(gone && this.rand() < 0.6)) for (const [s0, s1] of spans) this.board(at(am, s0, out), at(am, s1, out), a1 - a0, t, n, color);
        a += w;
      }
      // Battens across the inside, and now and then a board nailed over a gap.
      for (const b of [0.25, H - 0.3]) this.board(at(0.05, b, -0.045), at(W - 0.05, b + this.r(-0.03, 0.03), -0.045), 0.09, 0.03, n, this.col(this.pal.dark));
      if (this.rand() < 0.55) {
        const pa = this.r(0.2, W - 0.6);
        const pb = this.r(0.3, H - 0.6);
        this.board(at(pa, pb, 0.04), at(pa + this.r(0.4, 0.7), pb + this.r(-0.15, 0.15), 0.04), this.r(0.12, 0.2), 0.03, n, this.col(this.rand() < 0.5 ? this.pal.paint : this.pal.wood));
      }
    } else {
      for (let b = 0; b < H - 0.02; ) {
        const h = Math.min(H - b, base * this.r(0.75, 1.3));
        const b0 = b + 0.005;
        const b1 = b + h - 0.005;
        const bm = (b0 + b1) / 2;
        const color = this.rand() < salvage ? this.col(odds, 0.05) : this.col(woods);
        let spans = [[this.r(-0.05, 0.02), W + this.r(-0.02, 0.06)]];
        if (this.rand() < missing) spans = spans.map(([s0, s1]) => (this.rand() < 0.5 ? [s0, s0 + (s1 - s0) * this.r(0.3, 0.7)] : [s0 + (s1 - s0) * this.r(0.3, 0.7), s1]));
        for (const ho of inHole(0, W, b0, b1)) {
          spans = spans.flatMap(([s0, s1]) => [[s0, Math.min(s1, ho.a0)], [Math.max(s0, ho.a1), s1]]).filter(([s0, s1]) => s1 - s0 > 0.05);
        }
        const out = this.r(0, 0.015);
        for (const [s0, s1] of spans) this.board(at(s0, bm, out), at(s1, bm, out), b1 - b0, t, n, color, { sag: this.r(0, 0.012) });
        b += h;
      }
      // Corner posts the boards are nailed to.
      for (const a of [0.03, W - 0.03]) this.post(at(a, -0.05, -0.03), at(a, H + 0.02, -0.03), 0.06, this.col(this.pal.dark), 5);
    }
  }

  /**
   * A pitched roof: the ridge runs along `along` for L, the slopes go out
   * along ±`across` to S, from ridge height rh down to eaves eh. The ridge
   * sags in the middle; boards are tarred, with a patch of old sail.
   */
  roof(c, along, across, L, S, rh, eh, { sag = 0.08, overhang = 0.35, patch = 'sail', material = 'tar', rakeOver = 0.25, keep = [1, 1] } = {}) {
    const up = V(0, 1, 0);
    const half = L / 2 + rakeOver;
    const mats = material === 'tar' ? this.pal.tar : material === 'canvas' ? this.pal.canvas : material === 'shingle' ? this.pal.wood : this.pal.wood;
    for (const side of [-1, 1]) {
      const out = across.clone().multiplyScalar(side);
      const kept = keep[side < 0 ? 0 : 1];
      // A roof that's falling in: the rafters show where the boards have gone.
      if (kept < 1) {
        for (let a = -half + 0.2; a < half; a += 0.62) {
          const s = (a + half) / (2 * half);
          const top = c.clone().addScaledVector(along, a).setY(c.y + rh - sag * 4 * s * (1 - s));
          const bot = c.clone().addScaledVector(along, a).addScaledVector(out, S + 0.15).setY(c.y + eh - 0.05 - this.r(0, 0.2) * (1 - kept));
          this.post(top, bot, 0.045, this.col(this.pal.dark), 4);
        }
      }
      // Boards running down the slope, side by side along the ridge.
      for (let a = -half; a < half - 0.02; ) {
        const w = Math.min(half - a, this.r(0.18, 0.3));
        const am = a + w / 2;
        const s = (am + half) / (2 * half);
        const ridge = rh - sag * 4 * s * (1 - s);
        const eave = eh - sag * 0.5 * 4 * s * (1 - s) - this.r(0, 0.04);
        const reach = S + overhang + this.r(-0.05, 0.08);
        a += w;
        // Ruins lose boards in runs, from the eaves up.
        if (kept < 1 && hash2(Math.floor(am * 1.6), side, 31) > kept) {
          if (this.rand() < 0.35) {
            // What's left: a stub at the ridge.
            const stub = this.r(0.25, 0.6);
            const top = c.clone().addScaledVector(along, am).addScaledVector(out, -0.02).setY(c.y + ridge + 0.02);
            const bot = c.clone().addScaledVector(along, am).addScaledVector(out, S * stub).setY(c.y + ridge - (rh - eh) * stub);
            this.board(top, bot, w - 0.012, 0.045, up, this.col(mats, 0.08));
          }
          continue;
        }
        const top = c.clone().addScaledVector(along, am).addScaledVector(out, -0.02).setY(c.y + ridge + 0.02);
        const bot = c.clone().addScaledVector(along, am).addScaledVector(out, reach).setY(c.y + eave - (overhang * (rh - eh)) / S);
        const nrm = up.clone().multiplyScalar(S).addScaledVector(out, rh - eh).normalize();
        this.board(top, bot, w - 0.012, 0.045, nrm, this.col(mats, 0.06), { sag: this.r(0, 0.02) + (kept < 1 ? this.r(0, 0.06) : 0) });
      }
      // A patch: old sailcloth tied over a leak, or a few odd boards.
      if (patch && kept >= 1 && this.rand() < 0.75) {
        const a0 = this.r(-half * 0.7, half * 0.2);
        const len = this.r(0.6, 1.1);
        const d0 = this.r(0.15, S * 0.4);
        const d1 = d0 + this.r(0.5, 0.9);
        const y = (d) => c.y + rh - ((rh - eh) * d) / S + 0.035;
        const p = (aa, d) => c.clone().addScaledVector(along, aa).addScaledVector(out, d).setY(y(d));
        if (patch === 'sail') {
          const g = new THREE.BufferGeometry();
          const A = p(a0, d0);
          const B = p(a0 + len, d0 + this.r(-0.05, 0.05));
          const C = p(a0 + len + this.r(-0.06, 0.06), d1);
          const D = p(a0 + this.r(-0.06, 0.06), d1);
          g.setAttribute('position', new THREE.Float32BufferAttribute([...A.toArray(), ...C.toArray(), ...B.toArray(), ...A.toArray(), ...D.toArray(), ...C.toArray(), ...A.toArray(), ...B.toArray(), ...C.toArray(), ...A.toArray(), ...C.toArray(), ...D.toArray()], 3));
          this.parts.push(paint(g, this.col(this.pal.canvas, 0.05)));
          // Ties over it.
          for (const f of [0.25, 0.75]) {
            const q = p(a0 + len * f, d0 - 0.05);
            const q2 = p(a0 + len * f, d1 + 0.05);
            this.parts.push(paint(segment(q, q2, 0.008, 0.008, 3), this.pal.rope));
          }
        } else {
          for (let k = 0; k < 3; k++) this.board(p(a0, d0 + k * 0.22), p(a0 + len, d0 + k * 0.22 + this.r(-0.03, 0.03)), 0.2, 0.03, up, this.col(this.pal.wood));
        }
      }
    }
    // A bent board over the ridge.
    for (const side of [-1, 1]) {
      const a = c.clone().addScaledVector(along, -half).setY(c.y + rh + 0.03);
      const b = c.clone().addScaledVector(along, half).setY(c.y + rh + 0.03);
      a.addScaledVector(across, side * 0.07);
      b.addScaledVector(across, side * 0.07);
      this.board(a, b, 0.16, 0.035, up.clone().addScaledVector(across, side * 0.8).normalize(), this.col(this.pal.dark), { sag: sag, segs: 4 });
    }
  }

  /** A window: frame, a shutter hanging open, and where the light shows at night. */
  window(c, u, n, w, h, owner = null) {
    const up = V(0, 1, 0);
    const corner = (a, b) => c.clone().addScaledVector(u, a).addScaledVector(up, b).addScaledVector(n, 0.03);
    const fc = this.col(this.pal.dark);
    this.board(corner(-w / 2 - 0.04, -h / 2), corner(w / 2 + 0.04, -h / 2 + this.r(-0.02, 0.02)), 0.07, 0.04, n, fc);
    this.board(corner(-w / 2 - 0.04, h / 2), corner(w / 2 + 0.04, h / 2), 0.07, 0.04, n, fc);
    this.board(corner(-w / 2, -h / 2), corner(-w / 2, h / 2), 0.06, 0.04, n, fc);
    this.board(corner(w / 2, -h / 2), corner(w / 2, h / 2), 0.06, 0.04, n, fc);
    // One shutter swung open against the wall, hanging a bit off true.
    const side = this.rand() < 0.5 ? -1 : 1;
    const hinge = corner(side * (w / 2 + 0.04), 0);
    const swing = this.r(2.2, 2.9);
    const dir = u.clone().multiplyScalar(side * Math.cos(Math.PI - swing)).addScaledVector(n, Math.sin(Math.PI - swing)).normalize();
    for (let k = 0; k < 2; k++) {
      const off = (k - 0.5) * (h / 2);
      this.board(hinge.clone().addScaledVector(up, off - h / 4 + 0.02), hinge.clone().addScaledVector(dir, w * 0.95).addScaledVector(up, off - h / 4 + this.r(-0.06, 0.02)), h / 2 - 0.02, 0.03, dir.clone().cross(up).normalize(), this.col(this.rand() < 0.5 ? this.pal.paint : this.pal.wood));
    }
    this.windows.push({ pos: c.clone().addScaledVector(n, 0.02), normal: n.clone(), u: u.clone(), w, h, owner });
  }

  /** A rusty stovepipe with a cap, and smoke coming out of it. */
  stovepipe(base, height) {
    const top = base.clone().add(V(this.r(-0.04, 0.04), height, this.r(-0.04, 0.04)));
    this.parts.push(paint(segment(base, top, 0.075, 0.07, 8), this.col(this.pal.rust)));
    const cap = new THREE.ConeGeometry(0.16, 0.12, 8);
    cap.translate(top.x, top.y + 0.1, top.z);
    this.parts.push(paint(cap, this.col(this.pal.rust)));
    this.chimneys.push(top.clone().add(V(0, 0.05, 0)));
  }

  /** Merge it all, weathered. */
  finish(ground = () => 0) {
    if (!this.parts.length) return null;
    const g = mergeParts(this.parts);
    weather(g, this.pal, ground);
    const m = new THREE.Mesh(g, kitMat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

export const kitMat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

/**
 * Weathering, into the vertex colours of merged world-space geometry:
 * salt crusting low down, moss on faces turned from the sun (north, −z) and
 * near the ground, bleaching where the sun hits, and uneven grime.
 */
export function weather(g, pal, ground) {
  const p = g.attributes.position;
  const nrm = g.attributes.normal;
  const col = g.attributes.color;
  const salt = new THREE.Color(pal.salt);
  const moss = new THREE.Color(pal.moss);
  const c = new THREE.Color();
  const grey = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    // One look per face (they're flat-shaded).
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    const above = y - ground(x, z);
    const noise = hash2(Math.floor(x * 3), Math.floor(z * 3 + y * 2), 71);
    const streak = hash2(Math.floor(x * 9 + z * 9), Math.floor(y * 1.2), 73);
    for (let k = 0; k < 3; k++) {
      c.fromBufferAttribute(col, i + k);
      // Salt crust in a band near the sand and the tideline.
      const s = Math.max(0, 1 - Math.max(0, above) / 0.7) * (0.25 + 0.35 * noise) + Math.max(0, 1 - Math.abs(y - 1.0) / 0.5) * 0.12 * noise;
      c.lerp(salt, Math.min(0.5, s));
      // Moss on the shady side, low down and on roofs facing north.
      const shade = Math.max(0, -nz) * (0.5 + 0.5 * Math.max(0, 1 - above / 2.5)) + (ny > 0.4 && nz < -0.1 ? 0.4 : 0);
      c.lerp(moss, Math.min(0.4, shade * 0.45 * noise));
      // Sun bleaching: lighter and greyer where it faces the sun (south, up).
      const sun = Math.max(0, nz) * 0.6 + Math.max(0, ny) * 0.4;
      const l = (c.r + c.g + c.b) / 3;
      grey.setRGB(l * 1.12, l * 1.1, l * 1.06);
      c.lerp(grey, Math.min(0.35, sun * 0.3));
      // Grime: vertical streaks and blotches.
      c.multiplyScalar(0.86 + 0.16 * streak);
      void nx;
      col.setXYZ(i + k, c.r, c.g, c.b);
    }
  }
  col.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Things there are lots of: one geometry, many placements, each its own tint.
// ---------------------------------------------------------------------------

export class Instances {
  constructor() {
    this.sets = new Map();
  }

  /** Add one of `key` (made once by make()) at a matrix, tinted. */
  add(key, make, matrix, color = '#ffffff') {
    if (!this.sets.has(key)) this.sets.set(key, { geo: make(), list: [] });
    this.sets.get(key).list.push({ matrix: matrix.clone(), color: new THREE.Color(color) });
  }

  /** Shorthand: position, yaw, tilt (about x), scale. */
  put(key, make, pos, yaw = 0, color = '#ffffff', scale = 1, tilt = 0, roll = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, roll, 'YXZ'));
    const s = typeof scale === 'number' ? V(scale, scale, scale) : scale;
    this.add(key, make, new THREE.Matrix4().compose(pos, q, s), color);
  }

  build(parent) {
    const out = [];
    for (const [key, set] of this.sets) {
      const m = new THREE.InstancedMesh(set.geo, kitMat, set.list.length);
      set.list.forEach((it, i) => {
        m.setMatrixAt(i, it.matrix);
        m.setColorAt(i, it.color);
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `inst:${key}`;
      m.computeBoundingSphere();
      parent.add(m);
      out.push(m);
    }
    return out;
  }
}

/** Shapes for instancing. All painted white; the instance colour tints them. */
export const SHAPES = {
  splitFish() {
    const g = new THREE.ConeGeometry(0.075, 0.44, 5);
    g.rotateX(Math.PI);
    g.scale(1, 1, 0.3);
    g.translate(0, -0.22, 0);
    const tail = new THREE.ConeGeometry(0.06, 0.1, 3);
    tail.translate(0, -0.47, 0);
    tail.scale(1, 1, 0.3);
    return mergeParts([paint(g, '#ffffff'), paint(tail, '#d8d4cc')]);
  },
  fish() {
    const g = new THREE.SphereGeometry(1, 7, 5);
    g.scale(0.17, 0.045, 0.06);
    const tail = new THREE.ConeGeometry(0.05, 0.08, 3);
    tail.rotateZ(Math.PI / 2);
    tail.scale(1, 1, 0.3);
    tail.translate(-0.2, 0, 0);
    return mergeParts([paint(g, '#ffffff'), paint(tail, '#cfcac0')]);
  },
  float() {
    const g = new THREE.IcosahedronGeometry(0.12, 1);
    g.scale(1, 0.85, 1);
    return mergeParts([paint(g, '#ffffff')]);
  },
  corkFloat() {
    const g = new THREE.CylinderGeometry(0.055, 0.055, 0.05, 7);
    return mergeParts([paint(g, '#ffffff')]);
  },
  lobsterPot() {
    // A wicker dome on a flat base, with hoops.
    const dome = new THREE.SphereGeometry(0.36, 9, 5, 0, TAU, 0, Math.PI / 2);
    dome.scale(1, 0.85, 0.7);
    const base = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 9);
    base.scale(1, 1, 0.7);
    const parts = [paint(dome, '#ffffff'), paint(base, '#d9d0bd')];
    for (const x of [-0.18, 0, 0.18]) {
      const hoop = new THREE.TorusGeometry(0.29 - Math.abs(x) * 0.6, 0.012, 3, 10, Math.PI);
      hoop.translate(x, 0, 0);
      hoop.rotateY(Math.PI / 2);
      hoop.scale(1, 1.05, 1);
      parts.push(paint(hoop, '#8f8370'));
    }
    return mergeParts(parts);
  },
  crate() {
    const g = new THREE.BoxGeometry(0.6, 0.5, 0.5);
    const parts = [paint(g, '#ffffff')];
    for (const dx of [-0.31, 0.31]) {
      const s = new THREE.BoxGeometry(0.02, 0.52, 0.52);
      s.translate(dx, 0, 0);
      parts.push(paint(s, '#c8bca6'));
    }
    const lid = new THREE.BoxGeometry(0.62, 0.03, 0.08);
    lid.translate(0, 0.25, 0);
    parts.push(paint(lid, '#c8bca6'));
    return mergeParts(parts);
  },
  barrel() {
    const g = new THREE.CylinderGeometry(0.24, 0.24, 0.62, 9, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + 0.12 * Math.cos((p.getY(i) / 0.31) * (Math.PI / 2));
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    const parts = [paint(g, '#ffffff')];
    for (const y of [-0.22, 0.22]) {
      const h = new THREE.TorusGeometry(0.255, 0.012, 3, 12);
      h.rotateX(Math.PI / 2);
      h.translate(0, y, 0);
      parts.push(paint(h, '#4a4038'));
    }
    return mergeParts(parts);
  },
  stone() {
    const g = new THREE.IcosahedronGeometry(0.2, 0);
    g.scale(1, 0.6, 0.85);
    return mergeParts([paint(g, '#ffffff')]);
  },
  sack() {
    // A hessian sack, slumped, the top gathered and tied.
    const g = new THREE.SphereGeometry(0.26, 9, 7);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      // Squarer in the middle, flat where it sits, drawn in at the top.
      const sq = 1 + 0.18 * (1 - Math.abs(y) / 0.26);
      x *= sq;
      z *= sq * 0.8;
      if (y < -0.12) y = -0.12 - (y + 0.12) * 0.25;
      if (y > 0.12) {
        const k = 1 - Math.min(0.75, (y - 0.12) * 4.5);
        x *= k;
        z *= k;
      }
      p.setXYZ(i, x * (1 + 0.04 * Math.sin(y * 31)), y * 1.25, z);
    }
    g.translate(0, 0.17, 0);
    const tuft = new THREE.ConeGeometry(0.07, 0.12, 6);
    tuft.rotateX(Math.PI);
    tuft.translate(0, 0.55, 0);
    const tie = new THREE.TorusGeometry(0.05, 0.015, 3, 8);
    tie.rotateX(Math.PI / 2);
    tie.translate(0, 0.49, 0);
    return mergeParts([paint(g, '#ffffff'), paint(tuft, '#e8e2d4'), paint(tie, '#6f6250')]);
  },
  coil() {
    // A coil of rope lying flat.
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const t = new THREE.TorusGeometry(0.3 - i * 0.03, 0.04, 4, 14);
      t.rotateX(Math.PI / 2);
      t.translate(0, 0.04 + i * 0.065, 0);
      parts.push(paint(t, i % 2 ? '#ffffff' : '#e6dccb'));
    }
    return mergeParts(parts);
  },
  plant() {
    // Something leafy in a garden row.
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.SphereGeometry(0.11, 5, 3);
      leaf.scale(1, 0.45, 0.6);
      leaf.translate(0.1, 0.09 + (i % 2) * 0.04, 0);
      leaf.rotateZ(0.5);
      leaf.rotateY((i / 5) * TAU);
      parts.push(paint(leaf, i % 2 ? '#ffffff' : '#dfe6d6'));
    }
    return mergeParts(parts);
  },
  bramble() {
    // A clump of bramble and nettle growing up against something.
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.IcosahedronGeometry(0.22 + (i % 3) * 0.06, 0);
      b.scale(1, 0.8, 1);
      b.translate(Math.cos(i * 2.1) * 0.3, 0.15 + (i % 3) * 0.2, Math.sin(i * 2.1) * 0.22);
      parts.push(paint(b, i % 2 ? '#ffffff' : '#d6dccb'));
    }
    return mergeParts(parts);
  },
  jar() {
    const g = new THREE.CylinderGeometry(0.07, 0.075, 0.18, 8);
    g.translate(0, 0.09, 0);
    const lid = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 8);
    lid.translate(0, 0.195, 0);
    return mergeParts([paint(g, '#ffffff'), paint(lid, '#b9ad94')]);
  },
  tuft() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.ConeGeometry(0.03, 0.35, 3);
      b.translate(0, 0.17, 0);
      b.rotateZ((i - 1.5) * 0.25);
      b.rotateY(i * 1.4);
      parts.push(paint(b, '#ffffff'));
    }
    return mergeParts(parts);
  },
};

// ---------------------------------------------------------------------------
// Lit windows. The panes glow a little (lamplight behind them); a handful of
// real lights go to the lit windows nearest you, just outside, so the light
// falls on the ground and the walls and flickers like a flame.
// ---------------------------------------------------------------------------

export class WindowLights {
  constructor(scene, count = 5) {
    this.wins = [];
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight('#ffad5a', 0, 8, 1.8);
      scene.add(l);
      this.lights.push(l);
    }
    const pane = new THREE.PlaneGeometry(1, 1);
    this.paneMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: true });
    this.scene = scene;
    this.paneGeo = pane;
    this.mesh = null;
  }

  /** Windows from a kit, with who lives behind each (for when the lamp goes out). */
  add(windows) {
    this.wins.push(...windows.map((w) => ({ ...w, seed: this.wins.length + Math.random() * 100 })));
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = new THREE.InstancedMesh(this.paneGeo, this.paneMat, this.wins.length);
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    this.wins.forEach((w, i) => {
      q.setFromUnitVectors(V(0, 0, 1), w.normal);
      m.compose(w.pos, q, V(w.w, w.h, 1));
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, new THREE.Color('#1c1a17'));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.mesh);
  }

  /**
   * lit(w) says whether a window's lamp is lit now. The panes flicker; the
   * real lights go to the nearest lit ones.
   */
  update(t, camera, night, lit) {
    if (!this.mesh) return;
    const c = new THREE.Color();
    const near = [];
    this.wins.forEach((w, i) => {
      const on = night > 0.25 && lit(w);
      const f = 0.82 + 0.1 * Math.sin(t * 9.1 + w.seed) + 0.08 * Math.sin(t * 23.7 + w.seed * 3);
      if (on) {
        c.setRGB(1.0, 0.62, 0.3).multiplyScalar(0.55 + 0.45 * f);
        near.push({ w, d: w.pos.distanceToSquared(camera.position), f });
      } else c.setRGB(0.07, 0.065, 0.06);
      this.mesh.setColorAt(i, c);
    });
    this.mesh.instanceColor.needsUpdate = true;
    near.sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const n = near[i];
      if (!n || n.d > 90 * 90) {
        l.intensity = 0;
        return;
      }
      l.position.copy(n.w.pos).addScaledVector(n.w.normal, 0.55);
      l.intensity = 3.2 * n.f * Math.min(1, night * 1.5);
    });
  }
}

// ---------------------------------------------------------------------------
// Chimney smoke: soft puffs drifting up and off with the wind.
// ---------------------------------------------------------------------------

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Smoke {
  constructor(scene, sources, perSource = 14) {
    this.sources = sources;
    const n = Math.max(1, sources.length * perSource);
    this.per = perSource;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: puffTexture() }, uColor: { value: new THREE.Color('#a9a49b') }, uPx: { value: 300 } },
      // Sized in metres (projection-aware), so a far chimney is a haze, not a dot.
      vertexShader: `attribute float size; attribute float alpha; varying float vA; uniform float uPx;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float px = size * uPx * projectionMatrix[1][1] / -mv.z;
          vA = alpha * clamp(px / 6.0, 0.0, 1.0); gl_PointSize = max(px, 1.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
        void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vA); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.age = new Float32Array(n).map((_, i) => (i % perSource) / perSource);
  }

  /** wind: { x, z, speed }; strength 0..1 (a fire going), light 0..1 (how lit the smoke is). */
  update(dt, wind, strength = 1, light = 1, viewHeight = 700) {
    const n = this.age.length;
    this.mat.uniforms.uPx.value = viewHeight / 2;
    // Grey by day; at night only a dark smudge against the sky.
    this.mat.uniforms.uColor.value.setRGB(0.66, 0.64, 0.6).multiplyScalar(0.08 + 0.92 * light * light);
    for (let i = 0; i < n; i++) {
      const src = this.sources[Math.floor(i / this.per)];
      this.age[i] += dt / 7;
      if (this.age[i] > 1) this.age[i] -= 1;
      const a = this.age[i];
      const drift = a * 7 * (0.25 + 0.06 * (wind?.speed ?? 3));
      this.pos[i * 3] = src.x + (wind?.x ?? 0.5) * drift + Math.sin(a * 9 + i) * 0.15 * a;
      this.pos[i * 3 + 1] = src.y + a * 3.2;
      this.pos[i * 3 + 2] = src.z + (wind?.z ?? 0.3) * drift + Math.cos(a * 7 + i) * 0.15 * a;
      this.size[i] = 0.5 + a * 2.6;
      this.alpha[i] = strength * Math.min(1, a * 5) * (1 - a) * 0.32;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Hand-painted signs: a picture on a board, no lettering.
// ---------------------------------------------------------------------------

const signTex = {};
export function signTexture(kind) {
  if (signTex[kind]) return signTex[kind];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  const rand = mulberry32(kind.length * 977 + kind.charCodeAt(0));
  // Weathered boards.
  ctx.fillStyle = '#6f6556';
  ctx.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y += 32) {
    ctx.fillStyle = `rgba(${90 + rand() * 30},${80 + rand() * 25},${66 + rand() * 20},1)`;
    ctx.fillRect(0, y + 1, 256, 30);
    ctx.strokeStyle = 'rgba(40,32,24,0.5)';
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      const yy = y + 4 + rand() * 24;
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(80, yy + rand() * 4 - 2, 170, yy + rand() * 4 - 2, 256, yy);
      ctx.stroke();
    }
  }
  // The picture, painted thick and a bit wobbly, faded.
  const wob = (v) => v + (rand() - 0.5) * 3;
  const paintColour = { fish: '#a5583f', pot: '#2f3b45', barrel: '#7a4a2a', loaf: '#b07a3a', cup: '#3f5a6a', bowl: '#8a5a3a', rope: '#9a7f4a', scales: '#3f4f5a', boat: '#5a3a2a', sack: '#8a6a3a' }[kind] ?? '#a5583f';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e6dcc4';
  ctx.fillStyle = paintColour;
  ctx.lineWidth = 7;
  const shape = () => {
    ctx.beginPath();
    if (kind === 'fish') {
      ctx.moveTo(wob(60), wob(64));
      ctx.bezierCurveTo(wob(95), wob(25), wob(165), wob(28), wob(190), wob(64));
      ctx.bezierCurveTo(wob(165), wob(100), wob(95), wob(103), wob(60), wob(64));
      ctx.moveTo(wob(62), wob(64));
      ctx.lineTo(wob(28), wob(38));
      ctx.lineTo(wob(34), wob(64));
      ctx.lineTo(wob(28), wob(90));
      ctx.closePath();
    } else if (kind === 'pot') {
      ctx.moveTo(wob(80), wob(50));
      ctx.lineTo(wob(176), wob(50));
      ctx.bezierCurveTo(wob(180), wob(95), wob(160), wob(110), wob(128), wob(110));
      ctx.bezierCurveTo(wob(96), wob(110), wob(76), wob(95), wob(80), wob(50));
      ctx.moveTo(wob(70), wob(48));
      ctx.lineTo(wob(186), wob(48));
    } else if (kind === 'barrel') {
      ctx.moveTo(wob(96), wob(18));
      ctx.bezierCurveTo(wob(84), wob(50), wob(84), wob(78), wob(96), wob(110));
      ctx.lineTo(wob(160), wob(110));
      ctx.bezierCurveTo(wob(172), wob(78), wob(172), wob(50), wob(160), wob(18));
      ctx.closePath();
    } else if (kind === 'loaf') {
      ctx.moveTo(wob(64), wob(90));
      ctx.bezierCurveTo(wob(60), wob(30), wob(196), wob(30), wob(192), wob(90));
      ctx.closePath();
    } else if (kind === 'rope') {
      // A coil, from above.
      for (const r of [44, 32, 20]) ctx.ellipse(128, 64, r * 1.3, r, 0, 0, TAU);
    } else if (kind === 'scales') {
      ctx.moveTo(wob(128), wob(20));
      ctx.lineTo(wob(128), wob(100));
      ctx.moveTo(wob(70), wob(36));
      ctx.lineTo(wob(186), wob(36));
      ctx.moveTo(wob(56), wob(70));
      ctx.bezierCurveTo(wob(60), wob(92), wob(100), wob(92), wob(104), wob(70));
      ctx.closePath();
      ctx.moveTo(wob(152), wob(70));
      ctx.bezierCurveTo(wob(156), wob(92), wob(196), wob(92), wob(200), wob(70));
      ctx.closePath();
      ctx.moveTo(wob(96), wob(108));
      ctx.lineTo(wob(160), wob(108));
    } else if (kind === 'boat') {
      ctx.moveTo(wob(40), wob(70));
      ctx.lineTo(wob(216), wob(70));
      ctx.bezierCurveTo(wob(200), wob(104), wob(80), wob(108), wob(52), wob(92));
      ctx.closePath();
      ctx.moveTo(wob(128), wob(66));
      ctx.lineTo(wob(128), wob(14));
      ctx.lineTo(wob(176), wob(62));
      ctx.closePath();
    } else if (kind === 'sack') {
      ctx.moveTo(wob(96), wob(34));
      ctx.bezierCurveTo(wob(60), wob(60), wob(64), wob(112), wob(128), wob(112));
      ctx.bezierCurveTo(wob(192), wob(112), wob(196), wob(60), wob(160), wob(34));
      ctx.lineTo(wob(140), wob(22));
      ctx.lineTo(wob(116), wob(22));
      ctx.closePath();
    } else {
      ctx.ellipse(128, 70, 56, 30, 0, 0, TAU);
    }
  };
  shape();
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (kind === 'fish') {
    ctx.fillStyle = '#e6dcc4';
    ctx.beginPath();
    ctx.arc(wob(166), wob(56), 6, 0, TAU);
    ctx.fill();
  } else if (kind === 'pot') {
    ctx.strokeStyle = 'rgba(230,220,196,0.7)';
    ctx.lineWidth = 4;
    for (const x of [108, 128, 148]) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.bezierCurveTo(x - 8, 30, x + 8, 22, x, 10);
      ctx.stroke();
    }
  } else if (kind === 'barrel') {
    ctx.strokeStyle = '#2b241d';
    ctx.lineWidth = 5;
    for (const y of [40, 88]) {
      ctx.beginPath();
      ctx.moveTo(90, y);
      ctx.lineTo(166, y);
      ctx.stroke();
    }
  }
  // Paint flaked off here and there, and dirt in the corners.
  for (let k = 0; k < 140; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(111,101,86,0.8)' : 'rgba(60,50,40,0.25)';
    ctx.fillRect(rand() * 256, rand() * 128, 2 + rand() * 6, 1 + rand() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  signTex[kind] = tex;
  return tex;
}

/** A sign board with its picture, hung from a bracket or nailed up; faces +z. */
export function signBoard(kind, w = 0.9) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, w / 2, 0.04), [
    new THREE.MeshLambertMaterial({ color: '#5e5446' }),
    new THREE.MeshLambertMaterial({ color: '#5e5446' }),
    new THREE.MeshLambertMaterial({ color: '#5e5446' }),
    new THREE.MeshLambertMaterial({ color: '#5e5446' }),
    new THREE.MeshLambertMaterial({ map: signTexture(kind) }),
    new THREE.MeshLambertMaterial({ map: signTexture(kind) }),
  ]);
  board.castShadow = true;
  g.add(board);
  return g;
}

// ---------------------------------------------------------------------------
// Small life: a cat, gulls, laundry. Each returns { object, update(t, wind) }.
// ---------------------------------------------------------------------------

export function cat(color = '#3a332d') {
  const g = new THREE.Group();
  const parts = [];
  const body = new THREE.SphereGeometry(0.16, 8, 6);
  body.scale(1, 1.15, 1.5);
  body.translate(0, 0.17, 0);
  const head = new THREE.SphereGeometry(0.1, 8, 6);
  head.translate(0, 0.37, 0.14);
  parts.push(paint(body, color), paint(head, color));
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.035, 0.07, 3);
    ear.translate(s * 0.055, 0.46, 0.13);
    parts.push(paint(ear, color));
    const eye = new THREE.SphereGeometry(0.012, 4, 3);
    eye.translate(s * 0.04, 0.39, 0.23);
    parts.push(paint(eye, '#b8a24a'));
  }
  const m = new THREE.Mesh(mergeParts(parts), kitMat);
  m.castShadow = true;
  g.add(m);
  const tail = new THREE.Group();
  tail.position.set(0, 0.08, -0.2);
  const tm = new THREE.Mesh(mergeParts([paint(segment(V(0, 0, 0), V(0.05, 0.05, -0.28), 0.025, 0.018, 4), color)]), kitMat);
  tail.add(tm);
  g.add(tail);
  return {
    object: g,
    update(t) {
      tail.rotation.y = Math.sin(t * 1.3) * 0.5;
      m.rotation.y = Math.sin(t * 0.21) > 0.85 ? 0.5 : 0;
    },
  };
}

/** A gull (or, crow = true, a crow) standing about, turning its head. */
export function gull(crow = false) {
  const g = new THREE.Group();
  const parts = [];
  const body = new THREE.SphereGeometry(0.1, 7, 5);
  body.scale(1, 0.85, 1.8);
  body.translate(0, 0.14, 0);
  const wing = new THREE.BoxGeometry(0.2, 0.05, 0.3);
  wing.translate(0, 0.17, -0.04);
  const tail = new THREE.ConeGeometry(0.05, 0.12, 3);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0.15, -0.22);
  parts.push(paint(body, crow ? '#26262a' : '#e9e8e2'), paint(wing, crow ? '#1c1c20' : '#9ea3a6'), paint(tail, crow ? '#1c1c20' : '#2e3032'));
  for (const s of [-1, 1]) parts.push(paint(segment(V(s * 0.03, 0, 0), V(s * 0.03, 0.08, 0.01), 0.008, 0.008, 3), crow ? '#2a2a2a' : '#c99a46'));
  const m = new THREE.Mesh(mergeParts(parts), kitMat);
  m.castShadow = true;
  g.add(m);
  const head = new THREE.Group();
  head.position.set(0, 0.24, 0.13);
  const hm = new THREE.Mesh(
    mergeParts([
      paint(new THREE.SphereGeometry(0.06, 6, 5), crow ? '#26262a' : '#efeee8'),
      (() => {
        const b = new THREE.ConeGeometry(0.018, 0.08, 4);
        b.rotateX(Math.PI / 2);
        b.translate(0, -0.01, 0.08);
        return paint(b, crow ? '#2e2e30' : '#d8a33a');
      })(),
    ]),
    kitMat,
  );
  head.add(hm);
  g.add(head);
  const seed = Math.random() * 10;
  return {
    object: g,
    update(t) {
      const k = Math.sin(t * 0.7 + seed);
      head.rotation.y = k > 0.6 ? 0.8 : k < -0.6 ? -0.7 : 0;
      head.position.z = 0.13 + Math.max(0, Math.sin(t * 2.3 + seed)) * 0.02;
    },
  };
}

/** A washing line between a and b with things pegged on it, moving in the wind. */
export function laundry(a, b, colors) {
  const g = new THREE.Group();
  const line = new THREE.Mesh(mergeParts([paint(segment(a, a.clone().lerp(b, 0.5).add(V(0, -0.12, 0)), 0.006, 0.006, 3), '#cfc5ae'), paint(segment(a.clone().lerp(b, 0.5).add(V(0, -0.12, 0)), b, 0.006, 0.006, 3), '#cfc5ae')]), kitMat);
  g.add(line);
  const cloths = [];
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.7) / (n + 0.4);
    const p = a.clone().lerp(b, s);
    p.y -= 0.12 * 4 * s * (1 - s);
    const w = 0.35 + (i % 3) * 0.08;
    const h = 0.45 + ((i * 7) % 3) * 0.1;
    const geo = new THREE.PlaneGeometry(w, h, 2, 3);
    geo.translate(0, -h / 2, 0);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 9) * 0.02);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[i], side: THREE.DoubleSide }));
    m.position.copy(p);
    m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    m.castShadow = true;
    g.add(m);
    cloths.push(m);
  }
  return {
    object: g,
    update(t, wind) {
      const w = Math.min(1, (wind?.speed ?? 3) / 8);
      cloths.forEach((c, i) => {
        c.rotation.x = (Math.sin(t * 1.9 + i * 1.3) * 0.12 + 0.1) * (0.3 + w);
      });
    },
  };
}
