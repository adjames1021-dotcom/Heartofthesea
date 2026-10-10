import * as THREE from 'three';
import { ISLAND_BY_ID, groundAt, toWorld } from '../shared/world.js';
import { VILLAGES, VILLAGERS, routineAt, awake } from '../shared/villages.js';
import { mulberry32 } from '../shared/noise.js';
import { makeBox } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { deepenShadows } from './atmosphere.js';
import { Bear } from './bear.js';
import { rodModel } from './fishing.js';
import { handVillage } from './handvillage.js';
import { NavGrid } from './navgrid.js';
import { WindowLights, Smoke } from './kit.js';

// Villages built by hand (src/handvillage.js). The plain builder below still
// does the slipway, Mags's boat and the fires, and everything's colliders
// stay as they were.
const HAND = new Set(['cove', 'landing', 'strand', 'yard']);

// The villages: huts, docks, drying racks, nets and fires, and the people who
// live there going about their day by the shared clock (shared/villages.js
// says who does what, when).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const mat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const WOOD = '#8c7a62';
const WOOD_DARK = '#66573f';
const WOOD_WET = '#5c4f3c';
const THATCH = '#a68c58';
const THATCH_DARK = '#8a7246';

function box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.rotateZ(rz);
  g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, color);
}

// ---------------------------------------------------------------------------
// Hats: what the villagers wear, sat on the bear's head.
// ---------------------------------------------------------------------------

function hat(kind, tint = null) {
  const parts = [];
  const c = (base) => tint ?? base;
  if (kind === 'souwester') {
    const crown = new THREE.CylinderGeometry(0.22, 0.27, 0.2, 14);
    crown.translate(0, 0.56, -0.02);
    const brim = new THREE.CylinderGeometry(0.44, 0.44, 0.025, 18);
    brim.rotateX(-0.22); // turned down at the back
    brim.translate(0, 0.47, -0.04);
    parts.push(paint(crown, '#e2ad2a'), paint(brim, '#d9a226'));
  } else if (kind === 'beanie') {
    const dome = new THREE.SphereGeometry(0.29, 14, 8, 0, TAU, 0, Math.PI / 2);
    dome.scale(1, 0.8, 1);
    dome.translate(0, 0.44, -0.02);
    const roll = new THREE.TorusGeometry(0.28, 0.045, 6, 18);
    roll.rotateX(Math.PI / 2);
    roll.translate(0, 0.45, -0.02);
    parts.push(paint(dome, c('#3d5a88')), paint(roll, new THREE.Color(c('#33507a')).multiplyScalar(0.85)));
  } else if (kind === 'shawl') {
    // Worn on the shoulders (on the body, not the head).
    const shawl = new THREE.TorusGeometry(0.29, 0.09, 6, 18);
    shawl.rotateX(Math.PI / 2);
    shawl.scale(1, 0.8, 0.92);
    shawl.translate(0, 0.76, 0.02);
    const knot = new THREE.IcosahedronGeometry(0.075, 0);
    knot.translate(0, 0.7, 0.3);
    const tail = new THREE.BoxGeometry(0.1, 0.18, 0.03);
    tail.translate(0.03, 0.58, 0.31);
    const dark = new THREE.Color(c('#a33c32')).multiplyScalar(tint ? 0.85 : 1);
    parts.push(paint(shawl, c('#b8463b')), paint(knot, dark), paint(tail, dark));
  } else if (kind === 'apron') {
    // A leather apron, worn on the body: a bib curved round the front, with
    // a strap round the neck and ties round the middle.
    const prof = [[0.16, 0.2], [0.26, 0.31], [0.42, 0.35], [0.58, 0.33], [0.72, 0.27], [0.81, 0.17]];
    const rAt = (y) => {
      for (let k = 0; k + 1 < prof.length; k++) {
        const [y0, r0] = prof[k];
        const [y1, r1] = prof[k + 1];
        if (y >= y0 && y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
      }
      return 0.2;
    };
    const pos = [];
    const rows = 8;
    const cols = 6;
    const grid = [];
    for (let i = 0; i <= rows; i++) {
      const y = 0.2 + (i / rows) * 0.52;
      const span = 0.7 - 0.25 * (i / rows); // narrower at the bib
      grid.push([]);
      for (let j = 0; j <= cols; j++) {
        const a = -span + (2 * span * j) / cols;
        const r = rAt(y) + 0.018;
        grid[i].push([Math.sin(a) * r, y, Math.cos(a) * r]);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) pos.push(...grid[i][j], ...grid[i][j + 1], ...grid[i + 1][j + 1], ...grid[i][j], ...grid[i + 1][j + 1], ...grid[i + 1][j]);
    }
    const bib = new THREE.BufferGeometry();
    bib.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const strap = new THREE.TorusGeometry(0.15, 0.014, 4, 16);
    strap.rotateX(Math.PI / 2 - 0.35);
    strap.translate(0, 0.79, 0.04);
    const ties = new THREE.TorusGeometry(0.365, 0.014, 4, 24);
    ties.rotateX(Math.PI / 2);
    ties.translate(0, 0.43, 0);
    const pocket = new THREE.BoxGeometry(0.16, 0.1, 0.02);
    pocket.rotateX(-0.08);
    pocket.translate(0, 0.33, 0.355);
    const pencil = new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5);
    pencil.rotateZ(0.25);
    pencil.translate(0.04, 0.4, 0.36);
    const strapC = new THREE.Color(c('#5a3d27')).multiplyScalar(tint ? 0.8 : 1);
    parts.push(paint(bib, c('#6b4a30')), paint(strap, strapC), paint(ties, strapC), paint(pocket, strapC), paint(pencil, '#c9a23a'));
  } else if (kind === 'flatcap') {
    // A flat tweed cap, peak pulled down.
    const crown = new THREE.SphereGeometry(0.27, 14, 6, 0, TAU, 0, Math.PI / 2);
    crown.scale(1, 0.38, 1.05);
    crown.translate(0, 0.5, -0.01);
    const peak = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12, 1, false, -Math.PI / 2, Math.PI);
    peak.rotateX(0.18);
    peak.translate(0, 0.5, 0.17);
    parts.push(paint(crown, c('#6b5a44')), paint(peak, new THREE.Color(c('#6b5a44')).multiplyScalar(0.8)));
  } else if (kind === 'neckerchief') {
    // Knotted round the neck (worn on the body).
    const band = new THREE.TorusGeometry(0.2, 0.045, 5, 16);
    band.rotateX(Math.PI / 2);
    band.translate(0, 0.79, 0.02);
    const knot = new THREE.ConeGeometry(0.07, 0.12, 4);
    knot.rotateX(Math.PI);
    knot.translate(0, 0.72, 0.2);
    parts.push(paint(band, c('#a8322a')), paint(knot, new THREE.Color(c('#a8322a')).multiplyScalar(0.85)));
  } else if (kind === 'cap') {
    const crown = new THREE.CylinderGeometry(0.27, 0.25, 0.13, 16);
    crown.translate(0, 0.54, -0.02);
    const visor = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12, 1, false, -Math.PI / 2, Math.PI);
    visor.translate(0, 0.49, 0.2);
    const badge = new THREE.BoxGeometry(0.06, 0.04, 0.01);
    badge.translate(0, 0.55, 0.255);
    parts.push(paint(crown, '#25304a'), paint(visor, '#1b2132'), paint(badge, '#c9a24a'));
  }
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Set pieces. Each builder works in the island's frame through `w` (local →
// world) and pushes parts and colliders.
// ---------------------------------------------------------------------------

class Builder {
  constructor(isl, world) {
    this.isl = isl;
    this.world = world;
    this.parts = [];
    this.yaw = -isl.rot; // three.js yaw of the island frame
    this.walkBlock = []; // places villagers shouldn't walk that aren't solid (under a stilt hut): world rects
  }

