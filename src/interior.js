import * as THREE from 'three';
import { makeBox } from './collision.js';
import { paint, mergeParts, segment } from './props.js';
import { LAYOUT, hullZ, deckAt, cabinHalf, roofTop, halfAt } from './boat.js';

// Below decks, built inside the boat's own hull: you walk down the
// companionway steps from the cockpit and you're in it, and she keeps
// sailing round you. The galley is to port at the foot of the steps and the
// chart table to starboard; then the saloon (a dinette round the mast post
// to port, a settee to starboard); then through the bulkhead door to the
// forecabin and its V-berth, with the locker under it.
//
// The lining follows the real hull: it curves in toward the keel, so the
// floor's narrower than the cabin is at shoulder height. The deckhead is the
// underside of the side decks and the coachroof, with the coachroof windows
// and the hatches letting the daylight in.
//
// While you're down here the decks over you are cut away (see Boat.setCutaway)
// and the camera looks in from above. They still throw their shadow, so it's
// lamplit and dim down here even at noon, with the sun coming down the
// companionway.
//
// Local frame (the group's): boat-local x (toward the bow) and z (to
// starboard), and y = 0 on the cabin sole.

const B = LAYOUT.below;
const C = LAYOUT.cabin;
const FLOOR = B.floor;
const AFT = B.x0 + 0.05; // the face of the cockpit bulkhead
const FWD = B.x1 - 0.03; // the chain locker bulkhead
const DOOR = B.door;
const SOLE = LAYOUT.cockpit.sole - FLOOR; // the cockpit sole, from down here
const BH = 2.1; // the bulkhead between the saloon and the forecabin
const BERTH = 2.85; // where the V-berth starts

const TEAK = '#8a5a34';
const TEAK_DARK = '#6a4426';
const TEAK_LIGHT = '#a8774a';
const HOLLY = '#e6dcc4';
const CREAM = '#ebe3d0';
const CREAM2 = '#e2d8c3';
const NAVY = '#33425c';
const NAVY_LIGHT = '#47566f';
const RED = '#8e4a3c';
const BRASS = '#b48a3c';
const STEEL = '#b9bec2';
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** The lining's half-width at height y (it sits just inside the hull). */
const side = (x, y) => hullZ(x, y + FLOOR) - 0.06;
/** Underside of the deck at the hull side. */
const deckUnder = (x) => deckAt(x) - FLOOR - 0.07;
/** Inside face of the coachroof sides at the deck. */
const trunk = (x) => cabinHalf(x) - 0.06;
/** Underside of the coachroof (sloping down to the deck at its front). */
function roofUnder(x) {
  const f = C.x1 - 0.35;
  if (x <= f) return roofTop(x) - FLOOR - 0.07;
  const t = Math.min(1, (x - f) / 0.35);
  return roofTop(f) - FLOOR - 0.07 + t * (deckUnder(C.x1) - (roofTop(f) - FLOOR - 0.07));
}
/** The deck's camber, as in src/hull.js loftDeck. */
const camber = (x, z) => {
  const hb = halfAt(x);
  const t = Math.min(1, Math.abs(z) / hb);
  return 0.03 * hb * (1 - t * t);
};

/**
 * Interior materials: lit as if the deck's over them (less of the open sky's
 * light), with the lamps and the companionway doing the rest.
 */
const INDOOR = { value: 0.5 };
function indoor(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uIndoor = INDOOR;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uIndoor;')
      .replace('#include <lights_fragment_maps>', 'irradiance *= uIndoor;\n#include <lights_fragment_maps>');
  };
  return material;
}

/** Turn each triangle of a non-indexed geometry to face want(x, y, z) → [dx, dy, dz]. */
function orient(g, want) {
  const p = g.attributes.position.array;
  const c = g.attributes.color?.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let t = 0; t < p.length; t += 9) {
    a.set(p[t + 3] - p[t], p[t + 4] - p[t + 1], p[t + 5] - p[t + 2]);
    b.set(p[t + 6] - p[t], p[t + 7] - p[t + 1], p[t + 8] - p[t + 2]);
    a.cross(b);
    d.set(...want((p[t] + p[t + 3] + p[t + 6]) / 3, (p[t + 1] + p[t + 4] + p[t + 7]) / 3, (p[t + 2] + p[t + 5] + p[t + 8]) / 3));
    if (a.dot(d) >= 0) continue;
    for (const arr of c ? [p, c] : [p]) {
      for (let k = 0; k < 3; k++) [arr[t + 3 + k], arr[t + 6 + k]] = [arr[t + 6 + k], arr[t + 3 + k]];
    }
  }
  return g;
}

/** Facing the middle of the cabin, across. */
const INWARD = (x, y, z) => [0, 0, -Math.sign(z)];
const UP = () => [0, 1, 0];
const DOWN = () => [0, -1, 0];

