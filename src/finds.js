import * as THREE from 'three';
import { ISLAND_BY_ID, groundAt, toWorld } from '../shared/world.js';
import { makeBox } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { deepenShadows } from './atmosphere.js';

// Things to come across on the islands: a fisherman's hut, a cairn on the
// summit, a burnt-out cottage, an upturned dinghy, the Molly Ann's anchor,
// and small things washed up on the beaches. Each has something to pick up
// or read; what you've found is kept in localStorage and listed on the chart.

const STORE = 'hots.finds';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

const WOOD = '#8c7a62';
const WOOD_DARK = '#6b5b47';
const TAR = '#3f3a35';
const STONE = '#7f786c';
const STONE_DARK = '#6a645a';
const RUST = '#6e4b33';

function box(w, h, d, color, [x, y, z] = [0, 0, 0], yaw = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return paint(g, color);
}

function meshOf(parts, { shadow = true } = {}) {
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Set pieces. Each returns { object, boxes: [{x,y,z, w,h,d}], cyls: [...] } in
// its own frame (+z is the front), and where the find sits.
// ---------------------------------------------------------------------------

function hut() {
  const W = 3.2;
  const D = 2.6;
  const H = 2.1;
  const t = 0.1;
  const parts = [
    box(W + 0.2, 0.18, D + 0.2, WOOD_DARK, [0, 0.09, 0]),
    box(W, H, t, WOOD, [0, H / 2, -D / 2]),
    box(t, H, D, WOOD, [-W / 2, H / 2, 0]),
    box(t, H, D, WOOD, [W / 2, H / 2, 0]),
    // Front wall with a doorway.
    box(1.15, H, t, WOOD, [-W / 2 + 0.575, H / 2, D / 2]),
    box(1.15, H, t, WOOD, [W / 2 - 0.575, H / 2, D / 2]),
    box(0.9, 0.35, t, WOOD, [0, H - 0.175, D / 2]),
    // Gables and a tarred roof.
  ];
  for (const s of [-1, 1]) {
    const gable = new THREE.BufferGeometry();
    const z = (s * D) / 2;
    gable.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, H, z, W / 2, H, z, 0, H + 0.9, z], 3));
    parts.push(paint(gable, WOOD));
    const roof = new THREE.BoxGeometry(W / 2 / Math.cos(0.51) + 0.45, 0.08, D + 0.5);
    roof.rotateZ(-s * 0.51);
    roof.translate((s * W) / 4 + s * 0.05, H + 0.47, 0);
    parts.push(paint(roof, TAR));
  }
  // Planks: dark seams so it reads as boards.
  for (let i = -3; i <= 3; i++) parts.push(box(0.02, H, 0.012, WOOD_DARK, [i * 0.45, H / 2, -D / 2 + 0.056]));
  // Bench by the door, a barrel, a lobster pot.
  parts.push(box(1.4, 0.06, 0.36, WOOD_DARK, [1.0, 0.5, D / 2 + 0.55]));
  for (const x of [0.45, 1.55]) parts.push(box(0.08, 0.47, 0.3, WOOD_DARK, [x, 0.24, D / 2 + 0.55]));
  const barrel = new THREE.CylinderGeometry(0.32, 0.3, 0.85, 10);
  barrel.translate(-W / 2 - 0.45, 0.43, D / 2 - 0.4);
  parts.push(paint(barrel, '#7a5a3a'));
  const pot = new THREE.CylinderGeometry(0.3, 0.3, 0.75, 8, 1, false, 0, Math.PI);
  pot.rotateZ(Math.PI / 2);
  pot.rotateY(Math.PI / 2);
  pot.translate(-1.2, 0.02, D / 2 + 0.9);
  parts.push(paint(pot, '#5c4a36'));
  parts.push(box(0.6, 0.04, 0.75, '#5c4a36', [-1.2, 0.03, D / 2 + 0.9]));
  // Inside: a bunk and a little table.
  parts.push(box(0.8, 0.45, 1.9, WOOD_DARK, [-W / 2 + 0.5, 0.4, -0.25]));
  parts.push(box(0.75, 0.08, 1.8, '#9a8b72', [-W / 2 + 0.5, 0.66, -0.25]));
  parts.push(box(0.6, 0.06, 0.6, WOOD_DARK, [0.9, 0.75, -0.6]));
  parts.push(box(0.06, 0.72, 0.06, WOOD_DARK, [0.9, 0.36, -0.6]));
  const book = box(0.24, 0.05, 0.17, '#6f2a22', [1.25, 0.555, D / 2 + 0.55], 0.3);
  return {
    object: meshOf(parts),
    boxes: [
      [0, H / 2, -D / 2, W, H, t * 2], [-W / 2, H / 2, 0, t * 2, H, D], [W / 2, H / 2, 0, t * 2, H, D],
      [-W / 2 + 0.575, H / 2, D / 2, 1.15, H, t * 2], [W / 2 - 0.575, H / 2, D / 2, 1.15, H, t * 2],
      [1.0, 0.27, D / 2 + 0.55, 1.4, 0.53, 0.36], [-W / 2 + 0.5, 0.35, -0.25, 0.8, 0.7, 1.9],
    ],
    cyls: [[-W / 2 - 0.45, D / 2 - 0.4, 0.33, 0.9]],
    item: { geo: book, at: [1.25, 0.6, D / 2 + 0.55] },
  };
}