  /** Keep walkers out of a rectangle (island-local centre, size, facing): for routes only. */
  noWalk(lx, lz, w, d, face = 0) {
    const p = this.w(lx, lz);
    this.walkBlock.push({ x: p.x, z: p.z, hx: w / 2 + 0.3, hz: d / 2 + 0.3, yaw: this.yaw - face });
  }

  /** Is a world point inside one of the no-walk rectangles? */
  inNoWalk(x, z) {
    for (const r of this.walkBlock) {
      const dx = x - r.x;
      const dz = z - r.z;
      const c = Math.cos(r.yaw);
      const s = Math.sin(r.yaw);
      const u = dx * c - dz * s;
      const v = dx * s + dz * c;
      if (Math.abs(u) < r.hx && Math.abs(v) < r.hz) return true;
    }
    return false;
  }

  /** Local (lx, lz) → world { x, z }. */
  w(lx, lz) {
    return toWorld(this.isl, lx, lz);
  }

  /** A part built around the origin, turned by `face` (island-local) and moved to (lx, y, lz). */
  put(geo, lx, y, lz, face = 0) {
    const p = this.w(lx, lz);
    geo.rotateY(this.yaw - face);
    geo.translate(p.x, y, p.z);
    this.parts.push(geo);
  }

  /** A solid box in island-local terms. */
  solid(lx, y, lz, w, h, d, face = 0, extra = {}) {
    const p = this.w(lx, lz);
    this.world.addStatic(makeBox({ center: V(p.x, y, p.z), half: V(w / 2, h / 2, d / 2), yaw: -(this.yaw - face), ...extra }));
  }

  hut(h) {
    const [lx, lz] = h.at;
    const f = h.face;
    const W = 3.4;
    const D = 2.8;
    const H = 2.1;
    const y0 = h.floor;
    const c = Math.cos(f);
    const s = Math.sin(f);
    // Local offsets in the hut's own frame (+u toward the door, +v to its left).
    const at = (u, v) => [lx + c * u - s * v, lz + s * u + c * v];
    const piece = (geo, u, y, v) => {
      const [x, z] = at(u, v);
      this.put(geo, x, y, z, f);
    };
    // Floor, on stilts or on a footing of stones.
    piece(box(D + 0.3, 0.16, W + 0.3, WOOD_DARK, 0, 0, 0), 0, y0 - 0.08, 0);
    const [fx, fz] = at(0, 0);
    this.solid(fx, y0 - 0.1, fz, D + 0.3, 0.2, W + 0.3, f);
    this.noWalk(fx, fz, D + 0.3, W + 0.3, f);
    for (const [u, v] of [[-1.3, -1.6], [1.3, -1.6], [-1.3, 1.6], [1.3, 1.6], [0, -1.6], [0, 1.6]]) {
      const [x, z] = at(u, v);
      const p = this.w(x, z);
      const g = Math.min(groundAt(p.x, p.z), y0 - 0.3);
      if (h.stilts) this.put(paint(segment(V(0, g - 0.6, 0), V(0, y0 - 0.1, 0), 0.09, 0.08, 6), WOOD_WET), x, 0, z);
      else this.parts.push(rockAt(this, x, z, 0.45, g));
    }
    // Walls of planks, with a doorway on the +u side.
    const wall = (w2, u, v, alongU) => piece(box(alongU ? w2 : 0.1, H, alongU ? 0.1 : w2, WOOD, 0, 0, 0), u, y0 + H / 2, v);
    wall(D, 0, -W / 2, true);
    wall(D, 0, W / 2, true);
    wall(W, -D / 2, 0, false);
    piece(box(0.1, H, 1.1, WOOD, 0, 0, 0), D / 2, y0 + H / 2, -W / 2 + 0.55);
    piece(box(0.1, H, 1.1, WOOD, 0, 0, 0), D / 2, y0 + H / 2, W / 2 - 0.55);
    piece(box(0.1, 0.4, W, WOOD, 0, 0, 0), D / 2, y0 + H - 0.2, 0);
    for (const [u, v, w2, d2] of [[0, -W / 2, D, 0.2], [0, W / 2, D, 0.2], [-D / 2, 0, 0.2, W], [D / 2, -W / 2 + 0.55, 0.2, 1.1], [D / 2, W / 2 - 0.55, 0.2, 1.1]]) {
      const [x, z] = at(u, v);
      this.solid(x, y0 + H / 2, z, w2, H, d2, f);
    }
    // Dark seams so it reads as boards.
    for (let i = -3; i <= 3; i++) piece(box(0.012, H, 0.02, WOOD_DARK, 0, 0, 0), -D / 2 + 0.06, y0 + H / 2, i * 0.45);
    // A thatched roof, pitched along the hut, hanging well over. A ruin
    // has lost most of one side and some of the other.
    for (const side of [-1, 1]) {
      if (h.ruin && side < 0) {
        const scrap = new THREE.BoxGeometry(D * 0.4, 0.16, W / 2 / Math.cos(0.55) * 0.6);
        scrap.rotateX(side * 0.55);
        piece(paint(scrap, '#7a6a4a'), -D * 0.25, y0 + H + 0.3, side * (W / 4 + 0.3));
        continue;
      }
      const roof = new THREE.BoxGeometry(D + 0.9, 0.16, W / 2 / Math.cos(0.55) + 0.5);
      roof.rotateX(side * 0.55);
      piece(paint(roof, h.ruin ? '#7a6a4a' : side > 0 ? THATCH : THATCH_DARK), 0, y0 + H + 0.42, side * (W / 4 + 0.08));
    }
    if (h.ruin) {
      // Fallen thatch and a broken board on the floor; nobody sleeps here.
      piece(box(1.4, 0.12, 0.9, '#6e5f45', 0, 0, 0, 0, 0.1, 0.06), -0.2, y0 + 0.06, -0.6);
      piece(box(1.6, 0.05, 0.2, WOOD_WET, 0, 0, 0, 0, 0.4, 0.2), 0.3, y0 + 0.1, 0.5);
    } else {
      // Inside: a low bunk with a blanket (two, if two live here).
      piece(box(1.0, 0.3, 2.0, WOOD_DARK, 0, 0, 0), -0.75, y0 + 0.15, 0.4);
      piece(box(0.95, 0.06, 1.7, '#8a5a4a', 0, 0, 0), -0.75, y0 + 0.33, 0.5);
      if (h.beds === 2) {
        piece(box(1.0, 0.3, 2.0, WOOD_DARK, 0, 0, 0), 0.4, y0 + 0.15, 0.4);
        piece(box(0.95, 0.06, 1.7, '#5a6a8a', 0, 0, 0), 0.4, y0 + 0.33, 0.5);
      }
    }
    // Steps (or a ramp) down from the door to the ground.
    const [rx, rz] = at(D / 2 + 2.6, 0);
    const pr = this.w(rx, rz);
    const gy = groundAt(pr.x, pr.z);
    const run = 2.5;
    const rise = y0 - gy;
    const ang = Math.atan2(rise, run);
    const len = Math.hypot(rise, run);
    const [mx, mz] = at(D / 2 + 1.25, 0);
    const ramp = new THREE.BoxGeometry(len, 0.1, 1.0);
    ramp.rotateZ(ang);
    this.put(paint(ramp, WOOD_DARK), mx, (y0 + gy) / 2 - 0.04, mz, f);
    for (let i = 1; i < 5; i++) {
      const [sx, sz] = at(D / 2 + (i / 5) * run, 0);
      this.put(box(0.06, 0.03, 1.0, WOOD_WET, 0, 0, 0), sx, y0 - (i / 5) * rise + 0.02, sz, f);
    }
    this.solid(mx, (y0 + gy) / 2 - 0.06, mz, len, 0.12, 1.0, f, { roll: ang });
  }

