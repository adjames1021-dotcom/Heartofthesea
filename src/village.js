import * as THREE from 'three';
import { ISLAND_BY_ID, groundAt, toWorld } from '../shared/world.js';
import { VILLAGES, VILLAGERS, routineAt, awake } from '../shared/villages.js';
import { mulberry32 } from '../shared/noise.js';
import { makeBox } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { deepenShadows } from './atmosphere.js';
import { Bear } from './bear.js';
import { rodModel } from './fishing.js';

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

function hat(kind) {
  const parts = [];
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
    parts.push(paint(dome, '#3d5a88'), paint(roll, '#33507a'));
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
    parts.push(paint(shawl, '#b8463b'), paint(knot, '#a33c32'), paint(tail, '#a33c32'));
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
    // A thatched roof, pitched along the hut, hanging well over.
    for (const side of [-1, 1]) {
      const roof = new THREE.BoxGeometry(D + 0.9, 0.16, W / 2 / Math.cos(0.55) + 0.5);
      roof.rotateX(side * 0.55);
      piece(paint(roof, side > 0 ? THATCH : THATCH_DARK), 0, y0 + H + 0.42, side * (W / 4 + 0.08));
    }
    // Inside: a low bunk with a blanket.
    piece(box(1.0, 0.3, 2.0, WOOD_DARK, 0, 0, 0), -0.75, y0 + 0.15, 0.4);
    piece(box(0.95, 0.06, 1.7, '#8a5a4a', 0, 0, 0), -0.75, y0 + 0.33, 0.5);
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
    for (let u = -len / 2; u < len / 2; u += 0.36) {
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
    if (def.wears) this.bear.wear(hat(def.wears), def.wears === 'shawl' ? 'body' : 'head');
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
    if (fd && !sameSide) {
      for (const p of [...(fd.via ?? [])].reverse()) out.push(this.#pt(p));
      out.push(this.#pt(this.village.hub));
    }
    if (!sameSide) for (const p of td.via ?? []) out.push(this.#pt(p));
    out.push(this.#pt([...td.at, ...(td.y !== undefined ? [td.y] : [])]));
    return out;
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
    if (this.path.length) {
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
    } else {
      mode = this.act === 'away' ? 'idle' : this.act;
    }

    // Someone with something to say turns to you and waves now and then;
    // anyone awake glances at you when you're close.
    let look = null;
    const awakeNow = awake(this.def, h) && !this.path.length;
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
      // Lying on the bunk on one side.
      const d = this.#spotDef(this.spot);
      const lie = this.b.yaw - (d.lie ?? 0);
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
    for (const [id, v] of Object.entries(VILLAGES)) this.#build(id, v, world);
  }

  #build(id, v, world) {
    const isl = ISLAND_BY_ID[v.island];
    const b = new Builder(isl, world);
    const rand = mulberry32(id.length * 991);
    for (const h of v.huts) b.hut(h);
    if (v.dock) b.dock(v.dock);
    for (const [x, z, f] of v.racks ?? []) b.rack(x, z, f);
    for (const [x, z, f] of v.boats ?? []) b.boat(x, z, f, rand() < 0.5 ? '#3c5a78' : '#8a3a2e');
    for (const [x, z] of v.pots ?? []) {
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
      this.fires.push(fire);
      this.group.add(fire.group);
    }
    // Nets on poles.
    for (const [x, z, f] of v.nets ?? []) {
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
    for (const def of Object.values(VILLAGERS)) {
      if (def.village !== id) continue;
      for (const sp of Object.values(def.spots ?? {})) {
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
    for (const [pid, def] of Object.entries(VILLAGERS)) {
      if (def.village !== id) continue;
      const vil = new Villager(pid, def, v, b);
      this.group.add(vil.bear.root);
      this.people.push(vil);
    }
  }

  /** Put everyone where they should be at this hour (on loading). */
  place(h) {
    for (const p of this.people) p.place(h);
  }

  update(dt, { t, hours, player, night = 0 }) {
    for (const p of this.people) {
      p.update(dt, t, hours, player);
      p.awakeNow = awake(p.def, hours) && !p.path.length;
    }
    const lit = hours >= 17 || hours < 7.5;
    for (const f of this.fires) f.update(t, lit, night);
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
