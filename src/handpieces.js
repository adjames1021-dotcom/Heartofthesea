import * as THREE from 'three';
import { groundAt } from '../shared/world.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { SHAPES } from './kit.js';

// More hand-built pieces for the villages (src/handvillage.js): the market
// awning at the Landing, its quay derrick and ropewalk; the garden, the ruins'
// overgrowth and the scarecrow at Kettle Strand; Ned's shed, his timber,
// logs, steam box and capstan at the yard. All in the island's frame, through
// the plain builder `b` (b.w for positions, b.solid for colliders).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** World position of an island-local point, at height y (or on the ground). */
export function wp(b, lx, lz, y = null) {
  const p = b.w(lx, lz);
  return V(p.x, y ?? groundAt(p.x, p.z), p.z);
}

/** A local frame at (lx, lz) facing `face`: at(u, v, y) and its world axes. */
export function frame(b, lx, lz, face) {
  const c = Math.cos(face);
  const s = Math.sin(face);
  const loc = (u, v) => [lx + c * u - s * v, lz + s * u + c * v];
  const at = (u, v, y = null) => wp(b, ...loc(u, v), y);
  const o = at(0, 0, 0);
  const U = at(1, 0, 0).sub(o).normalize();
  const Vv = at(0, 1, 0).sub(o).normalize();
  return { at, loc, U, Vv, face };
}

/** A solid box in a frame's terms (u, v: its middle; w along u, d along v). */
function solidAt(b, F, u, v, y, w, h, d) {
  const [x, z] = F.loc(u, v);
  b.solid(x, y, z, w, h, d, F.face);
}

/** A solid post for walking into: a vertical cylinder at a world point. */
function postCollider(b, p, r, h) {
  b.world.addStatic({ type: 'cyl', x: p.x, z: p.z, r, y0: p.y - 0.5, y1: p.y + h, noClimb: true });
}