  dock(d) {
    const [x0, z0] = d.from;
    const [x1, z1] = d.to;
    const f = Math.atan2(z1 - z0, x1 - x0);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    // Planks across the walkway, with gaps.
    let k = 0;
    for (let u = -len / 2; u < len / 2; u += 0.36) {
      // An old jetty's lost a plank here and there.
      if (d.broken && (k++ % 7 === 3 || k % 11 === 5)) continue;
      const x = mx + Math.cos(f) * u;
      const z = mz + Math.sin(f) * u;
      this.put(box(0.32, 0.08, d.width, (Math.round(u * 10) % 3 ? WOOD : WOOD_DARK), 0, 0, 0), x, d.y - 0.04, z, f);
    }
    for (const side of [-1, 1]) {
      this.put(box(len, 0.16, 0.14, WOOD_WET, 0, 0, 0), mx - Math.sin(f) * side * (d.width / 2 - 0.1), d.y - 0.16, mz + Math.cos(f) * side * (d.width / 2 - 0.1), f);
    }
    for (let u = -len / 2 + 0.5; u <= len / 2; u += 3) {
      for (const side of [-1, 1]) {
        const x = mx + Math.cos(f) * u - Math.sin(f) * side * (d.width / 2 - 0.05);
        const z = mz + Math.sin(f) * u + Math.cos(f) * side * (d.width / 2 - 0.05);
        this.put(paint(segment(V(0, -5, 0), V(0, d.y + 0.25, 0), 0.11, 0.1, 6), WOOD_WET), x, 0, z);
      }
    }
    this.solid(mx, d.y - 0.1, mz, len, 0.2, d.width, f);
  }

  rack(lx, lz, face) {
    const c = Math.cos(face);
    const s = Math.sin(face);
    const parts = [];
    this.solid(lx, groundAt(this.w(lx, lz).x, this.w(lx, lz).z) + 0.95, lz, 0.25, 1.9, 2.8, face);
    for (const v of [-1.3, 1.3]) {
      for (const u of [-0.5, 0.5]) parts.push(paint(segment(V(u, 0, v), V(0, 1.9, v), 0.04, 0.035, 5), WOOD_DARK));
    }
    for (const y of [1.15, 1.75]) parts.push(paint(segment(V(0, y, -1.4), V(0, y, 1.4), 0.03, 0.03, 5), WOOD));
    // Split fish hung over the bars to dry.
    for (const y of [1.15, 1.75]) {
      for (let i = 0; i < 7; i++) {
        const fish = new THREE.ConeGeometry(0.07, 0.42, 4);
        fish.rotateX(Math.PI);
        fish.scale(1, 1, 0.35);
        fish.translate(0, y - 0.22, -1.1 + i * 0.36);
        parts.push(paint(fish, i % 2 ? '#c9b48e' : '#b59f78'));
      }
    }
    const g = mergeParts(parts);
    const p = this.w(lx, lz);
    g.rotateY(this.yaw - face);
    g.translate(p.x, groundAt(p.x, p.z) - 0.05, p.z);
    this.parts.push(g);
    void c;
    void s;
  }

  boat(lx, lz, face, color) {
    const hull = new THREE.SphereGeometry(1, 14, 6, 0, TAU, Math.PI / 2, Math.PI / 2);
    hull.scale(0.62, 0.42, 1.6);
    hull.translate(0, 0.42, 0);
    const parts = [paint(hull, color)];
    const rim = new THREE.TorusGeometry(1, 0.035, 4, 24);
    rim.rotateX(Math.PI / 2);
    rim.scale(0.62, 1, 1.6);
    rim.translate(0, 0.42, 0);
    parts.push(paint(rim, '#e7e2d6'));
    parts.push(box(1.1, 0.05, 0.22, WOOD, 0, 0.32, 0.2), box(0.9, 0.05, 0.2, WOOD, 0, 0.32, -0.7));
    parts.push(paint(segment(V(-0.3, 0.36, -0.9), V(0.25, 0.36, 1.1), 0.025, 0.025, 4), '#a58a63'));
    const g = mergeParts(parts);
    const p = this.w(lx, lz);
    g.rotateZ(0.12); // listing on the sand
    g.rotateY(this.yaw - face);
    g.translate(p.x, groundAt(p.x, p.z) - 0.12, p.z);
    this.parts.push(g);
    this.solid(lx, groundAt(p.x, p.z) + 0.2, lz, 3.2, 0.5, 1.3, face + Math.PI / 2);
  }
}

// ---------------------------------------------------------------------------
// The boatyard: a slipway with a boat in frame on it, the shed, timber and rope.
// ---------------------------------------------------------------------------

const TAR = '#3d3631';
const OAK = '#9a7b55';
const OAK_PALE = '#b39468';
const ROPE = '#b8a275';

/** A part in a frame turned by `face` (island-local) about (lx, lz), at absolute height y. */
function framePut(b, geo, lx, y, lz, face) {
  b.put(geo, lx, y, lz, face);
}

