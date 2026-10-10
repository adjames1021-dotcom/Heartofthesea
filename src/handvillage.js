import * as THREE from 'three';
import { groundAt } from '../shared/world.js';
import { VILLAGERS } from '../shared/villages.js';
import { mulberry32 } from '../shared/noise.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { Kit, Instances, SHAPES, PALETTES, kitMat, signBoard, cat, gull, laundry } from './kit.js';
import { stall, marketTable, handcart, derrick, bollards, ropewalk, garden, overgrowth, shed, timber, logs, sawhorse, steambox, capstan, bench, kitchen } from './handpieces.js';
import { groundColorAt } from './terrain.js';

// Villages built by hand (src/kit.js): every hut its own, nothing square,
// weathered, and the clutter of what the place does. Same footprints, doors,
// floors and beds as before, so everyone's day and every quest still works.
//
// handVillage() builds one village; it gives back the detailed version and a
// plain one for when you're far off, plus windows, chimneys and the bits
// that move (gulls, a cat, washing).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** What each hand-built village has lying about (island-local positions). */
const DRESS = {
  cove: {
    gutting: [-40.7, 14.6, 0.05],
    pots: [[-41.6, 34.6], [-42.4, 35.3], [-41.9, 35.6, 1], [-40.8, 35.2], [-42.9, 34.4]],
    crates: [[-40.6, 20.7, 0.2], [-41.5, 21.4, 0.9], [-41.0, 21.0, 0.4, 1], [-39.9, 21.5, -0.3]],
    barrels: [[-42.3, 20.4], [-42.8, 21.2]],
    laundry: { from: [-29.3, 32.3], fromY: 4.4, to: [-25.4, 34.6], pole: true, colors: ['#8a8072', '#6f7d86', '#a49a86', '#7a5e52'] },
    cat: { hut: 'tam', along: 0.4 },
    gulls: [['dock', 0.92], ['dock', 0.8], ['ridge', 'oda', 0.3], ['rack', 0], ['at', -30.22, 18.7, 2.3]],
    signs: [{ kind: 'fish', at: [-38.0, 16.3], face: -0.7, post: true }, { kind: 'barrel', hut: 'gwen' }],
    chair: [-29.4, 27.0, 0.6],
    // Kitto's: the lean-to off the side of Jenefer's shack (the shack's wall is
    // `wall` behind the counter), her fire, the board for what's on.
    kitchens: { kitto: { at: [-29.6, 20.1], face: Math.PI, wall: 2.1, span: [-1.4, 1.8], counter: [-1.0, 1.25], floor: 2.9, grill: [-28.6, 22.25], board: [-30.4, 17.3, -2.72], owner: 'jenefer' } },
    // Gwen's slab, out on the sand toward the dock.
    stalls: { gwen: { kind: 'slab', at: [-34.6, 10.4], face: 1.96, len: 2.6, depth: 0.95, places: 9, hooks: 4, baskets: 3 } },
    oars: { hut: 'oda' },
    floats: { hut: 'oda' },
    netPile: [-42.6, -0.9],
    tarring: [-30.6, 13.4, 0.4],
    chimneys: ['oda', 'gwen'],
    paths: [
      [[-36.5, 15], [-38.5, 18]],
      [[-36.5, 15], [-39.5, 9], [-42.6, 4]],
      [[-36.5, 15], [-39, 24], [-41.6, 31]],
      [[-36.5, 15], [-34.7, 20.6], [-31, 26.6]],
      [[-36.5, 15], [-33.6, 18.1], [-30.6, 19.8]],
      [[-36.5, 15], [-39, 6], [-40, -1.8]],
    ],
    walls: { oda: 'boards', tam: 'planks', gwen: 'boards', kitto: 'planks' },
    patches: { oda: 'sail', tam: 'boards', gwen: 'sail', kitto: 'boards' },
  },
  // The Landing: every house its own faded colour, Hester's stall under an
  // old sail out front of the store, goods about, a derrick on the quay.
  landing: {
    paint: { store: ['#6a7a82', '#64737b'], jory: ['#86604f', '#7e5a4a'], abel: ['#9a8a5a', '#918254'], martha: ['#74846e', '#6d7c67'] },
    walls: { store: 'planks', jory: 'boards', abel: 'planks', martha: 'boards' },
    patches: { store: 'boards', jory: 'sail', abel: 'sail', martha: 'boards' },
    chimneys: ['store', 'abel', 'martha'],
    stalls: { hester: { kind: 'awning', at: [-55.4, -15.0], face: Math.PI, len: 4.2, depth: 3.4, counter: 0.1 } },
    crates: [[-56.6, -11.5, 0.2], [-57.4, -10.9, 0.7], [-56.8, -11.3, 0.4, 1], [-57.7, -11.9, -0.3], [-69.4, 2.95, 0.1, 0, 1.6], [-70.1, 3.0, 0.5, 0, 1.6], [-69.7, 2.95, 0.3, 1, 1.6]],
    barrels: [[-58.1, -12.6], [-58.6, -11.8], [-72.2, 0.98, 1.6], [-72.8, 1.0, 1.6]],
    sacks: [[-57.9, -13.6], [-58.4, -14.1], [-57.7, -14.5], [-58.6, -13.0]],
    handcart: [-59.6, -7.6, 0.5],
    derrick: { at: [-67.6, 3.05], y: 1.6, face: Math.PI / 2 },
    bollards: [[-70.6, 0.85], [-75.6, 3.15], [-80.6, 0.85], [-87.2, 3.15]],
    bollardY: 1.6,
    ropewalk: true,
    signs: [{ kind: 'scales', at: [-57.9, -12.4], face: Math.PI + 0.4 }, { kind: 'rope', at: [-51.8, 38.4], face: Math.PI + 0.3 }],
    laundry: { from: [-47.4, 22.0], fromY: 5.25, to: [-44.6, 26.2], pole: true, colors: ['#8a5a48', '#c2b392', '#5f7a8a', '#a08a4a', '#7d8a5c'] },
    cat: { hut: 'store', along: 0.65 },
    gulls: [['dock', 0.95], ['dock', 0.55], ['ridge', 'jory', 0.4]],
    paths: [
      [[-55, 3], [-54.5, -6], [-53.9, -12]],
      [[-54.5, -6], [-55.9, -24]],
      [[-55, 3], [-52.5, 12], [-51.9, 20]],
      [[-52.5, 12], [-50.5, 27], [-49.9, 34], [-50, 37]],
      [[-55, 3], [-63.6, 2]],
      [[-55, 3], [-30, 0], [-6, -4]],
      [[-54.5, -6], [-56.2, -12.4]],
    ],
  },
  // Kettle Strand: most of it empty and falling in, the island growing back
  // over it. Ben's lamp in his window all night, for his son.
  strand: {
    paint: { mags: ['#7a6458', '#715d52'], ben: ['#6b6f75', '#646870'] },
    walls: { mags: 'planks', ben: 'boards', ruin1: 'boards', ruin2: 'planks', ruin3: 'boards' },
    patches: { mags: 'sail', ben: 'boards' },
    frontWindow: { ben: 'always' },
    chimneys: ['mags', 'ben'],
    sparseRacks: true,
    garden: true,
    // Dorcas's table in front of her garden; Loveday's kitchen along the side of the old Hocking place.
    stalls: { dorcas: { kind: 'veg', at: [-92.6, 22.6], face: Math.PI, len: 2.0, depth: 0.85, places: 8, hooks: 2, baskets: 3 } },
    kitchens: { cellar: { at: [-92.3, 1.8], face: Math.PI / 2, wall: 2.1, span: [-1.6, 1.5], counter: [-1.0, 1.0], floor: 3.2, grill: [-94.7, 0.9], board: [-95.9, 2.6, -2.25], owner: 'loveday', fireEnd: 1, roof: 'sail' } },
    overgrowth: [[-91, -4.2, 3.0, 12], [-91, 30, 3.4, 16], [-93, -32, 3.4, 16], [-96, -26, 4, 8], [-86, 6, 4, 10], [-104, 26, 3, 6], [-95, 40, 4, 8], [-86, -10, 3, 7]],
    sunk: [-105.5, 21.5, 0.9],
    laundry: { from: [-91.5, -15.9], fromY: 4.45, to: [-88.6, -13.6], pole: true, colors: ['#7a6458', '#9a9484', '#5a6a6e'] },
    gulls: [['ridge', 'ruin1', 0.3, 'crow'], ['ridge', 'ruin2', 0.62, 'crow'], ['dock', 0.75]],
    signs: [{ kind: 'fish', hut: 'ruin1', askew: true }],
    paths: [
      [[-98, 0], [-95.9, -18]],
      [[-98, 0], [-95.9, 16]],
      [[-98, 0], [-98.5, 6]],
      [[-95.9, 16], [-91.2, 21]],
      [[-98, 0], [-95.4, 2.4], [-92.6, 2.7]],
      [[-95.9, 16], [-93.6, 22.4]],
    ],
  },
  // Pascoe's yard: the shed, his timber and logs, the steam box going, the
  // capstan at the head of the slip, a boat upside down being tarred.
  yard: {
    shed: true,
    timber: true,
    logs: true,
    horse: true,
    steambox: [-50.5, 223.6, 0],
    capstan: { at: [-47.6, 216], toward: [-38.5, 216] },
    tarring: [-36.5, 206.0, 0.15],
    signs: [{ kind: 'boat', at: [-45.6, 208.0], face: 0.3 }],
    gulls: [['at', -41.5, 228.5, 1.2], ['at', -47.6, 216, 0.84]],
    paths: [
      [[-49.5, 211.5], [-42, 213], [-36.3, 213.3]],
      [[-42, 213], [-42, 208.6]],
      [[-42, 213], [-46, 219.5], [-48.6, 221.4]],
      [[-42, 213], [-40.5, 220.8], [-31.5, 218.7]],
    ],
  },
};