/** Cloth between four corners, sagging in the middle, in stripes along the first edge. Both faces. */
function cloth(a, b, c, d, colors, sag, nu = 6, nv = 4) {
  const pos = [];
  const col = [];
  const k = new THREE.Color();
  const P = (s, t) => {
    const top = a.clone().lerp(b, s);
    const bot = d.clone().lerp(c, s);
    const p = top.lerp(bot, t);
    p.y -= sag * 4 * s * (1 - s) * (0.4 + 0.6 * 4 * t * (1 - t));
    return p;
  };
  for (let i = 0; i < nu; i++) {
    k.set(colors[i % colors.length]);
    for (let j = 0; j < nv; j++) {
      const q = [P(i / nu, j / nv), P((i + 1) / nu, j / nv), P((i + 1) / nu, (j + 1) / nv), P(i / nu, (j + 1) / nv)];
      for (const [x, y, z] of [q[0], q[1], q[2], q[0], q[2], q[3], q[0], q[2], q[1], q[0], q[3], q[2]].map((v) => v.toArray())) {
        pos.push(x, y, z);
        col.push(k.r, k.g, k.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------------------
// The Landing
// ---------------------------------------------------------------------------

/**
 * Hester's stall in front of the store: an old sail stretched over poles
 * that don't match, a counter of planks on two barrels, a rough set of
 * shelves, and a bar with hooks. Returns where goods go (for the shop).
 */
export function stall(b, kit, s, inst) {
  const pal = kit.pal;
  const F = frame(b, s.at[0], s.at[1], s.face); // +u: toward the customers
  const g0 = F.at(0, 0).y;
  const L = s.len ?? 4.2; // along v
  const Dp = s.depth ?? 3.2; // along u
  // Poles: four, each its own height; the back two taller so it sheds rain.
  const corners = [];
  for (const [u, v, h] of [[-Dp / 2, -L / 2, 2.75], [-Dp / 2, L / 2, 2.7], [Dp / 2, -L / 2, 2.3], [Dp / 2, L / 2, 2.38]]) {
    const foot = F.at(u, v);
    const top = foot.clone().add(V(kit.r(-0.06, 0.06), h + kit.r(-0.08, 0.06), kit.r(-0.06, 0.06)));
    kit.post(foot.clone().add(V(0, -0.3, 0)), top, kit.r(0.055, 0.075), kit.col(pal.dark), 6);
    postCollider(b, foot, 0.1, h);
    corners.push(top);
  }
  // Beams along the tops.
  kit.board(corners[0], corners[1], 0.09, 0.08, UP, kit.col(pal.dark), { sag: 0.04 });
  kit.board(corners[2], corners[3], 0.09, 0.08, UP, kit.col(pal.dark), { sag: 0.05 });
  // The sail: striped, sagging, a patch, lashed at the corners.
  const lift = V(0, 0.06, 0);
  kit.parts.push(cloth(corners[0].clone().add(lift), corners[1].clone().add(lift), corners[3].clone().add(lift), corners[2].clone().add(lift), [kit.col(pal.canvas).getStyle(), kit.col(pal.stripe ?? pal.paint, 0.04).getStyle()], 0.22, 8, 4));
  // A hem hanging down at the front, and guy ropes to stakes.
  for (const [i, j] of [[2, 3]]) {
    const a = corners[i];
    const c = corners[j];
    for (let k = 0; k < 6; k++) {
      const p = a.clone().lerp(c, (k + 0.5) / 6);
      kit.block(p.clone().add(V(0, -0.1, 0)), 0.42, 0.22, 0.012, kit.col(k % 2 ? pal.canvas : pal.stripe ?? pal.paint), b.yaw - s.face + Math.PI / 2, 0);
    }
  }
  for (const [ci, du, dv] of [[2, 1.2, -0.5], [3, 1.2, 0.5], [0, -1.0, -0.6]]) {
    const top = corners[ci];
    const [u, v] = ci === 0 ? [-Dp / 2 + du, -L / 2 + dv] : [Dp / 2 + du, (ci === 2 ? -L / 2 : L / 2) + dv];
    const stake = F.at(u, v);
    kit.parts.push(paint(segment(top, stake.clone().add(V(0, 0.15, 0)), 0.01, 0.01, 3), pal.rope));
    kit.post(stake.clone().add(V(0, -0.2, 0)), stake.clone().add(V(0, 0.22, 0)), 0.03, kit.col(pal.dark), 4);
  }
  // The counter: planks on two barrels, a cloth over one end, a pair of scales.
  const cu = s.counter ?? -Dp / 2 + 0.75; // the keeper stands between this and the shelves
  const counter = [];
  for (const v of [-0.85, 0.85]) inst.put('barrel', SHAPES.barrel, F.at(cu, v, g0 + 0.31), kit.r(0, 6), kit.col(['#7a6450', '#6c5846']));
  for (let k = 0; k < 3; k++) {
    const u = cu - 0.18 + k * 0.18;
    kit.board(F.at(u, -1.25, g0 + 0.66), F.at(u, 1.25 + kit.r(-0.05, 0.05), g0 + 0.66 + kit.r(-0.01, 0.01)), 0.17, 0.05, UP, kit.col(pal.wood));
  }
  counter.push(F.at(cu, 0.15, g0 + 0.69));
  solidAt(b, F, cu, 0, g0 + 0.4, 0.5, 0.8, 2.5);
  // Scales on the counter.
  const sc = F.at(cu, 0.75, g0 + 0.69);
  kit.parts.push(paint(segment(sc, sc.clone().add(V(0, 0.42, 0)), 0.015, 0.015, 5), '#4a4038'));
  const beam = new THREE.BoxGeometry(0.5, 0.02, 0.02);
  beam.rotateY(b.yaw - s.face + Math.PI / 2);
  beam.translate(sc.x, sc.y + 0.42, sc.z);
  kit.parts.push(paint(beam, '#4a4038'));
  for (const d of [-0.24, 0.24]) {
    const pan = new THREE.CylinderGeometry(0.1, 0.07, 0.03, 10);
    const pp = sc.clone().addScaledVector(F.Vv, d).add(V(0, 0.18, 0));
    pan.translate(pp.x, pp.y, pp.z);
    kit.parts.push(paint(pan, '#8a6a3a'));
    kit.parts.push(paint(segment(pp, pp.clone().add(V(0, 0.24, 0)), 0.004, 0.004, 3), '#4a4038'));
  }
  // Shelves at the back (three boards on uprights, not quite level).
  const shelves = [];
  const su = -Dp / 2 + 0.2;
  for (const v of [-1.85, -0.5]) {
    for (const vv of [v, v + 1.3]) kit.post(F.at(su, vv, g0 - 0.1), F.at(su, vv, g0 + 1.6), 0.035, kit.col(pal.dark), 4);
    for (const y of [0.35, 0.82, 1.28]) {
      kit.board(F.at(su, v - 0.05, g0 + y), F.at(su, v + 1.35, g0 + y + kit.r(-0.025, 0.025)), 0.3, 0.035, UP, kit.col(pal.wood));
      shelves.push({ a: F.at(su, v + 0.1, g0 + y + 0.02), b: F.at(su, v + 1.2, g0 + y + 0.02) });
    }
    solidAt(b, F, su, v + 0.65, g0 + 0.8, 0.35, 1.6, 1.4);
  }
  // A bar between the front poles with hooks, for things to hang.
  const hooks = [];
  const ha = corners[2].clone().add(V(0, -0.55, 0));
  const hb = corners[3].clone().add(V(0, -0.55, 0));
  kit.board(ha, hb, 0.05, 0.05, UP, kit.col(pal.dark), { sag: 0.03 });
  for (let k = 0; k < 7; k++) {
    const p = ha.clone().lerp(hb, (k + 0.5) / 7).add(V(0, -0.03, 0));
    kit.parts.push(paint(segment(p, p.clone().add(V(0, -0.12, 0)), 0.006, 0.006, 3), '#3a3532'));
    hooks.push(p.clone().add(V(0, -0.12, 0)));
  }
  // Baskets on the ground in front.
  const baskets = [];
  for (const [u, v] of s.baskets ?? [[0.9, -1.7], [1.35, -1.05], [1.25, 1.15], [0.8, 1.75]]) {
    const p = F.at(u, v);
    const bk = new THREE.CylinderGeometry(0.3, 0.24, 0.3, 10, 1, true);
    bk.translate(p.x, p.y + 0.15, p.z);
    kit.parts.push(paint(bk, kit.col(['#a08a5c', '#94804f', '#ab9466']).getStyle()));
    const rim = new THREE.TorusGeometry(0.3, 0.025, 3, 12);
    rim.rotateX(Math.PI / 2);
    rim.translate(p.x, p.y + 0.3, p.z);
    kit.parts.push(paint(rim, '#7a6a48'));
    baskets.push(p.clone().add(V(0, 0.28, 0)));
  }
  const counterSpot = (k) => counter[0].clone().addScaledVector(F.Vv, -0.9 + k * 0.2);
  return { counter, counterSpot, shelves, hooks, hookFrom: 1, baskets, frame: F, g0 };
}

/**
 * A table to sell from in the open. Gwen's slab at the cove ('slab'): thick
 * wet boards on two barrels, tipped toward you so it drains, an old sail
 * over it on a pair of oars and two poles, a gallows with hooks for the
 * kippers and salt fish, baskets of crab, a fish box and a bucket. Dorcas's
 * at the strand ('veg'): an old door laid on two crates, baskets at the
 * ends, a post with a crossbar for strings of onions. Returns where goods go
 * (for the shop), like stall().
 */
export function marketTable(b, kit, s, inst) {
  const pal = kit.pal;
  const F = frame(b, s.at[0], s.at[1], s.face); // +u: toward the customers; the keeper's behind, at −u
  const g0 = F.at(0, 0).y;
  const slab = s.kind === 'slab';
  const L = s.len ?? 2.4; // along v
  const Dp = s.depth ?? 0.9; // along u
  const th = g0 + (slab ? 0.7 : 0.58);
  const yaw = b.yaw - s.face;
  // What it stands on.
  for (const v of [-L / 2 + 0.42, L / 2 - 0.42]) {
    if (slab) inst.put('barrel', SHAPES.barrel, F.at(0, v, g0 + 0.31), kit.r(0, 6), kit.col(['#7a6450', '#6c5846']));
    else inst.put('crate', SHAPES.crate, F.at(0, v, g0 + 0.27), yaw + kit.r(-0.12, 0.12), kit.col(['#8a7a62', '#7a6c58', '#94846a']));
  }
  if (slab) {
    // Thick boards, dark with wet, the front edge lower.
    for (let u = -Dp / 2; u < Dp / 2 - 0.02; ) {
      const w = Math.min(Dp / 2 - u, kit.r(0.2, 0.27));
      const drop = ((u + w / 2 + Dp / 2) / Dp) * 0.05;
      kit.board(F.at(u + w / 2, -L / 2 - kit.r(0, 0.06), th - drop), F.at(u + w / 2, L / 2 + kit.r(0, 0.06), th - drop + kit.r(-0.01, 0.01)), w - 0.012, 0.07, UP, kit.col(['#5f5a52', '#57524a', '#646058'], 0.05));
      u += w;
    }
  } else {
    // A door: its boards, two battens, a rusty handle, and what's left of its paint.
    const doorCol = kit.col(pal.paint, 0.04);
    for (let u = -Dp / 2; u < Dp / 2 - 0.02; ) {
      const w = Math.min(Dp / 2 - u, kit.r(0.16, 0.22));
      kit.board(F.at(u + w / 2, -L / 2, th), F.at(u + w / 2, L / 2, th + kit.r(-0.006, 0.006)), w - 0.01, 0.04, UP, kit.rand() < 0.3 ? kit.col(pal.wood) : doorCol);
      u += w;
    }
    for (const v of [-L / 2 + 0.3, L / 2 - 0.3]) kit.board(F.at(-Dp / 2 + 0.05, v, th - 0.035), F.at(Dp / 2 - 0.05, v, th - 0.035), 0.12, 0.03, UP, kit.col(pal.wood));
    kit.block(F.at(Dp / 2 - 0.12, 0.2, th + 0.035), 0.05, 0.03, 0.14, kit.col(pal.rust), yaw);
  }
  solidAt(b, F, 0, 0, g0 + 0.4, Dp, 0.8, L);
  // Where the goods go: two rows along it, leaving the end by the keeper's hand clear for paying.
  const n = s.places ?? 8;
  const cols = Math.ceil(n / 2);
  const table = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const v = -L / 2 + 0.22 + (c + 0.5) * ((L - 0.85) / cols);
    const u = r ? -Dp / 4 : Dp / 4 - 0.02;
    table.push(F.at(u, v, th + (slab ? 0.04 - ((u + Dp / 2) / Dp) * 0.05 : 0.025)));
  }
  const counter = [F.at(-0.05, L / 2 - 0.3, th + 0.03)];
  const counterSpot = (k) => counter[0].clone().addScaledVector(F.U, 0.22 - (k % 3) * 0.17).addScaledVector(F.Vv, -Math.floor(k / 3) * 0.17);
  // Scales at the paying end, on the slab; a knife.
  if (slab) {
    kit.block(F.at(-0.25, L / 2 - 0.12, th + 0.02), 0.06, 0.02, 0.24, '#8a8f93', yaw + 0.5);
    const pan = new THREE.CylinderGeometry(0.12, 0.09, 0.04, 10);
    const pp = F.at(-0.3, L / 2 - 0.45, th + 0.05);
    pan.translate(pp.x, pp.y, pp.z);
    kit.parts.push(paint(pan, '#8a6a3a'));
  }
  // Hooks: a gallows at the far end (the slab), or a post with a crossbar (the door).
  const hooks = [];
  const gv = -L / 2 - (slab ? 0.55 : 0.4);
  const gu = slab ? 0.25 : 0.1;
  const gTop = g0 + (slab ? 1.85 : 1.55);
  const gp = F.at(gu, gv);
  kit.post(gp.clone().add(V(0, -0.3, 0)), F.at(gu, gv, gTop + 0.08), 0.05, kit.col(pal.dark), 5);
  postCollider(b, gp, 0.09, gTop - g0);
  const arm = slab ? 0.9 : 0.55;
  const a0 = F.at(gu, gv + 0.08, gTop);
  const a1 = F.at(gu, gv + arm, gTop - kit.r(0.02, 0.05));
  kit.board(F.at(gu, gv - 0.12, gTop), a1, 0.05, 0.05, UP, kit.col(pal.dark), { sag: 0.02 });
  kit.parts.push(paint(segment(F.at(gu, gv, gTop - 0.4), F.at(gu, gv + 0.35, gTop), 0.02, 0.02, 4), kit.col(pal.dark).getStyle())); // the brace
  const nh = s.hooks ?? 4;
  for (let k = 0; k < nh; k++) {
    const p = a0.clone().lerp(a1, (k + 0.6) / (nh + 0.2)).add(V(0, -0.03, 0));
    kit.parts.push(paint(segment(p, p.clone().add(V(0, -0.12, 0)), 0.006, 0.006, 3), '#3a3532'));
    hooks.push(p.clone().add(V(0, -0.12, 0)));
  }
  // Baskets on the ground at the ends.
  const baskets = [];
  const bspots = slab ? [[0.15, L / 2 + 0.5], [0.75, L / 2 + 0.35], [-0.35, L / 2 + 0.55]] : [[0.25, L / 2 + 0.45], [0.15, gv - 0.55], [0.75, gv - 0.3]];
  for (const [u, v] of bspots.slice(0, s.baskets ?? 3)) {
    const p = F.at(u, v);
    const bk = new THREE.CylinderGeometry(0.3, 0.24, 0.3, 10, 1, true);
    bk.translate(p.x, p.y + 0.15, p.z);
    kit.parts.push(paint(bk, kit.col(['#a08a5c', '#94804f', '#ab9466']).getStyle()));
    const rim = new THREE.TorusGeometry(0.3, 0.025, 3, 12);
    rim.rotateX(Math.PI / 2);
    rim.translate(p.x, p.y + 0.3, p.z);
    kit.parts.push(paint(rim, '#7a6a48'));
    baskets.push(p.clone().add(V(0, 0.28, 0)));
  }
  if (slab) {
    // An old sail over it, on a pair of oars stuck in the sand behind and two poles in front.
    const corners = [];
    for (const [u, v, h] of [[-Dp / 2 - 0.75, -L / 2 - 0.1, 2.25], [-Dp / 2 - 0.75, L / 2 + 0.1, 2.2], [Dp / 2 + 0.35, -L / 2 - 0.05, 1.95], [Dp / 2 + 0.35, L / 2 + 0.05, 2.0]]) {
      const foot = F.at(u, v);
      const top = foot.clone().add(V(kit.r(-0.05, 0.05), h, kit.r(-0.05, 0.05)));
      kit.post(foot.clone().add(V(0, -0.3, 0)), top, u < 0 ? 0.035 : 0.045, kit.col(u < 0 ? pal.wood : pal.dark), 5);
      if (u < 0) {
        // The blade of the oar, at the top.
        kit.block(top.clone().add(V(0, -0.15, 0)), 0.12, 0.45, 0.02, kit.col(pal.paint), yaw + kit.r(-0.3, 0.3));
      } else postCollider(b, foot, 0.08, h);
      corners.push(top);
    }
    // Old tan sailcloth, a patch let in, sagging where the rain sits.
    kit.parts.push(cloth(corners[0].clone(), corners[1].clone(), corners[3].clone(), corners[2].clone(), [kit.col(['#8f8168', '#998a6e']).getStyle(), kit.col(['#8a7c62']).getStyle(), kit.col(pal.paint, 0.04).getStyle(), kit.col(['#938569']).getStyle()], 0.3, 8, 4));
    for (const [i, j] of [[0, 2], [1, 3]]) kit.parts.push(paint(segment(corners[i], corners[j], 0.012, 0.012, 3), pal.rope));
    // A fish box with the morning's leftovers, a bucket, a stain on the sand.
    const fb = F.at(-Dp / 2 - 0.35, L / 2 + 0.2);
    inst.put('crate', SHAPES.crate, fb.clone().add(V(0, 0.2, 0)), yaw + 0.3, kit.col(['#7a6c58']), V(1, 0.75, 1));
    for (let i = 0; i < 3; i++) inst.put('fish', SHAPES.fish, fb.clone().add(V(kit.r(-0.12, 0.12), 0.42, kit.r(-0.12, 0.12))), kit.r(0, 6), kit.col(['#8a9aa0', '#9aa5a0', '#7f8c88'], 0.05), 0.8, 0.2);
    const bucket = new THREE.CylinderGeometry(0.16, 0.13, 0.3, 9, 1, true);
    const bp = F.at(-Dp / 2 - 0.2, -L / 2 + 0.2);
    bucket.translate(bp.x, bp.y + 0.15, bp.z);
    kit.parts.push(paint(bucket, '#6b6f6e'));
  } else {
    // A sack of something and a fork stuck in the ground; the trug she carries it in.
    inst.put('sack', SHAPES.sack, F.at(-Dp / 2 - 0.35, L / 2 - 0.1), kit.r(0, 6), kit.col(['#a8956c', '#9c8a60']), 0.9, 0.15);
    const fk = F.at(-Dp / 2 - 0.5, -L / 2 + 0.25);
    kit.parts.push(paint(segment(fk.clone().add(V(0, -0.1, 0)), fk.clone().add(V(0.04, 1.05, 0.02)), 0.018, 0.016, 4), kit.col(pal.wood).getStyle()));
    kit.block(fk.clone().add(V(0.04, 1.08, 0.02)), 0.2, 0.04, 0.04, kit.col(pal.wood), yaw);
  }
  const top = F.at(0, 0, th + 0.02);
  return { counter, counterSpot, table, shelves: [], hooks, hookFrom: 0, baskets, frame: F, g0, cloth: { at: top, w: L + 0.1, d: Dp + 0.1 } };
}

/** A handcart with one wheel off, propped on a crate. */
export function handcart(b, kit, lx, lz, face) {
  const pal = kit.pal;
  const F = frame(b, lx, lz, face);
  const g = F.at(0, 0).y;
  const tilt = 0.18;
  const y = (u) => g + 0.62 - u * tilt * 0.3;
  for (let v = -0.5; v <= 0.5; v += 0.2) kit.board(F.at(-0.9, v, y(-0.9)), F.at(0.9, v, y(0.9)), 0.18, 0.04, UP, kit.col(pal.wood));
  for (const v of [-0.6, 0.6]) {
    kit.board(F.at(-0.9, v, y(-0.9) + 0.12), F.at(0.9, v, y(0.9) + 0.12), 0.18, 0.04, F.Vv, kit.col(pal.wood));
    kit.board(F.at(0.9, v * 0.6, y(0.9) + 0.02), F.at(1.9, v * 0.4, g + 0.15), 0.06, 0.06, UP, kit.col(pal.dark)); // shafts, down on the sand
  }
  // The one wheel still on.
  const wheel = new THREE.TorusGeometry(0.45, 0.05, 4, 12);
  const wp1 = F.at(0.1, 0.68, g + 0.45);
  wheel.rotateY(b.yaw - face);
  wheel.translate(wp1.x, wp1.y, wp1.z);
  kit.parts.push(paint(wheel, kit.col(pal.dark).getStyle()));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const tip = wp1.clone().addScaledVector(F.U, Math.cos(a) * 0.43).add(V(0, Math.sin(a) * 0.43, 0));
    kit.parts.push(paint(segment(wp1, tip, 0.02, 0.02, 3), kit.col(pal.wood).getStyle()));
  }
  // The other lying flat on the sand beside it.
  const lost = new THREE.TorusGeometry(0.45, 0.05, 4, 12);
  lost.rotateX(Math.PI / 2);
  const lp = F.at(0.4, -1.5, g + 0.05);
  lost.translate(lp.x, lp.y, lp.z);
  kit.parts.push(paint(lost, kit.col(pal.dark).getStyle()));
  b.solid(lx, g + 0.4, lz, 1.9, 0.8, 1.3, face);
}

/** A derrick at the head of the quay: a post, a boom, a block and a hook with a sling. */
export function derrick(b, kit, d) {
  const pal = kit.pal;
  const base = wp(b, d.at[0], d.at[1], d.y);
  const top = base.clone().add(V(0.05, 3.8, 0.04));
  kit.post(base.clone().add(V(0, -2.5, 0)), top, 0.13, kit.col(pal.dark), 7);
  postCollider(b, base, 0.18, 3.8);
  const out = wp(b, d.at[0] + Math.cos(d.face) * 3.2, d.at[1] + Math.sin(d.face) * 3.2, d.y + 3.0);
  const heel = base.clone().add(V(0, 0.9, 0));
  kit.post(heel, out, 0.07, kit.col(pal.dark), 6);
  kit.parts.push(paint(segment(top, out, 0.012, 0.012, 3), pal.rope));
  const hook = out.clone().add(V(0, -1.6, 0));
  kit.parts.push(paint(segment(out, hook, 0.012, 0.012, 3), pal.rope));
  const blk = new THREE.BoxGeometry(0.12, 0.2, 0.08);
  blk.translate(out.x, out.y - 0.12, out.z);
  kit.parts.push(paint(blk, '#3a3532'));
  const h = new THREE.TorusGeometry(0.06, 0.015, 3, 8, Math.PI * 1.4);
  h.translate(hook.x, hook.y, hook.z);
  kit.parts.push(paint(h, '#4a4540'));
  // The fall led down to a cleat on the post.
  kit.parts.push(paint(segment(out, heel.clone().add(V(0.12, 0.1, 0)), 0.01, 0.01, 3), pal.rope));
}

/** Short fat bollards along a quay edge. */
export function bollards(b, kit, pts, y) {
  for (const [lx, lz] of pts) {
    const p = wp(b, lx, lz, y);
    kit.post(p.clone().add(V(0, -0.05, 0)), p.clone().add(V(0, 0.42, 0)), 0.13, kit.col(kit.pal.dark), 7);
    const cap = new THREE.CylinderGeometry(0.17, 0.15, 0.06, 7);
    cap.translate(p.x, p.y + 0.44, p.z);
    kit.parts.push(paint(cap, kit.col(kit.pal.dark).getStyle()));
    postCollider(b, p, 0.14, 0.45);
  }
}

/** The ropewalk, by hand: posts that lean, pegged crossbars, strands sagging between, the wheel. */
export function ropewalk(b, kit, rw, inst) {
  const pal = kit.pal;
  const [x0, z0] = rw.from;
  const [x1, z1] = rw.to;
  const f = Math.atan2(z1 - z0, x1 - x0);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const F = frame(b, x0, z0, f);
  const tops = [];
  for (let u = 0; u <= len + 0.01; u += 4) {
    const foot = F.at(u + kit.r(-0.15, 0.15), 0);
    const top = foot.clone().add(V(kit.r(-0.06, 0.06), 1.0 + kit.r(-0.06, 0.08), kit.r(-0.06, 0.06)));
    kit.post(foot.clone().add(V(0, -0.25, 0)), top, kit.r(0.045, 0.06), kit.col(pal.dark), 5);
    kit.board(top.clone().addScaledVector(F.Vv, -0.3), top.clone().addScaledVector(F.Vv, 0.3).add(V(0, kit.r(-0.03, 0.03), 0)), 0.07, 0.06, UP, kit.col(pal.wood));
    for (const off of [-0.18, 0, 0.18]) {
      const peg = top.clone().addScaledVector(F.Vv, off).add(V(0, 0.03, 0));
      kit.parts.push(paint(segment(peg, peg.clone().add(V(0, 0.09, 0)), 0.012, 0.012, 3), kit.col(pal.dark).getStyle()));
    }
    tops.push(top);
  }
  for (const off of [-0.18, 0, 0.18]) {
    for (let i = 1; i < tops.length; i++) {
      const a = tops[i - 1].clone().addScaledVector(F.Vv, off).add(V(0, 0.07, 0));
      const c = tops[i].clone().addScaledVector(F.Vv, off).add(V(0, 0.07, 0));
      const mid = a.clone().lerp(c, 0.5).add(V(0, -0.12 - Math.abs(off) * 0.2, 0));
      kit.parts.push(paint(segment(a, mid, 0.013, 0.013, 3), pal.rope), paint(segment(mid, c, 0.013, 0.013, 3), pal.rope));
    }
  }
  // The spinning wheel, on a frame, before the first post.
  const wc = F.at(-1.3, 0);
  const hub = wc.clone().add(V(0, 0.78, 0));
  const wheel = new THREE.TorusGeometry(0.48, 0.04, 4, 16);
  wheel.rotateY(b.yaw - f);
  wheel.translate(hub.x, hub.y, hub.z);
  kit.parts.push(paint(wheel, kit.col(pal.wood).getStyle()));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const tip = hub.clone().addScaledVector(F.Vv, Math.cos(a) * 0.46).add(V(0, Math.sin(a) * 0.46, 0));
    kit.parts.push(paint(segment(hub, tip, 0.015, 0.015, 3), kit.col(pal.wood).getStyle()));
  }
  for (const s of [-0.12, 0.12]) kit.post(wc.clone().addScaledVector(F.U, s).add(V(0, -0.1, 0)), hub.clone().addScaledVector(F.U, s), 0.04, kit.col(pal.dark), 4);
  kit.parts.push(paint(segment(hub.clone().addScaledVector(F.U, -0.2), hub.clone().addScaledVector(F.U, 0.2), 0.03, 0.03, 5), '#3a3532'));
  postCollider(b, wc, 0.35, 1.3);
  // Hemp waiting, in bundles on a trestle.
  const tr = F.at(-1.6, -1.6);
  for (const v of [-0.5, 0.5]) kit.post(tr.clone().addScaledVector(F.Vv, v).add(V(0, -0.1, 0)), tr.clone().addScaledVector(F.Vv, v).add(V(0, 0.65, 0)), 0.035, kit.col(pal.dark), 4);
  for (let k = 0; k < 3; k++) {
    const p = tr.clone().addScaledVector(F.U, (k - 1) * 0.22).add(V(0, 0.75, 0));
    const bundle = segment(p.clone().addScaledVector(F.Vv, -0.6), p.clone().addScaledVector(F.Vv, 0.6), 0.1, 0.09, 6);
    kit.parts.push(paint(bundle, kit.col(['#b7a97f', '#a99a70']).getStyle()));
  }
  solidAt(b, F, -1.6, -1.6, tr.y + 0.4, 0.8, 0.8, 1.4);
  void inst;
}

// ---------------------------------------------------------------------------
// Kettle Strand
// ---------------------------------------------------------------------------

/**
 * Dorcas's garden, fenced with driftwood against the goats on three sides
 * (open to the west, where she and Ben work it): rows, a scarecrow in an old
 * oilskin, a water butt.
 */
export function garden(b, kit, gd, inst) {
  const pal = kit.pal;
  const [lx, lz] = gd.at;
  // Dug rows, darker than the sand, with things coming up.
  for (let r = 0; r < 4; r++) {
    const x = lx - gd.w / 2 + (r + 0.5) * (gd.w / 4);
    const a = wp(b, x, lz - gd.d / 2 + 0.3);
    const c = wp(b, x, lz + gd.d / 2 - 0.3);
    kit.board(a.clone().add(V(0, 0.02, 0)), c.clone().add(V(0, 0.02, 0)), 0.55, 0.1, UP, kit.col(['#3e342c', '#453a30']));
    for (let k = 0; k < 7; k++) {
      if (kit.rand() < 0.15) continue;
      const z = lz - gd.d / 2 + 0.5 + k * ((gd.d - 1) / 6);
      const p = wp(b, x + kit.r(-0.06, 0.06), z);
      inst.put('plant', SHAPES.plant, p.add(V(0, 0.07, 0)), kit.r(0, 6), kit.col(r % 2 ? ['#5d7a3a', '#56703a'] : ['#6b8442', '#7a8a48']), kit.r(0.8, 1.3));
    }
  }
  // The fence: posts not in a line, two rails, the odd plank, one panel down.
  const x0 = lx - gd.w / 2 - 0.4;
  const x1 = lx + gd.w / 2 + 0.4;
  const z0 = lz - gd.d / 2 - 0.4;
  const z1 = lz + gd.d / 2 + 0.4;
  const runs = [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]]];
  runs.forEach(([[ax, az], [cx, cz]], ri) => {
    const n = Math.max(2, Math.round(Math.hypot(cx - ax, cz - az) / 1.6));
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = wp(b, ax + (cx - ax) * t + kit.r(-0.08, 0.08), az + (cz - az) * t + kit.r(-0.08, 0.08));
      const top = p.clone().add(V(kit.r(-0.05, 0.05), kit.r(0.75, 1.0), kit.r(-0.05, 0.05)));
      kit.post(p.clone().add(V(0, -0.2, 0)), top, kit.r(0.04, 0.06), kit.col(pal.wood), 5);
      // Two rails to the last post (but not where a panel's come down).
      if (prev && !(ri === 2 && k === 2)) {
        for (const y of [0.32, 0.7]) kit.board(prev.clone().add(V(0, y + kit.r(-0.04, 0.04), 0)), p.clone().add(V(0, y + kit.r(-0.04, 0.04), 0)), 0.07, 0.035, UP, kit.col(pal.wood), { sag: 0.02 });
      }
      prev = p;
    }
    const mx = (ax + cx) / 2;
    const mz = (az + cz) / 2;
    const len = Math.hypot(cx - ax, cz - az);
    b.solid(mx, groundAt(b.w(mx, mz).x, b.w(mx, mz).z) + 0.5, mz, len, 1.0, 0.15, Math.atan2(cz - az, cx - ax));
  });
  // The fallen panel lying in the grass.
  const fp = wp(b, x0 + 0.6, z1 + 0.7);
  for (const y of [0, 0.35]) kit.board(fp.clone().add(V(-0.8, 0.04 + y * 0.1, y)), fp.clone().add(V(0.8, 0.04, y)), 0.07, 0.035, UP, kit.col(pal.wood));
  // A scarecrow in an old oilskin and a hat.
  const sc = wp(b, lx + 0.6, lz + 0.4);
  kit.post(sc.clone().add(V(0, -0.3, 0)), sc.clone().add(V(0, 1.65, 0)), 0.04, kit.col(pal.dark), 4);
  kit.post(sc.clone().add(V(-0.55, 1.25, 0.05)), sc.clone().add(V(0.55, 1.3, -0.05)), 0.03, kit.col(pal.dark), 4);
  const coat = new THREE.CylinderGeometry(0.16, 0.3, 0.75, 7, 1, true);
  coat.translate(sc.x, sc.y + 0.95, sc.z);
  kit.parts.push(paint(coat, '#8a7a3e'));
  const head = new THREE.SphereGeometry(0.15, 7, 5);
  head.translate(sc.x, sc.y + 1.52, sc.z);
  kit.parts.push(paint(head, '#a89a74'));
  const brim = new THREE.CylinderGeometry(0.26, 0.26, 0.03, 9);
  brim.translate(sc.x, sc.y + 1.64, sc.z);
  const crown = new THREE.CylinderGeometry(0.12, 0.14, 0.15, 8);
  crown.translate(sc.x, sc.y + 1.72, sc.z);
  kit.parts.push(paint(brim, '#3e3a34'), paint(crown, '#3e3a34'));
  // The water butt at the corner, a bucket by it.
  const wb = wp(b, x1 + 0.6, z0 + 0.4);
  inst.put('barrel', SHAPES.barrel, wb.clone().add(V(0, 0.31, 0)), 0.3, '#5f5246', 1.15);
  b.solid(x1 + 0.6, wb.y + 0.4, z0 + 0.4, 0.6, 0.8, 0.6, 0);
}

