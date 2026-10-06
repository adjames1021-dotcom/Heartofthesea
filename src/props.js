import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hash2 } from '../shared/noise.js';

// Low-poly island props built from primitives. Every builder returns plain
// geometry with a per-vertex colour so a whole island's props can be merged
// into one or two draw calls.

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

/** Colour every vertex of a (non-indexed) geometry and strip attributes merge can't mix. */
export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.normal) g.deleteAttribute('normal');
  return g;
}

/** Merge painted parts and give them flat (per-face) normals. */
export function mergeParts(parts) {
  for (const p of parts) {
    if (p.attributes.normal) p.deleteAttribute('normal');
    if (p.attributes.uv) p.deleteAttribute('uv');
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

/** A cylinder from a to b (Vector3s). */
export function segment(a, b, r0, r1, sides = 5) {
  const dir = _v.subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, sides, 1);
  _q.setFromUnitVectors(UP, dir.normalize());
  _m.compose(_s.copy(a).lerp(b, 0.5), _q, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(_m);
  return geo;
}

function jitter(geo, amount, seed, scale = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // Hash the rounded position so shared corners move together.
    const hx = Math.round(x * 97 * scale);
    const hy = Math.round(y * 97 * scale);
    const hz = Math.round(z * 97 * scale);
    const k = hash2(hx + hz * 7, hy, seed);
    const k2 = hash2(hy + hx * 3, hz, seed + 5);
    const k3 = hash2(hz + hy * 5, hx, seed + 9);
    p.setXYZ(i, x + (k - 0.5) * amount, y + (k2 - 0.5) * amount, z + (k3 - 0.5) * amount);
  }
  return geo;
}

// ---------------------------------------------------------------------------

const PALM = {
  bark: [new THREE.Color('#8a6b48'), new THREE.Color('#77593b')],
  frond: [new THREE.Color('#5f9a3d'), new THREE.Color('#4f8634')],
  nut: new THREE.Color('#6b4a2a'),
};

function frond(top, ang, len, droop, color) {
  const pos = [];
  const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const steps = 6;
  const centre = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const p = top.clone().addScaledVector(dir, len * s);
    p.y += (0.55 * s - droop * s * s) * len * 0.5;
    centre.push(p);
  }
  for (let i = 0; i < steps; i++) {
    const s0 = i / steps;
    const s1 = (i + 1) / steps;
    const w0 = Math.sin(Math.PI * s0) ** 0.7 * len * 0.2 * (i % 2 ? 0.75 : 1);
    const w1 = Math.sin(Math.PI * s1) ** 0.7 * len * 0.2 * (i % 2 ? 1 : 0.75);
    const a0 = centre[i];
    const a1 = centre[i + 1];
    for (const sgn of [-1, 1]) {
      const e0 = a0.clone().addScaledVector(side, sgn * w0);
      e0.y -= w0 * 0.3;
      const e1 = a1.clone().addScaledVector(side, sgn * w1);
      e1.y -= w1 * 0.3;
      pos.push(a0.x, a0.y, a0.z, e0.x, e0.y, e0.z, a1.x, a1.y, a1.z);
      pos.push(e0.x, e0.y, e0.z, e1.x, e1.y, e1.z, a1.x, a1.y, a1.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return paint(g, color);
}

/**
 * A palm: curved, banded trunk and a crown of drooping V-shaped fronds.
 * `split` grows a second trunk from the same base (a landmark on maps).
 * Returns { trunk, crown } geometries (crown is separate so it can sway)
 * and the trunk collider segments.
 */
export function palm({ height = 8, lean = 0.4, split = false, seed = 1 }) {
  const rand = mulberry32(seed);
  const trunkParts = [];
  const colliders = [];
  const trunks = [{ h: height, lean, yaw: rand() * TAU }];
  if (split) trunks.push({ h: height * 0.86, lean: lean + 0.45, yaw: trunks[0].yaw + 2.3 + rand() * 0.5 });
  const crowns = [];
  for (const t of trunks) {
    const off = t.lean * t.h * 0.45;
    const top = new THREE.Vector3(Math.cos(t.yaw) * off, t.h, Math.sin(t.yaw) * off);
    const ctrl = new THREE.Vector3(top.x * 0.05, t.h * 0.55, top.z * 0.05);
    const base = new THREE.Vector3(0, -0.4, 0);
    const segs = 8;
    let prev = base;
    for (let i = 1; i <= segs; i++) {
      const s = i / segs;
      const p = new THREE.Vector3()
        .copy(base).multiplyScalar((1 - s) * (1 - s))
        .addScaledVector(ctrl, 2 * s * (1 - s))
        .addScaledVector(top, s * s);
      const r0 = 0.24 - 0.09 * ((i - 1) / segs);
      const r1 = 0.24 - 0.09 * s;
      trunkParts.push(paint(segment(prev, p, r0, r1, 6), PALM.bark[i % 2]));
      prev = p;
    }
    colliders.push({ a: base.clone(), b: top.clone(), r: 0.26 });
    // Crown geometry is built around its own top so it can sway in place.
    const origin = new THREE.Vector3();
    const crownParts = [];
    const fronds = 8;
    for (let f = 0; f < fronds; f++) {
      const ang = (f / fronds) * TAU + rand() * 0.4;
      crownParts.push(frond(origin, ang, 3.4 + rand() * 1.1, 1.3 + rand() * 0.6, PALM.frond[f % 2]));
    }
    for (let c = 0; c < 3; c++) {
      const nut = new THREE.IcosahedronGeometry(0.17, 0);
      const a = (c / 3) * TAU + rand();
      nut.translate(Math.cos(a) * 0.22, -0.25, Math.sin(a) * 0.22);
      crownParts.push(paint(nut, PALM.nut));
    }
    crowns.push({ top, geometry: mergeParts(crownParts) });
  }
  return { trunk: mergeParts(trunkParts), crowns, colliders };
}

export function shrub(seed, dead = false) {
  const rand = mulberry32(seed);
  const parts = [];
  if (dead) {
    const col = new THREE.Color('#4a3f35');
    for (let i = 0; i < 8; i++) {
      const a = rand() * TAU;
      const tilt = 0.35 + rand() * 0.5;
      const len = 0.7 + rand() * 0.9;
      const tip = new THREE.Vector3(Math.cos(a) * Math.sin(tilt) * len, Math.cos(tilt) * len, Math.sin(a) * Math.sin(tilt) * len);
      parts.push(paint(segment(new THREE.Vector3(0, -0.1, 0), tip, 0.05, 0.02, 4), col));
    }
    return mergeParts(parts);
  }
  const greens = [new THREE.Color('#6f9446'), new THREE.Color('#5f843c'), new THREE.Color('#7da352')];
  const n = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const r = 0.55 + rand() * 0.45;
    const g = new THREE.IcosahedronGeometry(r, 0);
    jitter(g, r * 0.35, seed + i);
    g.scale(1, 0.75, 1);
    const a = rand() * TAU;
    g.translate(Math.cos(a) * 0.5, r * 0.55, Math.sin(a) * 0.5);
    parts.push(paint(g, greens[i % greens.length]));
  }
  return mergeParts(parts);
}

/** A chunky, faceted boulder. */
export function rock(size, seed, color = '#9b958b', squash = 0.75) {
  const rand = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, 1);
  jitter(g, 0.38, seed);
  g.scale(size * (0.9 + rand() * 0.3), size * squash, size * (0.8 + rand() * 0.3));
  g.rotateY(rand() * TAU);
  return paint(g, color);
}

/** A burnt palm stump. */
export function stump(seed) {
  const rand = mulberry32(seed);
  const h = 1.4 + rand() * 1.2;
  const lean = (rand() - 0.5) * 0.4;
  const top = new THREE.Vector3(lean, h, lean * 0.5);
  const g = segment(new THREE.Vector3(0, -0.3, 0), top, 0.25, 0.18, 6);
  jitter(g, 0.08, seed);
  return paint(g, '#3b332c');
}

/**
 * Stacked, slightly offset rock tiers (Gannet Stack's spire, Pell's Bar rock,
 * the piglets). Tier rims are flat, so they read as ledges.
 * tiers: [{ r, y0, y1, ox, oz, taper? }]
 */
export function rockColumn(tiers, seed, colorA = '#a7a196', colorB = '#928c82', sides = 11, { guano = false } = {}) {
  const parts = [];
  const cA = new THREE.Color(colorA);
  const cB = new THREE.Color(colorB);
  const white = new THREE.Color('#e4dfd0');
  const _n = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  tiers.forEach((t, i) => {
    const h = t.y1 - t.y0;
    const g = new THREE.CylinderGeometry(t.r * (t.taper ?? 0.94), t.r * 1.04, h, sides, Math.max(2, Math.round(h / 3.5)), false);
    jitter(g, Math.min(1.1, t.r * 0.14), seed + i * 13, 0.5);
    g.translate(t.ox ?? 0, t.y0 + h / 2, t.oz ?? 0);
    const flat = g.toNonIndexed();
    // Strata: alternate bands of slightly different rock.
    const p = flat.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let f = 0; f < p.count; f += 3) {
      const y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      const band = Math.sin(y * 1.3 + i) > 0.2;
      c.copy(band ? cA : cB).multiplyScalar(0.94 + 0.1 * hash2(f, i, seed));
      if (guano && i > 0) {
        // Seabirds sit on the ledges: white on the rims, streaks just under them.
        _a.fromBufferAttribute(p, f + 1).sub(_n.fromBufferAttribute(p, f));
        _b.fromBufferAttribute(p, f + 2).sub(_n.fromBufferAttribute(p, f));
        const up = _a.cross(_b).normalize().y;
        const underRim = t.y1 - y < 2.2 && hash2(f >> 2, i, seed + 5) > 0.5;
        if (up > 0.45 || underRim) c.lerp(white, up > 0.45 ? 0.85 : 0.6);
      }
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
    flat.deleteAttribute('uv');
    flat.deleteAttribute('normal');
    parts.push(flat);
  });
  return mergeParts(parts);
}