Object.assign(Builder.prototype, {
  /** Ways down the beach into the water, on sleepers, and a boat half built on them. */
  slipway(sl) {
    const [x0, z0] = sl.from;
    const [x1, z1] = sl.to;
    const f = Math.atan2(z1 - z0, x1 - x0);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const p0 = this.w(x0, z0);
    const p1 = this.w(x1, z1);
    const y0 = groundAt(p0.x, p0.z) + 0.16;
    const y1 = groundAt(p1.x, p1.z) + 0.16;
    const drop = Math.atan2(y0 - y1, len);
    const at = (u, v) => [x0 + Math.cos(f) * u - Math.sin(f) * v, z0 + Math.sin(f) * u + Math.cos(f) * v];
    const railY = (u) => y0 + ((y1 - y0) * u) / len;
    // The two ways.
    for (const v of [-sl.width / 2, sl.width / 2]) {
      const g = new THREE.BoxGeometry(len, 0.18, 0.26);
      g.rotateZ(-drop);
      const [mx, mz] = at(len / 2, v);
      framePut(this, paint(g, WOOD_WET), mx, (y0 + y1) / 2, mz, f);
    }
    // Sleepers across, propped up off the sand where it falls away.
    for (let u = 0.6; u < len; u += 1.5) {
      const [mx, mz] = at(u, 0);
      framePut(this, box(0.24, 0.14, sl.width + 0.8, u % 3 < 1.5 ? WOOD_DARK : WOOD_WET, 0, 0, 0), mx, railY(u) - 0.16, mz, f);
      for (const v of [-sl.width / 2, sl.width / 2]) {
        const [bx, bz] = at(u, v);
        const p = this.w(bx, bz);
        const g = groundAt(p.x, p.z);
        if (railY(u) - 0.23 - g > 0.05) this.put(paint(segment(V(0, g - 0.3, 0), V(0, railY(u) - 0.22, 0), 0.1, 0.1, 4), WOOD_WET), bx, 0, bz);
      }
    }
    // The boat in frame: keel, stem and sternpost, ribs, the lower strakes
    // planked, the upper ones not yet. Her bow points down the slip.
    const BL = 8.6; // length on deck
    const D = 1.7; // keel to sheer
    const half = (x) => 1.45 * Math.pow(Math.max(0, 1 - (x / (BL / 2)) ** 2), 0.55) + 0.05;
    const sheer = (x) => D + 0.12 * (x / (BL / 2)) ** 2;
    const section = (x, t) => {
      // t: 0 at the keel → 1 at the sheer, round the bilge.
      const a = t * (Math.PI / 2);
      return [half(x) * Math.pow(Math.sin(a), 0.75), sheer(x) * (1 - Math.pow(Math.cos(a), 0.6))];
    };
    const parts = [];
    parts.push(box(BL - 0.4, 0.22, 0.2, OAK, 0, 0.11, 0));
    // Stem and sternpost.
    parts.push(paint(segment(V(BL / 2 - 0.3, 0.1, 0), V(BL / 2 + 0.15, sheer(BL / 2) + 0.35, 0), 0.1, 0.09, 4), OAK));
    parts.push(paint(segment(V(-BL / 2 + 0.25, 0.1, 0), V(-BL / 2 + 0.05, sheer(-BL / 2) + 0.25, 0), 0.1, 0.09, 4), OAK));
    parts.push(box(0.08, 1.0, 1.7, OAK_PALE, -BL / 2 + 0.12, sheer(-BL / 2) - 0.45, 0));
    // Ribs.
    for (let x = -BL / 2 + 0.6; x <= BL / 2 - 0.5; x += 0.55) {
      for (const side of [-1, 1]) {
        let prev = null;
        for (let k = 0; k <= 6; k++) {
          const [hz, hy] = section(x, k / 6);
          const p = V(x, hy + 0.1, side * hz);
          if (prev) parts.push(paint(segment(prev, p, 0.05, 0.05, 4), OAK_PALE));
          prev = p;
        }
      }
    }
    // Planking up to about two thirds of the way, a strake at a time.
    const strakes = 5;
    for (let k = 0; k < strakes; k++) {
      const ta = k / 8;
      const tb = (k + 1) / 8 - 0.01;
      const pos = [];
      const nx = 14;
      for (let i = 0; i < nx; i++) {
        const xa = -BL / 2 + 0.35 + ((BL - 0.8) * i) / nx;
        const xb = -BL / 2 + 0.35 + ((BL - 0.8) * (i + 1)) / nx;
        for (const side of [-1, 1]) {
          const [za0, ya0] = section(xa, ta);
          const [za1, ya1] = section(xa, tb);
          const [zb0, yb0] = section(xb, ta);
          const [zb1, yb1] = section(xb, tb);
          const A = [xa, ya0 + 0.1, side * (za0 + 0.04)];
          const B = [xb, yb0 + 0.1, side * (zb0 + 0.04)];
          const C = [xb, yb1 + 0.1, side * (zb1 + 0.04)];
          const E = [xa, ya1 + 0.1, side * (za1 + 0.04)];
          // Both faces, so it reads from inside as well as out.
          pos.push(...A, ...B, ...C, ...A, ...C, ...E, ...A, ...C, ...B, ...A, ...E, ...C);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      parts.push(paint(g, k % 2 ? OAK : OAK_PALE));
    }
    // Shores holding her upright, from the sand to her sides.
    const shores = [];
    for (const xs of [-2.4, 0, 2.4]) {
      for (const side of [-1, 1]) {
        const [hz, hy] = section(xs, 0.62);
        shores.push([xs, side, hz, hy]);
      }
    }
    // Put her together, sloping with the slip, sat on a cradle.
    const hullU = len * 0.32;
    const g = mergeParts(parts);
    g.rotateZ(-drop);
    const [hx, hz] = at(hullU, 0);
    framePut(this, g, hx, railY(hullU) + 0.22, hz, f);
    for (const u of [hullU - 3, hullU, hullU + 3]) {
      const [cx, cz] = at(u, 0);
      framePut(this, box(0.35, 0.3, sl.width + 0.3, WOOD_DARK, 0, 0, 0), cx, railY(u) + 0.08, cz, f);
    }
    for (const [xs, side, hz2, hy] of shores) {
      const u = hullU + xs;
      const [tx, tz] = at(u, side * (hz2 + 0.05));
      const top = railY(u) + 0.32 + hy - xs * Math.tan(drop) * 0;
      const [fx, fz] = at(u, side * (hz2 + 1.6));
      const pf = this.w(fx, fz);
      const pt = this.w(tx, tz);
      this.parts.push(paint(segment(V(pf.x, groundAt(pf.x, pf.z) - 0.1, pf.z), V(pt.x, top, pt.z), 0.06, 0.05, 4), WOOD_DARK));
    }
    // You can't walk through her.
    this.solid(hx, railY(hullU) + 1.0, hz, BL, 1.9, 2.9, f, { roll: -drop });
  },

  /** The shed: three walls and an open front, a tarred roof, a bench and a cot. */
  shed(sh) {
    const [lx, lz] = sh.at;
    const W = sh.w; // along z
    const D = sh.d; // along x, open at +x
    const H = 2.5;
    const y0 = sh.floor;
    const put = (geo, x, y, z) => this.put(geo, lx + x, y, lz + z, 0);
    const solid = (x, y, z, w, h, d) => this.solid(lx + x, y, lz + z, w, h, d, 0);
    // Floor on a footing of stones.
    put(box(D, 0.14, W, WOOD_DARK, 0, 0, 0), 0, y0 - 0.07, 0);
    solid(0, y0 - 0.1, 0, D, 0.2, W);
    for (const [x, z] of [[-D / 2 + 0.3, -W / 2 + 0.3], [D / 2 - 0.3, -W / 2 + 0.3], [-D / 2 + 0.3, W / 2 - 0.3], [D / 2 - 0.3, W / 2 - 0.3], [0, -W / 2 + 0.3], [0, W / 2 - 0.3]]) {
      const p = this.w(lx + x, lz + z);
      this.parts.push(rockAt(this, lx + x, lz + z, 0.42, Math.min(groundAt(p.x, p.z), y0 - 0.4)));
    }
    // A step up at the front.
    put(box(0.6, 0.12, 2.4, WOOD_WET, 0, 0, 0), D / 2 + 0.3, y0 - 0.2, 0);
    solid(D / 2 + 0.3, y0 - 0.22, 0, 0.6, 0.16, 2.4);
    // Walls of upright boards: back and both sides.
    put(box(0.1, H, W, WOOD, 0, 0, 0), -D / 2, y0 + H / 2, 0);
    solid(-D / 2, y0 + H / 2, 0, 0.2, H, W);
    for (const side of [-1, 1]) {
      put(box(D, H, 0.1, WOOD, 0, 0, 0), 0, y0 + H / 2, side * W / 2);
      solid(0, y0 + H / 2, side * W / 2, D, H, 0.2);
      for (let x = -D / 2 + 0.4; x < D / 2; x += 0.42) put(box(0.025, H, 0.02, WOOD_DARK, 0, 0, 0), x, y0 + H / 2, side * (W / 2 + 0.055));
    }
    for (let z = -W / 2 + 0.4; z < W / 2; z += 0.42) put(box(0.02, H, 0.025, WOOD_DARK, 0, 0, 0), -D / 2 - 0.055, y0 + H / 2, z);
    // Front posts and a beam over the opening.
    for (const side of [-1, 1]) put(box(0.18, H + 0.1, 0.18, WOOD_DARK, 0, 0, 0), D / 2 - 0.09, y0 + H / 2, side * (W / 2 - 0.09));
    put(box(0.2, 0.22, W, WOOD_DARK, 0, 0, 0), D / 2 - 0.1, y0 + H - 0.1, 0);
    // Gables and the roof, ridge running front to back, tarred.
    const pitch = 0.5;
    const rise = (W / 2) * Math.tan(pitch);
    for (const x of [-D / 2, D / 2 - 0.1]) {
      const gable = new THREE.BufferGeometry();
      gable.setAttribute('position', new THREE.Float32BufferAttribute([0, H, -W / 2, 0, H, W / 2, 0, H + rise, 0, 0, H, W / 2, 0, H, -W / 2, 0, H + rise, 0], 3));
      put(paint(gable, WOOD), x, y0, 0);
    }
    for (const side of [-1, 1]) {
      const roof = new THREE.BoxGeometry(D + 0.9, 0.1, W / 2 / Math.cos(pitch) + 0.45);
      roof.rotateX(side * pitch);
      put(paint(roof, TAR), 0.15, y0 + H + rise / 2 + 0.05, side * (W / 4 + 0.1));
    }
    // The bench along the back, with a vice and tools.
    const bx = -D / 2 + 0.45;
    const bz = -W / 2 + 1.75;
    put(box(0.72, 0.08, 2.5, OAK, 0, 0, 0), bx, y0 + 0.86, bz);
    for (const [dx, dz] of [[-0.28, -1.15], [0.28, -1.15], [-0.28, 1.15], [0.28, 1.15]]) put(box(0.08, 0.86, 0.08, WOOD_DARK, 0, 0, 0), bx + dx, y0 + 0.43, bz + dz);
    put(box(0.6, 0.06, 2.3, WOOD_DARK, 0, 0, 0), bx, y0 + 0.25, bz);
    put(box(0.16, 0.2, 0.3, '#4a4f52', 0, 0, 0), bx + 0.36, y0 + 0.96, bz + 0.9); // vice
    put(box(0.04, 0.02, 0.55, '#8d9295', 0, 0, 0), bx + 0.1, y0 + 0.91, bz - 0.5); // saw blade
    put(box(0.07, 0.1, 0.12, OAK_PALE, 0, 0, 0), bx + 0.1, y0 + 0.94, bz - 0.84); // its handle
    put(paint(segment(V(0, 0, 0), V(0.3, 0, 0.05), 0.018, 0.018, 4), OAK_PALE), bx - 0.15, y0 + 0.92, bz + 0.1); // mallet handle
    put(box(0.12, 0.1, 0.1, '#7a5a3a', 0, 0, 0), bx + 0.17, y0 + 0.93, bz + 0.12); // mallet head
    solid(bx, y0 + 0.45, bz, 0.72, 0.9, 2.5);
    // Tools on the back wall.
    for (let i = 0; i < 4; i++) put(box(0.03, 0.4 + (i % 2) * 0.15, 0.06, i % 2 ? '#6d7275' : OAK_PALE, 0, 0, 0), -D / 2 + 0.08, y0 + 1.6, bz - 0.9 + i * 0.5);
    // The cot in the back corner.
    const cz = W / 2 - 1.15;
    put(box(0.85, 0.3, 1.95, WOOD_DARK, 0, 0, 0), -D / 2 + 0.55, y0 + 0.15, cz);
    put(box(0.8, 0.07, 1.7, '#5f6a5a', 0, 0, 0), -D / 2 + 0.55, y0 + 0.34, cz + 0.1);
    put(box(0.5, 0.1, 0.32, '#d9d2c2', 0, 0, 0), -D / 2 + 0.55, y0 + 0.4, cz - 0.72);
    // A bucket of tar by the door.
    const pail = new THREE.CylinderGeometry(0.2, 0.16, 0.34, 10);
    put(paint(pail, '#3a3532'), D / 2 - 0.5, y0 + 0.17, -W / 2 + 0.5);
  },

  /** Sawn planks stacked to season, sticks between the layers. */
  timber(lx, lz, face) {
    const g = groundAt(this.w(lx, lz).x, this.w(lx, lz).z);
    for (const u of [-1.8, 0, 1.8]) this.put(box(0.16, 0.14, 1.4, WOOD_WET, 0, 0, 0), lx + Math.cos(face) * u, g + 0.07, lz + Math.sin(face) * u, face);
    for (let layer = 0; layer < 4; layer++) {
      const y = g + 0.17 + layer * 0.12;
      for (let k = 0; k < 4; k++) {
        const v = -0.48 + k * 0.32;
        this.put(box(4.4 - (layer % 2) * 0.3, 0.06, 0.28, layer % 2 ? OAK : OAK_PALE, 0, 0, 0), lx - Math.sin(face) * v, y, lz + Math.cos(face) * v, face);
      }
      for (const u of [-1.8, 0, 1.8]) this.put(box(0.05, 0.05, 1.3, WOOD_DARK, 0, 0, 0), lx + Math.cos(face) * u, y + 0.06, lz + Math.sin(face) * u, face);
    }
    this.solid(lx, g + 0.35, lz, 4.4, 0.7, 1.4, face);
  },

  /** Trunks waiting to be sawn. */
  logs(lx, lz, face) {
    const g = groundAt(this.w(lx, lz).x, this.w(lx, lz).z);
    const rows = [[-0.6, 0.22], [0, 0.22], [0.6, 0.22], [-0.3, 0.6], [0.3, 0.6], [0, 0.97]];
    rows.forEach(([v, y], i) => {
      const len = 3.4 + (i % 3) * 0.3;
      const a = V(-len / 2, y, v);
      const b2 = V(len / 2, y, v);
      const geo = segment(a, b2, 0.22, 0.2, 7);
      this.put(paint(geo, i % 2 ? '#6e5a44' : '#7a6650'), lx, g, lz, face);
      const end = new THREE.CircleGeometry(0.2, 7);
      end.rotateY(Math.PI / 2);
      end.translate(len / 2 + 0.01, y, v);
      this.put(paint(end, '#c7ab7f'), lx, g, lz, face);
    });
    this.solid(lx, g + 0.5, lz, 3.6, 1.0, 1.7, face);
  },

  /** A coil of rope on the sand. */
  rope(lx, lz) {
    const p = this.w(lx, lz);
    const g = groundAt(p.x, p.z);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.TorusGeometry(0.3 - i * 0.025, 0.045, 5, 16);
      t.rotateX(Math.PI / 2);
      this.put(paint(t, i % 2 ? ROPE : '#a8916a'), lx, g + 0.05 + i * 0.075, lz);
    }
  },

  /** A crate of trade goods (stack: one on top). */
  crate(lx, lz, face, stack = 0) {
    const g = groundAt(this.w(lx, lz).x, this.w(lx, lz).z);
    const y = g + 0.3 + stack * 0.6;
    this.put(box(0.6, 0.6, 0.6, '#9c8058', 0, 0, 0), lx, y, lz, face);
    for (const [dx, dz] of [[0.31, 0], [-0.31, 0]]) this.put(box(0.02, 0.6, 0.62, '#7a6244', dx, 0, dz), lx, y, lz, face);
    for (const dy of [-0.25, 0.25]) this.put(box(0.62, 0.06, 0.62, '#7a6244', 0, dy, 0), lx, y, lz, face);
    if (!stack) this.solid(lx, g + 0.45, lz, 0.6, 0.9, 0.6, face);
  },

  /** The ropewalk: posts in a line with strands strung along them, and a wheel at one end. */
  ropewalk(rw) {
    const [x0, z0] = rw.from;
    const [x1, z1] = rw.to;
    const f = Math.atan2(z1 - z0, x1 - x0);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const at = (u) => [x0 + Math.cos(f) * u, z0 + Math.sin(f) * u];
    const pts = [];
    for (let u = 0; u <= len + 0.01; u += 4) {
      const [x, z] = at(u);
      const p = this.w(x, z);
      const g = groundAt(p.x, p.z);
      this.put(paint(segment(V(0, g - 0.2, 0), V(0, g + 1.0, 0), 0.05, 0.045, 5), WOOD_DARK), x, 0, z);
      this.put(box(0.08, 0.06, 0.5, WOOD_DARK, 0, 0, 0), x, g + 1.0, z, f);
      pts.push([p.x, g + 1.04, p.z]);
    }
    for (const off of [-0.15, 0, 0.15]) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b2 = pts[i];
        const ox = -Math.sin(-this.yaw + f) * off;
        const oz = Math.cos(-this.yaw + f) * off;
        this.parts.push(paint(segment(V(a[0] + ox, a[1], a[2] + oz), V(b2[0] + ox, b2[1] - 0.04, b2[2] + oz), 0.012, 0.012, 3), ROPE));
      }
    }
    // The spinning wheel at the start of the walk.
    const [wx, wz] = at(-1.2);
    const p = this.w(wx, wz);
    const g = groundAt(p.x, p.z);
    const wheel = new THREE.TorusGeometry(0.45, 0.04, 4, 14);
    this.put(paint(wheel, WOOD), wx, g + 0.75, wz, f + Math.PI / 2);
    this.put(box(0.12, 0.75, 0.5, WOOD_DARK, 0, 0, 0), wx, g + 0.37, wz, f);
  },

  /** A small sailing boat lying to a mooring off the jetty, mast up, sail stowed. */
  sailboat(lx, lz, face) {
    const hull = new THREE.SphereGeometry(1, 14, 6, 0, TAU, Math.PI / 2, Math.PI / 2);
    hull.scale(0.9, 0.55, 2.5);
    hull.translate(0, 0.35, 0);
    const parts = [paint(hull, '#46423c')];
    const rim = new THREE.TorusGeometry(1, 0.04, 4, 24);
    rim.rotateX(Math.PI / 2);
    rim.scale(0.9, 1, 2.5);
    rim.translate(0, 0.35, 0);
    parts.push(paint(rim, '#8a7a5a'));
    parts.push(paint(segment(V(0, 0.2, 0.7), V(0, 4.6, 0.6), 0.05, 0.035, 5), '#8a6a45'));
    parts.push(paint(segment(V(0, 1.05, 0.65), V(0, 1.05, -1.7), 0.035, 0.03, 5), '#8a6a45'));
    // The sail, furled along the boom: dark tan, no lights anywhere.
    parts.push(paint(segment(V(0, 1.15, 0.55), V(0, 1.15, -1.6), 0.11, 0.07, 6), '#7a4a32'));
    const g = mergeParts(parts);
    const p = this.w(lx, lz);
    g.rotateY(this.yaw - face);
    g.translate(p.x, 0.18, p.z);
    this.parts.push(g);
  },

  /** A garden patch: dug rows with something green coming up. */
  garden(gd) {
    const [lx, lz] = gd.at;
    for (let r = 0; r < 4; r++) {
      const x = lx - gd.w / 2 + (r + 0.5) * (gd.w / 4);
      for (let k = 0; k < 6; k++) {
        const z = lz - gd.d / 2 + (k + 0.5) * (gd.d / 6);
        const p = this.w(x, z);
        const g = groundAt(p.x, p.z);
        this.put(box(0.5, 0.12, 0.9, '#5a4632', 0, 0, 0), x, g + 0.03, z, 0);
        const leaf = new THREE.IcosahedronGeometry(0.16 + ((r + k) % 3) * 0.04, 0);
        leaf.scale(1, 0.7, 1);
        this.put(paint(leaf, (r + k) % 2 ? '#5d8a3a' : '#6e9a44'), x, g + 0.2, z, 0);
      }
    }
  },

  /** Trestles with a plank across, half sawn. */
  sawhorse(lx, lz, face) {
    const g = groundAt(this.w(lx, lz).x, this.w(lx, lz).z);
    for (const u of [-0.9, 0.9]) {
      for (const v of [-0.3, 0.3]) this.put(paint(segment(V(u, 0, v), V(u, 0.72, 0), 0.03, 0.03, 4), WOOD_DARK), lx, g, lz, face);
      this.put(box(0.08, 0.06, 0.4, WOOD_DARK, u, 0.72, 0), lx, g, lz, face);
    }
    this.put(box(3.2, 0.06, 0.3, OAK_PALE, 0.3, 0.8, 0), lx, g, lz, face);
    this.put(box(0.6, 0.02, 0.3, '#d8c49c', 1.1, 0.0 + 0.02, 0.6), lx, g, lz, face); // offcut on the sand
  },
});