/** Overgrowth round something abandoned: brambles at the walls, grass all over. */
export function overgrowth(b, kit, lx, lz, r, inst, n = 10) {
  for (let k = 0; k < n; k++) {
    const a = kit.r(0, Math.PI * 2);
    const d = kit.r(r * 0.6, r * 1.15);
    const p = wp(b, lx + Math.cos(a) * d, lz + Math.sin(a) * d);
    if (k % 3 === 0) inst.put('bramble', SHAPES.bramble, p.clone().add(V(0, -0.05, 0)), kit.r(0, 6), kit.col(['#3f5a2c', '#4a6230', '#536a34']), kit.r(0.8, 1.4));
    else inst.put('tuft', SHAPES.tuft, p, kit.r(0, 6), kit.col(['#6f7f44', '#7d8a4c', '#8a8a52']), kit.r(0.9, 1.6));
  }
}

// ---------------------------------------------------------------------------
// The yard
// ---------------------------------------------------------------------------

/**
 * Ned's shed, by hand: three walls and the front open to the slip, a tarred
 * roof with the ridge front to back, his bench and his cot, tools on the
 * wall, shavings on the floor, a stovepipe. Same colliders as before.
 */
export function shed(b, kit, sh, inst) {
  const pal = kit.pal;
  const [lx, lz] = sh.at;
  const W = sh.w;
  const D = sh.d;
  const H = 2.5;
  const y0 = sh.floor;
  const F = frame(b, lx, lz, 0);
  const at = (u, v, y) => F.at(u, v, y);
  const solid = (u, y, v, w, h, d) => b.solid(lx + u, y, lz + v, w, h, d, 0);
  // Floor on stones.
  for (const v of [-W / 2 + 0.25, 0, W / 2 - 0.25]) kit.board(at(-D / 2, v, y0 - 0.1), at(D / 2, v, y0 - 0.1), 0.14, 0.12, UP, kit.col(pal.dark));
  for (let u = -D / 2; u < D / 2 - 0.02; ) {
    const w = Math.min(D / 2 - u, kit.r(0.18, 0.3));
    kit.board(at(u + w / 2, -W / 2 - kit.r(0, 0.1), y0 - 0.03), at(u + w / 2, W / 2 + kit.r(0, 0.1), y0 - 0.03), w - 0.012, 0.055, UP, kit.col(pal.wood));
    u += w;
  }
  for (const [u, v] of [[-D / 2 + 0.3, -W / 2 + 0.3], [D / 2 - 0.3, -W / 2 + 0.3], [-D / 2 + 0.3, W / 2 - 0.3], [D / 2 - 0.3, W / 2 - 0.3], [0, -W / 2 + 0.3], [0, W / 2 - 0.3]]) {
    const p = at(u, v);
    const r = rock(0.42, Math.round(p.x * 13 + p.z * 7), kit.col(pal.stone).getStyle());
    r.translate(p.x, Math.min(p.y, y0 - 0.4) + 0.15, p.z);
    kit.parts.push(r);
  }
  solid(0, y0 - 0.1, 0, D, 0.2, W);
  // The step up at the front: an old plank on two stones.
  kit.board(at(D / 2 + 0.3, -1.2, y0 - 0.17), at(D / 2 + 0.3, 1.2, y0 - 0.19), 0.6, 0.08, UP, kit.col(pal.dark));
  solid(D / 2 + 0.3, y0 - 0.22, 0, 0.6, 0.16, 2.4);
  // Walls: back and both sides, each leaning its own way; a window in the north side.
  const lean = () => kit.r(-0.03, 0.03);
  const wallAt = (o, along, out, len, holes) => {
    const up = UP.clone().addScaledVector(out, lean()).normalize();
    kit.wall(o, along, up, out, len, H, { holes, base: 0.22, salvage: 0.1 });
  };
  wallAt(at(-D / 2, W / 2, y0), F.Vv.clone().negate(), F.U.clone().negate(), W, []);
  solid(-D / 2, y0 + H / 2, 0, 0.2, H, W);
  wallAt(at(-D / 2, -W / 2, y0), F.U, F.Vv.clone().negate(), D, [{ a0: 1.6, a1: 2.3, b0: 1.1, b1: 1.65 }]);
  kit.window(at(-D / 2 + 1.95, -W / 2 - 0.02, y0 + 1.375), F.U, F.Vv.clone().negate(), 0.62, 0.5, 'ned');
  solid(0, y0 + H / 2, -W / 2, D, H, 0.2);
  wallAt(at(D / 2, W / 2, y0), F.U.clone().negate(), F.Vv, D, []);
  solid(0, y0 + H / 2, W / 2, D, H, 0.2);
  // Front posts, and a beam over the opening that's taken some weight.
  for (const v of [-W / 2 + 0.09, W / 2 - 0.09]) kit.post(at(D / 2 - 0.09, v, y0 - 0.1), at(D / 2 - 0.09, v, y0 + H + 0.05), 0.1, kit.col(pal.dark), 6);
  kit.board(at(D / 2 - 0.1, -W / 2, y0 + H - 0.08), at(D / 2 - 0.1, W / 2, y0 + H - 0.1), 0.2, 0.22, F.U, kit.col(pal.dark), { sag: 0.05 });
  // Roof: ridge front to back, tarred, a sheet of tin over a bad patch.
  const pitch = 0.5;
  const rise = (W / 2) * Math.tan(pitch);
  kit.roof(at(0, 0, y0), F.U, F.Vv, D + 0.2, W / 2, H + rise, H - 0.02, { sag: 0.1, overhang: 0.4, patch: 'boards', material: 'tar' });
  // Gables, boarded; the front one over the opening.
  for (const side of [-1, 1]) {
    const u = side * (D / 2) - (side > 0 ? 0.1 : 0);
    const n = F.U.clone().multiplyScalar(side);
    for (let v = -W / 2 + 0.05; v < W / 2 - 0.05; v += 0.26) {
      const top = H + rise * (1 - Math.abs(v + 0.13) / (W / 2)) - 0.04;
      if (top <= H) continue;
      kit.board(at(u, v + 0.13, y0 + H - 0.02), at(u, v + 0.13, y0 + top), 0.24, 0.04, n, kit.col(pal.wood));
    }
  }
  kit.stovepipe(at(-D / 2 + 1.2, W / 2 - 0.7, y0 + H + rise * 0.55), 1.1);
  // The bench along the back, his vice, a saw, a mallet, a plane.
  const bu = -D / 2 + 0.45;
  const bv = -W / 2 + 1.75;
  kit.board(at(bu, bv - 1.25, y0 + 0.88), at(bu, bv + 1.25, y0 + 0.88), 0.72, 0.08, UP, kit.col(['#8a6a44', '#7d603e']));
  for (const [du, dv] of [[-0.28, -1.15], [0.28, -1.15], [-0.28, 1.15], [0.28, 1.15]]) kit.post(at(bu + du, bv + dv, y0), at(bu + du, bv + dv, y0 + 0.85), 0.04, kit.col(pal.dark), 4);
  kit.board(at(bu, bv - 1.1, y0 + 0.26), at(bu, bv + 1.1, y0 + 0.26), 0.6, 0.05, UP, kit.col(pal.dark));
  kit.block(at(bu + 0.36, bv + 0.9, y0 + 0.97), 0.16, 0.2, 0.3, '#4a4f52', b.yaw);
  kit.block(at(bu + 0.1, bv - 0.5, y0 + 0.93), 0.04, 0.02, 0.55, '#8d9295', b.yaw);
  kit.block(at(bu + 0.1, bv - 0.84, y0 + 0.95), 0.07, 0.1, 0.12, '#a08460', b.yaw);
  kit.block(at(bu + 0.15, bv + 0.15, y0 + 0.95), 0.12, 0.1, 0.24, '#7a5a3a', b.yaw + 0.3);
  kit.block(at(bu - 0.1, bv + 0.45, y0 + 0.95), 0.08, 0.08, 0.28, '#6a4a2e', b.yaw - 0.2);
  solid(bu, y0 + 0.45, bv, 0.72, 0.9, 2.5);
  // Tools hung on the back wall: saws, a brace, clamps.
  for (let i = 0; i < 6; i++) {
    const p = at(-D / 2 + 0.07, bv - 1.1 + i * 0.42, y0 + 1.45 + (i % 2) * 0.12);
    kit.block(p, 0.03, 0.35 + (i % 3) * 0.12, i % 2 ? 0.14 : 0.06, i % 2 ? '#6d7275' : '#8a6a44', b.yaw);
  }
  // The cot in the back corner, a blanket, a lamp on a box.
  const cv = W / 2 - 1.15;
  kit.block(at(-D / 2 + 0.55, cv, y0 + 0.15), 0.85, 0.3, 1.95, kit.col(pal.dark), b.yaw);
  kit.block(at(-D / 2 + 0.55, cv + 0.1, y0 + 0.34), 0.8, 0.07, 1.7, '#5f6a5a', b.yaw);
  kit.block(at(-D / 2 + 0.55, cv - 0.72, y0 + 0.4), 0.5, 0.1, 0.32, '#d9d2c2', b.yaw);
  kit.block(at(-D / 2 + 1.2, cv - 1.0, y0 + 0.25), 0.4, 0.5, 0.4, kit.col(pal.wood), b.yaw);
  // Shavings in drifts on the floor and out of the door.
  for (let i = 0; i < 14; i++) {
    const u = kit.r(-D / 2 + 0.6, D / 2 + 1.4);
    const p = at(u, kit.r(-W / 2 + 0.4, 0.8), null);
    if (u < D / 2) p.y = y0;
    const s = new THREE.CircleGeometry(kit.r(0.15, 0.35), 6);
    s.rotateX(-Math.PI / 2);
    s.translate(p.x, p.y + 0.012, p.z);
    kit.parts.push(paint(s, kit.col(['#d8c49c', '#cdb58a', '#e0cfa8']).getStyle()));
  }
  // The tar pail by the door.
  const pail = new THREE.CylinderGeometry(0.2, 0.16, 0.34, 10);
  const pp = at(D / 2 - 0.5, -W / 2 + 0.5, y0 + 0.17);
  pail.translate(pp.x, pp.y, pp.z);
  kit.parts.push(paint(pail, '#2f2b28'));
  void inst;
  return { at, D, W, H, y0 };
}