/** A quad (or several) from flat [x, y, z, ...] points: two triangles a, b, c / a, c, d. */
function quads(points, color, want) {
  const pos = [];
  for (let i = 0; i < points.length; i += 4) {
    const [a, b, cc, d] = points.slice(i, i + 4);
    pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return orient(paint(g, color), want);
}

/** A grid surface (non-indexed, one colour per cell): at(i, j) → [x, y, z]; color(i, j) → css or null to leave a hole. Faces want(x, y, z). */
function surface(nu, nv, at, color, want) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const k = color(i, j);
      if (!k) continue;
      c.set(k);
      const a = at(i, j);
      const b = at(i + 1, j);
      const d = at(i, j + 1);
      const e = at(i + 1, j + 1);
      for (const q of [a, b, e, a, e, d]) {
        pos.push(...q);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return want ? orient(g, want) : g;
}

/** The cabin's cross-section at x, as [z, y] points round the inside (sole, lining, deckhead). */
function section(x) {
  const top = deckUnder(x);
  const pts = [];
  const n = 7;
  for (let i = 0; i <= n; i++) pts.push([side(x, (top * i) / n), (top * i) / n]);
  if (x < C.x1) {
    const t = trunk(x);
    const r = roofUnder(x);
    pts.push([t, top], [t - 0.12, r], [-(t - 0.12), r], [-t, top]);
  } else {
    const w = side(x, top);
    for (let k = 1; k < 6; k++) {
      const z = w - (2 * w * k) / 6;
      pts.push([z, top + camber(x, z)]);
    }
  }
  for (let i = n; i >= 0; i--) pts.push([-side(x, (top * i) / n), (top * i) / n]);
  return pts;
}

/** Keep the part of a polygon on one side of a line: axis 0 (z) or 1 (y), keep values ≥ v (or ≤ v). */
function clip(poly, axis, v, keepAbove) {
  const inside = (p) => (keepAbove ? p[axis] >= v : p[axis] <= v);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (v - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** A bulkhead: a polygon of the section, as a board `depth` thick, its face at x facing aft (−x). */
function board(poly, x, depth, color) {
  if (poly.length < 3) return null;
  const shape = new THREE.Shape(poly.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // shape x → z, extrusion → −x
  g.translate(x + depth, 0, 0);
  return paint(g, color);
}

export class Interior {
  constructor({ boat }) {
    this.boat = boat;
    this.group = new THREE.Group();
    this.group.name = 'interior';
    this.group.position.y = FLOOR;
    boat.root.add(this.group);
    // The lamps hang in their own group, never hidden: lights coming and
    // going would make every material in the world rebuild.
    this.lightGroup = new THREE.Group();
    this.lightGroup.position.y = FLOOR;
    boat.root.add(this.lightGroup);
    this.inside = false;
    this.cutK = 0;

    const parts = []; // the cabin itself: what things can be put on or hung from
    const ceil = []; // the deckhead, hidden while you're below and looking in from above
    const boxes = []; // colliders, cabin-local
    const solid = (x0, x1, y0, y1, z0, z1) => boxes.push([x0, x1, y0, y1, z0, z1]);
    const box = (cx, cy, cz, sx, sy, sz, color, list = parts) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(cx, cy, cz);
      list.push(paint(g, color));
    };
    const rod = (a, b, r, color, list = parts, sides = 6) => list.push(paint(segment(a, b, r, r, sides), color));
    /** A box from z = zIn out to the lining (at its narrowest over the box's height), on one side. */
    const toHull = (x0, x1, y0, y1, zIn, s, color, list = parts) => {
      const out = Math.min(side(x0, y0), side(x1, y0)) + 0.04;
      const w = out - zIn;
      if (w <= 0) return;
      box((x0 + x1) / 2, (y0 + y1) / 2, s * (zIn + w / 2), x1 - x0, y1 - y0, w, color, list);
    };

    this.#shell(parts, ceil, rod);
    this.#steps(parts, solid);
    this.#galley(parts, box, rod, toHull, solid);
    this.#chartTable(parts, box, rod, toHull, solid);
    this.#saloon(parts, ceil, box, rod, toHull, solid);
    this.#forecabin(parts, box, rod, toHull, solid);
    this.#betterStove();

    const mat = indoor(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.mesh = new THREE.Mesh(mergeParts(parts), mat); // the surfaces things can be put on (src/decorate.js)
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.ceiling = new THREE.Mesh(mergeParts(ceil), mat);
    this.ceiling.receiveShadow = true;
    this.group.add(this.ceiling);

    this.#glass();
    this.#lamps();

    // Into the boat's own collision body, in her frame.
    this.boxes = boxes.map(([x0, x1, y0, y1, z0, z1]) => ({
      ...makeBox({ center: V((x0 + x1) / 2, (y0 + y1) / 2 + FLOOR, (z0 + z1) / 2), half: V((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2) }),
      body: boat.body,
    }));
    boat.body.boxes.push(...this.boxes);

    // Where things are, cabin-local.
    this.foot = V(0.45, 0, 0.05); // the foot of the steps
    this.locker = V(2.5, 0, DOOR);
  }

  // ---------------------------------------------------------------------
  // The shell: sole, lining, bulkheads, deckhead
  // ---------------------------------------------------------------------

  #shell(parts, ceil, rod) {
    // Window openings in the lining, matching the dark windows painted on the hull outside.
    const WIN = [[-0.34, 1.6], [2.28, 2.79]];
    const WY = [0.98, 1.1];
    this.windows = WIN;
    const xs = [];
    for (let x = AFT; x < FWD - 0.05; x += 0.22) xs.push(x);
    xs.push(FWD);
    for (const [a, b] of WIN) xs.push(a, b);
    xs.sort((a, b) => a - b);
    const xu = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 0.03);
    const rows = [0, 0.12, 0.26, 0.4, 0.5, 0.62, 0.74, 0.86, WY[0], WY[1], 1.22, 1.34, 1.46, 1.58, 1.7];
    const yOf = (x, j) => Math.min(rows[j], deckUnder(x));
    for (const s of [-1, 1]) {
      // Varnished teak below the settee backs, then painted tongue-and-groove
      // (each plank a shade off the next), with the windows let in.
      parts.push(
        surface(
          xu.length - 1,
          rows.length - 1,
          (i, j) => {
            const x = xu[Math.min(i, xu.length - 1)];
            const y = yOf(x, j);
            return [x, y, s * side(x, y)];
          },
          (i, j) => {
            const xm = (xu[i] + xu[i + 1]) / 2;
            if (rows[j] >= deckUnder(xm) - 1e-4) return null;
            if (rows[j] === WY[0] && WIN.some(([a, b]) => xm > a && xm < b)) return null;
            if (rows[j] < 0.5) return j % 2 ? TEAK : '#83552f';
            return j % 2 ? CREAM : CREAM2;
          },
          INWARD,
        ),
      );
      // Teak battens along the lining: the top of the varnish, and one above the windows.
      for (const y of [0.5, 1.22]) {
        for (let i = 0; i + 1 < xu.length; i++) {
          const a = xu[i];
          const b = xu[i + 1];
          if (y > deckUnder(a) - 0.05) continue;
          rod(V(a, y, s * (side(a, y) - 0.015)), V(b, y, s * (side(b, y) - 0.015)), 0.018, TEAK_DARK, parts, 4);
        }
      }
      // Window frames.
      for (const [a, b] of WIN) {
        for (const y of WY) rod(V(a, y, s * (side(a, y) - 0.02)), V(b, y, s * (side(b, y) - 0.02)), 0.022, TEAK_DARK, parts, 4);
        for (const x of [a, b]) rod(V(x, WY[0], s * (side(x, WY[0]) - 0.02)), V(x, WY[1], s * (side(x, WY[1]) - 0.02)), 0.022, TEAK_DARK, parts, 4);
      }
      // The cut edge, where the deck meets the hull: seen only from above, while the deck's away.
      for (let i = 0; i + 1 < xu.length; i++) {
        const a = xu[i];
        const b = xu[i + 1];
        const ya = deckUnder(a) + 0.05;
        const yb = deckUnder(b) + 0.05;
        parts.push(
          quads(
            [
              [a, ya, s * (side(a, deckUnder(a)) - 0.01)],
              [b, yb, s * (side(b, deckUnder(b)) - 0.01)],
              [b, yb, s * (hullZ(b, deckAt(b)) + 0.01)],
              [a, ya, s * (hullZ(a, deckAt(a)) + 0.01)],
            ],
            '#4a3322',
            UP,
          ),
        );
      }
    }

    // The sole: teak planks with holly between, and a lifting board over the bilge.
    {
      const zs = [];
      for (let z = -1.5; z <= 1.5 + 1e-6; z += 0.12) zs.push(z);
      parts.push(
        surface(
          xu.length - 1,
          zs.length - 1,
          (i, j) => {
            const x = xu[Math.min(i, xu.length - 1)];
            const w = side(x, 0) + 0.02;
            return [x, 0, Math.max(-w, Math.min(w, zs[j]))];
          },
          (i, j) => (j % 3 === 0 ? '#9a6a40' : j % 3 === 1 ? TEAK_LIGHT : '#a37148'),
          UP,
        ),
      );
      for (let z = -1.44; z <= 1.44; z += 0.12) {
        for (let i = 0; i + 1 < xu.length; i++) {
          const a = xu[i];
          const b = xu[i + 1];
          if (Math.abs(z) > Math.min(side(a, 0), side(b, 0)) - 0.02) continue;
          const g = new THREE.BoxGeometry(b - a, 0.004, 0.012);
          g.translate((a + b) / 2, 0.002, z);
          parts.push(paint(g, HOLLY));
        }
      }
      // The bilge board in the saloon floor, with its brass ring.
      for (const [cx, cz, sx, sz] of [[1.45, 0.5, 0.5, 0.012], [1.45, 0.25, 0.5, 0.012], [1.2, 0.375, 0.012, 0.26], [1.7, 0.375, 0.012, 0.26]]) {
        const g = new THREE.BoxGeometry(sx, 0.006, sz);
        g.translate(cx, 0.004, cz);
        parts.push(paint(g, TEAK_DARK));
      }
      const ring = new THREE.TorusGeometry(0.03, 0.006, 4, 12);
      ring.rotateX(Math.PI / 2);
      ring.translate(1.62, 0.008, 0.375);
      parts.push(paint(ring, BRASS));
    }

    // Bulkheads: the cockpit end (open in the middle for the steps), the one
    // between the saloon and the forecabin (with its door), the chain locker's.
    const aft = section(AFT - 0.06);
    for (const s of [-1, 1]) {
      const piece = clip(aft, 0, s * DOOR, s > 0);
      parts.push(board(piece.map(([z, y]) => [z, Math.min(y, deckUnder(AFT))]), AFT - 0.06, 0.06, TEAK));
    }
    parts.push(board(clip(clip(aft, 0, -DOOR, true), 0, DOOR, false).map(([z, y]) => [z, Math.min(y, SOLE - 0.02)]), AFT - 0.06, 0.06, TEAK));
    // (Above the side decks, the companionway's sides: part of the deckhead.)
    for (const s of [-1, 1]) {
      const piece = clip(clip(aft, 0, s * DOOR, s > 0), 1, deckUnder(AFT) - 0.01, true);
      const b = board(piece, AFT - 0.06, 0.06, CREAM);
      if (b) ceil.push(b);
    }
    const mid = section(BH);
    parts.push(board(clip(mid, 0, -0.02, false), BH, 0.06, TEAK));
    parts.push(board(clip(mid, 0, 0.78, true), BH, 0.06, TEAK));
    parts.push(board(clip(clip(clip(mid, 0, -0.02, true), 0, 0.78, false), 1, 1.42, true), BH, 0.06, TEAK));
    // A door frame, and a clock and barometer on the saloon side.
    for (const z of [-0.02, 0.78]) parts.push(paint(segment(V(BH - 0.015, 0, z), V(BH - 0.015, 1.42, z), 0.03, 0.03, 4), TEAK_DARK));
    parts.push(paint(segment(V(BH - 0.015, 1.42, -0.04), V(BH - 0.015, 1.42, 0.8), 0.03, 0.03, 4), TEAK_DARK));
    for (const [z, face] of [[-0.42, '#f4efe2'], [-0.86, '#efe6cf']]) {
      const rim = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 18);
      rim.rotateZ(Math.PI / 2);
      rim.translate(BH - 0.02, 1.2, z);
      parts.push(paint(rim, BRASS));
      const f = new THREE.CylinderGeometry(0.092, 0.092, 0.01, 18);
      f.rotateZ(Math.PI / 2);
      f.translate(BH - 0.045, 1.2, z);
      parts.push(paint(f, face));
      parts.push(paint(segment(V(BH - 0.052, 1.2, z), V(BH - 0.052, 1.26, z + 0.02), 0.005, 0.005, 3), '#222222'));
    }
    parts.push(board(section(FWD), FWD, 0.06, TEAK));

    // The deckhead: under the side decks, up the inside of the coachroof,
    // across under its roof (open over the companionway and the saloon
    // hatch), and forward of it under the foredeck. Painted, with teak beams.
    const xr = xu.filter((x) => x <= C.x1 + 1e-6);
    if (xr[xr.length - 1] < C.x1) xr.push(C.x1);
    for (const s of [-1, 1]) {
      // Side-deck undersides.
      ceil.push(
        surface(xr.length - 1, 1, (i, j) => {
          const x = xr[Math.min(i, xr.length - 1)];
          const y = deckUnder(x);
          return [x, y, s * (j ? side(x, y) + 0.01 : trunk(x))];
        }, () => '#f1ebdc', DOWN),
      );
      // Coachroof sides, sloping in, with the windows (glass is separate).
      const wy = [deckAt(C.x0) + 0.3 - 0.065 - FLOOR, deckAt(C.x0) + 0.3 + 0.065 - FLOOR];
      const wx = [-0.55, 1.35];
      const ys = (x) => [deckUnder(x), wy[0], wy[1], roofUnder(x)];
      ceil.push(
        surface(xr.length - 1, 3, (i, j) => {
          const x = xr[Math.min(i, xr.length - 1)];
          const yy = ys(x);
          const y = Math.min(yy[j], yy[3]);
          const t = (y - yy[0]) / Math.max(0.01, yy[3] - yy[0]);
          return [x, y, s * (trunk(x) - 0.12 * t)];
        }, (i, j) => {
          const xm = (xr[i] + xr[i + 1]) / 2;
          if (j === 1 && xm > wx[0] && xm < wx[1]) return null;
          return j === 0 ? '#e9e1cd' : CREAM;
        }, INWARD),
      );
      this.roofWindows ??= [];
      this.roofWindows.push({ s, wx, wy });
    }
    // Under the coachroof.
    {
      const xs2 = [AFT - 0.06, B.hatchX, 0.65, 1.1];
      for (let x = AFT; x < C.x1 - 0.35; x += 0.25) xs2.push(x);
      xs2.push(C.x1 - 0.35, C.x1 - 0.18, C.x1);
      xs2.sort((a, b) => a - b);
      const xx = xs2.filter((x, i) => i === 0 || x - xs2[i - 1] > 0.02);
      const zf = [-1, -DOOR, -0.25, 0, 0.25, DOOR, 1];
      const edge = (x) => trunk(x) - 0.12;
      const zAt = (x, j) => (Math.abs(zf[j]) === 1 ? zf[j] * edge(x) : zf[j]);
      ceil.push(
        surface(xx.length - 1, zf.length - 1, (i, j) => {
          const x = xx[Math.min(i, xx.length - 1)];
          const z = zAt(x, j);
          return [x, roofUnder(x) + 0.03 * (1 - (z / edge(x)) ** 2), z];
        }, (i, j) => {
          const xm = (xx[i] + xx[i + 1]) / 2;
          const zm = (zf[j] + zf[j + 1]) / 2;
          if (xm < B.hatchX && Math.abs(zm) < DOOR) return null; // the companionway
          if (xm > 0.65 && xm < 1.1 && Math.abs(zm) < 0.25) return null; // the saloon hatch
          return '#f3eee2';
        }, DOWN),
      );
      // Beams across.
      for (let x = AFT + 0.45; x < C.x1 - 0.4; x += 0.42) {
        if (x > 0.6 && x < 1.15) continue;
        const y = roofUnder(x) - 0.02;
        if (x < B.hatchX) {
          for (const s of [-1, 1]) rod(V(x, y, s * DOOR), V(x, y, s * (edge(x) - 0.02)), 0.025, TEAK, ceil, 4);
        } else rod(V(x, y, -(edge(x) - 0.02)), V(x, y, edge(x) - 0.02), 0.025, TEAK, ceil, 4);
      }
      // The companionway's sides, through the coachroof.
      for (const s of [-1, 1]) {
        const a = [AFT - 0.06, deckUnder(AFT), s * DOOR];
        const b = [B.hatchX, deckUnder(B.hatchX), s * DOOR];
        const cc = [B.hatchX, roofUnder(B.hatchX) + 0.07, s * DOOR];
        const d = [AFT - 0.06, roofUnder(AFT) + 0.07, s * DOOR];
        ceil.push(quads([a, b, cc, d], TEAK_LIGHT, INWARD));
      }
    }
    // Under the foredeck, with the forehatch.
    {
      const xf = [C.x1, 3.15, 3.65];
      for (let x = C.x1; x < FWD; x += 0.22) xf.push(x);
      xf.push(FWD);
      xf.sort((a, b) => a - b);
      const xx = xf.filter((x, i) => i === 0 || x - xf[i - 1] > 0.02);
      const zf = [-1, -0.25, 0, 0.25, 1];
      const zAt = (x, j) => (Math.abs(zf[j]) === 1 ? zf[j] * (side(x, deckUnder(x)) + 0.01) : zf[j]);
      ceil.push(
        surface(xx.length - 1, zf.length - 1, (i, j) => {
          const x = xx[Math.min(i, xx.length - 1)];
          const z = zAt(x, j);
          return [x, deckUnder(x) + camber(x, z), z];
        }, (i, j) => {
          const xm = (xx[i] + xx[i + 1]) / 2;
          if (xm > 3.15 && xm < 3.65 && Math.abs((zf[j] + zf[j + 1]) / 2) < 0.25) return null;
          return '#f1ebdc';
        }, DOWN),
      );
      for (const x of [2.6, 3.0, 3.85, 4.2]) {
        const w = side(x, deckUnder(x));
        rod(V(x, deckUnder(x) - 0.02, -w), V(x, deckUnder(x) + camber(x, 0) - 0.02, 0), 0.025, TEAK, ceil, 4);
        rod(V(x, deckUnder(x) + camber(x, 0) - 0.02, 0), V(x, deckUnder(x) - 0.02, w), 0.025, TEAK, ceil, 4);
      }
      // The coachroof's front, from inside.
      const f = C.x1 - 0.35;
      ceil.push(
        surface(1, 1, (i, j) => {
          const x = i ? C.x1 : f;
          const y = i ? deckUnder(C.x1) : roofUnder(f);
          const w = i ? trunk(C.x1) : trunk(f) - 0.12;
          return [x, y, (j ? 1 : -1) * w];
        }, () => '#e9e1cd', () => [-1, -1, 0]),
      );
    }
  }

  // ---------------------------------------------------------------------
  // The companionway steps
  // ---------------------------------------------------------------------

  #steps(parts) {
    // Walked as a ramp (src/boat.js), drawn as steps whose middles sit on it.
    const x0 = B.x0;
    const x1 = -0.1;
    const lineX = (y) => x1 - ((x1 - x0) * y) / SOLE;
    for (let i = 1; i <= 3; i++) {
      const y = (SOLE * i) / 4;
      const x = lineX(y);
      const g = new THREE.BoxGeometry(0.27, 0.05, 2 * DOOR - 0.06);
      g.translate(x, y - 0.025, 0);
      parts.push(paint(g, TEAK_DARK));
      // A worn, lighter middle where everyone steps.
      const w = new THREE.BoxGeometry(0.2, 0.004, 0.3);
      w.translate(x + 0.01, y + 0.001, 0);
      parts.push(paint(w, '#7d5434'));
    }
    // The sill at the top.
    const sill = new THREE.BoxGeometry(AFT + 0.06 - x0 + 0.1, 0.06, 2 * DOOR);
    sill.translate((x0 + AFT) / 2, SOLE - 0.03, 0);
    parts.push(paint(sill, TEAK_DARK));
    // Stringers each side, and a handrail on posts.
    for (const s of [-1, 1]) {
      const z = s * (DOOR - 0.02);
      parts.push(paint(segment(V(AFT, SOLE + 0.08, z), V(x1 + 0.08, -0.02, z), 0.04, 0.04, 4), TEAK));
      const zr = s * (DOOR + 0.06);
      const a = V(AFT + 0.02, SOLE + 0.85, zr);
      const b = V(-0.3, 0.95, zr);
      parts.push(paint(segment(a, b, 0.02, 0.02, 6), TEAK_LIGHT));
      for (const t of [0.1, 0.9]) {
        const p = a.clone().lerp(b, t);
        parts.push(paint(segment(V(p.x, Math.max(0, SOLE * ((x1 - p.x) / (x1 - x0))) - 0.02, zr), p, 0.018, 0.018, 5), TEAK_DARK));
      }
      // The panel under the rail, against the galley and the chart table (seen from both sides).
      const lo = (x) => Math.max(0, (SOLE * (x1 - x)) / (x1 - x0)) - 0.02;
      const panel = [[AFT, 0, zr], [-0.3, 0, zr], [-0.3, lo(-0.3) + 0.25, zr], [AFT, SOLE + 0.25, zr]];
      parts.push(quads(panel, TEAK, () => [0, 0, 1]), quads(panel, TEAK, () => [0, 0, -1]));
    }
  }

  // ---------------------------------------------------------------------
  // The galley, to port at the foot of the steps
  // ---------------------------------------------------------------------

  #galley(parts, box, rod, toHull, solid) {
    const z0 = 0.92; // the counter's front, from the middle
    const x0 = AFT;
    const x1 = 0.55;
    const xm = (x0 + x1) / 2;
    toHull(x0, x1, 0, 0.88, z0, -1, TEAK);
    solid(x0, x1, 0, 1.0, -1.98, -z0);
    // Locker doors in the front, with their pulls.
    for (let x = x0 + 0.08; x + 0.42 < x1; x += 0.46) {
      box(x + 0.21, 0.42, -z0 + 0.005, 0.4, 0.62, 0.012, TEAK_LIGHT);
      box(x + 0.21, 0.42, -z0 + 0.012, 0.3, 0.5, 0.006, TEAK);
      rod(V(x + 0.34, 0.64, -z0 + 0.03), V(x + 0.34, 0.68, -z0 + 0.03), 0.012, BRASS);
    }
    box(xm, 0.08, -z0 + 0.03, x1 - x0, 0.16, 0.06, TEAK_DARK); // kick
    // Worktop (round the stove), a fiddle rail along its front, and the ledge behind it under the window.
    const sx = 0.15; // the stove's middle
    for (const [a, b] of [[x0 - 0.01, sx - 0.27], [sx + 0.27, x1 + 0.01]]) box((a + b) / 2, 0.9, -(z0 + 0.32), b - a, 0.04, 0.66, '#d6cdb8');
    box(sx, 0.86, -(z0 + 0.32), 0.54, 0.04, 0.66, TEAK_DARK); // under the stove
    box(xm, 0.94, -z0 + 0.0, x1 - x0, 0.05, 0.03, TEAK_DARK);
    toHull(x0, x1, 0.9, 0.95, z0 + 0.64, -1, TEAK);
    // The sink, and its pump.
    box(-0.55, 0.915, -(z0 + 0.3), 0.42, 0.012, 0.36, STEEL);
    box(-0.55, 0.905, -(z0 + 0.3), 0.36, 0.012, 0.3, '#8f9599');
    rod(V(-0.55, 0.92, -(z0 + 0.52)), V(-0.55, 1.16, -(z0 + 0.52)), 0.016, STEEL);
    rod(V(-0.55, 1.16, -(z0 + 0.52)), V(-0.55, 1.14, -(z0 + 0.36)), 0.014, STEEL);
    // The stove, slung in gimbals so it stays level at sea.
    this.stove = V(sx, 0, -(z0 + 0.28));
    const st = this.stove;
    box(st.x, 0.72, st.z, 0.52, 0.34, 0.5, '#d8d6d0');
    box(st.x, 0.9, st.z, 0.52, 0.03, 0.5, '#2a2a2a');
    for (const [dx, dz] of [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]]) {
      const ring = new THREE.TorusGeometry(0.06, 0.01, 4, 12);
      ring.rotateX(Math.PI / 2);
      ring.translate(st.x + dx, 0.93, st.z + dz);
      parts.push(paint(ring, '#555555'));
    }
    for (const dx of [-0.29, 0.29]) rod(V(st.x + dx, 0.6, st.z), V(st.x + dx, 0.95, st.z), 0.014, STEEL); // gimbal brackets
    rod(V(st.x - 0.27, 0.98, st.z + 0.27), V(st.x + 0.27, 0.98, st.z + 0.27), 0.01, STEEL); // pot rail
    // A kettle on the back burner's neighbour.
    const kettle = new THREE.SphereGeometry(0.1, 12, 8);
    kettle.scale(1, 0.85, 1);
    kettle.translate(st.x - 0.12, 1.01, st.z - 0.1);
    parts.push(paint(kettle, '#8e4a3c'));
    rod(V(st.x - 0.08, 1.02, st.z - 0.1), V(st.x, 1.08, st.z - 0.1), 0.012, '#8e4a3c');
    // Lockers along the hull above, a plate rack and mugs on hooks.
    const top = (x) => deckUnder(x) - 0.04;
    for (let x = x0 + 0.1; x + 0.5 < x1; x += 0.52) {
      const y0 = 1.2;
      const y1 = Math.min(top(x), top(x + 0.5));
      if (y1 - y0 < 0.15) continue;
      toHull(x, x + 0.5, y0, y1, z0 + 0.62, -1, TEAK);
      box(x + 0.25, (y0 + y1) / 2, -(z0 + 0.615), 0.44, y1 - y0 - 0.06, 0.012, TEAK_LIGHT);
      rod(V(x + 0.42, y0 + 0.05, -(z0 + 0.6)), V(x + 0.42, y0 + 0.09, -(z0 + 0.6)), 0.01, BRASS);
    }
    for (let i = 0; i < 5; i++) {
      const plate = new THREE.CylinderGeometry(0.1, 0.1, 0.014, 14);
      plate.rotateX(Math.PI / 2);
      plate.translate(-0.95 + i * 0.045, 1.07, -(z0 + 0.58));
      parts.push(paint(plate, ['#efe9dc', NAVY_LIGHT, '#efe9dc', '#c9b98a', '#efe9dc'][i]));
    }
    box(-0.86, 1.0, -(z0 + 0.6), 0.28, 0.02, 0.06, TEAK_DARK);
    rod(V(-0.2, 1.16, -(z0 + 0.6)), V(0.35, 1.16, -(z0 + 0.6)), 0.008, TEAK_DARK);
    for (let i = 0; i < 4; i++) {
      const x = -0.12 + i * 0.13;
      const mug = new THREE.CylinderGeometry(0.035, 0.032, 0.08, 10);
      mug.translate(x, 1.1, -(z0 + 0.56));
      parts.push(paint(mug, ['#efe9dc', NAVY_LIGHT, '#b98a3c', '#7d8c84'][i]));
    }
    // A tea towel over the rail, and a bucket and a sack of potatoes by the steps.
    box(0.35, 0.86, -z0 + 0.02, 0.16, 0.2, 0.012, '#b9a37a');
    box(0.35, 0.86, -z0 + 0.027, 0.16, 0.02, 0.006, '#8e4a3c');
    const bucket = new THREE.CylinderGeometry(0.13, 0.1, 0.26, 12, 1, true);
    bucket.translate(-0.62, 0.13, -0.68);
    parts.push(paint(bucket, '#6b7a80'));
    const sack = new THREE.SphereGeometry(0.17, 9, 6);
    sack.scale(1, 1.25, 0.9);
    sack.translate(-0.98, 0.2, -0.7);
    parts.push(paint(sack, '#a08b66'));
    const sackTop = new THREE.ConeGeometry(0.08, 0.12, 7);
    sackTop.translate(-0.98, 0.43, -0.7);
    parts.push(paint(sackTop, '#958058'));
  }

  // ---------------------------------------------------------------------
  // The chart table, to starboard at the foot of the steps
  // ---------------------------------------------------------------------

  #chartTable(parts, box, rod, toHull, solid) {
    const z0 = 0.92;
    const x0 = AFT;
    const x1 = 0.35;
    const xm = (x0 + x1) / 2;
    toHull(x0, x1, 0, 0.74, z0, 1, TEAK);
    solid(x0, x1, 0, 0.95, z0, 1.98);
    box(xm, 0.4, z0 - 0.005, x1 - x0 - 0.1, 0.5, 0.012, TEAK_LIGHT);
    box(xm, 0.4, z0 - 0.012, x1 - x0 - 0.3, 0.38, 0.006, TEAK);
    // The lid, with a chart on it, dividers, a pencil and a parallel rule.
    box(xm, 0.77, z0 + 0.3, x1 - x0 + 0.02, 0.04, 0.64, TEAK_LIGHT);
    box(xm, 0.8, z0 - 0.0, x1 - x0, 0.04, 0.025, TEAK_DARK);
    box(-0.45, 0.792, z0 + 0.32, 0.72, 0.004, 0.48, '#e2d6b0');
    box(-0.45, 0.795, z0 + 0.32, 0.6, 0.002, 0.004, '#8fa7b4');
    box(-0.6, 0.795, z0 + 0.25, 0.004, 0.002, 0.3, '#8fa7b4');
    rod(V(-0.62, 0.8, z0 + 0.18), V(-0.25, 0.8, z0 + 0.42), 0.006, '#2b2b2b', parts, 4);
    rod(V(-0.2, 0.8, z0 + 0.12), V(-0.05, 0.8, z0 + 0.2), 0.006, '#c9a24a', parts, 4);
    box(-0.32, 0.798, z0 + 0.52, 0.42, 0.01, 0.06, '#d8dccf');
    // Instruments on the lining above: the radio, the barometer, a dial.
    const iz = (x, y) => side(x, y) - 0.06;
    box(-0.55, 1.3, iz(-0.55, 1.3), 0.34, 0.14, 0.12, '#25292d');
    box(-0.55, 1.3, iz(-0.55, 1.3) - 0.062, 0.12, 0.03, 0.004, '#c27a3a');
    for (const [x, face] of [[-0.95, '#f4efe2'], [-0.15, '#20262c']]) {
      const rim = new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16);
      rim.rotateX(Math.PI / 2);
      rim.translate(x, 1.3, iz(x, 1.3) + 0.02);
      parts.push(paint(rim, BRASS));
      const f = new THREE.CylinderGeometry(0.07, 0.07, 0.01, 16);
      f.rotateX(Math.PI / 2);
      f.translate(x, 1.3, iz(x, 1.3) - 0.003);
      parts.push(paint(f, face));
    }
    // A little red chart lamp on a gooseneck.
    rod(V(0.15, 0.8, z0 + 0.55), V(0.12, 1.02, z0 + 0.4), 0.01, '#2b2b2b', parts, 4);
    const shade = new THREE.ConeGeometry(0.04, 0.06, 8);
    shade.translate(0.12, 1.02, z0 + 0.38);
    parts.push(paint(shade, '#7a2f26'));
    this.chartTable = V(0.15, 0, 0.6); // where you stand to use it
  }

  // ---------------------------------------------------------------------
  // The saloon
  // ---------------------------------------------------------------------

  #saloon(parts, ceil, box, rod, toHull, solid) {
    const x0 = 0.62;
    const x1 = 2.05;
    const xm = (x0 + x1) / 2;
    for (const s of [-1, 1]) {
      // Settees: a base, a cushion with piping, a backrest against the lining.
      toHull(x0, x1, 0, 0.38, 1.0, s, TEAK);
      box(xm, 0.19, s * 1.0, x1 - x0, 0.3, 0.012, TEAK_LIGHT);
      toHull(x0 + 0.02, x1 - 0.02, 0.38, 0.5, 1.0, s, s < 0 ? NAVY : RED);
      box(xm, 0.5, s * 1.003, x1 - x0 - 0.04, 0.012, 0.012, '#c9b98a');
      const back = (x) => side(x, 0.7) - 0.14;
      for (let x = x0; x < x1 - 0.01; x += (x1 - x0) / 3) {
        const xb = x + (x1 - x0) / 3;
        const zb = Math.min(back(x), back(xb));
        box((x + xb) / 2 - 0.0, 0.72, s * (zb + 0.06), (x1 - x0) / 3 - 0.02, 0.4, 0.14, s < 0 ? NAVY_LIGHT : '#9c5a48');
      }
      solid(x0, x1, 0, 0.62, s > 0 ? 1.0 : -1.98, s > 0 ? 1.98 : -1.0);
      // A bookshelf above, behind a fiddle rail.
      const y = 1.24;
      for (let x = x0 + 0.05; x < x1 - 0.1; x += 0.47) {
        const xb = Math.min(x1 - 0.05, x + 0.47);
        const z = Math.min(side(x, y), side(xb, y)) - 0.12;
        box((x + xb) / 2, y, s * (z + 0.05), xb - x, 0.025, 0.2, TEAK_DARK);
        box((x + xb) / 2, y + 0.07, s * (z - 0.05), xb - x, 0.06, 0.015, TEAK_DARK);
        let bx = x + 0.03;
        let i = Math.floor((x + 7) * 5);
        while (bx < xb - 0.06) {
          const w = 0.035 + ((i * 13) % 5) * 0.008;
          const h = 0.14 + ((i * 7) % 6) * 0.012;
          const lean = (i * 17) % 11 === 0;
          const g = new THREE.BoxGeometry(w, h, 0.15);
          if (lean) g.rotateX(0.25 * s);
          g.translate(bx + w / 2, y + 0.012 + h / 2, s * (z + 0.05));
          parts.push(paint(g, ['#6e3a30', '#3f5446', '#a88a4a', '#3d4b62', '#5e4459', '#7d6a52'][i % 6]));
          bx += w + 0.004;
          i++;
        }
      }
      // Curtains, tied back at the ends of the long window.
      for (const x of [-0.25, 1.52]) {
        if (s > 0 && x < 0.4) continue;
        box(x, 1.04, s * (side(x, 1.04) - 0.04), 0.1, 0.16, 0.02, s < 0 ? '#a8865a' : '#8a6f62');
      }
    }
    // The dinette table to port, built round the mast's foot, with its fiddles.
    const tz0 = -0.05;
    const tz1 = -0.92;
    const tx0 = 0.85;
    const tx1 = 1.85;
    box((tx0 + tx1) / 2, 0.72, (tz0 + tz1) / 2, tx1 - tx0, 0.04, tz0 - tz1, TEAK_LIGHT);
    for (const z of [tz0 - 0.01, tz1 + 0.01]) box((tx0 + tx1) / 2, 0.755, z, tx1 - tx0, 0.03, 0.018, TEAK_DARK);
    for (const x of [tx0 + 0.01, tx1 - 0.01]) box(x, 0.755, (tz0 + tz1) / 2, 0.018, 0.03, tz0 - tz1, TEAK_DARK);
    box((tx0 + tx1) / 2, 0.35, (tz0 + tz1) / 2 - 0.1, 0.12, 0.7, 0.3, TEAK_DARK);
    solid(tx0, tx1, 0, 1.1, tz1 - 0.1, tz0);
    // The mast's foot: a varnished post down through the saloon, with a brass collar.
    const mx = LAYOUT.mast.x;
    rod(V(mx, 0, 0), V(mx, roofUnder(mx) + 0.05, 0), 0.07, '#9a6a3c', parts, 10);
    rod(V(mx, 0.76, 0), V(mx, 0.8, 0), 0.08, BRASS, parts, 10);
    rod(V(mx, roofUnder(mx) - 0.06, 0), V(mx, roofUnder(mx) - 0.02, 0), 0.08, BRASS, parts, 10);
    // A rug down the aisle.
    box((x0 + x1) / 2, 0.006, 0.47, 1.3, 0.012, 0.66, '#7c4a36');
    box((x0 + x1) / 2, 0.008, 0.47, 1.16, 0.012, 0.52, '#9b6a44');
    box((x0 + x1) / 2, 0.01, 0.47, 0.9, 0.012, 0.3, '#7c4a36');
    // The saloon hatch's frame (the glass is separate).
    for (const [dx, dz, sx, sz] of [[0, -0.26, 0.5, 0.04], [0, 0.26, 0.5, 0.04], [-0.24, 0, 0.04, 0.52], [0.24, 0, 0.04, 0.52]]) {
      box(0.875 + dx, roofUnder(0.875) - 0.01, dz, sx, 0.05, sz, TEAK_DARK, ceil);
    }
  }

  // ---------------------------------------------------------------------
  // The forecabin
  // ---------------------------------------------------------------------

  #forecabin(parts, box, rod, toHull, solid) {
    const yb = 0.4; // the berth's base
    const xs = [];
    for (let x = BERTH; x < FWD; x += 0.2) xs.push(x);
    xs.push(FWD);
    const shape = new THREE.Shape();
    shape.moveTo(BERTH, -side(BERTH, 0.05));
    for (const x of xs) shape.lineTo(x, -side(x, 0.05));
    for (const x of [...xs].reverse()) shape.lineTo(x, side(x, 0.05));
    const slab = (y0, depth, color, inset = 0) => {
      const sh = inset
        ? (() => {
            const s2 = new THREE.Shape();
            s2.moveTo(BERTH + inset, -side(BERTH, y0) + inset);
            for (const x of xs) s2.lineTo(Math.min(x, FWD - inset), -side(x, y0) + inset);
            for (const x of [...xs].reverse()) s2.lineTo(Math.min(x, FWD - inset), side(x, y0) - inset);
            return s2;
          })()
        : shape;
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.translate(0, y0 + depth, 0);
      parts.push(paint(g, color));
    };
    slab(0, yb, TEAK);
    slab(yb, 0.12, '#efeadf', 0.03);
    // A quilt over the after half, in squares of old shirts.
    const qs = [[3.0, -0.45], [3.0, 0.0], [3.0, 0.45], [3.32, -0.38], [3.32, 0.05], [3.32, 0.48]];
    const qc = ['#7c8a7a', '#a88a5a', '#6b7a8c', '#9c6a58', '#c2b48c', '#5f6b5a'];
    qs.forEach(([x, z], i) => box(x, yb + 0.13, z, 0.32, 0.03, 0.44, qc[i]));
    for (const z of [-0.28, 0.28]) {
      const pillow = new THREE.SphereGeometry(1, 12, 6);
      pillow.scale(0.17, 0.07, 0.25);
      pillow.translate(4.05, yb + 0.18, z * 0.7);
      parts.push(paint(pillow, '#f6f2e8'));
    }
    box(BERTH + 0.22, yb + 0.16, -0.1, 0.3, 0.07, 0.7, '#8e4a3c'); // a folded blanket
    box(3.6, yb + 0.15, 0.38, 0.16, 0.035, 0.12, '#3f5446'); // a book left open
    solid(BERTH, FWD, 0, 0.62, -1.98, 1.98);
    // The locker under the berth: two drawers with brass pulls.
    for (const z of [0.05, 0.62]) {
      if (Math.abs(z) + 0.24 > side(BERTH, 0.05)) continue;
      box(BERTH - 0.006, 0.2, z, 0.012, 0.26, 0.46, TEAK_LIGHT);
      const pull = new THREE.TorusGeometry(0.025, 0.006, 4, 10);
      pull.rotateY(Math.PI / 2);
      pull.translate(BERTH - 0.02, 0.24, z);
      parts.push(paint(pull, BRASS));
    }
    // Shelves along the hull, and an oilskin on a hook inside the door.
    for (const s of [-1, 1]) {
      const y = 0.92;
      for (const [a, b] of [[2.9, 3.4], [3.4, 3.9]]) {
        const z = Math.min(side(a, y), side(b, y)) - 0.1;
        box((a + b) / 2, y, s * (z + 0.04), b - a, 0.025, 0.14, TEAK_DARK);
      }
    }
    const coat = new THREE.CylinderGeometry(0.12, 0.19, 0.7, 8);
    coat.translate(BH + 0.16, 1.05, -0.3);
    parts.push(paint(coat, '#b8922e'));
    rod(V(BH + 0.06, 1.42, -0.3), V(BH + 0.16, 1.4, -0.3), 0.012, BRASS);
  }

  /** Ned's stove, when he's fitted it: cast iron, with an oven, and a flue up through the side deck. */
  #betterStove() {
    const st = this.stove;
    const sp = [];
    const iron = '#2c2a28';
    const b2 = (cx, cy, cz, sx, sy, sz, color) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(cx, cy, cz);
      sp.push(paint(g, color));
    };
    // It stands proud of the counter, so the oven door shows.
    b2(st.x, 0.46, st.z + 0.03, 0.6, 0.92, 0.66, iron);
    b2(st.x, 0.925, st.z + 0.03, 0.64, 0.018, 0.7, '#1f1e1d');
    b2(st.x, 0.4, st.z + 0.365, 0.42, 0.36, 0.02, '#3a3734'); // oven door
    b2(st.x + 0.13, 0.48, st.z + 0.385, 0.1, 0.025, 0.025, '#b8913f'); // its handle
    b2(st.x, 0.12, st.z + 0.365, 0.5, 0.09, 0.02, '#3a3734'); // ash drawer
    const fx = st.x - 0.18;
    const fz = st.z - 0.2;
    const top = deckUnder(fx) + 0.55;
    sp.push(paint(segment(V(fx, 0.93, fz), V(fx, top, fz), 0.05, 0.05, 8), iron));
    const cap = new THREE.ConeGeometry(0.1, 0.08, 8);
    cap.translate(fx, top + 0.06, fz);
    sp.push(paint(cap, iron));
    for (const dx of [-0.25, 0.25]) b2(st.x + dx, 0.95, st.z + 0.36, 0.03, 0.04, 0.03, '#b8913f'); // rail posts
    sp.push(paint(segment(V(st.x - 0.25, 0.97, st.z + 0.36), V(st.x + 0.25, 0.97, st.z + 0.36), 0.008, 0.008, 4), '#b8913f'));
    this.betterStove = new THREE.Mesh(mergeParts(sp), indoor(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    this.betterStove.visible = false;
    this.betterStove.castShadow = true;
    this.group.add(this.betterStove);
  }

  /** Windows and hatches: daylight (or the dark) outside. */
  #glass() {
    this.portMat = new THREE.MeshBasicMaterial({ color: '#bfe0ec' });
    const panes = [];
    const strip = (pts) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      panes.push(g);
    };
    // Along the hull.
    for (const s of [-1, 1]) {
      for (const [a, b] of this.windows) {
        const n = Math.ceil((b - a) / 0.2);
        for (let i = 0; i < n; i++) {
          const xa = a + ((b - a) * i) / n;
          const xb = a + ((b - a) * (i + 1)) / n;
          const p = (x, y) => [x, y, s * (side(x, y) + 0.005)];
          strip([...p(xa, 0.98), ...p(xb, 0.98), ...p(xb, 1.1), ...p(xa, 0.98), ...p(xb, 1.1), ...p(xa, 1.1)]);
        }
      }
    }
    // In the coachroof sides.
    const roof = [];
    for (const { s, wx, wy } of this.roofWindows) {
      const z = (x, y) => {
        const t = (y - deckUnder(x)) / Math.max(0.01, roofUnder(x) - deckUnder(x));
        return s * (trunk(x) - 0.12 * t + 0.005);
      };
      const n = 6;
      for (let i = 0; i < n; i++) {
        const xa = wx[0] + ((wx[1] - wx[0]) * i) / n;
        const xb = wx[0] + ((wx[1] - wx[0]) * (i + 1)) / n;
        const p = (x, y) => [x, y, z(x, y)];
        roof.push(...p(xa, wy[0]), ...p(xb, wy[0]), ...p(xb, wy[1]), ...p(xa, wy[0]), ...p(xb, wy[1]), ...p(xa, wy[1]));
      }
    }
    // Hatches overhead: the saloon's and the forehatch.
    const hatch = (x, w, y) => [x - w, y, -w, x + w, y, -w, x + w, y, w, x - w, y, -w, x + w, y, w, x - w, y, w];
    roof.push(...hatch(0.875, 0.23, roofUnder(0.875) + 0.05), ...hatch(3.4, 0.25, deckUnder(3.4) + camber(3.4, 0) + 0.02));
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute('position', new THREE.Float32BufferAttribute(roof, 3));
    const hull = new THREE.Mesh(mergeGeo(panes), this.portMat);
    this.portMat.side = THREE.DoubleSide;
    this.roofGlass = new THREE.Mesh(g1, this.portMat);
    this.group.add(hull, this.roofGlass);
  }

  /** Warm lamps: a brass oil lamp over the table, one in the galley, a reading lamp in the forecabin. */
  #lamps() {
    const parts = [];
    const lx = 1.2;
    const lz = -0.5;
    const ly = 1.5;
    parts.push(paint(segment(V(lx, roofUnder(lx) - 0.02, lz), V(lx, ly + 0.14, lz), 0.006, 0.006, 4), BRASS));
    const font = new THREE.CylinderGeometry(0.07, 0.05, 0.08, 12);
    font.translate(lx, ly - 0.1, lz);
    parts.push(paint(font, BRASS));
    const smoke = new THREE.CylinderGeometry(0.05, 0.03, 0.05, 10);
    smoke.translate(lx, ly + 0.14, lz);
    parts.push(paint(smoke, BRASS));
    // The galley lamp, a bulkhead lamp on the lining.
    const gz = -(side(-0.25, 1.4) - 0.08);
    const gb = new THREE.BoxGeometry(0.08, 0.12, 0.06);
    gb.translate(-0.25, 1.38, gz);
    parts.push(paint(gb, BRASS));
    // The reading lamp over the berth.
    const rb = new THREE.CylinderGeometry(0.05, 0.07, 0.06, 10);
    rb.translate(3.35, deckUnder(3.35) - 0.04, 0.45);
    parts.push(paint(rb, BRASS));
    const fit = new THREE.Mesh(mergeParts(parts), indoor(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    this.group.add(fit);
    // The glass of each, which glows once they're lit.
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0' });
    const glow = [
      [new THREE.CylinderGeometry(0.045, 0.06, 0.2, 12), V(lx, ly + 0.02, lz)],
      [new THREE.BoxGeometry(0.05, 0.08, 0.02), V(-0.25, 1.38, gz + 0.03)],
      [new THREE.CylinderGeometry(0.06, 0.06, 0.01, 10), V(3.35, deckUnder(3.35) - 0.075, 0.45)],
    ];
    for (const [g, p] of glow) {
      const m = new THREE.Mesh(g, this.glowMat);
      m.position.copy(p);
      this.group.add(m);
    }
    this.lamps = [[V(lx, ly - 0.05, lz), 2.4], [V(-0.25, 1.3, gz + 0.25), 1.4], [V(3.35, deckUnder(3.35) - 0.2, 0.3), 1.2]].map(([p, i]) => {
      const light = new THREE.PointLight('#ffc98a', i, 5.5, 1.5);
      light.position.copy(p);
      light.userData.base = i;
      this.lightGroup.add(light);
      return light;
    });
  }

  // ---------------------------------------------------------------------

  /** A world position in the cabin's frame. */
  toLocal(p, out = new THREE.Vector3()) {
    return this.group.worldToLocal(out.copy(p));
  }

  /** A cabin position in the world. */
  toWorld(p, out = new THREE.Vector3()) {
    return this.group.localToWorld(out.copy(p));
  }

  /** How far a world position is from a cabin spot, across the floor. */
  dist(p, spot) {
    const l = this.toLocal(p, _l);
    return Math.hypot(l.x - spot.x, l.z - spot.z);
  }

  /** Standing at the galley stove? */
  nearStove(p) {
    return this.inside && this.dist(p, this.stove) < 0.95;
  }

  /** Standing at the chart table? */
  nearChartTable(p) {
    return this.inside && this.dist(p, this.chartTable) < 0.45;
  }

  nearLocker(p) {
    return this.inside && this.dist(p, this.locker) < 0.75;
  }

  /** What the yard's done that shows below (shared/upgrades.js). */
  setUpgrades(list = []) {
    const on = list.includes('stove');
    this.betterStove.visible = on;
    // Its flue comes up through the side deck: mind it.
    if (on && !this.flueBox) {
      const st = this.stove;
      this.flueBox = { ...makeBox({ center: V(st.x - 0.18, deckUnder(st.x) + FLOOR + 0.3, st.z - 0.2), half: V(0.07, 0.3, 0.07) }), body: this.boat.body };
      this.boat.body.boxes.push(this.flueBox);
    }
  }

  /**
   * Each frame. Are you below (by where you're standing, in her frame)? Cut
   * the deck away if so; daylight in the windows; the lamps.
   * night: 0 day … 1 night.
   */
  update(dt, { night, camera, player }) {
    const l = this.toLocal(player.pos, _l);
    const inHull = l.x > AFT - 0.1 && l.x < FWD && Math.abs(l.z) < 2 && l.y > -0.5;
    // In once you're a step down; out once you're back up at the top (a jump
    // down here can't take you that high: the deckhead's in the way).
    if (!this.inside && inHull && l.y < SOLE - 0.08 && l.x > B.x0 + 0.2) this.inside = true;
    else if (this.inside && (!inHull || l.y > 1.45 || (l.x < B.x0 + 0.05 && l.y > SOLE - 0.15))) this.inside = false;
    this.cutK += ((this.inside ? 1 : 0) - this.cutK) * (1 - Math.exp(-dt * 6));
    if (Math.abs(this.cutK - (this.inside ? 1 : 0)) < 0.01) this.cutK = this.inside ? 1 : 0;
    this.boat.setCutaway(this.cutK);
    this.ceiling.visible = this.cutK < 0.5;
    this.roofGlass.visible = this.ceiling.visible;
    // Seen from outside only through the companionway: don't draw it from far off.
    this.group.visible = this.inside || camera.position.distanceTo(this.boat.root.position) < 45;
    this.portMat.color.setRGB(0.78 - 0.68 * night, 0.86 - 0.74 * night, 0.9 - 0.7 * night);
    // The lamps are turned down by day and up after dark.
    for (const lamp of this.lamps) lamp.intensity = lamp.userData.base * (0.45 + 1.1 * night);
    this.glowMat.color.setRGB(0.55 + 0.6 * night, 0.42 + 0.45 * night, 0.25 + 0.3 * night);
  }
}

const _l = new THREE.Vector3();

function mergeGeo(list) {
  return mergeParts(list.map((g) => paint(g, '#ffffff')));
}