function rockAt(b, lx, lz, s, y) {
  const g = rock(s, Math.round(lx * 13 + lz * 7), '#8f8a80');
  const p = b.w(lx, lz);
  g.translate(p.x, y + s * 0.35, p.z);
  return g;
}

/** A net hung to dry between two poles. */
export function netMesh(color = '#3f4a46', repeat = [3, 2]) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = -128; i < 256; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.moveTo(i + 128, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  return new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------------------
// The fire: stones, logs, flames that flicker, and warm light after dark.
// ---------------------------------------------------------------------------

class Fire {
  constructor(at, y) {
    this.group = new THREE.Group();
    this.group.position.set(at.x, y, at.z);
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const g = rock(0.2, 600 + i, '#77726a');
      g.translate(Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62);
      parts.push(g);
    }
    for (const a of [0.3, 1.9, 3.6]) parts.push(paint(segment(V(Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45), V(-Math.cos(a) * 0.2, 0.35, -Math.sin(a) * 0.2), 0.07, 0.05, 5), '#4a3524'));
    // A tripod and a pot.
    for (const a of [0.5, 2.6, 4.7]) parts.push(paint(segment(V(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8), V(0, 1.35, 0), 0.03, 0.03, 4), WOOD_DARK));
    const pot = new THREE.SphereGeometry(0.26, 12, 8, 0, TAU, Math.PI / 2.6, Math.PI / 1.6);
    pot.translate(0, 0.86, 0);
    parts.push(paint(pot, '#2e2c2a'));
    parts.push(paint(segment(V(0, 1.35, 0), V(0, 1.08, 0), 0.008, 0.008, 3), '#2e2c2a'));
    const m = new THREE.Mesh(mergeParts(parts), mat);
    m.castShadow = true;
    this.group.add(m);
    // Flames: a few cones, bright enough to bloom.
    this.flames = [0, 1, 2, 3].map((i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.02, 0.6 - i * 0.07, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 2.6 : 3.0, i % 2 ? 1.2 : 1.7, 0.35), transparent: true, opacity: 0.9 }));
      f.position.set((i - 1.5) * 0.08, 0.32, ((i * 37) % 5) * 0.03 - 0.06);
      this.group.add(f);
      return f;
    });
    this.light = new THREE.PointLight('#ff9a4a', 0, 14, 1.6);
    this.light.position.y = 0.8;
    this.group.add(this.light);
  }

  update(t, lit, night) {
    this.lit = lit;
    for (const [i, f] of this.flames.entries()) {
      f.visible = lit;
      const k = 0.8 + 0.25 * Math.sin(t * (9 + i * 3) + i) + 0.1 * Math.sin(t * 23 + i * 2);
      f.scale.set(1, k, 1);
      f.rotation.y = t * (1 + i * 0.3);
    }
    this.light.intensity = lit ? (2.5 + 5 * night) * (0.85 + 0.15 * Math.sin(t * 11)) : 0;
  }
}