/** Sawn planks stacked to season, stickers between, a tarpaulin weighted with stones over one end. */
export function timber(b, kit, lx, lz, face) {
  const pal = kit.pal;
  const F = frame(b, lx, lz, face);
  const g = F.at(0, 0).y;
  for (const u of [-1.8, 0, 1.8]) kit.board(F.at(u, -0.7, g + 0.07), F.at(u, 0.7, g + 0.07), 0.16, 0.14, UP, kit.col(pal.dark));
  for (let layer = 0; layer < 4; layer++) {
    const y = g + 0.17 + layer * 0.12;
    for (let k = 0; k < 4; k++) {
      const v = -0.48 + k * 0.32 + kit.r(-0.02, 0.02);
      const l = 2.1 - (layer % 2) * 0.15 + kit.r(-0.15, 0.1);
      kit.board(F.at(-l, v, y), F.at(l + kit.r(-0.1, 0.1), v, y + kit.r(-0.01, 0.01)), 0.27, 0.055, UP, kit.col(layer % 2 ? ['#b39c78', '#a8916c'] : ['#9a845f', '#a08a66']));
    }
    for (const u of [-1.8, 0, 1.8]) kit.board(F.at(u, -0.62, y + 0.05), F.at(u, 0.62, y + 0.05), 0.05, 0.04, UP, kit.col(pal.dark));
  }
  // An old sail over the end, stones holding it down.
  const top = g + 0.17 + 3 * 0.12 + 0.06;
  kit.parts.push(cloth(F.at(0.8, -0.8, top), F.at(2.3, -0.8, top), F.at(2.3, 0.8, top - 0.25), F.at(0.8, 0.8, top), [kit.col(pal.canvas).getStyle()], 0.05, 3, 3));
  for (const [u, v] of [[1.2, -0.7], [2.0, 0.6]]) {
    const r = rock(0.13, Math.round(lx * 7 + u * 13), kit.col(pal.stone).getStyle());
    const p = F.at(u, v, top + 0.06);
    r.translate(p.x, p.y, p.z);
    kit.parts.push(r);
  }
  b.solid(lx, g + 0.35, lz, 4.4, 0.7, 1.4, face);
}

