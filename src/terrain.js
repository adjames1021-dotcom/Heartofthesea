import * as THREE from 'three';
import { ISLANDS, islandGrid, worldBake, groundAt, islandNear } from '../shared/world.js';
import { hash2, fbm } from '../shared/noise.js';
import { deepenShadows } from './atmosphere.js';

// Flat-shaded island terrain. The triangles are exactly the ones the player
// walks on (shared/world.js → groundAt), split along the same diagonal.

const C = (hex) => new THREE.Color(hex);

const PALETTES = {
  base: {
    sand: C('#e8d5a2'), wet: C('#cdb27c'), grass: C('#7fa552'), grass2: C('#6c9445'),
    dirt: C('#a5835a'), rock: C('#a19b90'), rock2: C('#8a847b'), seabed: C('#cdb98d'),
  },
  stack: {
    sand: C('#a89f8c'), wet: C('#8a8273'), grass: C('#8b8a62'), grass2: C('#7a7a55'),
    dirt: C('#857b6c'), rock: C('#8a8175'), rock2: C('#756d63'), seabed: C('#b3a586'),
  },
  sow: {
    sand: C('#cfc3a6'), wet: C('#a99d84'), grass: C('#8f8a7f'), grass2: C('#86817a'),
    dirt: C('#9b958b'), rock: C('#a49e95'), rock2: C('#8c867e'), seabed: C('#bdae90'),
  },
  burnt: {
    sand: C('#6a6158'), wet: C('#544d46'), grass: C('#857a52'), grass2: C('#6f6446'),
    dirt: C('#4a3d33'), rock: C('#57504a'), rock2: C('#3f3a36'), seabed: C('#7d7262'),
  },
  reef: {
    sand: C('#ecdeb3'), wet: C('#d2c192'), grass: C('#86a654'), grass2: C('#779a49'),
    dirt: C('#b39a74'), rock: C('#a69a86'), rock2: C('#8e8372'), seabed: C('#d6c79c'),
  },
};

const SAND_TOP = { saddle: 2.7, horseshoe: 2.3, bar: 3, reef: 3, stack: 2.0, sow: 1.7, burnt: 2.3 };

function classify(isl, pal, h, ny, x, z, out) {
  const sandTop = SAND_TOP[isl.id] ?? 2.4;
  if (h < -0.4) return out.copy(pal.seabed);
  // Reef flats are rough coral rock; only the cay is sand.
  if (isl.id === 'reef' && h < 0.9) return out.copy(fbm(x * 0.15, z * 0.15, 3, 2) > 0.5 ? pal.rock : pal.rock2);
  if (h < 0.6) return out.copy(ny > 0.75 ? pal.wet : pal.rock2);
  if (ny < 0.64) return out.copy(fbm(x * 0.08, z * 0.08, 7, 2) > 0.5 ? pal.rock : pal.rock2);
  if (h < sandTop) return out.copy(ny > 0.82 ? pal.sand : pal.dirt);
  if (ny < 0.72) return out.copy(pal.dirt);
  const patch = fbm(x * 0.025, z * 0.025, 13, 3);
  const charred = isl.id === 'burnt' ? 0.46 : 0.3;
  if (patch < charred || (ny < 0.8 && patch < charred + 0.12)) return out.copy(pal.dirt);
  return out.copy(patch > 0.55 ? pal.grass : pal.grass2);
}

function paletteFor(isl) {
  return PALETTES[isl.id] ?? PALETTES.base;
}

/** The colour the terrain is painted at (x, z), for things dug into it. */
export function groundColorAt(x, z, out = new THREE.Color()) {
  const isl = islandNear(x, z, 40);
  if (!isl) return out.copy(PALETTES.base.seabed);
  const n = new THREE.Vector3();
  const h = groundAt(x, z, n);
  return classify(isl, paletteFor(isl), h, n.y, x, z, out);
}

function buildIslandMesh(isl, material) {
  const g = islandGrid(isl);
  const pal = paletteFor(isl);
  const { nx, nz, cell, minX, minZ, h } = g;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();

  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, ci, cj) => {
    if (ay < -5 && by < -5 && cy < -5) return;
    a.set(ax, ay, az);
    b.set(bx, by, bz);
    d.set(cx, cy, cz);
    e1.subVectors(b, a);
    e2.subVectors(d, a);
    n.crossVectors(e1, e2).normalize();
    const mx = (ax + bx + cx) / 3;
    const my = (ay + by + cy) / 3;
    const mz = (az + bz + cz) / 3;
    classify(isl, pal, my, n.y, mx, mz, c);
    // Hand-painted wobble so big flat areas don't look like one colour.
    const v = 0.93 + 0.12 * hash2(ci * 2 + (cy > by ? 1 : 0), cj, 77);
    c.multiplyScalar(v);
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  };

  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      const x0 = minX + i * cell;
      const x1 = x0 + cell;
      const z0 = minZ + j * cell;
      const z1 = z0 + cell;
      const h00 = h[k];
      const h10 = h[k + 1];
      const h01 = h[k + nx];
      const h11 = h[k + nx + 1];
      // Same split as groundAt(): (00, 11, 10) and (00, 01, 11), counter-clockwise from above.
      tri(x0, h00, z0, x1, h11, z1, x1, h10, z0, i, j);
      tri(x0, h00, z0, x0, h01, z1, x1, h11, z1, i, j);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `terrain:${isl.id}`;
  return mesh;
}

export function buildTerrain() {
  const material = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const group = new THREE.Group();
  group.name = 'terrain';
  for (const isl of ISLANDS) group.add(buildIslandMesh(isl, material));
  return group;
}

/**
 * The baked seabed + damping grid as an RG half-float texture for the ocean
 * shader. Texel centres match shared/world.js sampling exactly.
 */
export function buildWorldTexture() {
  const b = worldBake();
  const n = b.n;
  const data = new Uint16Array(n * n * 2);
  for (let k = 0; k < n * n; k++) {
    data[2 * k] = THREE.DataUtils.toHalfFloat(b.height[k]);
    data[2 * k + 1] = THREE.DataUtils.toHalfFloat(b.damp[k]);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { texture: tex, rect: new THREE.Vector3(-b.half, -b.half, 2 * b.half) };
}