// ---------------------------------------------------------------------------
// Villagers.
// ---------------------------------------------------------------------------

class Villager {
  constructor(id, def, village, b) {
    this.id = id;
    this.def = def;
    this.village = village;
    this.b = b;
    this.bear = new Bear(def.look);
    this.bear.root.scale.setScalar(def.size ?? 1);
    if (def.wears) this.bear.wear(hat(def.wears, def.tint), ['shawl', 'apron', 'neckerchief'].includes(def.wears) ? 'body' : 'head');
    this.rod = rodModel();
    this.bear.setRod(false, this.rod);
    this.pos = V();
    this.heading = 0;
    this.path = [];
    this.spot = null;
    this.act = 'idle';
    this.wantsToTalk = false;
    this.waveT = 0;
  }

  /** A spot's world position (and the via waypoints to it). */
  #spotDef(name) {
    return this.def.spots?.[name] ?? this.village.spots[name];
  }

  #pt(p) {
    const w = this.b.w(p[0], p[1]);
    return { x: w.x, z: w.z, y: p.length > 2 ? p[2] : null };
  }

  /** Waypoints from the current spot to a new one, through the village middle. */
  #route(from, to) {
    const out = [];
    const fd = from ? this.#spotDef(from) : null;
    const td = this.#spotDef(to);
    const sameSide = fd && (fd.ground || td.ground);
    // Two places down the same way (both on the dock, say): no need to go
    // back to the middle of the village in between.
    const fv = fd?.via ?? [];
    const tv = td.via ?? [];
    let common = 0;
    while (common < fv.length && common < tv.length && fv[common].join() === tv[common].join()) common++;
    if (fd && !sameSide) {
      for (const p of fv.slice(common).reverse()) out.push(this.#pt(p));
      if (!common) out.push(this.#pt(this.village.hub));
    }
    if (!sameSide) for (const p of tv.slice(common)) out.push(this.#pt(p));
    out.push(this.#pt([...td.at, ...(td.y !== undefined ? [td.y] : [])]));
    if (!this.nav) return out;
    // On the ground, go round whatever's in the way rather than through it.
    const routed = [];
    let prev = { x: this.pos.x, z: this.pos.z, y: this.onGround === false ? this.pos.y : null };
    for (const p of out) {
      if (prev.y === null && p.y === null) for (const m of this.nav.find(prev, p)) routed.push({ x: m.x, z: m.z, y: null });
      routed.push(p);
      prev = p;
    }
    return routed;
  }

  /** Put them straight where their routine says (on loading). */
  place(h) {
    const { spot, act } = routineAt(this.def, h);
    const d = this.#spotDef(spot);
    const p = this.#pt([...d.at, ...(d.y !== undefined ? [d.y] : [])]);
    this.pos.set(p.x, p.y ?? groundAt(p.x, p.z), p.z);
    this.onGround = p.y === null;
    this.seg = null;
    this.spot = spot;
    this.act = act;
    this.path = [];
    this.#faceSpot();
  }

  #faceSpot() {
    const d = this.#spotDef(this.spot);
    if (!d?.face) return;
    const f = this.b.w(d.face[0], d.face[1]);
    this.heading = Math.atan2(f.x - this.pos.x, f.z - this.pos.z);
  }

  update(dt, t, h, player) {
    const { spot, act } = routineAt(this.def, h);
    if (spot !== this.spot) {
      this.path = this.#route(this.spot, spot);
      this.spot = spot;
      this.act = act;
    }
    let mode = 'idle';
    let speed = 0;
    if (this.path.length && !this.listening) {
      // Walk the waypoints. Between two points on the ground, follow it;
      // otherwise (a ramp, the dock) go evenly from one height to the next.
      const p = this.path[0];
      if (!this.seg) this.seg = { x: this.pos.x, z: this.pos.z, y: this.pos.y, ground: this.onGround !== false };
      const dx = p.x - this.pos.x;
      const dz = p.z - this.pos.z;
      const l = Math.hypot(dx, dz);
      const step = 1.25 * dt;
      if (l <= step) {
        this.pos.x = p.x;
        this.pos.z = p.z;
      } else {
        this.pos.x += (dx / l) * step;
        this.pos.z += (dz / l) * step;
        const want = Math.atan2(dx, dz);
        this.heading += Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)) * Math.min(1, dt * 8);
      }
      const total = Math.hypot(p.x - this.seg.x, p.z - this.seg.z) || 1;
      const k = 1 - Math.min(1, Math.hypot(p.x - this.pos.x, p.z - this.pos.z) / total);
      if (this.seg.ground && p.y === null) this.pos.y = groundAt(this.pos.x, this.pos.z);
      else this.pos.y = THREE.MathUtils.lerp(this.seg.y, p.y ?? groundAt(p.x, p.z), k);
      if (l <= step) {
        this.onGround = p.y === null;
        this.path.shift();
        this.seg = null;
        if (!this.path.length) this.#faceSpot();
      }
      mode = 'walk';
      speed = 1.25;
    } else if (this.path.length) {
      mode = 'idle'; // stopped to talk on the way somewhere
    } else {
      mode = this.act === 'away' ? 'idle' : this.act;
    }

    // Someone with something to say turns to you and waves now and then;
    // anyone awake glances at you when you're close.
    let look = null;
    const awakeNow = (awake(this.def, h) && !this.path.length) || this.listening;
    if (player && awakeNow) {
      const dx = player.pos.x - this.pos.x;
      const dz = player.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const toYou = Math.atan2(dx, dz);
      if (this.listening) {
        // Talking with you: face you (or, sat down, just turn the head).
        if (this.act === 'sit') look = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(toYou - this.heading), Math.cos(toYou - this.heading))));
        else this.heading += Math.atan2(Math.sin(toYou - this.heading), Math.cos(toYou - this.heading)) * Math.min(1, dt * 5);
        if (this.act === 'work' || this.act === 'fish') mode = 'idle';
      } else if (this.wantsToTalk && d < 14) {
        this.heading += Math.atan2(Math.sin(toYou - this.heading), Math.cos(toYou - this.heading)) * Math.min(1, dt * 3);
        this.waveT -= dt;
        if (this.waveT < -4.5) this.waveT = 1.6;
        if (this.waveT > 0 && d > 3) mode = 'wave';
      } else if (d < 7) {
        look = Math.atan2(Math.sin(toYou - this.heading), Math.cos(toYou - this.heading));
        if (Math.abs(look) > 1.6) look = null;
      }
      this.talkingTo = d < 2.4;
    }

    const r = this.bear.root;
    r.visible = this.act !== 'away' || this.path.length > 0;
    r.position.copy(this.pos);
    r.rotation.set(0, this.heading, 0);
    if (mode === 'sleep') {
      // Lying on the bunk on one side, along it (bunks run across the hut,
      // so a quarter turn from the way the house faces; head on Ned's pillow).
      const d = this.#spotDef(this.spot);
      const lie = this.b.yaw - (d.lie ?? 0) - Math.PI / 2;
      r.rotation.set(0, lie, Math.PI / 2);
      r.position.y += 0.42;
    }
    this.bear.setRod(mode === 'fish');
    this.bear.update(dt, { mode, speed, t, look, effort: 0 });
  }

  get awake() {
    return this.awakeNow;
  }
}