/** Trunks waiting to be sawn, bark on, ends pale; chocks so they don't roll. */
export function logs(b, kit, lx, lz, face) {
  const F = frame(b, lx, lz, face);
  const g = F.at(0, 0).y;
  const rows = [[-0.6, 0.22], [0, 0.22], [0.6, 0.22], [-0.3, 0.6], [0.3, 0.6], [0, 0.97]];
  rows.forEach(([v, y], i) => {
    const len = 3.2 + kit.r(0, 0.6);
    const r0 = kit.r(0.19, 0.24);
    const a = F.at(-len / 2 + kit.r(-0.1, 0.1), v, g + y);
    const c = F.at(len / 2 + kit.r(-0.1, 0.1), v, g + y + kit.r(-0.02, 0.02));
    kit.parts.push(paint(segment(a, c, r0, r0 * 0.92, 7), kit.col(['#6e5a44', '#7a6650', '#64503d']).getStyle()));
    const end = new THREE.CircleGeometry(r0 * 0.92, 7);
    const n = c.clone().sub(a).normalize();
    end.lookAt(n);
    end.translate(c.x + n.x * 0.01, c.y + n.y * 0.01, c.z + n.z * 0.01);
    kit.parts.push(paint(end, kit.col(['#c7ab7f', '#bfa275']).getStyle()));
    void i;
  });
  for (const u of [-1.2, 1.2]) for (const v of [-0.95, 0.95]) kit.block(F.at(u, v, g + 0.1), 0.15, 0.2, 0.2, kit.col(kit.pal.dark), b.yaw - face, 0.3);
  b.solid(lx, g + 0.5, lz, 3.6, 1.0, 1.7, face);
}

