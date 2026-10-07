import * as THREE from 'three';
import { toWorld, dirToWorld, gannetCourse } from '../shared/world.js';
import { mulberry32 } from '../shared/noise.js';
import { makeBox } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';

// The climb up Gannet Stack. Up the first drum by footholds where the rock
// has split away (white with the birds' droppings, like every ledge out
// here), along the top of the drum, up an old frayed rope somebody tied off
// round a horn of rock, and round to the nest on top of the second drum.
// Fall off and you land in the drifted sand at the foot.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ROPE = '#8a7656';
const GUANO = '#e2ddcf';

export class StackClimb {
  constructor({ scene, world }) {
    this.world = world;
    world.climbables ??= [];
    const g = (this.layout = gannetCourse());
    const isl = g.isl;
    this.group = new THREE.Group();
    this.group.name = 'course:stack';
    scene.add(this.group);
    const parts = [];
    const W = (p, y) => {
      const w = toWorld(isl, p.x, p.z);
      return V(w.x, y, w.z);
    };
    const out = (a) => {
      const d = dirToWorld(isl, Math.cos(a), Math.sin(a));
      return V(d.x, 0, d.z);
    };

    // Footholds: shelves where the rock has split away, white on top where
    // the birds sit.
    g.ledges.forEach((L, i) => {
      const n = out(L.a);
      const yaw = Math.atan2(n.x, n.z);
      const mid = W(g.on(L.c, L.r + 0.25, L.a), L.top);
      parts.push(shelf(7300 + i, yaw, mid, L.top));
      this.world.addStatic(makeBox({ center: W(g.on(L.c, L.r + 0.2, L.a), L.top - 0.15), half: V(0.8, 0.15, 0.45), yaw: -yaw }));
    });

    // The rope, from a horn of rock on the second drum's rim down to the first.
    const R = g.rope;
    const n = out(R.a);
    const tangent = V(-n.z, 0, n.x);
    const foot = W(g.on(R.c, R.r + 0.08, R.a), R.bottom);
    const hornAt = W(g.on(R.c, R.r - 0.7, R.a), R.top);
    const horn = rock(0.45, 7500, '#6f685e', 1.6);
    horn.translate(hornAt.x, R.top + 0.45, hornAt.z);
    parts.push(horn);
    this.world.addStatic({ type: 'cyl', x: hornAt.x, z: hornAt.z, r: 0.35, y0: R.top - 0.5, y1: R.top + 1.0 });
    // Round the horn, over the lip, down the face; frayed where it rubs.
    const lip = W(g.on(R.c, R.r + 0.1, R.a), R.top + 0.05);
    const knot = hornAt.clone().add(V(0, 0.55, 0));
    parts.push(paint(segment(knot.clone().addScaledVector(n, 0.3), lip, 0.04, 0.04, 5), ROPE));
    const wrap = new THREE.TorusGeometry(0.36, 0.045, 4, 10);
    wrap.rotateX(Math.PI / 2);
    wrap.translate(knot.x, knot.y, knot.z);
    parts.push(paint(wrap, ROPE));
    const sag = (t) => lip.clone().lerp(foot, t).addScaledVector(n, 0.12 * Math.sin(Math.PI * t));
    for (let i = 0; i < 12; i++) {
      const a = sag(i / 12);
      const b = sag((i + 1) / 12);
      parts.push(paint(segment(a, b, 0.04, 0.04, 5), i === 3 || i === 8 ? '#a8946f' : ROPE));
    }
    // Knots to hold, and loose strands where it's worn.
    for (let i = 1; i < 12; i += 2) {
      const k = new THREE.SphereGeometry(0.075, 6, 4);
      const p = sag(i / 12);
      k.translate(p.x, p.y, p.z);
      parts.push(paint(k, ROPE));
    }
    for (const t of [0.25, 0.67]) {
      const p = sag(t);
      for (let j = 0; j < 3; j++) parts.push(paint(segment(p, p.clone().addScaledVector(tangent, (j - 1) * 0.18).add(V(0, -0.25, 0)).addScaledVector(n, 0.08), 0.01, 0.005, 3), '#b29d77'));
    }
    const h = R.top - R.bottom;
    world.climbables.push({
      o: foot.clone().addScaledVector(tangent, -0.35).addScaledVector(n, 0.05),
      r: tangent,
      u: V(0, 1, 0),
      n,
      w: 0.7,
      h,
      exit: W(g.on(R.c, R.r - 0.9, R.a + 0.06), R.top + 0.1),
    });

    // The nest: a heap of sticks, weed and feathers, long abandoned.
    const N = g.nest;
    const rand = mulberry32(7700);
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.25 + rand() * 0.45;
      const p = V(N.x + Math.cos(a) * r, N.y + 0.04 + rand() * 0.12, N.z + Math.sin(a) * r);
      const d = V(Math.cos(a + 1.6 + rand()), (rand() - 0.5) * 0.3, Math.sin(a + 1.6 + rand())).normalize();
      parts.push(paint(segment(p.clone().addScaledVector(d, -0.3), p.clone().addScaledVector(d, 0.3), 0.022, 0.016, 3), rand() < 0.3 ? '#4d5a3a' : '#7a6448'));
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // A few gannets about the place.
    this.birds = [];
    const isle = gannetCourse().isl;
    const tiers = isle.features.spire.tiers;
    const sx = isle.features.spire.x;
    const sz = isle.features.spire.z;
    for (const [ti, a, dr] of [[1, Math.PI - 0.45, 1.3], [1, Math.PI + 0.35, 1.0], [2, 0.8, 0.9], [3, 2.6, 0.8], [4, 4.0, 0.7]]) {
      const t = tiers[ti];
      const c = { x: sx + t.ox, z: sz + t.oz };
      const p = W(g.on(c, t.r - dr, a), t.y1);
      const bird = gannet();
      bird.position.copy(p);
      const face = out(a);
      bird.rotation.y = Math.atan2(face.x, face.z) + (rand() - 0.5) * 1.2;
      this.group.add(bird);
      this.birds.push({ bird, phase: rand() * 10 });
    }
  }