function cairn() {
  const parts = [];
  let y = 0;
  const sizes = [0.75, 0.62, 0.5, 0.4, 0.3, 0.22];
  sizes.forEach((s, i) => {
    const g = rock(s, 30 + i);
    g.translate(Math.sin(i * 2.1) * 0.08, y + s * 0.55, Math.cos(i * 1.7) * 0.08);
    parts.push(g);
    y += s * 0.95;
  });
  const tin = box(0.32, 0.14, 0.22, '#5d6660', [0.95, 0.07, 0.2], 0.4);
  return { object: meshOf(parts), boxes: [], cyls: [[0, 0, 0.8, y]], item: { geo: tin, at: [0.95, 0.15, 0.2] } };
}

function ruin() {
  const parts = [];
  const rand = mulberry(7);
  // The chimney stack, still standing: rough courses of stone, sooty at the top.
  for (let i = 0; i < 10; i++) {
    const w = 1.22 - i * 0.025 + (rand() - 0.5) * 0.06;
    parts.push(box(w, 0.47, 0.92 - i * 0.015, i > 7 ? '#4a4540' : rand() < 0.5 ? STONE : STONE_DARK, [(rand() - 0.5) * 0.05, 0.235 + i * 0.46, -2.0]));
  }
  parts.push(box(0.8, 0.45, 0.6, '#3a3631', [0, 4.8, -2.0]));
  parts.push(box(0.75, 1.0, 0.25, '#2b2724', [0, 0.5, -1.56]));
  // Broken walls round the footprint.
  const walls = [
    [0, -2.2, 5.2, 0.4, 1.1], [-2.6, 0, 0.4, 4.4, 0.7], [2.6, -0.6, 0.4, 3.2, 0.9], [-1.4, 2.2, 2.4, 0.4, 0.45], [1.9, 2.2, 1.4, 0.4, 0.3],
  ];
  const boxes = [];
  for (const [x, z, w, d, h] of walls) {
    parts.push(box(w, h, d, rand() < 0.5 ? STONE : STONE_DARK, [x, h / 2, z]));
    boxes.push([x, h / 2, z, w, h, d]);
  }
  // Fallen stones and charred beams.
  for (let i = 0; i < 9; i++) {
    const g = rock(0.18 + rand() * 0.2, 50 + i);
    g.translate((rand() - 0.5) * 6, 0.08, (rand() - 0.5) * 5);
    parts.push(g);
  }
  for (const [x, z, a, l] of [[-0.6, 0.4, 0.4, 3.2], [1.0, -0.2, -0.9, 2.6], [0.3, 1.2, 1.4, 2.0]]) {
    parts.push(paint(segment(V(x - Math.cos(a) * l / 2, 0.1, z - Math.sin(a) * l / 2), V(x + Math.cos(a) * l / 2, 0.14, z + Math.sin(a) * l / 2), 0.1, 0.09, 5), '#2e2925'));
  }
  boxes.push([0, 2.4, -2.0, 1.2, 4.8, 0.9]);
  // The bell, on its side among the stones.
  const bell = bellGeo('#3a332c');
  bell.rotateZ(Math.PI / 2 - 0.2);
  bell.translate(0.9, 0.15, 0.9);
  return { object: meshOf(parts), boxes, cyls: [], item: { geo: bell, at: [0.9, 0.2, 0.9] } };
}

