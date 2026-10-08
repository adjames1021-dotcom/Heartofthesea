import * as THREE from 'three';
import { ISLANDS, islandGrid, worldBake, groundAt, islandNear, surfAt } from '../shared/world.js';
import { hash2, fbm } from '../shared/noise.js';
import { deepenShadows } from './atmosphere.js';

// Flat-shaded island terrain. The triangles are exactly the ones the player
// walks on (shared/world.js → groundAt), split along the same diagonal.

const C = (hex) => new THREE.Color(hex);

const PALETTES = {
  base: {
    sand: C('#ead8a6'), wet: C('#cdb27c'), grass: C('#7cae4e'), grass2: C('#5f9442'), grassLight: C('#9cc35e'),
    dirt: C('#a88a60'), rock: C('#a19b90'), rock2: C('#8a847b'), seabed: C('#cdb98d'),
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
  // Black volcanic sand and dark rock, green on the gentler flanks.
  kettle: {
    sand: C('#4f4a45'), wet: C('#3d3935'), grass: C('#76a04c'), grass2: C('#5c8640'),
    dirt: C('#5e5148'), rock: C('#55504b'), rock2: C('#46423e'), seabed: C('#6e655b'),
  },
  brothers: {
    sand: C('#9c968a'), wet: C('#7d776c'), grass: C('#8b8a62'), grass2: C('#7a7a55'),
    dirt: C('#857b6c'), rock: C('#7f786e'), rock2: C('#6b655c'), seabed: C('#a99b80'),
  },
  head: {
    sand: C('#e2d2a6'), wet: C('#c4ad80'), grass: C('#7aa653'), grass2: C('#5d8c44'),
    dirt: C('#9a8566'), rock: C('#97928a'), rock2: C('#7f7b74'), seabed: C('#c8b78e'),
  },
  green: {
    sand: C('#f1e4bb'), wet: C('#d6c393'), grass: C('#6fae47'), grass2: C('#4f8f3a'), grassLight: C('#8cc357'),
    dirt: C('#9c8257'), rock: C('#a19b90'), rock2: C('#8a847b'), seabed: C('#d8c99f'),
  },
};
for (const p of Object.values(PALETTES)) {
  p.grassLight ??= p.grass.clone().multiplyScalar(1.12);
  p.dry = p.grass.clone().lerp(p.sand, 0.5);
}

const SAND_TOP = { saddle: 2.7, horseshoe: 2.3, bar: 3, reef: 3, stack: 2.0, sow: 1.7, burnt: 2.3, head: 2.0, kettle: 2.0, brothers: 1.6, green: 2.4 };

const SURF_ROCK = [C('#5f5c55'), C('#6b675f'), C('#545a4c')];
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** What the ground is at a spot: grass, dune, scrub, sand, wet, dirt, rock, coral, surf or seabed. */
export function surfaceKind(isl, h, ny, x, z) {
  const sandTop = SAND_TOP[isl.id] ?? 2.4;
  if (isl.id === 'horseshoe' && h > 0.3 && h < 2 && surfAt(x, z)) return 'surf';
  if (h < -0.4) return 'seabed';
  // Reef flats are rough coral rock; only the cay is sand.
  if (isl.id === 'reef' && h < 0.9) return 'coral';
  if (h < 0.6) return ny > 0.75 ? 'wet' : 'rock';
  // Bare rock only on real cliffs; steep hillsides elsewhere are scrub.
  const bareIsle = isl.id === 'stack' || isl.id === 'sow' || isl.id === 'burnt' || isl.id === 'brothers';
  if (ny < (bareIsle ? 0.64 : 0.52)) return 'rock';
  if (h < sandTop) return ny > 0.82 ? 'sand' : 'dirt';
  if (ny < 0.72) return bareIsle ? 'dirt' : 'scrub';
  const patch = fbm(x * 0.025, z * 0.025, 13, 3);
  const bare = isl.id === 'burnt' ? 0.46 : isl.id === 'saddle' || isl.id === 'green' ? 0.17 : 0.26;
  if (patch < bare || (ny < 0.8 && patch < bare + 0.1)) return 'dirt';
  if (h < sandTop + 1.4) return 'dune';
  return 'grass';
}

function classify(isl, pal, h, ny, x, z, out) {
  const kind = surfaceKind(isl, h, ny, x, z);
  const n = fbm(x * 0.06, z * 0.06, 91, 3);
  switch (kind) {
    case 'surf':
      return out.copy(SURF_ROCK[Math.floor(fbm(x * 0.3, z * 0.3, 37, 2) * 3) % 3]);
    case 'seabed':
      return out.copy(pal.seabed);
    case 'coral':
      return out.copy(fbm(x * 0.15, z * 0.15, 3, 2) > 0.5 ? pal.rock : pal.rock2);
    case 'wet':
      return out.copy(pal.wet);
    case 'rock': {
      out.copy(pal.rock).lerp(pal.rock2, fbm(x * 0.08, z * 0.08, 7, 2));
      // A little moss where it isn't too steep (not on the bare islands).
      if (ny > 0.5 && isl.id !== 'burnt' && isl.id !== 'stack' && isl.id !== 'sow') out.lerp(pal.grass2, 0.3 * smooth(0.5, 0.64, ny) * n);
      return out;
    }
    case 'sand':
      return out.copy(pal.sand).lerp(pal.wet, 0.25 * smooth(1.4, 0.6, h));
    case 'dirt':
      return out.copy(pal.dirt).lerp(pal.grass2, 0.25 * n);
    case 'scrub':
      // Heath on the steep slopes: dark greens with a little earth and stone.
      return out.copy(pal.grass2).lerp(pal.dirt, 0.25 + 0.2 * n).lerp(pal.rock2, 0.25 * smooth(0.64, 0.52, ny));
    case 'dune':
      return out.copy(pal.sand).lerp(pal.dry, smooth(SAND_TOP[isl.id] ?? 2.4, (SAND_TOP[isl.id] ?? 2.4) + 1.4, h) * (0.6 + 0.4 * n));
    default: {
      // Grass: soft blends of three greens, drying out up high and on slopes.
      out.copy(pal.grass2).lerp(pal.grass, smooth(0.25, 0.6, n)).lerp(pal.grassLight, smooth(0.6, 0.85, n));
      return out.lerp(pal.dry, Math.min(0.45, 0.35 * smooth(25, 60, h) + 0.6 * smooth(0.86, 0.74, ny)));
    }
  }
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

  // Paint each grid point once (using the smoothed slope there) and let the
  // colours blend across each facet, so edges between grass, sand and rock
  // run soft instead of in a saw-tooth along the triangles.
  const vcol = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const hx = (h[j * nx + Math.min(nx - 1, i + 1)] - h[j * nx + Math.max(0, i - 1)]) / (2 * cell);
      const hz = (h[Math.min(nz - 1, j + 1) * nx + i] - h[Math.max(0, j - 1) * nx + i]) / (2 * cell);
      const ny = 1 / Math.hypot(hx, 1, hz);
      classify(isl, pal, h[k], ny, minX + i * cell, minZ + j * cell, c);
      vcol[3 * k] = c.r;
      vcol[3 * k + 1] = c.g;
      vcol[3 * k + 2] = c.b;
    }
  }

  const tri = (ka, kb, kc, ci, cj) => {
    if (h[ka] < -5 && h[kb] < -5 && h[kc] < -5) return;
    // Hand-painted wobble so big flat areas don't look like one colour.
    const v = 0.95 + 0.08 * hash2(ci * 2 + (h[kc] > h[kb] ? 1 : 0), cj, 77);
    for (const k of [ka, kb, kc]) {
      pos.push(minX + (k % nx) * cell, h[k], minZ + Math.floor(k / nx) * cell);
      col.push(vcol[3 * k] * v, vcol[3 * k + 1] * v, vcol[3 * k + 2] * v);
    }
  };

  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      // Same split as groundAt(): (00, 11, 10) and (00, 01, 11), counter-clockwise from above.
      tri(k, k + nx + 1, k + 1, i, j);
      tri(k, k + nx, k + nx + 1, i, j);
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