  update(t) {
    // Heads turn now and then.
    for (const b of this.birds) {
      const k = Math.sin(t * 0.7 + b.phase);
      b.bird.userData.head.rotation.y = Math.abs(k) > 0.85 ? Math.sign(k) * 0.7 : 0;
    }
  }
}

/** A natural shelf of rock with a flat top, cut from a lumpy boulder. */
function shelf(seed, yaw, at, top) {
  const rand = mulberry32(seed);
  // The same lumpy rock as everywhere else, wide along the wall, cut flat.
  const g = rock(1.0, seed, '#7f776c', 0.6);
  g.scale(0.95, 1, 0.85);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, Math.min(p.getY(i), 0.18) - 0.18);
  g.rotateY(yaw);
  g.translate(at.x, top, at.z);
  const col = g.attributes.color;
  const rockA = new THREE.Color('#7f776c');
  const rockB = new THREE.Color('#6f685f');
  const white = new THREE.Color(GUANO);
  const c = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const o = new THREE.Vector3();
  for (let f = 0; f < p.count; f += 3) {
    o.fromBufferAttribute(p, f);
    a.fromBufferAttribute(p, f + 1).sub(o);
    b.fromBufferAttribute(p, f + 2).sub(o);
    const up = a.cross(b).normalize().y;
    const y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    if (up > 0.7 && rand() < 0.88) c.copy(white).multiplyScalar(0.93 + rand() * 0.07);
    else if (top - y < 0.15 && rand() < 0.4) c.copy(white).lerp(rockA, 0.35); // dribbles over the lip
    else c.copy(rand() < 0.5 ? rockA : rockB);
    for (let k = 0; k < 3; k++) col.setXYZ(f + k, c.r, c.g, c.b);
  }
  return g;
}

/** A gannet sitting: white, black wing tips, a buff head and a long grey bill. */
function gannet() {
  const parts = [];
  const body = new THREE.SphereGeometry(1, 8, 6);
  body.scale(0.16, 0.15, 0.32);
  body.translate(0, 0.17, 0);
  parts.push(paint(body, '#f1efe8'));
  for (const s of [-1, 1]) {
    const tip = new THREE.BoxGeometry(0.05, 0.06, 0.22);
    tip.translate(s * 0.13, 0.2, -0.28);
    parts.push(paint(tip, '#222222'));
  }
  const tail = new THREE.ConeGeometry(0.06, 0.2, 5);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0.17, -0.38);
  parts.push(paint(tail, '#f1efe8'));
  const g = new THREE.Group();
  const m = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true;
  g.add(m);
  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.22);
  const hp = [];
  const skull = new THREE.SphereGeometry(0.085, 7, 5);
  hp.push(paint(skull, '#e8d9a8'));
  const bill = new THREE.ConeGeometry(0.035, 0.2, 5);
  bill.rotateX(Math.PI / 2);
  bill.translate(0, -0.015, 0.15);
  hp.push(paint(bill, '#9aa3a8'));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.014, 4, 3);
    eye.translate(s * 0.06, 0.015, 0.045);
    hp.push(paint(eye, '#111111'));
  }
  head.add(new THREE.Mesh(mergeParts(hp), m.material));
  g.add(head);
  g.userData.head = head;
  return g;
}