function dinghy() {
  const hull = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  hull.scale(0.68, 0.5, 1.65);
  const keel = box(0.06, 0.06, 3.1, '#3c4a5a', [0, 0.5, 0]);
  const sheer = new THREE.TorusGeometry(1, 0.03, 4, 24);
  sheer.rotateX(Math.PI / 2);
  sheer.scale(0.68, 1, 1.65);
  // Faded blue bottom, a white band at the gunwale.
  const band = new THREE.SphereGeometry(1.01, 14, 2, 0, Math.PI * 2, Math.PI / 2 - 0.22, 0.22);
  band.scale(0.68, 0.5, 1.65);
  const parts = [paint(hull, '#557089'), paint(band, '#e7e2d6'), keel, paint(sheer, '#2f3a46')];
  // Two oars lying alongside.
  for (const [x, a] of [[1.0, 0.08], [1.25, -0.05]]) {
    parts.push(paint(segment(V(x - Math.sin(a) * 1.2, 0.05, -Math.cos(a) * 1.2), V(x + Math.sin(a) * 1.2, 0.05, Math.cos(a) * 1.2), 0.03, 0.03, 5), '#a58a63'));
    const blade = box(0.14, 0.02, 0.5, '#a58a63', [x + Math.sin(a) * 1.35, 0.05, Math.cos(a) * 1.35], a);
    parts.push(blade);
  }
  return { object: meshOf(parts), boxes: [[0, 0.25, 0, 1.36, 0.5, 3.2]], cyls: [], item: null, sink: 0.04 };
}

function anchorPiece() {
  const parts = [];
  // Lying on its side: shank along x, stock standing up, one arm buried.
  parts.push(paint(segment(V(-1.3, 0.16, 0), V(1.1, 0.16, 0), 0.08, 0.1, 6), RUST));
  parts.push(paint(segment(V(-1.2, 0.0, 0), V(-1.2, 1.5, 0), 0.06, 0.05, 6), '#5d4a39'));
  const ring = new THREE.TorusGeometry(0.2, 0.04, 5, 12);
  ring.translate(-1.5, 0.18, 0);
  parts.push(paint(ring, RUST));
  for (const s of [-1, 1]) {
    const tip = V(1.6, 0.16 + s * 0.6, s * 0.15);
    parts.push(paint(segment(V(1.1, 0.16, 0), tip, 0.08, 0.06, 6), RUST));
    const fluke = new THREE.BoxGeometry(0.35, 0.3, 0.06);
    fluke.translate(tip.x - 0.05, tip.y - s * 0.05, tip.z);
    parts.push(paint(fluke, RUST));
  }
  // The name board, half in the sand.
  const board = { geo: null, at: [0.4, 0.12, 1.1] };
  return { object: meshOf(parts), boxes: [[0, 0.3, 0, 2.6, 0.6, 0.4]], cyls: [], item: board, sink: 0.02 };
}