/** Trestles with a plank across, half sawn through; the saw left in it; sawdust. */
export function sawhorse(b, kit, lx, lz, face) {
  const pal = kit.pal;
  const F = frame(b, lx, lz, face);
  const g = F.at(0, 0).y;
  for (const u of [-0.9, 0.9]) {
    for (const v of [-0.32, 0.32]) kit.post(F.at(u + kit.r(-0.04, 0.04), v, g - 0.1), F.at(u, 0, g + 0.72), 0.03, kit.col(pal.dark), 4);
    kit.board(F.at(u, -0.22, g + 0.74), F.at(u, 0.22, g + 0.74), 0.08, 0.06, UP, kit.col(pal.dark));
  }
  kit.board(F.at(-1.3, 0, g + 0.8), F.at(1.9, 0, g + 0.8), 0.3, 0.06, UP, kit.col(['#b39c78', '#ab9472']));
  // The saw stood in the cut.
  const cut = F.at(1.15, 0, g + 0.83);
  kit.block(cut.clone().add(V(0, 0.18, 0)), 0.5, 0.3, 0.012, '#8d9295', b.yaw - face, 0.4);
  kit.block(cut.clone().addScaledVector(F.U, 0.28).add(V(0, 0.36, 0)), 0.14, 0.12, 0.04, '#8a6a44', b.yaw - face, 0.4);
  // Sawdust below.
  const sd = new THREE.CircleGeometry(0.5, 7);
  sd.rotateX(-Math.PI / 2);
  sd.scale(1.4, 1, 0.8);
  const sp = F.at(1.15, 0);
  sd.translate(sp.x, sp.y + 0.015, sp.z);
  kit.parts.push(paint(sd, '#dcc9a0'));
}

/** The steam box for bending planks: a long box on legs, a boiler under one end with its flue smoking. */
export function steambox(b, kit, lx, lz, face) {
  const pal = kit.pal;
  const F = frame(b, lx, lz, face);
  const g = F.at(0, 0).y;
  for (const u of [-1.6, 0, 1.6]) for (const v of [-0.25, 0.25]) kit.post(F.at(u, v, g - 0.1), F.at(u, v, g + 0.95), 0.035, kit.col(pal.dark), 4);
  for (const [v, n] of [[-0.22, F.Vv.clone().negate()], [0.22, F.Vv]]) kit.board(F.at(-1.8, v, g + 1.15), F.at(1.8, v, g + 1.15), 0.4, 0.04, n, kit.col(pal.wood));
  kit.board(F.at(-1.8, 0, g + 1.36), F.at(1.8, 0, g + 1.36), 0.48, 0.04, UP, kit.col(pal.wood));
  kit.board(F.at(-1.8, 0, g + 0.94), F.at(1.8, 0, g + 0.94), 0.48, 0.04, UP, kit.col(pal.dark));
  // The boiler: an old drum on stones, black with soot.
  const bp = F.at(-2.4, 0);
  const drum = new THREE.CylinderGeometry(0.32, 0.32, 0.7, 10);
  drum.translate(bp.x, bp.y + 0.55, bp.z);
  kit.parts.push(paint(drum, '#3a3430'));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = rock(0.16, 900 + i, kit.col(pal.stone).getStyle());
    r.translate(bp.x + Math.cos(a) * 0.35, bp.y + 0.08, bp.z + Math.sin(a) * 0.35);
    kit.parts.push(r);
  }
  kit.parts.push(paint(segment(bp.clone().add(V(0, 0.9, 0)), F.at(-1.75, 0, g + 1.15), 0.05, 0.05, 6), '#4a4540'));
  kit.stovepipe(bp.clone().add(V(0.1, 0.9, 0.08)), 0.7);
  b.solid(lx, g + 0.7, lz, 3.8, 1.4, 0.7, face);
  postCollider(b, bp, 0.45, 1.2);
}

/** A capstan at the head of the slip, its bars out, a rope down to the cradle. */
export function capstan(b, kit, lx, lz, toward) {
  const pal = kit.pal;
  const p = wp(b, lx, lz);
  const drum = new THREE.CylinderGeometry(0.22, 0.28, 0.7, 9);
  drum.translate(p.x, p.y + 0.35, p.z);
  kit.parts.push(paint(drum, kit.col(pal.dark).getStyle()));
  const head = new THREE.CylinderGeometry(0.3, 0.3, 0.14, 9);
  head.translate(p.x, p.y + 0.75, p.z);
  kit.parts.push(paint(head, kit.col(pal.dark).getStyle()));
  for (let k = 0; k < 2; k++) {
    const a = k * 1.2 + 0.3;
    kit.parts.push(paint(segment(V(p.x - Math.cos(a) * 1.0, p.y + 0.75, p.z - Math.sin(a) * 1.0), V(p.x + Math.cos(a) * 1.0, p.y + 0.75, p.z + Math.sin(a) * 1.0), 0.035, 0.035, 5), kit.col(pal.wood).getStyle()));
  }
  // Its rope, a few turns on the drum and off down the slip.
  for (let i = 0; i < 3; i++) {
    const t = new THREE.TorusGeometry(0.25, 0.025, 3, 12);
    t.rotateX(Math.PI / 2);
    t.translate(p.x, p.y + 0.25 + i * 0.07, p.z);
    kit.parts.push(paint(t, pal.rope));
  }
  const to = wp(b, ...toward);
  kit.parts.push(paint(segment(p.clone().add(V(0, 0.3, 0)), to.clone().add(V(0, 0.4, 0)), 0.02, 0.02, 4), pal.rope));
  postCollider(b, p, 0.35, 0.9);
}

/** A bench by hand: a plank on two stumps, worn pale where people sit. */
export function bench(b, kit, sp) {
  const f = Math.atan2(sp.face[1] - sp.at[1], sp.face[0] - sp.at[0]);
  const bx = sp.at[0] - Math.cos(f) * 0.15;
  const bz = sp.at[1] - Math.sin(f) * 0.15;
  const F = frame(b, bx, bz, f);
  const y = F.at(0, 0).y;
  for (const v of [-0.6, 0.6]) {
    const p = F.at(0, v);
    kit.parts.push(paint(segment(p.clone().add(V(0, -0.1, 0)), p.clone().add(V(kit.r(-0.02, 0.02), 0.34, 0)), kit.r(0.15, 0.19), 0.15, 7), kit.col(['#6e5a44', '#7a6650']).getStyle()));
  }
  kit.board(F.at(0, -0.78, y + 0.37), F.at(0, 0.8, y + 0.38 + kit.r(-0.02, 0.02)), 0.4, 0.06, UP, kit.col(kit.pal.wood));
}

// ---------------------------------------------------------------------------
// Head Cove: Kitto's
// ---------------------------------------------------------------------------

/**
 * Jenefer Kitto's, out the side of her shack: a lean-to of planks with an
 * old sail over the worst of it, a counter on trestles, a fire ring with a
 * grate and a pot hung over it, fish on hooks, a board on legs for what's
 * on, a lantern, and trestle tables on the sand (`tables`, island-local).
 * Returns where the board's face is, where the fire glows and smokes, and
 * where a bowl goes down on the counter.
 */