export class Villages {
  constructor({ scene, world }) {
    this.group = new THREE.Group();
    this.group.name = 'villages';
    scene.add(this.group);
    this.people = [];
    this.fires = [];
    this.hand = []; // hand-built villages: { detail, far, life, hub }
    this.windows = new WindowLights(scene, 5);
    this.chimneys = [];
    for (const [id, v] of Object.entries(VILLAGES)) this.#build(id, v, world);
    this.smoke = new Smoke(scene, this.chimneys.map((c) => c.pos));
  }

  #build(id, v, world) {
    const isl = ISLAND_BY_ID[v.island];
    const b = new Builder(isl, world);
    const rand = mulberry32(id.length * 991);
    if (HAND.has(id)) {
      const hv = handVillage(b, id, v, netMesh);
      this.group.add(hv.detail, hv.far);
      this.windows.add(hv.windows);
      for (const c of hv.chimneys) this.chimneys.push({ pos: c, village: id });
      this.hand.push({ id, ...hv });
    }
    const hand = HAND.has(id);
    const plain = (list) => (hand ? [] : list ?? []);
    for (const h of plain(v.huts)) b.hut(h);
    if (v.dock && !hand) b.dock(v.dock);
    for (const [x, z, f] of plain(v.racks)) b.rack(x, z, f);
    for (const [x, z, f] of plain(v.boats)) b.boat(x, z, f, rand() < 0.5 ? '#3c5a78' : '#8a3a2e');
    if (v.slip) b.slipway(v.slip);
    if (v.shed && !hand) b.shed(v.shed);
    for (const [x, z, f] of plain(v.timber)) b.timber(x, z, f);
    for (const [x, z, f] of plain(v.logs)) b.logs(x, z, f);
    for (const [x, z] of plain(v.rope)) b.rope(x, z);
    if (v.horse && !hand) b.sawhorse(...v.horse);
    for (const [x, z, f, st] of plain(v.crates)) b.crate(x, z, f, st);
    if (v.ropewalk && !hand) b.ropewalk(v.ropewalk);
    if (v.sailboat) b.sailboat(...v.sailboat);
    if (v.garden && !hand) b.garden(v.garden);
    for (const [x, z] of HAND.has(id) ? [] : v.pots ?? []) {
      const pot = new THREE.CylinderGeometry(0.3, 0.32, 0.5, 8, 1, false, 0, Math.PI);
      pot.rotateZ(Math.PI / 2);
      const p = b.w(x, z);
      pot.translate(p.x, groundAt(p.x, p.z) + 0.05, p.z);
      b.parts.push(paint(pot, '#5c4a36'));
    }
    // Logs to sit on round the fire.
    if (v.fire) {
      const fp = b.w(...v.fire);
      const fy = groundAt(fp.x, fp.z);
      for (const s of ['fire1', 'fire2', 'fire3', 'fire4']) {
        const at = v.spots[s]?.at;
        if (!at) continue;
        const sp = b.w(...at);
        const dx = sp.x - fp.x;
        const dz = sp.z - fp.z;
        const l = Math.hypot(dx, dz);
        const ox = sp.x - (dx / l) * 0.45;
        const oz = sp.z - (dz / l) * 0.45;
        const a = Math.atan2(dz, dx) + Math.PI / 2;
        b.parts.push(paint(segment(V(ox - Math.cos(a) * 0.6, groundAt(ox, oz) + 0.16, oz - Math.sin(a) * 0.6), V(ox + Math.cos(a) * 0.6, groundAt(ox, oz) + 0.16, oz + Math.sin(a) * 0.6), 0.17, 0.16, 7), '#6b5440'));
      }
      const fire = new Fire(fp, fy);
      fire.village = id;
      world.addStatic({ type: 'cyl', x: fp.x, z: fp.z, r: 0.75, y0: fy - 0.5, y1: fy + 0.35, noClimb: true });
      this.fires.push(fire);
      this.group.add(fire.group);
    }
    // Nets on poles.
    for (const [x, z, f] of HAND.has(id) ? [] : v.nets ?? []) {
      for (const s of [-1, 1]) {
        const px = x + Math.sin(f) * s * 1.6;
        const pz = z - Math.cos(f) * s * 1.6;
        const p = b.w(px, pz);
        b.parts.push(paint(segment(V(p.x, groundAt(p.x, p.z) - 0.2, p.z), V(p.x, groundAt(p.x, p.z) + 2.3, p.z), 0.05, 0.045, 5), WOOD_DARK));
      }
      const net = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), netMesh());
      const p = b.w(x, z);
      net.position.set(p.x, groundAt(p.x, p.z) + 1.25, p.z);
      net.rotation.y = b.yaw - f + Math.PI / 2;
      this.group.add(net);
    }
    const m = new THREE.Mesh(mergeParts(b.parts), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = `village:${id}`;
    this.group.add(m);

    // Benches where someone sits that isn't by the fire (Silas, at his door).
    const own = Object.values(VILLAGERS).filter((d) => d.village === id).map((d) => d.spots ?? {});
    for (const spots of HAND.has(id) ? [] : [v.spots ?? {}, ...own]) {
      for (const sp of Object.values(spots)) {
        if (!sp.bench) continue;
        const f = Math.atan2(sp.face[1] - sp.at[1], sp.face[0] - sp.at[0]);
        const bx = sp.at[0] - Math.cos(f) * 0.15;
        const bz = sp.at[1] - Math.sin(f) * 0.15;
        const p = b.w(bx, bz);
        const y = groundAt(p.x, p.z);
        b.put(box(0.42, 0.06, 1.5, WOOD, 0, 0, 0), bx, y + 0.36, bz, f);
        for (const v of [-0.6, 0.6]) b.put(box(0.36, 0.36, 0.07, WOOD_DARK, 0, 0, 0), bx, y + 0.17, bz - Math.cos(f) * v, f);
      }
    }
    const mine = [];
    for (const [pid, def] of Object.entries(VILLAGERS)) {
      if (def.village !== id) continue;
      const vil = new Villager(pid, def, v, b);
      this.group.add(vil.bear.root);
      this.people.push(vil);
      mine.push(vil);
    }
    // Where they can walk: everything built is in the world now.
    const pts = [v.hub, ...Object.values(v.spots ?? {}).flatMap((sp) => [sp.at, ...(sp.via ?? [])])];
    for (const vil of mine) for (const sp of Object.values(vil.def.spots ?? {})) pts.push(sp.at, ...(sp.via ?? []));
    const wpts = pts.map((p) => b.w(p[0], p[1]));
    const bounds = {
      x0: Math.min(...wpts.map((p) => p.x)) - 8,
      x1: Math.max(...wpts.map((p) => p.x)) + 8,
      z0: Math.min(...wpts.map((p) => p.z)) - 8,
      z1: Math.max(...wpts.map((p) => p.z)) + 8,
    };
    const grid = new NavGrid(world, bounds, (x, z) => b.inNoWalk(x, z));
    for (const vil of mine) vil.nav = grid;
  }

  /** Put everyone where they should be at this hour (on loading). */
  place(h) {
    for (const p of this.people) p.place(h);
  }

  update(dt, { t, hours, player, night = 0, camera = null, wind = null }) {
    for (const p of this.people) {
      // Nobody's drawn from a long way off.
      const far = camera && p.pos.distanceToSquared(camera.position) > 170 * 170;
      p.bear.root.visible = !far && (p.act !== 'away' || p.path.length > 0);
      if (far) {
        // Out of sight: just be where the day says (no walking about unseen).
        if (routineAt(p.def, hours).spot !== p.spot || p.path.length) p.place(hours);
        p.awakeNow = p.act !== 'away' && p.act !== 'sleep';
        continue;
      }
      p.update(dt, t, hours, player);
      // Awake unless actually lying in bed (or away up the tower): someone
      // walking somewhere, even to bed, will stop and talk.
      p.awakeNow = p.act !== 'away' && !(p.act === 'sleep' && !p.path.length);
    }
    const lit = hours >= 17 || hours < 7.5;
    for (const f of this.fires) f.update(t, lit, night);
    if (!camera) return;
    // Hand-built villages: the full thing near, a plain one far off.
    for (const hv of this.hand) {
      const near = hv.hub.distanceToSquared(camera.position) < 230 * 230;
      hv.detail.visible = near;
      hv.far.visible = !near;
      if (near) for (const l of hv.life) l.update(t, wind);
    }
    // Lamps in the windows from dusk till an hour after bed, and before dawn.
    // (Ben's is lit all night, every night.)
    this.windows.update(t, camera, night, (w) => w.always || (hours >= 17 && hours < w.bed + 1) || hours < 6.5 || (w.bed < 12 && hours < w.bed + 1));
    // Chimneys smoke morning and evening, a thread in the day.
    const cook = hours < 9 || hours > 17 ? 1 : 0.35;
    this.smoke.update(dt, wind, cook, 1 - night, innerHeight);
  }

  /** Someone close enough to talk to (awake or not). */
  nearest(pos, r = 2.4) {
    let best = null;
    let bd = r;
    for (const p of this.people) {
      if (!p.bear.root.visible) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bd && Math.abs(p.pos.y - pos.y) < 2) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
}