/** A carved board with a name on it, as a texture. */
function nameBoard(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4e3a28';
  ctx.fillRect(0, 0, 512, 96);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(30, 20, 10, ${0.12 + 0.1 * (i % 2)})`;
    ctx.fillRect(0, i * 11, 512, 2);
  }
  ctx.font = '600 58px Spectral, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2a1d12';
  ctx.fillText(text, 258, 52);
  ctx.fillStyle = '#c9a65a';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.36), [
    ...Array(2).fill(new THREE.MeshLambertMaterial({ color: '#4e3a28' })),
    new THREE.MeshLambertMaterial({ map: tex }),
    ...Array(3).fill(new THREE.MeshLambertMaterial({ color: '#4e3a28' })),
  ]);
  m.castShadow = true;
  return m;
}

// Small things.
function bellGeo(color) {
  const bell = new THREE.CylinderGeometry(0.1, 0.17, 0.26, 10, 1, true);
  const crown = new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  crown.translate(0, 0.13, 0);
  const lip = new THREE.TorusGeometry(0.165, 0.014, 4, 14);
  lip.rotateX(Math.PI / 2);
  lip.translate(0, -0.13, 0);
  return mergeParts([paint(bell, color), paint(crown, color), paint(lip, color)]);
}

function bottleGeo() {
  const body = new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8);
  const neck = new THREE.CylinderGeometry(0.022, 0.05, 0.1, 8);
  neck.translate(0, 0.16, 0);
  const cork = new THREE.CylinderGeometry(0.02, 0.02, 0.04, 6);
  cork.translate(0, 0.22, 0);
  const g = mergeParts([paint(body, '#3f7a52'), paint(neck, '#3f7a52'), paint(cork, '#a07a4f')]);
  g.rotateZ(Math.PI / 2 - 0.1);
  g.translate(0, 0.06, 0);
  return g;
}

function leadGeo() {
  const g = new THREE.CylinderGeometry(0.035, 0.06, 0.28, 8);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.06, 0);
  const loop = new THREE.TorusGeometry(0.05, 0.012, 4, 10);
  loop.translate(0.17, 0.06, 0);
  return mergeParts([paint(g, '#6d7277'), paint(loop, '#b49a6e')]);
}

function floatGeo() {
  const ball = new THREE.IcosahedronGeometry(0.18, 1);
  ball.translate(0, 0.17, 0);
  const parts = [paint(ball, '#4f8f6a')];
  for (let i = 0; i < 3; i++) {
    const t = new THREE.TorusGeometry(0.185, 0.008, 3, 16);
    t.rotateY((i * Math.PI) / 3);
    t.translate(0, 0.17, 0);
    parts.push(paint(t, '#7a5d3d'));
  }
  return mergeParts(parts);
}

function shellGeo(kind) {
  if (kind === 'scallop') {
    const g = new THREE.CircleGeometry(0.09, 9, 0, Math.PI);
    g.rotateX(-Math.PI / 2 + 0.2);
    g.translate(0, 0.02, 0);
    return paint(g, '#e3a48a');
  }
  if (kind === 'seaglass') {
    const g = new THREE.IcosahedronGeometry(0.035, 0);
    g.scale(1.3, 0.45, 1);
    g.translate(0, 0.015, 0);
    return paint(g, '#9fd2d6');
  }
  const g = new THREE.IcosahedronGeometry(0.05, 1);
  g.scale(1, 0.6, 1.4);
  g.translate(0, 0.025, 0);
  return paint(g, '#efe2c8');
}

/** How a find looks on the shelf aboard once you have it. */
export function keepsake(id) {
  const m = (geo) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  };
  switch (id) {
    case 'bottle':
      return m(bottleGeo());
    case 'lead':
      return m(leadGeo());
    case 'float':
      return m(floatGeo());
    case 'cowrie':
    case 'seaglass':
    case 'scallop':
      return m(shellGeo(id));
    case 'bell': {
      const g = bellGeo('#4a4036');
      g.translate(0, -0.2, 0);
      const parts = [g, box(0.05, 0.05, 0.3, '#6a4426', [0, 0.02, -0.12]), paint(segment(V(0, 0.02, 0), V(0, -0.07, 0), 0.008, 0.008, 4), '#333333')];
      return m(mergeParts(parts));
    }
    case 'spyglass': {
      const parts = [];
      let x = 0;
      for (const [r, l] of [[0.035, 0.22], [0.03, 0.16], [0.026, 0.12]]) {
        parts.push(paint(segment(V(x, 0.035, 0), V(x + l, 0.035, 0), r, r, 10), '#b8913f'));
        x += l - 0.01;
      }
      return m(mergeParts(parts));
    }
    case 'pipe': {
      const bowl = new THREE.CylinderGeometry(0.025, 0.02, 0.05, 8);
      bowl.translate(0, 0.03, 0);
      const tin = box(0.1, 0.03, 0.07, '#7a6a3a', [0.12, 0.015, 0.06]);
      return m(mergeParts([paint(bowl, '#e8e0cf'), paint(segment(V(0, 0.015, 0), V(-0.16, 0.025, 0.02), 0.007, 0.006, 5), '#e8e0cf'), tin]));
    }
    case 'log':
      return m(box(0.24, 0.05, 0.17, '#6f2a22', [0, 0.025, 0]));
    case 'nameboard': {
      const b = nameBoard('MOLLY ANN');
      b.rotation.x = Math.PI / 2;
      b.scale.setScalar(0.8);
      return b;
    }
  }
  return null;
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// What's where. Island-local positions; yaw turns the piece's front.
// ---------------------------------------------------------------------------

export const PLACES = [
  {
    id: 'log', island: 'saddle', at: [-44, 180], yaw: 2.6, piece: hut, clear: 5,
    name: "The Kittiwake's log", label: 'Read the logbook', look: true,
    text: "The Kittiwake's log. Last entry: 'Wind backing west. Taking her round to the Horseshoe for the night.'",
  },
  {
    id: 'spyglass', island: 'saddle', at: [-74, -41], yaw: 0.8, piece: cairn, clear: 3,
    name: 'A brass spyglass', label: 'Open the tin box',
    text: "A brass spyglass, wrapped in oilcloth. Scratched on the tin: 'Watched the Molly Ann go onto the reef from here.'",
  },
  {
    id: 'bell', island: 'burnt', at: [-50, 35], yaw: 0.3, piece: ruin, clear: 5,
    name: "The Kittiwake's bell", label: 'Pick up the bell',
    text: "A ship's bell, black from the fire. KITTIWAKE is cast into it.",
  },
  {
    id: 'pipe', island: 'horseshoe', at: [-79, -10], yaw: 1.2, piece: dinghy, clear: 3, reach: 2.2,
    name: 'A clay pipe and a tobacco tin', label: 'Look under the boat',
    text: 'Under the boat: a clay pipe and a tin of tobacco, still dry.',
  },
  {
    id: 'nameboard', island: 'reef', at: [-45, 16], yaw: -0.4, piece: anchorPiece, clear: 3, look: true,
    name: "The Molly Ann's name board", label: 'Look at the board',
    text: 'A carved name board, half buried in the sand. MOLLY ANN, BRISTOL.',
  },
  { id: 'bottle', island: 'bar', at: [72, -4], small: bottleGeo, name: 'A message in a bottle', label: 'Pick up the bottle', text: "A note in a bottle: 'Kettle's on at the hut on Saddle. Help yourself to biscuits.'" },
  { id: 'lead', island: 'stack', at: [-30, 16], small: leadGeo, name: 'A sounding lead', label: 'Pick up the lead weight', text: "A sounding lead. There's still sand stuck in the tallow." },
  { id: 'float', island: 'sow', at: [-13, 44], small: floatGeo, name: 'A glass fishing float', label: 'Pick up the glass float', text: 'A green glass fishing float, still in its net.' },
  { id: 'cowrie', island: 'saddle', at: [12, 172], small: () => shellGeo('cowrie'), name: 'A cowrie shell', label: 'Pick up the shell', text: 'A cowrie shell.' },
  { id: 'seaglass', island: 'burnt', at: [-52, 80], small: () => shellGeo('seaglass'), name: 'A piece of sea glass', label: 'Pick up the sea glass', text: 'A piece of blue sea glass, worn smooth.' },
  { id: 'scallop', island: 'horseshoe', at: [-76, -31], small: () => shellGeo('scallop'), name: 'A scallop shell', label: 'Pick up the shell', text: 'A scallop shell.' },
];

/** Where a place is in the world, nudged inland until it's on dry ground. */
function placeAt(p) {
  const isl = ISLAND_BY_ID[p.island];
  let [lx, lz] = p.at;
  for (let i = 0; i < 40; i++) {
    const w = toWorld(isl, lx, lz);
    if (groundAt(w.x, w.z) > 0.55) return { x: w.x, z: w.z, yaw: -(isl.rot + (p.yaw ?? 0)) };
    const l = Math.hypot(lx, lz) || 1;
    lx -= lx / l;
    lz -= lz / l;
  }
  const w = toWorld(isl, lx, lz);
  return { x: w.x, z: w.z, yaw: 0 };
}

/** Patches the grass and trees should leave alone. */
export function clearings() {
  return PLACES.filter((p) => p.clear).map((p) => ({ ...placeAt(p), r: p.clear + 3 }));
}

export class Finds {
  constructor({ scene, world, hud }) {
    this.hud = hud;
    this.found = this.#load();
    this.items = [];
    this.group = new THREE.Group();
    this.group.name = 'finds';
    scene.add(this.group);
    for (const p of PLACES) this.#build(p, world);
  }

  #load() {
    try {
      const a = JSON.parse(localStorage.getItem(STORE) ?? '[]');
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }

  #save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.found));
    } catch {
      // private mode
    }
  }

  #build(p, world) {
    const { x, z, yaw } = placeAt(p);
    const y = groundAt(x, z);
    const frame = new THREE.Object3D();
    frame.position.set(x, y, z);
    frame.rotation.y = yaw;
    frame.updateMatrixWorld();
    const local = (lx, ly, lz) => V(lx, ly, lz).applyMatrix4(frame.matrixWorld);
    let item = null;
    let at = V(x, y, z);
    if (p.piece) {
      const piece = p.piece();
      // Sink it a little so it sits in the ground on a slope.
      const obj = piece.object;
      const sink = piece.sink ?? 0.12;
      obj.position.set(x, y - sink, z);
      obj.rotation.y = yaw;
      this.group.add(obj);
      for (const [bx, by, bz, w, h, d] of piece.boxes) {
        const c = local(bx, by - sink, bz);
        world.addStatic(makeBox({ center: c, half: V(w / 2, h / 2, d / 2), yaw: -yaw })); // makeBox's yaw is the mirror of rotation.y
      }
      for (const [cx, cz, r, h] of piece.cyls) {
        const c = local(cx, 0, cz);
        world.addStatic({ type: 'cyl', x: c.x, z: c.z, r, y0: y - 1, y1: y + h });
      }
      if (piece.item) {
        at = local(...piece.item.at);
        if (piece.item.geo) {
          item = new THREE.Mesh(piece.item.geo, mat);
          item.castShadow = true;
          item.position.set(x, y - sink, z);
          item.rotation.y = yaw;
        } else if (p.id === 'nameboard') {
          item = nameBoard('MOLLY ANN');
          item.position.copy(at);
          item.position.y = groundAt(at.x, at.z) + 0.08;
          item.rotation.set(0.25, yaw + 0.3, 0.05);
        }
      }
    } else {
      item = new THREE.Mesh(p.small(), mat);
      item.castShadow = true;
      item.position.set(x, y, z);
      item.rotation.y = yaw + 1.1;
      at = V(x, y + 0.1, z);
    }
    if (item) this.group.add(item);
    const got = this.found.includes(p.id);
    // Things you take are gone once you have them; things you read stay.
    if (item && got && !p.look) item.visible = false;
    this.items.push({ place: p, at, item, reach: p.reach ?? 1.6 });
  }

  /** Something within reach that you haven't found yet (or can read again). */
  near(pos) {
    let best = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const got = this.found.includes(it.place.id);
      if (got && !it.place.look) continue;
      const d = Math.hypot(it.at.x - pos.x, it.at.z - pos.z);
      if (d < it.reach && Math.abs(it.at.y - pos.y) < 2 && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  take(it) {
    const p = it.place;
    if (!this.found.includes(p.id)) {
      this.found.push(p.id);
      this.#save();
    }
    if (it.item && !p.look) it.item.visible = false;
    this.hud.say(p.text, Math.min(9, 3 + p.text.length / 22));
  }

  /** For the chart: what you've found, in the order you found it. */
  summary() {
    const names = this.found.map((id) => PLACES.find((p) => p.id === id)?.name).filter(Boolean);
    return { count: names.length, total: PLACES.length, names };
  }
}