export function kitchen(b, kit, k, tables, inst) {
  const pal = kit.pal;
  const F = frame(b, k.at[0], k.at[1], k.face); // +u: out toward the tables
  const g0 = F.at(0, 0).y;
  const wall = -k.wall; // the shack's side, in u
  const [v0, v1] = k.span; // how far the lean-to runs along the wall
  const front = 0.62;
  const hi = Math.min(k.floor + 1.85, g0 + 2.65); // where it's nailed to the shack
  const lo = g0 + 2.12; // the front beam
  // Which end the fire's at (k.fireEnd: 0 the v0 end, 1 the v1 end); e runs from it to the other.
  const e = k.fireEnd === 1 ? -1 : 1;
  const vf = e > 0 ? v0 : v1;
  const vo = e > 0 ? v1 : v0;
  const mid = (v0 + v1) / 2;
  // A ledger along the shack wall, and posts out front that don't match.
  kit.board(F.at(wall + 0.06, v0 - 0.2, hi), F.at(wall + 0.06, v1 + 0.2, hi + kit.r(-0.03, 0.03)), 0.12, 0.06, F.U, kit.col(pal.dark));
  const tops = [];
  for (const v of [v0 + 0.05, mid + 0.35 * e, v1 - 0.05]) {
    const foot = F.at(front, v);
    const top = F.at(front + kit.r(-0.04, 0.04), v + kit.r(-0.04, 0.04), lo + kit.r(-0.07, 0.05));
    kit.post(foot.clone().add(V(0, -0.3, 0)), top, kit.r(0.06, 0.08), kit.col(pal.dark), 6);
    postCollider(b, foot, 0.1, lo - foot.y);
    tops.push(top);
  }
  kit.board(tops[0].clone().add(V(0, 0.05, 0)), tops[2].clone().add(V(0, 0.05, 0)), 0.1, 0.09, UP, kit.col(pal.dark), { sag: 0.05, segs: 3 });
  // Rafters from the ledger out over the beam, and planks across them.
  for (const v of [v0 + 0.1, (v0 + v1) / 2, v1 - 0.1]) kit.board(F.at(wall + 0.08, v, hi - 0.02), F.at(front + 0.35, v, lo + 0.02 - (hi - lo) * (0.35 / (front - wall))), 0.07, 0.07, UP, kit.col(pal.dark));
  const slope = (u) => hi + 0.08 - ((u - wall) / (front + 0.35 - wall)) * (hi - lo + (hi - lo) * (0.35 / (front - wall)));
  const sailRoof = k.roof === 'sail';
  for (let v = v0 - 0.25; v < v1 + 0.2; ) {
    const w = kit.r(0.2, 0.32);
    const vm = v + w / 2;
    v += w;
    // Two gone near the fire end, where the heat got at them. (Under a sail, just a few to hold it down.)
    if (e * (vm - vf) < 0.5 && kit.rand() < 0.6) continue;
    if (sailRoof && kit.rand() < 0.8) continue;
    const reach = front + 0.35 + kit.r(-0.06, 0.08);
    kit.board(F.at(wall + 0.04, vm, slope(wall + 0.04) + 0.04), F.at(reach, vm + kit.r(-0.03, 0.03), slope(reach) + 0.04), w - 0.015, 0.04, UP, kit.col(kit.rand() < 0.15 ? pal.paint : pal.wood, 0.08), { sag: kit.r(0, 0.03) });
  }
  // An old sail thrown over the middle, weighted with a stone at each corner
  // (or, for a roof that's only sail, the whole of it, sagging between the rafters).
  const su0 = sailRoof ? wall + 0.02 : wall + 0.5;
  const su1 = sailRoof ? front + 0.42 : front + 0.25;
  const sv0 = sailRoof ? v0 - 0.3 : mid - 0.9;
  const sv1 = sailRoof ? v1 + 0.3 : mid + 0.7;
  const lift = (u, v) => F.at(u, v, slope(u) + (sailRoof ? 0.0 : 0.09));
  kit.parts.push(cloth(lift(su0, sv0), lift(su0, sv1), lift(su1, sv1), lift(su1, sv0), [kit.col(pal.canvas).getStyle(), kit.col(pal.canvas, 0.1).getStyle(), kit.col(pal.paint, 0.05).getStyle()], sailRoof ? 0.18 : -0.05, sailRoof ? 7 : 4, 3));
  if (sailRoof) {
    // Its torn front edge hanging down in strips.
    for (let k2 = 0; k2 < 7; k2++) {
      const v = sv0 + ((k2 + 0.5) / 7) * (sv1 - sv0);
      kit.block(F.at(su1 - 0.02, v, slope(su1) - 0.18 - kit.r(0, 0.12)), kit.r(0.25, 0.4), kit.r(0.2, 0.36), 0.012, kit.col(pal.canvas), b.yaw - k.face + Math.PI / 2, kit.r(-0.1, 0.1));
    }
  }
  for (const [u, v] of [[su0, sv0], [su1, sv1], [su1 - 0.1, sv0 + 0.1]]) {
    const r = rock(0.13, Math.round(u * 50 + v * 17), kit.col(pal.stone).getStyle());
    const p = lift(u, v);
    r.translate(p.x, p.y + 0.06, p.z);
    kit.parts.push(r);
  }
  // A sign under the front beam: a pot, steaming.
  const sv = mid - e * 0.4;
  const sign = { at: F.at(front + 0.02, sv, lo - 0.42), face: F.U };
  for (const d of [-0.3, 0.3]) kit.parts.push(paint(segment(F.at(front + 0.02, sv + d, lo), sign.at.clone().addScaledVector(F.Vv, d).add(V(0, 0.17, 0)), 0.006, 0.006, 3), pal.rope));

  // The counter: planks on two trestles, boards nailed down the front.
  const ch = g0 + 0.96;
  const cv0 = k.counter[0];
  const cv1 = k.counter[1];
  for (const v of [cv0 + 0.3, cv1 - 0.3]) {
    for (const s of [-1, 1]) kit.post(F.at(s * 0.2, v - 0.05, g0 - 0.15), F.at(0, v, ch - 0.06), 0.035, kit.col(pal.dark), 4);
    kit.board(F.at(-0.22, v, ch - 0.07), F.at(0.22, v, ch - 0.07), 0.07, 0.05, UP, kit.col(pal.dark));
  }
  for (let k2 = 0; k2 < 3; k2++) {
    const u = -0.16 + k2 * 0.16;
    kit.board(F.at(u, cv0 - kit.r(0, 0.1), ch), F.at(u, cv1 + kit.r(0, 0.12), ch + kit.r(-0.012, 0.012)), 0.155, 0.045, UP, kit.col(pal.wood));
  }
  for (let v = cv0; v < cv1 - 0.1; ) {
    const w = kit.r(0.16, 0.28);
    if (kit.rand() > 0.12) kit.board(F.at(0.26, v + w / 2, g0 + 0.08), F.at(0.26, v + w / 2 + kit.r(-0.02, 0.02), ch - 0.04), w - 0.02, 0.03, F.U, kit.col(kit.rand() < 0.25 ? pal.paint : pal.wood, 0.08));
    v += w;
  }
  solidAt(b, F, 0, (cv0 + cv1) / 2, g0 + 0.5, 0.56, 1.0, cv1 - cv0);
  // On it: a stack of tin plates, a bowl with a ladle, a cleaver, a salt jar.
  const cvf = e > 0 ? cv0 : cv1;
  const cvo = e > 0 ? cv1 : cv0;
  const cmid = (cv0 + cv1) / 2;
  for (let i = 0; i < 4; i++) {
    const p = F.at(-0.05, cvo - e * 0.35, ch + 0.035 + i * 0.016);
    const plate = new THREE.CylinderGeometry(0.13, 0.11, 0.014, 12);
    plate.translate(p.x + kit.r(-0.01, 0.01), p.y, p.z + kit.r(-0.01, 0.01));
    kit.parts.push(paint(plate, kit.col(['#9a9a92', '#8a8a84'], 0.04).getStyle()));
  }
  const bowl = F.at(-0.1, cvf + e * 0.45, ch + 0.08);
  const bg = new THREE.SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bg.translate(bowl.x, bowl.y + 0.1, bowl.z);
  kit.parts.push(paint(bg, '#7a5a40'));
  kit.parts.push(paint(segment(bowl.clone().add(V(0, 0.05, 0)), bowl.clone().addScaledVector(F.Vv, 0.22).add(V(0, 0.32, 0)), 0.012, 0.01, 4), '#5a5550'));
  kit.block(F.at(-0.12, cmid + e * 0.3, ch + 0.035), 0.24, 0.02, 0.07, '#8a8f93', b.yaw - k.face + 0.3);
  kit.block(F.at(-0.12, cmid + e * 0.12, ch + 0.04), 0.12, 0.035, 0.04, kit.col(pal.dark), b.yaw - k.face + 0.3);
  inst.put('jar', SHAPES.jar, F.at(-0.15, cvo - e * 0.75, ch + 0.03), kit.r(0, 6), '#b8b2a2', 0.9);
  const plate = F.at(0.05, cmid - e * 0.15, ch + 0.03);

  // Fish on a bar under the beam, and a string of onions.
  const ha = F.at(front - 0.02, vf + e * 0.4, lo - 0.35);
  const hb = F.at(front - 0.02, mid - e * 0.15, lo - 0.33);
  kit.board(ha, hb, 0.04, 0.04, UP, kit.col(pal.dark), { sag: 0.02 });
  for (let i = 0; i < 4; i++) {
    const p = ha.clone().lerp(hb, (i + 0.5) / 4);
    kit.parts.push(paint(segment(p, p.clone().add(V(0, -0.1, 0)), 0.005, 0.005, 3), '#3a3532'));
    if (i === 2) {
      for (let j = 0; j < 5; j++) {
        const o = new THREE.SphereGeometry(0.045, 6, 4);
        o.scale(1, 0.9, 1);
        o.translate(p.x + kit.r(-0.03, 0.03), p.y - 0.14 - j * 0.07, p.z + kit.r(-0.03, 0.03));
        kit.parts.push(paint(o, kit.col(['#a8743a', '#9a6a34', '#b08048'], 0.05).getStyle()));
      }
      continue;
    }
    inst.put('splitFish', SHAPES.splitFish, p.clone().add(V(0, -0.3, 0)), b.yaw - k.face + kit.r(-0.4, 0.4), kit.col(['#c9b48e', '#b59f78', '#a99272'], 0.04), 0.9);
  }
  // A lantern on a nail on the middle post: lit for supper and after.
  const lp = tops[1].clone().addScaledVector(F.U, 0.1).add(V(0, -0.5, 0));
  kit.block(lp.clone().add(V(0, 0.12, 0)), 0.16, 0.03, 0.16, '#3a3532');
  kit.block(lp.clone().add(V(0, -0.11, 0)), 0.16, 0.03, 0.16, '#3a3532');
  for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const q = lp.clone().addScaledVector(F.U, a * 0.07).addScaledVector(F.Vv, c * 0.07);
    kit.parts.push(paint(segment(q.clone().add(V(0, -0.11, 0)), q.clone().add(V(0, 0.12, 0)), 0.008, 0.008, 3), '#3a3532'));
  }
  kit.parts.push(paint(segment(lp.clone().add(V(0, 0.13, 0)), lp.clone().add(V(0, 0.24, 0)).addScaledVector(F.U, -0.08), 0.008, 0.008, 3), '#3a3532'));
  kit.windows.push({ pos: lp.clone().addScaledVector(F.U, 0.075), normal: F.U.clone(), u: F.Vv.clone(), w: 0.13, h: 0.18, owner: k.owner });

  // The fire: a ring of stones, a grate across it, a pot on a tripod.
  const fc = wp(b, ...k.grill);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + kit.r(-0.1, 0.1);
    const r = rock(kit.r(0.13, 0.18), Math.round(fc.x * 31 + i * 7), kit.col(pal.stone).getStyle());
    r.translate(fc.x + Math.cos(a) * 0.48, fc.y + 0.07, fc.z + Math.sin(a) * 0.48);
    kit.parts.push(r);
  }
  const ash = new THREE.CircleGeometry(0.42, 10);
  ash.rotateX(-Math.PI / 2);
  ash.translate(fc.x, fc.y + 0.03, fc.z);
  kit.parts.push(paint(ash, '#4a4540'));
  for (let i = 0; i < 5; i++) {
    const a = fc.clone().addScaledVector(F.Vv, -0.42 + i * 0.21).addScaledVector(F.U, -0.45).add(V(0, 0.3, 0));
    kit.parts.push(paint(segment(a, a.clone().addScaledVector(F.U, 0.9), 0.012, 0.012, 4), '#2e2a27'));
  }
  for (let i = 0; i < 3; i++) inst.put('fish', SHAPES.fish, fc.clone().addScaledVector(F.Vv, -0.22 + i * 0.2).add(V(0, 0.34, 0)), b.yaw - k.face + Math.PI / 2 + kit.r(-0.2, 0.2), kit.col(['#7a6a52', '#6a5a46'], 0.06), 0.9);
  const apex = fc.clone().add(V(0.05, 1.45, -0.03));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    kit.post(fc.clone().add(V(Math.cos(a) * 0.75, -0.1, Math.sin(a) * 0.75)), apex.clone().add(V(Math.cos(a) * 0.05, 0.12, Math.sin(a) * 0.05)), 0.03, kit.col(pal.dark), 4);
  }
  const pot = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7);
  const pp = fc.clone().addScaledVector(F.U, 0.3).add(V(0, 0.72, 0));
  pot.translate(pp.x, pp.y, pp.z);
  kit.parts.push(paint(pot, '#2f2c29'));
  kit.parts.push(paint(segment(apex, pp.clone().add(V(0, 0.15, 0)), 0.008, 0.008, 3), '#3a3532'));
  b.world.addStatic({ type: 'cyl', x: fc.x, z: fc.z, r: 0.62, y0: fc.y - 0.3, y1: fc.y + 0.5, noClimb: true });
  // Wood for it, stacked against the shack.
  for (let i = 0; i < 7; i++) {
    const p = F.at(wall + 0.25 + (i % 2) * 0.05, vf - e * (0.3 + (i % 3) * 0.02), g0 + 0.08 + Math.floor(i / 2) * 0.12);
    kit.parts.push(paint(segment(p.clone().addScaledVector(F.Vv, -0.35), p.clone().addScaledVector(F.Vv, 0.35 + kit.r(-0.05, 0.05)), 0.055, 0.05, 5), kit.col(['#7a6450', '#6a5646', '#8a7258']).getStyle()));
  }
  // Behind the counter: a water barrel, a crate of potatoes, a broom.
  const bp = F.at(wall + 0.4, vo - e * 0.35);
  inst.put('barrel', SHAPES.barrel, bp.clone().add(V(0, 0.31, 0)), kit.r(0, 6), kit.col(['#7a6450', '#6c5846']));
  b.world.addStatic({ type: 'cyl', x: bp.x, z: bp.z, r: 0.28, y0: bp.y - 0.2, y1: bp.y + 0.62, noClimb: true });
  const cp = F.at(wall + 0.35, vo - e * 1.05);
  inst.put('crate', SHAPES.crate, cp.clone().add(V(0, 0.25, 0)), b.yaw - k.face + kit.r(-0.2, 0.2), kit.col(['#8a7a62', '#7a6c58']));
  for (let i = 0; i < 6; i++) {
    const o = new THREE.SphereGeometry(0.055, 6, 4);
    o.scale(1.2, 0.85, 1);
    o.translate(cp.x + kit.r(-0.16, 0.16), cp.y + 0.5 + kit.r(0, 0.04), cp.z + kit.r(-0.16, 0.16));
    kit.parts.push(paint(o, kit.col(['#9a7a4e', '#8a6c44'], 0.05).getStyle()));
  }
  solidAt(b, F, wall + 0.35, vo - e * 1.05, cp.y + 0.25, 0.5, 0.5, 0.5);
  const broom = F.at(wall + 0.12, vo + e * 0.15, g0 + 0.02);
  kit.parts.push(paint(segment(broom, broom.clone().addScaledVector(F.U, -0.06).add(V(0, 1.35, 0)), 0.018, 0.016, 4), kit.col(pal.wood).getStyle()));
  const bristle = new THREE.ConeGeometry(0.1, 0.32, 6);
  bristle.translate(broom.x, broom.y + 0.16, broom.z);
  kit.parts.push(paint(bristle, '#9a8a5c'));

  // The board on legs, for what's on: chalk on black, propped facing the path.
  const B = frame(b, k.board[0], k.board[1], k.board[2]);
  const bg0 = B.at(0, 0).y;
  const bw = 0.62;
  const bh = 0.82;
  const bc = B.at(0.04, 0, bg0 + 0.98);
  const lean = 0.18;
  for (const v of [-bw / 2 - 0.02, bw / 2 + 0.02]) kit.post(B.at(0.16, v, bg0 - 0.05), B.at(-0.02, v, bg0 + 1.45), 0.025, kit.col(pal.dark), 4);
  kit.post(B.at(-0.5, 0, bg0 - 0.05), B.at(-0.05, 0, bg0 + 1.4), 0.025, kit.col(pal.dark), 4);
  const boardFace = B.U.clone().multiplyScalar(Math.cos(lean)).add(V(0, Math.sin(lean), 0)).normalize();
  // A frame round the slate.
  for (const s of [-1, 1]) {
    kit.board(bc.clone().addScaledVector(B.Vv, -bw / 2 - 0.03).add(V(0, (s * bh) / 2, 0)).addScaledVector(B.U, (-s * bh * Math.sin(lean)) / 2), bc.clone().addScaledVector(B.Vv, bw / 2 + 0.03).add(V(0, (s * bh) / 2, 0)).addScaledVector(B.U, (-s * bh * Math.sin(lean)) / 2), 0.05, 0.03, boardFace, kit.col(pal.wood));
  }
  postCollider(b, B.at(0, 0), 0.25, 1.4);

  // Tables: boards on trestles, level, whatever the sand does.
  const tabs = [];
  for (const [tx, tz] of tables ?? []) {
    const T = frame(b, tx, tz, 0); // long side along z (v)
    const legs = [[-0.3, -0.6], [0.3, -0.6], [-0.3, 0.6], [0.3, 0.6]].map(([u, v]) => T.at(u, v));
    const top = Math.max(...legs.map((p) => p.y)) + 0.72;
    // Legs splayed a little, a rail across under each end, a stretcher down the middle.
    for (const v of [-0.62, 0.62]) {
      for (const s of [-1, 1]) kit.post(T.at(s * 0.31, v * 1.04 + kit.r(-0.03, 0.03), T.at(s * 0.31, v).y - 0.12), T.at(s * 0.25, v, top - 0.04), kit.r(0.035, 0.045), kit.col(pal.dark), 5);
      kit.board(T.at(-0.37, v, top - 0.08), T.at(0.37, v, top - 0.08 + kit.r(-0.01, 0.01)), 0.07, 0.06, UP, kit.col(pal.dark));
    }
    kit.board(T.at(0, -0.62, top - 0.42), T.at(0, 0.62, top - 0.45), 0.06, 0.06, UP, kit.col(pal.dark));
    // The top: boards gone dark with grease, one shorter than the rest.
    for (let u = -0.4; u < 0.38; ) {
      const w = kit.r(0.15, 0.23);
      const short = kit.rand() < 0.25 ? kit.r(0.1, 0.2) : 0;
      kit.board(T.at(u + w / 2, -0.84 + short - kit.r(0, 0.06), top), T.at(u + w / 2, 0.84 + kit.r(0, 0.08), top + kit.r(-0.012, 0.012)), w - 0.014, 0.045, UP, kit.col(['#6f6152', '#76685a', '#655a4c', '#7b6d5d'], 0.06));
      u += w;
    }
    b.solid(tx, top - 0.35, tz, 0.62, 0.75, 1.5, 0);
    tabs.push({ c: T.at(0, 0, top + 0.02), along: T.Vv.clone() });
    // A jar with a stub of candle, a mug or two.
    inst.put('jar', SHAPES.jar, T.at(kit.r(-0.1, 0.1), kit.r(-0.2, 0.2), top + 0.02), kit.r(0, 6), '#a8a292', 0.8);
    for (let i = 0; i < 2; i++) {
      const m = T.at(kit.r(-0.22, 0.22), kit.r(-0.65, 0.65), top + 0.07);
      const mug = new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8);
      mug.translate(m.x, m.y, m.z);
      kit.parts.push(paint(mug, kit.col(['#6b5a48', '#8a8a84', '#5a6a6e']).getStyle()));
    }
  }
  return {
    board: { at: bc.clone().addScaledVector(boardFace, 0.02), normal: boardFace, along: B.Vv.clone(), w: bw, h: bh },
    fire: fc.clone().add(V(0, 0.18, 0)),
    smoke: fc.clone().add(V(0, 0.6, 0)),
    plate,
    sign,
    tables: tabs,
    frame: F,
  };
}
