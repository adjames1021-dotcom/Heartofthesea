import * as THREE from 'three';
import { hash2 } from '../shared/noise.js';

/**
 * Loft a hull from stations along its length.
 *
 * Local frame: +x toward the bow, +y up (y = 0 at the waterline), +z to
 * starboard. u runs 0 (bow) → 1 (stern). Each cross-section is a quarter
 * superellipse from the sheer down to the keel line, mirrored for both sides.
 *
 * spec: {
 *   length, u0 = 0, u1 = 1, stations = 24, ring = 8,
 *   halfBreadth(u), sheer(u), keel(u),   // metres
 *   power = 2.5,                          // 2 = round bilge, 4+ = boxy
 *   jag = 0, seed = 1,                    // ragged broken ends (wrecks)
 *   transom = true                        // close the stern if u1 === 1
 * }
 * UVs: u along the length, v = 0 at the sheer → 1 at the keel.
 */
export function loftHull(spec) {
  const {
    length, u0 = 0, u1 = 1, stations = 24, ring = 8,
    halfBreadth, sheer, keel, power = 2.5, jag = 0, seed = 1, transom = true,
  } = spec;
  const e = 2 / power;
  const cols = 2 * ring + 1;
  const pts = [];
  const uvs = [];
  for (let i = 0; i <= stations; i++) {
    const u = u0 + ((u1 - u0) * i) / stations;
    const xBase = length / 2 - u * length;
    const hb = halfBreadth(u);
    const sh = sheer(u);
    const kd = keel(u);
    const ragged = (i === 0 && u0 > 0) || (i === stations && u1 < 1);
    for (let k = 0; k < cols; k++) {
      const t = (k - ring) / ring;
      const side = t < 0 ? -1 : 1;
      const phi = (1 - Math.abs(t)) * (Math.PI / 2);
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const xs = hb * Math.pow(Math.max(c, 0), e);
      const y = sh - (sh + kd) * Math.pow(Math.max(s, 0), e);
      let x = xBase;
      if (ragged && jag > 0) x += (hash2(i, k, seed) - 0.5) * jag;
      pts.push(x, y, side * xs);
      uvs.push(u, (sh - y) / Math.max(sh + kd, 1e-3));
    }
  }
  const idx = [];
  for (let i = 0; i < stations; i++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = i * cols + k;
      const b = (i + 1) * cols + k;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (transom && u1 >= 1) {
    // Fan across the stern.
    const base = pts.length / 3;
    const last = stations * cols;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < cols; k++) {
      cx += pts[(last + k) * 3];
      cy += pts[(last + k) * 3 + 1];
    }
    pts.push(cx / cols, cy / cols, 0);
    uvs.push(1, 0.5);
    for (let k = 0; k < cols - 1; k++) idx.push(base, last + k, last + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/**
 * A flat deck (with a little camber) between the port and starboard sheer
 * lines of a loft. UVs: u along the length, v across (0 port → 1 starboard).
 */
export function loftDeck({ length, u0 = 0, u1 = 1, stations = 24, halfBreadth, sheer, inset = 0, camber = 0.06, lift = 0 }) {
  const pos = [];
  const uv = [];
  const across = 4;
  for (let i = 0; i <= stations; i++) {
    const u = u0 + ((u1 - u0) * i) / stations;
    const x = length / 2 - u * length;
    const hb = Math.max(0, halfBreadth(u) - inset);
    const y = sheer(u) + lift;
    for (let k = 0; k <= across; k++) {
      const t = (k / across) * 2 - 1;
      pos.push(x, y + camber * hb * (1 - t * t), t * hb);
      uv.push(u, k / across);
    }
  }
  const idx = [];
  for (let i = 0; i < stations; i++) {
    for (let k = 0; k < across; k++) {
      const a = i * (across + 1) + k;
      const b = (i + 1) * (across + 1) + k;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Canvas texture helper. draw(ctx, w, h). */
export function canvasTexture(w, h, draw, { repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false; // canvas row 0 = v 0 (the sheer line on hulls)
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}