/** World position of an island-local point at height y. */
function wp(b, lx, lz, y = null) {
  const p = b.w(lx, lz);
  return V(p.x, y ?? groundAt(p.x, p.z), p.z);
}

/** A ground-hugging strip along a path: sand worn darker and flatter where people walk. */
function pathStrip(b, pts, color, rand, dark = 0.74) {
  const pos = [];
  const samples = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.6);
    for (let k = 0; k < n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  samples.push(pts[pts.length - 1]);
  // Nobody walks a straight line: the path wanders a little either side.
  const world = samples.map(([x, z], i) => {
    const w = b.w(x, z);
    if (i === 0 || i === samples.length - 1) return w;
    return { x: w.x + Math.sin(i * 1.7 + x) * 0.25, z: w.z + Math.cos(i * 1.3 + z) * 0.25 };
  });
  for (let i = 0; i + 1 < world.length; i++) {
    const a = world[i];
    const c = world[i + 1];
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const wa = 0.35 + rand() * 0.35;
    const wc = 0.35 + rand() * 0.35;
    const y = (x, z) => groundAt(x, z) + 0.02;
    const A = [a.x + nx * wa, 0, a.z + nz * wa];
    const B = [a.x - nx * wa, 0, a.z - nz * wa];
    const C = [c.x + nx * wc, 0, c.z + nz * wc];
    const D = [c.x - nx * wc, 0, c.z - nz * wc];
    for (const q of [A, B, C, D]) q[1] = y(q[0], q[2]);
    pos.push(...A, ...C, ...B, ...B, ...C, ...D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // The sand's own colour, trodden darker and browner, so it blends in.
  const col = new Float32Array(pos.length);
  const c = new THREE.Color();
  const tint = new THREE.Color(color);
  for (let i = 0; i < pos.length; i += 3) {
    groundColorAt(pos[i], pos[i + 2], c);
    c.lerp(tint, 0.3).multiplyScalar(dark);
    col.set([c.r, c.g, c.b], i);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * One hut, by hand. Same frame as the plain one (+u to the door, +v to its
 * left; D along u, W along v; floor at y0), same colliders.
 */
function hut(b, kit, h, opts, inst, extras) {
  const [lx, lz] = h.at;
  const f = h.face;
  const c = Math.cos(f);
  const s = Math.sin(f);
  const D = 2.8;
  const W = 3.4;
  const H = 2.05 + kit.r(-0.05, 0.1);
  const y0 = h.floor;
  const loc = (u, v) => [lx + c * u - s * v, lz + s * u + c * v];
  const at = (u, v, y) => wp(b, ...loc(u, v), y);
  const U = at(1, 0, 0).sub(at(0, 0, 0)).normalize();
  const Vv = at(0, 1, 0).sub(at(0, 0, 0)).normalize();
  const pal = kit.pal;

  // Floor: boards across, ends ragged, on three joists.
  for (const v of [-W / 2 + 0.2, 0, W / 2 - 0.2]) kit.board(at(-D / 2 - 0.1, v, y0 - 0.1), at(D / 2 + 0.1, v, y0 - 0.1), 0.14, 0.12, UP, kit.col(pal.dark));
  const ruin = !!h.ruin;
  for (let u = -D / 2 - 0.12; u < D / 2 + 0.1; ) {
    const w = kit.r(0.17, 0.29);
    const um = u + w / 2;
    if (!(ruin && kit.rand() < 0.25)) kit.board(at(um, -W / 2 - kit.r(0.05, 0.2), y0 - 0.03), at(um, W / 2 + kit.r(0.05, 0.2), y0 - 0.03 + kit.r(-0.01, 0.01)), w - 0.015, 0.055, UP, kit.col(pal.wood));
    u += w;
  }
  // Stilts with braces, or a footing of stones.
  const legs = [[-D / 2 + 0.1, -W / 2 + 0.15], [D / 2 - 0.1, -W / 2 + 0.15], [-D / 2 + 0.1, W / 2 - 0.15], [D / 2 - 0.1, W / 2 - 0.15], [0, -W / 2 + 0.15], [0, W / 2 - 0.15]];
  for (const [u, v] of legs) {
    const p = at(u, v, 0);
    const g = Math.min(groundAt(p.x, p.z), y0 - 0.3);
    if (h.stilts) kit.post(V(p.x + kit.r(-0.05, 0.05), g - 0.6, p.z + kit.r(-0.05, 0.05)), V(p.x, y0 - 0.12, p.z), kit.r(0.075, 0.11), kit.col(pal.dark));
    else {
      const r = rock(0.42, Math.round(p.x * 13 + p.z * 7), kit.col(pal.stone).getStyle());
      r.translate(p.x, g + 0.15, p.z);
      kit.parts.push(r);
    }
  }
  if (h.stilts) {
    for (const v of [-W / 2 + 0.15, W / 2 - 0.15]) {
      const a = at(-D / 2 + 0.1, v, 0);
      const e = at(D / 2 - 0.1, v, 0);
      const ga = Math.min(groundAt(a.x, a.z), y0 - 0.3);
      kit.board(V(a.x, ga + 0.2, a.z), V(e.x, y0 - 0.25, e.z), 0.08, 0.04, Vv.clone().multiplyScalar(Math.sign(v)), kit.col(pal.dark));
    }
  }

  // Walls, each leaning its own way. holes are in (along, up) metres.
  const across = opts.walls === 'planks';
  const lean = () => kit.r(-0.035, 0.035);
  const wallAt = (o, along, out, len, holes) => {
    const up = UP.clone().addScaledVector(out, lean() * (ruin ? 2.2 : 1)).addScaledVector(along, lean() * 0.5).normalize();
    kit.wall(o, along, up, out, len, H, {
      across,
      holes,
      base: across ? 0.24 : 0.2,
      // A painted house: its colour, with bare boards where it's flaked or been replaced.
      salvage: opts.paint ? 0.2 : across ? 0.32 : 0.12,
      colors: opts.paint ?? null,
      odd: opts.paint ? pal.wood : null,
      missing: ruin ? 0.24 : 0,
    });
  };
  // A window, or (in a ruin) the hole boarded across.
  const win = (c, along, out, w, hh, always = false) => {
    if (ruin) {
      for (const k of [-1, 1]) kit.board(c.clone().addScaledVector(along, -w / 2 - 0.05).add(V(0, k * hh * 0.35, 0)).addScaledVector(out, 0.04), c.clone().addScaledVector(along, w / 2 + 0.05).add(V(0, -k * hh * 0.35, 0)).addScaledVector(out, 0.04), 0.1, 0.03, out, kit.col(pal.wood));
      return;
    }
    kit.window(c, along, out, w, hh, h.id);
    if (always) kit.windows[kit.windows.length - 1].always = true;
  };
  // Back wall (u = −D/2), facing −U, with a window.
  wallAt(at(-D / 2, W / 2, y0), Vv.clone().negate(), U.clone().negate(), W, [{ a0: 1.4, a1: 1.95, b0: 0.95, b1: 1.42 }]);
  win(at(-D / 2 - 0.02, W / 2 - 1.675, y0 + 1.185), Vv.clone().negate(), U.clone().negate(), 0.5, 0.42);
  // Sides.
  wallAt(at(-D / 2, -W / 2, y0), U, Vv.clone().negate(), D, []);
  wallAt(at(D / 2, W / 2, y0), U.clone().negate(), Vv, D, [{ a0: 1.0, a1: 1.5, b0: 1.0, b1: 1.4 }]);
  win(at(D / 2 - 1.25, W / 2 + 0.02, y0 + 1.2), U.clone().negate(), Vv, 0.46, 0.38);
  // Front, with the doorway in the middle (and a window beside it, if there's one to look out of).
  const frontHoles = [{ a0: W / 2 - 0.47, a1: W / 2 + 0.47, b0: -0.1, b1: 1.78 }];
  if (opts.frontWindow) frontHoles.push({ a0: 0.35, a1: 0.95, b0: 1.0, b1: 1.45 });
  wallAt(at(D / 2, -W / 2, y0), Vv, U, W, frontHoles);
  if (opts.frontWindow) win(at(D / 2 + 0.02, -W / 2 + 0.65, y0 + 1.225), Vv, U, 0.55, 0.42, opts.frontWindow === 'always');
  kit.board(at(D / 2 + 0.03, -0.55, y0 + 1.82), at(D / 2 + 0.03, 0.55, y0 + 1.84), 0.12, 0.05, U, kit.col(pal.dark)); // lintel
  if (ruin) {
    // The door's come off and lies in the weeds below.
    const d0 = at(D / 2 + 2.9, -1.3, null);
    for (let k = 0; k < 4; k++) kit.board(d0.clone().addScaledVector(Vv, -0.33 + k * 0.22).add(V(0, 0.06, 0)), d0.clone().addScaledVector(Vv, -0.3 + k * 0.22).addScaledVector(U, 1.7).add(V(0, 0.1, 0)), 0.2, 0.04, UP, kit.col(pal.tar));
  }
  // The door, hanging open on its hinges.
  if (!ruin) {
    const hinge = at(D / 2, -0.46, y0 + 0.02);
    const open = kit.r(1.1, 1.7);
    const dir = U.clone().multiplyScalar(Math.sin(open)).addScaledVector(Vv, Math.cos(open)).normalize();
    const n = dir.clone().cross(UP).normalize();
    for (let k = 0; k < 4; k++) {
      const a = hinge.clone().addScaledVector(dir, 0.11 + k * 0.22);
      kit.board(a, a.clone().add(V(0, 1.72 + kit.r(-0.03, 0.02), 0)), 0.21, 0.04, n, kit.col(k === 2 ? pal.paint : pal.wood));
    }
    for (const y of [0.3, 1.4]) kit.board(hinge.clone().addScaledVector(dir, 0.05).add(V(0, y, 0)).addScaledVector(n, 0.03), hinge.clone().addScaledVector(dir, 0.85).add(V(0, y + 0.03, 0)).addScaledVector(n, 0.03), 0.1, 0.03, n, kit.col(pal.dark));
  }

  // The roof: ridge along u, slopes out to ±v, sagging, patched.
  const roofC = at(0, 0, y0);
  kit.roof(roofC, U, Vv, D + 0.5, W / 2, H + 0.85, H - 0.02, { sag: kit.r(0.06, 0.16) + (ruin ? 0.22 : 0), overhang: kit.r(0.35, 0.5), patch: ruin ? null : opts.patch, material: opts.roof ?? 'tar', keep: ruin ? [kit.r(0.05, 0.25), kit.r(0.4, 0.7)] : [1, 1] });
  // Gables, boarded.
  for (const side of [-1, 1]) {
    const u = side * (D / 2);
    const n = U.clone().multiplyScalar(side);
    for (let v = -W / 2 + 0.05; v < W / 2 - 0.05; v += 0.24) {
      const top = H + 0.85 * (1 - Math.abs(v + 0.12) / (W / 2)) - 0.04;
      if (top <= H || (ruin && kit.rand() < 0.35)) continue;
      kit.board(at(u, v + 0.12, y0 + H - 0.02), at(u, v + 0.12, y0 + top), 0.22, 0.04, n, kit.col(pal.wood));
    }
  }
  if (ruin) {
    // Roof boards fallen in across the floor, and something growing through it.
    for (let k = 0; k < 5; k++) {
      const a = at(kit.r(-1.0, 0.8), kit.r(-1.4, 0.2), y0 + 0.05);
      kit.board(a, a.clone().addScaledVector(Vv, kit.r(0.9, 1.6)).addScaledVector(U, kit.r(-0.4, 0.4)).add(V(0, kit.r(0.1, 0.9), 0)), 0.22, 0.04, UP, kit.col(pal.tar));
    }
    const sap = at(0.3, 0.8, y0 - 0.1);
    kit.post(sap, sap.clone().add(V(0.1, 2.6, -0.05)), 0.04, kit.col(['#5a4c3a']), 4);
    const crown = new THREE.IcosahedronGeometry(0.55, 0);
    crown.scale(1, 0.8, 1);
    crown.translate(sap.x + 0.1, sap.y + 2.75, sap.z - 0.05);
    kit.parts.push(paint(crown, kit.col(['#4f6a34', '#5a7036']).getStyle()));
  }
  if (opts.chimney) kit.stovepipe(at(-0.55, -0.7, y0 + H + 0.25), kit.r(0.9, 1.2));

  // Steps down from the door: two stringers, uneven treads (one gone), a rail.
  const [rx, rz] = loc(D / 2 + 2.6, 0);
  const pr = b.w(rx, rz);
  const gy = groundAt(pr.x, pr.z);
  const run = 2.5;
  const rise = y0 - gy;
  for (const v of [-0.45, 0.45]) kit.board(at(D / 2, v, y0 - 0.06), at(D / 2 + run, v, gy - 0.04), 0.16, 0.05, Vv.clone().multiplyScalar(Math.sign(v)), kit.col(pal.dark));
  const steps = Math.max(3, Math.round(rise / 0.28));
  const gone = Math.floor(kit.r(1, steps));
  for (let i = 1; i < steps; i++) {
    if ((i === gone && steps > 4) || (ruin && kit.rand() < 0.35)) continue;
    const t = i / steps;
    const u = D / 2 + t * run;
    const y = y0 - t * rise + 0.02;
    kit.board(at(u, -0.55 + kit.r(-0.04, 0.02), y), at(u, 0.55 + kit.r(-0.02, 0.05), y + kit.r(-0.02, 0.02)), 0.24, 0.04, UP, kit.col(pal.wood));
  }
  const railV = kit.rand() < 0.5 ? 0.6 : -0.6;
  if (!ruin) {
    kit.post(at(D / 2 + run - 0.05, railV, gy - 0.2), at(D / 2 + run - 0.05, railV, gy + 0.95), 0.05, kit.col(pal.dark));
    kit.board(at(D / 2 + 0.05, railV, y0 + 0.9), at(D / 2 + run - 0.05, railV, gy + 0.9), 0.06, 0.06, Vv, kit.col(pal.wood));
  }

  // Inside: the bunk with its blanket, and a shelf.
  const bunk = (u, v, blanket) => {
    kit.block(at(u, v, y0 + 0.15), 1.0, 0.3, 2.0, kit.col(pal.dark), b.yaw - f);
    kit.block(at(u, v + 0.1, y0 + 0.33), 0.95, 0.06, 1.7, blanket, b.yaw - f);
  };
  if (!ruin) {
    bunk(-0.75, 0.4, kit.col(['#7f5a4c', '#5d6b7a', '#7a6d4f']));
    if (h.beds === 2) bunk(0.4, 0.4, kit.col(['#5a6a8a', '#6f5f4a']));
    kit.board(at(-D / 2 + 0.12, -1.2, y0 + 1.3), at(-D / 2 + 0.12, -0.4, y0 + 1.31), 0.22, 0.03, UP, kit.col(pal.wood));
  }

  // Colliders: exactly the plain hut's.
  const [fx, fz] = loc(0, 0);
  b.solid(fx, y0 - 0.1, fz, D + 0.3, 0.2, W + 0.3, f);
  b.noWalk(fx, fz, D + 0.3, W + 0.3, f);
  for (const [u, v, w2, d2] of [[0, -W / 2, D, 0.2], [0, W / 2, D, 0.2], [-D / 2, 0, 0.2, W], [D / 2, -W / 2 + 0.55, 0.2, 1.1], [D / 2, W / 2 - 0.55, 0.2, 1.1]]) {
    const [x, z] = loc(u, v);
    b.solid(x, y0 + H / 2, z, w2, H, d2, f);
  }
  const ang = Math.atan2(rise, run);
  const len = Math.hypot(rise, run);
  const [mx, mz] = loc(D / 2 + 1.25, 0);
  b.solid(mx, (y0 + gy) / 2 - 0.06, mz, len, 0.12, 1.0, f, { roll: ang });

  // Where things hang and sit, for the dressing.
  extras.huts[h.id] = { at, U, Vv, D, W, H, y0, ridge: (t) => at(-D / 2 - 0.25 + t * (D + 0.5), 0, y0 + H + 0.85 - 0.1) };
  // Far version: a block and a roof.
  extras.far.push(paint(new THREE.BoxGeometry(D, H, W).rotateY(b.yaw - f).translate(roofC.x, y0 + H / 2, roofC.z), '#6f675b'));
  const roofFar = new THREE.CylinderGeometry(0.01, (W / 2 + 0.4) * 1.414, D + 0.8, 4, 1);
  roofFar.rotateY(Math.PI / 4);
  roofFar.scale(1, 1, 0.62);
  roofFar.rotateZ(Math.PI / 2);
  roofFar.rotateY(b.yaw - f);
  roofFar.translate(roofC.x, y0 + H + 0.3, roofC.z);
  extras.far.push(paint(roofFar, ruin ? '#4a4a44' : '#3d3731'));
  if (h.stilts) for (const [u, v] of legs.slice(0, 4)) extras.far.push(paint(new THREE.BoxGeometry(0.16, y0 + 0.6, 0.16).translate(at(u, v, 0).x, y0 / 2 - 0.3, at(u, v, 0).z), '#4e4740'));
  void inst;
}

/** The dock, by hand: uneven boards, a missing one, piles that don't match, a ladder. */
function dock(b, kit, d, inst, extras) {
  const [x0, z0] = d.from;
  const [x1, z1] = d.to;
  const f = Math.atan2(z1 - z0, x1 - x0);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const at = (u, v, y) => wp(b, x0 + Math.cos(f) * u - Math.sin(f) * v, z0 + Math.sin(f) * u + Math.cos(f) * v, y);
  const pal = kit.pal;
  const along = at(1, 0, 0).sub(at(0, 0, 0)).normalize();
  const side = at(0, 1, 0).sub(at(0, 0, 0)).normalize();
  // Stringers.
  for (const v of [-d.width / 2 + 0.12, d.width / 2 - 0.12]) kit.board(at(0, v, d.y - 0.14), at(len, v, d.y - 0.14 - kit.r(0, 0.06)), 0.14, 0.16, side, kit.col(pal.dark), { sag: 0.03 });
  // Boards across.
  const skip = Math.floor(kit.r(len * 0.55, len * 0.85) / 0.3);
  let k = 0;
  for (let u = 0.05; u < len - 0.1; k++) {
    const w = kit.r(0.2, 0.36);
    if (k !== skip && (!d.broken || (k % 7 !== 3 && k % 11 !== 5))) {
      const um = u + w / 2;
      const lift = kit.rand() < 0.1 ? kit.r(0.01, 0.03) : 0;
      kit.board(at(um, -d.width / 2 - kit.r(0, 0.08), d.y - 0.04 + lift), at(um, d.width / 2 + kit.r(0, 0.08), d.y - 0.04 + kit.r(-0.01, 0.01)), w - 0.02, 0.05, UP, kit.col(kit.rand() < 0.08 ? pal.paint : pal.wood));
    }
    u += w;
  }
  // Piles, each its own height and lean; the tall ones for tying up to.
  const piles = [];
  for (let u = 0.4; u <= len; u += kit.r(2.4, 3.3)) {
    for (const sgn of [-1, 1]) {
      const p = at(u, sgn * (d.width / 2 + 0.02), 0);
      const tall = kit.rand() < 0.3;
      const top = d.y + (tall ? kit.r(0.5, 0.9) : kit.r(0.05, 0.25));
      kit.post(V(p.x, -4, p.z), V(p.x + kit.r(-0.06, 0.06), top, p.z + kit.r(-0.06, 0.06)), kit.r(0.1, 0.14), kit.col(pal.dark), 6);
      piles.push({ p: V(p.x, top, p.z), tall, u });
    }
  }
  // A rope round a tall pile, and a ladder down at the end.
  const tallOnes = piles.filter((p) => p.tall);
  for (const t of tallOnes.slice(0, 2)) {
    const ring = new THREE.TorusGeometry(0.15, 0.025, 4, 10);
    ring.rotateX(Math.PI / 2);
    ring.translate(t.p.x, t.p.y - 0.2, t.p.z);
    kit.parts.push(paint(ring, pal.rope));
  }
  for (const v of [-0.25, 0.25]) kit.board(at(len - 0.05, v, d.y), at(len + 0.05, v, -1.4), 0.06, 0.06, along, kit.col(pal.dark));
  for (let y = d.y - 0.3; y > -1.2; y -= 0.32) kit.board(at(len, -0.27, y), at(len, 0.27, y), 0.05, 0.05, along, kit.col(pal.wood));
  b.solid((x0 + x1) / 2, d.y - 0.1, (z0 + z1) / 2, len, 0.2, d.width, f);
  extras.dock = { at, len, piles, d };
  extras.far.push(paint(new THREE.BoxGeometry(len, 0.15, d.width).rotateY(b.yaw - f).translate(at(len / 2, 0, 0).x, d.y - 0.08, at(len / 2, 0, 0).z), '#6f675b'));
}

/** A drying rack: poles that lean, bars that sag, rows of split fish. */
function rack(b, kit, lx, lz, face, inst, extras, empty = 0.12) {
  const pal = kit.pal;
  const at = (u, v, y) => {
    const x = lx + Math.cos(face) * u - Math.sin(face) * v;
    const z = lz + Math.sin(face) * u + Math.cos(face) * v;
    return wp(b, x, z, y === undefined ? null : y);
  };
  const g0 = at(0, 0).y;
  const along = at(0, 1, g0).sub(at(0, 0, g0)).normalize();
  for (const v of [-1.35, 1.35]) {
    for (const u of [-0.45, 0.45]) kit.post(at(u, v, g0 - 0.25), at(0, v + kit.r(-0.05, 0.05), g0 + 1.95 + kit.r(-0.08, 0.08)), 0.045, kit.col(pal.dark), 5);
  }
  for (const y of [1.18, 1.78]) kit.board(at(0, -1.5, g0 + y), at(0, 1.5, g0 + y + kit.r(-0.04, 0.04)), 0.05, 0.05, UP, kit.col(pal.wood), { sag: 0.05 });
  for (const y of [1.18, 1.78]) {
    for (let i = 0; i < 8; i++) {
      if (kit.rand() < empty) continue;
      const v = -1.2 + i * 0.34 + kit.r(-0.03, 0.03);
      const p = at(0, v, g0 + y - 0.02 - 0.05 * 4 * ((v + 1.5) / 3) * (1 - (v + 1.5) / 3));
      inst.put('splitFish', SHAPES.splitFish, p, b.yaw - face + Math.PI / 2 + kit.r(-0.3, 0.3), kit.col(['#c9b48e', '#b59f78', '#c4ab86', '#a99272'], 0.04), 1, kit.r(-0.08, 0.08));
    }
  }
  extras.racks.push({ top: at(0, 0, g0 + 1.98), along });
  b.solid(lx, g0 + 0.95, lz, 0.25, 1.9, 2.8, face);
  extras.far.push(paint(new THREE.BoxGeometry(0.1, 1.9, 2.8).rotateY(b.yaw - face).translate(at(0, 0).x, g0 + 0.95, at(0, 0).z), '#5a5248'));
}

/** A rowing boat drawn up on the sand: planked, faded, oars in it. */
function rowboat(b, kit, lx, lz, face, upturned = false, sunk = false) {
  const pal = kit.pal;
  const p = b.w(lx, lz);
  const g = groundAt(p.x, p.z);
  const parts = [];
  const paintC = sunk ? kit.col(pal.wood, 0.05) : kit.col(['#4f6a76', '#7a4a3e', '#6b7a5e', '#8a7f68'], 0.05);
  for (let k = 0; k < 4; k++) {
    const t0 = k / 4;
    const t1 = (k + 1) / 4 - 0.02;
    const band = new THREE.SphereGeometry(1, 14, 2, 0, Math.PI * 2, Math.PI / 2 + t0 * (Math.PI / 2), (t1 - t0) * (Math.PI / 2));
    band.scale(0.65, 0.45, 1.7);
    parts.push(paint(band, k === 0 ? kit.col(pal.salt) : k === 3 ? paintC.clone().multiplyScalar(0.9) : paintC));
  }
  const rim = new THREE.TorusGeometry(1, 0.035, 4, 24);
  rim.rotateX(Math.PI / 2);
  rim.scale(0.65, 1, 1.7);
  parts.push(paint(rim, kit.col(pal.wood)));
  for (const z of [-0.5, 0.4]) {
    const th = new THREE.BoxGeometry(1.15, 0.04, 0.2);
    th.translate(0, -0.1, z);
    parts.push(paint(th, kit.col(pal.wood)));
  }
  if (!upturned && !sunk) {
    for (const s of [-1, 1]) {
      const oar = segment(V(s * 0.25, -0.05, -1.1), V(s * 0.1, 0.0, 1.0), 0.025, 0.025, 4);
      parts.push(paint(oar, kit.col(pal.wood)));
    }
  }
  const geo = mergeParts(parts);
  if (upturned) geo.rotateZ(Math.PI);
  geo.rotateZ(upturned ? 0 : sunk ? 0.45 : 0.1);
  geo.rotateX(sunk ? 0.15 : 0);
  geo.rotateY(b.yaw - face);
  geo.translate(p.x, upturned ? g + 0.62 : sunk ? g + 0.02 : g + 0.32, p.z);
  kit.parts.push(geo);
  if (sunk) {
    // Half full of sand, a plank stove in, and she's going nowhere.
    b.solid(lx, g + 0.2, lz, 3.4, 0.4, 1.4, face + Math.PI / 2);
    return;
  }
  if (upturned) {
    // Up on trestles, half tarred, a pot of tar and a brush.
    for (const z of [-0.9, 0.9]) {
      const q = b.w(lx + Math.cos(face + Math.PI / 2) * z, lz + Math.sin(face + Math.PI / 2) * z);
      for (const s of [-1, 1]) kit.post(V(q.x + s * 0.3, g, q.z), V(q.x, g + 0.62, q.z), 0.035, kit.col(pal.dark), 4);
    }
    const pot = new THREE.CylinderGeometry(0.16, 0.13, 0.26, 8);
    pot.translate(p.x + 1.0, g + 0.13, p.z + 0.4);
    kit.parts.push(paint(pot, '#2a2622'));
  }
  b.solid(lx, g + 0.3, lz, 3.4, 0.6, 1.4, face + Math.PI / 2);
}

/** The gutting table: boards on trestles, fish, a knife, a bucket of heads, and the stain below. */
function guttingTable(b, kit, lx, lz, face, inst, flat) {
  const pal = kit.pal;
  const at = (u, v, y) => wp(b, lx + Math.cos(face) * u - Math.sin(face) * v, lz + Math.sin(face) * u + Math.cos(face) * v, y);
  const g = at(0, 0).y;
  for (const u of [-0.75, 0.75]) {
    for (const v of [-0.3, 0.3]) kit.post(at(u + kit.r(-0.05, 0.05), v * 1.2, g - 0.1), at(u, v * 0.4, g + 0.86), 0.035, kit.col(pal.dark), 4);
  }
  for (let v = -0.3; v < 0.3; v += 0.2) kit.board(at(-1.0, v + 0.1, g + 0.9), at(1.0 + kit.r(-0.05, 0.05), v + 0.1, g + 0.9), 0.19, 0.05, UP, kit.col(pal.wood));
  // Dark stain on the sand under it.
  const stain = new THREE.CircleGeometry(0.75, 9);
  stain.rotateX(-Math.PI / 2);
  stain.scale(1.5, 1, 0.8);
  stain.translate(at(0, 0).x, g + 0.03, at(0, 0).z);
  flat.push(paint(stain, '#a39070'));
  for (let i = 0; i < 4; i++) inst.put('fish', SHAPES.fish, at(-0.6 + i * 0.32, kit.r(-0.12, 0.12), g + 0.96), b.yaw - face + kit.r(-0.5, 0.5), kit.col(['#8a9aa0', '#9aa5a0', '#7f8c88'], 0.05));
  kit.block(at(0.55, 0.05, g + 0.94), 0.22, 0.02, 0.04, '#9a9fa3', b.yaw - face + 0.4); // knife
  kit.block(at(0.42, 0.05, g + 0.945), 0.1, 0.03, 0.045, kit.col(pal.dark), b.yaw - face + 0.4);
  const bucket = new THREE.CylinderGeometry(0.17, 0.14, 0.3, 9, 1, true);
  bucket.translate(at(1.25, 0.35).x, g + 0.15, at(1.25, 0.35).z);
  kit.parts.push(paint(bucket, '#6b6f6e'));
  for (let i = 0; i < 3; i++) inst.put('fish', SHAPES.fish, at(1.25 + kit.r(-0.05, 0.05), 0.35 + kit.r(-0.05, 0.05), g + 0.27), kit.r(0, 6), '#7d8784', 0.6, 0.6);
  b.solid(lx, g + 0.45, lz, 2.0, 0.9, 0.6, face);
}

/** Nets hung to dry between poles that lean, the net sagging. */
function netPoles(b, kit, lx, lz, face, netMat) {
  const pal = kit.pal;
  const tops = [];
  for (const s of [-1, 1]) {
    const px = lx + Math.sin(face) * s * 1.6;
    const pz = lz - Math.cos(face) * s * 1.6;
    const p = wp(b, px, pz);
    const top = V(p.x + kit.r(-0.1, 0.1), p.y + 2.3 + kit.r(-0.15, 0.15), p.z + kit.r(-0.1, 0.1));
    kit.post(V(p.x, p.y - 0.2, p.z), top, 0.05, kit.col(pal.dark), 5);
    b.world.addStatic({ type: 'cyl', x: p.x, z: p.z, r: 0.12, y0: p.y - 0.5, y1: p.y + 2.2, noClimb: true });
    tops.push(top);
  }
  const [a, c] = tops;
  const geo = new THREE.PlaneGeometry(1, 1, 8, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getX(i) + 0.5;
    const v = pos.getY(i) + 0.5;
    const top = a.clone().lerp(c, t);
    top.y -= 0.35 * 4 * t * (1 - t);
    pos.setXYZ(i, top.x, top.y - (1 - v) * 1.7 + Math.sin(t * 9) * 0.03, top.z + Math.sin(t * 7 + v * 3) * 0.08);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, netMat);
  return m;
}

/**
 * Build a village by hand. b: the plain builder (for colliders and the
 * island frame). Returns { detail, far, windows, chimneys, life }.
 */
export function handVillage(b, id, v, netMesh) {
  const pal = PALETTES[id] ?? PALETTES.cove;
  const dress = DRESS[id] ?? {};
  const detail = new THREE.Group();
  detail.name = `hand:${id}`;
  const inst = new Instances();
  const extras = { huts: {}, far: [], racks: [], dock: null, flat: [] };
  const kits = [];
  const seed = id.length * 7907;
  let n = 0;
  const kit = () => {
    const k = new Kit(seed + 31 * n++, pal);
    kits.push(k);
    return k;
  };
  const life = [];

  for (const h of v.huts) {
    hut(b, kit(), h, { walls: dress.walls?.[h.id], patch: dress.patches?.[h.id] ?? 'sail', chimney: dress.chimneys?.includes(h.id), paint: dress.paint?.[h.id], frontWindow: dress.frontWindow?.[h.id] }, inst, extras);
  }
  if (v.dock) dock(b, kit(), v.dock, inst, extras);
  const k = kit();
  for (const [x, z, f] of v.racks ?? []) rack(b, k, x, z, f, inst, extras, dress.sparseRacks ? 0.7 : 0.12);
  for (const [x, z, f] of v.boats ?? []) rowboat(b, k, x, z, f);
  if (dress.tarring) rowboat(b, k, ...dress.tarring, true);
  if (dress.gutting) guttingTable(b, k, ...dress.gutting, inst, extras.flat);
  const netMat = netMesh('#3f4a46', [2, 1]);
  for (const [x, z, f] of v.nets ?? []) detail.add(netPoles(b, k, x, z, f, netMat));

  // A pile of net on the sand, with its floats.
  if (dress.netPile) {
    const p = wp(b, ...dress.netPile);
    const heap = new THREE.SphereGeometry(0.8, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    heap.scale(1.2, 0.35, 0.9);
    const hp = heap.attributes.position;
    for (let i = 0; i < hp.count; i++) hp.setY(i, hp.getY(i) * (0.8 + 0.4 * Math.sin(hp.getX(i) * 7) * Math.cos(hp.getZ(i) * 5)));
    heap.translate(p.x, p.y, p.z);
    k.parts.push(paint(heap, '#4a5550'));
    for (let i = 0; i < 9; i++) inst.put('cork', SHAPES.corkFloat, V(p.x + k.r(-0.8, 0.8), p.y + k.r(0.05, 0.25), p.z + k.r(-0.6, 0.6)), k.r(0, 6), k.col(['#b98d58', '#a87c4a']), 1, k.r(-1, 1));
  }
  // Lobster pots, stacked any old how.
  for (const [x, z, up] of dress.pots ?? []) {
    const p = wp(b, x, z);
    inst.put('pot', SHAPES.lobsterPot, V(p.x, p.y + (up ? 0.33 : 0.02), p.z), k.r(0, 6), k.col(['#9a8a6a', '#8a7a5c', '#a49274']), 1, up ? k.r(-0.2, 0.2) : 0);
  }
  for (const [x, z, f, up, y] of dress.crates ?? []) {
    const p = wp(b, x, z, y ?? null);
    inst.put('crate', SHAPES.crate, V(p.x, p.y + 0.25 + (up ? 0.5 : 0), p.z), b.yaw - f + k.r(-0.15, 0.15), k.col(['#8a7a62', '#7a6c58', '#94846a']), 1, 0, k.r(-0.04, 0.04));
    if (!up) b.solid(x, p.y + 0.25, z, 0.6, 0.5, 0.5, f);
  }
  for (const [x, z, y] of dress.barrels ?? []) {
    const p = wp(b, x, z, y ?? null);
    inst.put('barrel', SHAPES.barrel, V(p.x, p.y + 0.31, p.z), k.r(0, 6), k.col(['#7a6450', '#6c5846']));
    b.world.addStatic({ type: 'cyl', x: p.x, z: p.z, r: 0.28, y0: p.y - 0.2, y1: p.y + 0.62, noClimb: true });
  }
  for (const [x, z] of dress.sacks ?? []) {
    const p = wp(b, x, z);
    inst.put('sack', SHAPES.sack, p, k.r(0, 6), k.col(['#a8956c', '#9c8a60', '#b09c72'], 0.05), k.r(0.85, 1.1), k.r(-0.12, 0.12));
  }
  // The rest of what the place does (src/handpieces.js).
  const bk = kit();
  // Shops (what's for sale goes where they say) and places to eat.
  extras.goods = {};
  for (const [sid, st] of Object.entries(dress.stalls ?? {})) extras.goods[sid] = st.kind === 'awning' ? stall(b, bk, st, inst) : marketTable(b, bk, st, inst);
  extras.kitchens = {};
  for (const [pid, kd] of Object.entries(dress.kitchens ?? {})) {
    const kk = kitchen(b, bk, kd, v.tables, inst);
    const sg = signBoard('pot', 0.7);
    sg.position.copy(kk.sign.at);
    sg.lookAt(kk.sign.at.clone().add(kk.sign.face));
    sg.rotateZ(0.04);
    detail.add(sg);
    extras.kitchens[pid] = kk;
  }
  if (dress.handcart) handcart(b, bk, ...dress.handcart);
  if (dress.derrick) derrick(b, bk, dress.derrick);
  if (dress.bollards) bollards(b, bk, dress.bollards, dress.bollardY);
  if (dress.ropewalk && v.ropewalk) ropewalk(b, bk, v.ropewalk, inst);
  for (const [x, z] of v.rope ?? []) inst.put('coil', SHAPES.coil, wp(b, x, z), bk.r(0, 6), bk.col([pal.rope, '#9a8660']));
  if (dress.garden && v.garden) garden(b, bk, v.garden, inst);
  for (const [x, z, r, nn] of dress.overgrowth ?? []) overgrowth(b, bk, x, z, r, inst, nn);
  if (dress.shed && v.shed) {
    const sh = shed(b, bk, v.shed, inst);
    const c = wp(b, ...v.shed.at, v.shed.floor);
    extras.far.push(paint(new THREE.BoxGeometry(sh.D, sh.H, sh.W).rotateY(b.yaw).translate(c.x, c.y + sh.H / 2, c.z), '#5e5446'));
    extras.far.push(paint(new THREE.BoxGeometry(sh.D + 0.6, 0.5, sh.W + 0.6).rotateY(b.yaw).translate(c.x, c.y + sh.H + 0.4, c.z), '#35302b'));
  }
  for (const [x, z, f] of dress.timber ? v.timber ?? [] : []) timber(b, bk, x, z, f);
  for (const [x, z, f] of dress.logs ? v.logs ?? [] : []) logs(b, bk, x, z, f);
  if (dress.horse && v.horse) sawhorse(b, bk, ...v.horse);
  if (dress.steambox) steambox(b, bk, ...dress.steambox);
  if (dress.capstan) capstan(b, bk, ...dress.capstan.at, dress.capstan.toward);
  if (dress.sunk) rowboat(b, bk, ...dress.sunk, false, true);
  // Benches where people sit about (not round the fire).
  for (const spots of [v.spots ?? {}, ...Object.values(VILLAGERS).filter((d) => d.village === id).map((d) => d.spots ?? {})]) {
    for (const sp of Object.values(spots)) if (sp.bench) bench(b, bk, sp);
  }
  // Worn paths.
  for (const pts of dress.paths ?? []) extras.flat.push(pathStrip(b, pts, pal.path, k.rand, pal.pathDark ?? 0.74));
  // A broken chair nobody's fixed: three legs, leaning on the wall.
  if (dress.chair) {
    const [x, z, yaw] = dress.chair;
    const p = wp(b, x, z);
    const parts = [];
    const seat = new THREE.BoxGeometry(0.42, 0.04, 0.4);
    seat.translate(0, 0.42, 0);
    parts.push(paint(seat, k.col(pal.wood).getStyle()));
    for (const [lx2, lz2] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17]]) parts.push(paint(segment(V(lx2, 0, lz2), V(lx2, 0.42, lz2), 0.02, 0.02, 4), k.col(pal.dark).getStyle()));
    parts.push(paint(segment(V(0.18, 0.42, 0.17), V(0.18, 0.2, 0.17), 0.02, 0.02, 4), k.col(pal.dark).getStyle())); // the broken leg, stump
    const back = new THREE.BoxGeometry(0.42, 0.4, 0.04);
    back.translate(0, 0.65, -0.19);
    parts.push(paint(back, k.col(pal.wood).getStyle()));
    const g = mergeParts(parts);
    g.rotateZ(-0.18);
    g.rotateY(yaw);
    g.translate(p.x, p.y + 0.05, p.z);
    k.parts.push(g);
    const leg = segment(V(p.x + 0.4, p.y + 0.03, p.z + 0.2), V(p.x + 0.62, p.y + 0.05, p.z + 0.05), 0.02, 0.02, 4);
    k.parts.push(paint(leg, k.col(pal.dark).getStyle()));
  }
  // Oars leaning on a hut, floats hanging from its eaves.
  const H = (id2) => extras.huts[id2];
  if (dress.oars && H(dress.oars.hut)) {
    const hh = H(dress.oars.hut);
    for (let i = 0; i < 2; i++) {
      const foot = hh.at(hh.D / 2 + 0.6, -1.2 + i * 0.25, null);
      const top = hh.at(hh.D / 2 + 0.06, -1.1 + i * 0.3, hh.y0 + 1.9);
      k.parts.push(paint(segment(foot, top, 0.025, 0.025, 4), k.col(pal.wood).getStyle()));
    }
  }
  if (dress.floats && H(dress.floats.hut)) {
    const hh = H(dress.floats.hut);
    for (let i = 0; i < 5; i++) {
      const p = hh.at(-0.9 + i * 0.45, hh.W / 2 + 0.45, hh.y0 + hh.H - 0.25 - (i % 2) * 0.2);
      k.parts.push(paint(segment(p.clone().add(V(0, 0.3 + (i % 2) * 0.2, 0)), p, 0.006, 0.006, 3), pal.rope));
      inst.put('float', SHAPES.float, p.clone().add(V(0, -0.1, 0)), 0, k.col(['#9a5a48', '#c9c2b0', '#8f8a7a', '#9a5a48'], 0.05));
    }
  }
  // Signs: a painted picture on a board.
  for (const s of dress.signs ?? []) {
    const sign = signBoard(s.kind);
    if (s.hut && H(s.hut)) {
      const hh = H(s.hut);
      const p = hh.at(hh.D / 2 + 0.06, 0.95, hh.y0 + 1.65);
      sign.position.copy(p);
      sign.lookAt(p.clone().add(hh.U));
      // An old sign hanging from one nail.
      sign.rotateZ(s.askew ? 0.55 : 0.06);
      if (s.askew) sign.position.y -= 0.12;
      sign.scale.setScalar(0.7);
    } else {
      const p = wp(b, ...s.at);
      k.post(V(p.x, p.y - 0.3, p.z), V(p.x + 0.04, p.y + 2.2, p.z), 0.06, k.col(pal.dark), 5);
      sign.position.set(p.x, p.y + 1.75, p.z);
      sign.rotation.y = b.yaw - s.face;
      sign.rotateZ(-0.05);
    }
    detail.add(sign);
  }
  // Washing on a line.
  if (dress.laundry) {
    const L = dress.laundry;
    const a = wp(b, ...L.from, L.fromY);
    const pe = wp(b, ...L.to);
    const top = V(pe.x, pe.y + 2.1, pe.z);
    if (L.pole) k.post(V(pe.x, pe.y - 0.3, pe.z), top.clone().add(V(0, 0.1, 0)), 0.05, k.col(pal.dark), 5);
    const l = laundry(a, top, L.colors);
    detail.add(l.object);
    life.push(l);
  }
  // A cat on a roof.
  if (dress.cat && H(dress.cat.hut)) {
    const hh = H(dress.cat.hut);
    const c = cat('#3a332d');
    c.object.position.copy(hh.ridge(dress.cat.along).add(V(0, 0.02, 0)));
    c.object.rotation.y = b.yaw + 1.2;
    detail.add(c.object);
    life.push(c);
  }
  // Gulls on whatever's high.
  for (const gdef of dress.gulls ?? []) {
    const gl = gull(gdef[0] !== 'at' && gdef[3] === 'crow');
    let p = null;
    if (gdef[0] === 'at') p = wp(b, gdef[1], gdef[2]).add(V(0, gdef[3], 0));
    else if (gdef[0] === 'dock' && extras.dock) {
      const tall = extras.dock.piles.filter((q) => q.u > extras.dock.len * gdef[1] - 3).sort((x2, y2) => y2.p.y - x2.p.y)[0];
      p = tall?.p.clone();
    } else if (gdef[0] === 'ridge' && H(gdef[1])) p = H(gdef[1]).ridge(gdef[2]);
    else if (gdef[0] === 'rack' && extras.racks[gdef[1]]) p = extras.racks[gdef[1]].top.clone();
    if (!p) continue;
    gl.object.position.copy(p);
    gl.object.rotation.y = k.r(0, 6);
    detail.add(gl.object);
    life.push(gl);
  }

  // Merge each kit, weathered, and the instances.
  const ground = (x, z) => groundAt(x, z);
  const windows = [];
  const chimneys = [];
  for (const kt of kits) {
    const m = kt.finish(ground);
    if (m) detail.add(m);
    windows.push(...kt.windows);
    chimneys.push(...kt.chimneys);
  }
  inst.build(detail);
  // Things lying flat on the sand (worn paths, stains): not weathered, kept off the ground.
  if (extras.flat.length) {
    const fm = new THREE.Mesh(mergeParts(extras.flat), flatMat);
    fm.receiveShadow = true;
    detail.add(fm);
  }
  const far = new THREE.Mesh(mergeParts(extras.far), kitMat);
  far.name = `far:${id}`;
  far.visible = false;
  // When each household's lamp goes out: an hour after they go to bed.
  const bed = {};
  for (const [vid, def] of Object.entries(VILLAGERS)) {
    if (def.village !== id) continue;
    const sleep = def.routine.find((r) => r[2] === 'sleep');
    if (sleep) bed[vid] = sleep[0];
  }
  // (A house not named for who lives in it.)
  const LIVES = { kitto: 'jenefer', store: 'hester' };
  for (const w of windows) w.bed = bed[w.owner] ?? bed[LIVES[w.owner]] ?? 22;
  return { detail, far, windows, chimneys, life, hub: wp(b, ...v.hub), goods: extras.goods, kitchens: extras.kitchens };
}

// Make sure the seeded random is used for anything left over.
void mulberry32;
