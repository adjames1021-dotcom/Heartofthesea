import * as THREE from 'three';
import { makeBox } from './collision.js';
import { paint, mergeParts, segment } from './props.js';

// Below decks, laid out like a real 37-footer and about the size of one: the
// companionway steps come down aft between the galley (port) and the chart
// table (starboard); the saloon has settees each side and a drop-leaf table;
// through the doorway in the bulkhead is the V-berth up in the bow.
//
// The hull sides curve in toward the floor and the bow, and the deckhead is
// arched, with a hatch letting daylight in over the saloon and the berth.
//
// It's built well away from the world and the bear is moved there when it
// goes below, so the boat can keep sailing on its own outside.
//
// Local frame: +x toward the bow, +z to starboard, floor at y = 0.

const ORIGIN = new THREE.Vector3(-3000, 200, -3000);
const AFT = -3.7;
const FWD = 3.9;
const H = 2.0; // headroom in the middle
const WIDE = 1.95; // half breadth at its widest

const TEAK = '#8a5a34';
const TEAK_DARK = '#6a4426';
const TEAK_LIGHT = '#a8774a';
const HOLLY = '#e6dcc4';
const CREAM = '#efe8d8';
const NAVY = '#2e3e5c';
const NAVY_LIGHT = '#3f5478';
const BRASS = '#b48a3c';
const STEEL = '#b9bec2';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Half breadth of the hull at station x (metres), at the widest height. */
const half = (x) => WIDE * (1 - 0.74 * smooth(0.6, FWD, x)) * (1 - 0.06 * smooth(-2.6, AFT, x));
/** How the sides curve: narrower down at the floor, a little tumblehome up top. */
const flare = (y) => (y < 1.1 ? 0.8 + 0.2 * Math.sin((Math.PI / 2) * (y / 1.1)) : 1 - 0.05 * ((y - 1.1) / (H - 1.1)));

export class Interior {
  constructor({ scene, world }) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'interior';
    this.group.position.copy(ORIGIN);
    scene.add(this.group);
    this.inside = false;

    const parts = [];
    const solid = (cx, cy, cz, sx, sy, sz, yaw = 0) => world.addStatic(makeBox({ center: V(cx, cy, cz).add(ORIGIN), half: V(sx / 2, sy / 2, sz / 2), yaw }));
    const box = (cx, cy, cz, sx, sy, sz, color, isSolid = true) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(cx, cy, cz);
      parts.push(paint(g, color));
      if (isSolid) solid(cx, cy, cz, sx, sy, sz);
    };

    // ---- The shell: curved sides, arched deckhead, a planked sole ----
    this.#shell(parts);
    // The sole: teak with holly lines.
    box((AFT + FWD) / 2, -0.1, 0, FWD - AFT, 0.2, 2 * WIDE, TEAK_LIGHT);
    for (let z = -1.5; z <= 1.5; z += 0.25) box(-0.2, 0.002, z, 6.8, 0.004, 0.022, HOLLY, false);
    // Walls and ends to stop the bear (and the camera) going through.
    for (const s of [-1, 1]) {
      for (let x = AFT; x < FWD; x += 0.5) {
        const xm = x + 0.25;
        const yaw = Math.atan2(half(x + 0.5) - half(x), 0.5) * s;
        solid(xm, 1.0, s * (half(xm) * 0.9 + 0.12), 0.56, 2.4, 0.24, yaw);
      }
    }
    // The aft bulkhead: a panel facing in, so it drops away in the cutaway view.
    const aft = new THREE.PlaneGeometry(2 * WIDE, H);
    aft.rotateY(Math.PI / 2);
    aft.translate(AFT, H / 2, 0);
    parts.push(paint(aft, TEAK));
    solid(AFT - 0.1, H / 2, 0, 0.2, H + 0.2, 2 * WIDE);
    solid(FWD + 0.1, H / 2, 0, 0.2, H + 0.2, 2);
    // Darkness all round, for the cutaway.
    const under = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: '#0d0a08' }));
    under.rotation.x = -Math.PI / 2;
    under.position.set(0, -0.25, 0);
    this.group.add(under);
    solid(0, H + 0.12, 0, FWD - AFT, 0.2, 2 * WIDE);

    // ---- Companionway steps, aft, down from the cockpit ----
    for (let i = 0; i < 4; i++) {
      const x = AFT + 0.25 + i * 0.24;
      box(x, 1.5 - i * 0.36, 0, 0.26, 0.05, 0.62, TEAK_DARK, false);
    }
    for (const s of [-1, 1]) parts.push(paint(segment(V(AFT + 0.08, 1.75, s * 0.33), V(AFT + 1.12, 0, s * 0.33), 0.025, 0.025, 6), TEAK_DARK));
    // A teak handrail either side of the steps.
    for (const s of [-1, 1]) parts.push(paint(segment(V(AFT + 0.1, 1.55, s * 0.5), V(AFT + 1.2, 1.25, s * 0.5), 0.02, 0.02, 6), TEAK));
    this.ladder = V(AFT + 1.45, 0, 0);

    // ---- Galley, to port ----
    const gz = -half(-2.3) * 0.8 + 0.32;
    box(-2.35, 0.44, gz, 1.5, 0.88, 0.62, TEAK); // counter
    box(-2.35, 0.9, gz, 1.52, 0.04, 0.64, '#d9d2c0', false); // worktop
    box(-2.35, 0.95, gz + 0.31, 1.52, 0.06, 0.02, TEAK_DARK, false); // fiddle rail
    box(-2.85, 0.92, gz - 0.02, 0.42, 0.03, 0.34, STEEL, false); // sink
    parts.push(paint(segment(V(-2.85, 0.92, gz - 0.2), V(-2.85, 1.18, gz - 0.2), 0.016, 0.016, 6), STEEL));
    parts.push(paint(segment(V(-2.85, 1.18, gz - 0.2), V(-2.85, 1.16, gz - 0.04), 0.016, 0.016, 6), STEEL));
    // The stove, slung in gimbals so it stays level at sea.
    this.stove = V(-1.95, 0, gz);
    box(-1.95, 0.72, gz, 0.52, 0.34, 0.5, '#d8d6d0', false);
    box(-1.95, 0.9, gz, 0.52, 0.03, 0.5, '#2a2a2a', false);
    for (const [dx, dz] of [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]]) {
      const ring = new THREE.TorusGeometry(0.06, 0.01, 4, 12);
      ring.rotateX(Math.PI / 2);
      ring.translate(-1.95 + dx, 0.93, gz + dz);
      parts.push(paint(ring, '#555555'));
    }
    const kettle = new THREE.SphereGeometry(0.1, 12, 8);
    kettle.scale(1, 0.85, 1);
    kettle.translate(-2.07, 1.01, gz - 0.1);
    parts.push(paint(kettle, '#c9473a'));
    parts.push(paint(segment(V(-1.99, 1.02, gz - 0.1), V(-1.91, 1.08, gz - 0.1), 0.016, 0.01, 5), '#c9473a'));
    // Lockers above, with a plate rack.
    box(-2.35, 1.6, -half(-2.3) * 0.95 + 0.2, 1.5, 0.42, 0.3, TEAK, false);
    for (let i = 0; i < 3; i++) box(-2.85 + i * 0.5, 1.6, -half(-2.3) * 0.95 + 0.36, 0.44, 0.36, 0.02, TEAK_LIGHT, false);
    for (let i = 0; i < 4; i++) {
      const plate = new THREE.CylinderGeometry(0.11, 0.11, 0.015, 14);
      plate.rotateX(Math.PI / 2);
      plate.translate(-2.75 + i * 0.05, 1.12, gz - 0.24);
      parts.push(paint(plate, ['#f2efe6', NAVY_LIGHT][i % 2]));
    }
    for (let i = 0; i < 3; i++) {
      const mug = new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10);
      mug.translate(-2.45 + i * 0.12, 0.96, gz + 0.12);
      parts.push(paint(mug, ['#f2efe6', NAVY_LIGHT, '#d5a440'][i]));
    }

    // ---- Chart table, to starboard ----
    const cz = half(-2.4) * 0.8 - 0.36;
    box(-2.45, 0.38, cz, 1.1, 0.76, 0.66, TEAK);
    box(-2.45, 0.78, cz, 1.12, 0.04, 0.68, TEAK_LIGHT, false);
    box(-2.45, 0.802, cz - 0.02, 0.7, 0.004, 0.46, '#e8dcb8', false); // a chart
    parts.push(paint(segment(V(-2.7, 0.81, cz - 0.15), V(-2.25, 0.81, cz + 0.08), 0.006, 0.006, 4), '#2b2b2b')); // dividers
    // Instruments over it.
    box(-2.45, 1.38, half(-2.4) * 0.93 - 0.08, 0.9, 0.5, 0.12, TEAK_DARK, false);
    for (const dx of [-0.25, 0.05]) {
      const dial = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16);
      dial.rotateX(Math.PI / 2);
      dial.translate(-2.45 + dx, 1.4, half(-2.4) * 0.93 - 0.15);
      parts.push(paint(dial, '#20262c'));
    }
    box(-1.7, 0.24, cz + 0.05, 0.4, 0.48, 0.4, NAVY); // seat
    this.chartTable = V(-2.45, 0, cz - 0.75);

    // ---- Saloon ----
    const tx = -0.1;
    box(tx, 0.7, 0, 1.3, 0.05, 0.62, TEAK_LIGHT, false); // table
    for (const s of [-1, 1]) box(tx, 0.69, s * 0.45, 1.3, 0.03, 0.28, TEAK_LIGHT, false); // leaves
    box(tx, 0.73, 0, 1.3, 0.03, 0.02, TEAK_DARK, false); // middle fiddle
    box(tx, 0.35, 0, 0.16, 0.7, 0.3, TEAK_DARK, false); // pedestal
    solid(tx, 0.55, 0, 1.3, 1.1, 1.18); // (taller than the table, so nobody walks up onto it)
    for (const s of [-1, 1]) {
      const sz = s * (half(-0.1) * 0.8 - 0.3);
      box(tx, 0.2, sz, 2.4, 0.4, 0.6, TEAK); // settee base
      box(tx, 0.46, sz, 2.36, 0.12, 0.58, NAVY, false); // cushion
      box(tx, 0.46, sz - s * 0.29, 2.36, 0.12, 0.02, '#c9b98a', false); // piping
      box(tx, 0.78, s * (half(-0.1) * 0.86 - 0.05), 2.36, 0.46, 0.12, NAVY_LIGHT, false); // backrest
      // Bookshelf with a fiddle, above the backrest.
      const bz = s * (half(-0.1) * 0.93 - 0.14);
      box(tx, 1.3, bz, 2.3, 0.03, 0.24, TEAK_DARK, false);
      box(tx, 1.36, bz - s * 0.11, 2.3, 0.08, 0.02, TEAK_DARK, false);
      for (let i = 0; i < 10; i++) {
        const h = 0.16 + ((i * 37) % 7) * 0.012;
        box(tx - 1.05 + i * 0.22, 1.32 + h / 2, bz, 0.05, h, 0.18, ['#7a2f26', '#2f4a3a', '#c9a24a', '#3a4a6a', '#6a3f5a'][i % 5], false);
      }
    }
    // A brass oil lamp swinging over the table.
    parts.push(paint(segment(V(tx, H - 0.04, 0), V(tx, 1.62, 0), 0.006, 0.006, 4), BRASS));
    const chimney = new THREE.CylinderGeometry(0.045, 0.06, 0.18, 12);
    chimney.translate(tx, 1.52, 0);
    parts.push(paint(chimney, '#f6e2b0'));
    const font = new THREE.CylinderGeometry(0.07, 0.05, 0.08, 12);
    font.translate(tx, 1.4, 0);
    parts.push(paint(font, BRASS));
    // A rug.
    box(tx, 0.006, 0, 1.6, 0.012, 0.6, '#9b5b3a', false);
    box(tx, 0.008, 0, 1.4, 0.012, 0.45, '#b8763f', false);

    // ---- Bulkhead with a doorway, a clock and a barometer ----
    const bx = 1.45;
    const door = 0.34;
    for (const s of [-1, 1]) box(bx, H / 2, s * (door + 0.8), 0.08, H, 1.6, TEAK);
    box(bx, H - 0.2, 0, 0.08, 0.4, 2 * door, TEAK, false);
    for (const s of [-1, 1]) box(bx - 0.05, H / 2 - 0.1, s * door, 0.04, H - 0.2, 0.06, TEAK_DARK, false); // door frame
    for (const s of [-1, 1]) {
      const rim = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 20);
      rim.rotateZ(Math.PI / 2);
      rim.translate(bx - 0.06, 1.45, s * 0.72);
      parts.push(paint(rim, BRASS));
      const face = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 20);
      face.rotateZ(Math.PI / 2);
      face.translate(bx - 0.085, 1.45, s * 0.72);
      parts.push(paint(face, '#f4efe2'));
      parts.push(paint(segment(V(bx - 0.095, 1.45, s * 0.72), V(bx - 0.095, 1.52, s * 0.72 + 0.02), 0.005, 0.005, 3), '#222222'));
    }

    // ---- The V-berth, in the bow ----
    const berthShape = new THREE.Shape();
    const fx0 = bx + 0.38; // a little floor inside the door, then the berth
    berthShape.moveTo(fx0, -half(fx0) * 0.86);
    for (let x = fx0; x <= FWD - 0.05; x += 0.2) berthShape.lineTo(x, -half(x) * 0.86);
    for (let x = FWD - 0.05; x >= fx0; x -= 0.2) berthShape.lineTo(x, half(x) * 0.86);
    const berth = (y0, depth, color) => {
      const g = new THREE.ExtrudeGeometry(berthShape, { depth, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.translate(0, y0 + depth, 0);
      parts.push(paint(g, color));
    };
    berth(0, 0.32, TEAK); // base, low enough to climb into
    berth(0.32, 0.12, '#f3efe6'); // mattress
    berth(0.44, 0.03, '#4f6b8f'); // quilt
    solid((fx0 + FWD) / 2, 0.22, 0, FWD - fx0, 0.44, 2.4);
    for (const z of [-0.4, 0.4]) {
      const pillow = new THREE.SphereGeometry(1, 12, 6);
      pillow.scale(0.2, 0.08, 0.32);
      pillow.translate(3.35, 0.52, z * 0.8);
      parts.push(paint(pillow, '#fbf8f0'));
    }
    box(fx0 + 0.3, 0.5, 0, 0.36, 0.06, half(fx0) * 1.5, '#b8463b', false); // folded blanket
    // The locker under the berth: two drawers, with brass pulls.
    for (const z of [-0.36, 0.36]) {
      box(fx0 - 0.006, 0.17, z, 0.012, 0.22, 0.5, TEAK_LIGHT, false);
      const pull = new THREE.TorusGeometry(0.025, 0.006, 4, 10);
      pull.rotateY(Math.PI / 2);
      pull.translate(fx0 - 0.02, 0.2, z);
      parts.push(paint(pull, BRASS));
    }
    // A little shelf each side, and a hanging oilskin by the door.
    for (const s of [-1, 1]) box(2.5, 1.12, s * (half(2.5) * 0.92 - 0.1), 1.0, 0.03, 0.18, TEAK_DARK, false);
    const coat = new THREE.CylinderGeometry(0.12, 0.2, 0.75, 8);
    coat.translate(bx + 0.14, 1.25, door + 0.3);
    parts.push(paint(coat, '#d9a92e'));

    const mesh = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.mesh = mesh; // the surfaces things can be put on (src/decorate.js)
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.group.add(mesh);

    // ---- Portholes and hatches: daylight (or the dark) outside ----
    this.portMat = new THREE.MeshBasicMaterial({ color: '#bfe0ec' });
    const rimMat = new THREE.MeshLambertMaterial({ color: BRASS });
    for (const x of [-2.4, -0.7, 0.5, 2.4]) {
      for (const s of [-1, 1]) {
        const z = s * (half(x) * flare(1.5) - 0.005);
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), this.portMat);
        glass.scale.x = 1.7;
        glass.position.set(x, 1.5, z);
        glass.rotation.y = s > 0 ? Math.PI : 0;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.025, 6, 20), rimMat);
        rim.scale.x = 1.6;
        rim.position.copy(glass.position);
        rim.rotation.y = glass.rotation.y;
        this.group.add(glass, rim);
      }
    }
    const frameMat = new THREE.MeshLambertMaterial({ color: TEAK_DARK });
    this.hatchFrames = [];
    for (const [x, w] of [[-0.1, 0.55], [2.4, 0.5]]) {
      const hatch = new THREE.Mesh(new THREE.PlaneGeometry(w, w), this.portMat);
      hatch.rotation.x = Math.PI / 2;
      hatch.position.set(x, H - 0.015, 0);
      this.group.add(hatch);
      for (const [dx, dz, sx, sz] of [[0, -w / 2, w + 0.1, 0.06], [0, w / 2, w + 0.1, 0.06], [-w / 2, 0, 0.06, w], [w / 2, 0, 0.06, w]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), frameMat);
        f.position.set(x + dx, H - 0.04, dz);
        this.hatchFrames.push(f);
        this.group.add(f);
      }
    }
    // Light falling from the saloon hatch: a soft shaft, by day only.
    this.shaftMat = new THREE.MeshBasicMaterial({ color: '#fff3d8', transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, H, 4, 1, true), this.shaftMat);
    shaft.rotation.y = Math.PI / 4;
    shaft.position.set(-0.1, H / 2, 0);
    this.group.add(shaft);

    // Warm lamps: over the table, the galley and the berth.
    this.lamps = [[V(-0.1, 1.45, 0), 2.6], [V(-2.3, 1.75, 0), 1.6], [V(2.6, 1.6, 0), 1.4]].map(([p, i]) => {
      const light = new THREE.PointLight('#ffc98a', i, 5.5, 1.5);
      light.position.copy(p);
      light.userData.base = i;
      this.group.add(light);
      return light;
    });
  }

  /** The curved hull lining and the arched deckhead, cream with teak battens. */
  #shell(parts) {
    const xs = [];
    for (let x = AFT; x <= FWD + 1e-6; x += 0.25) xs.push(x);
    const ys = [0, 0.25, 0.5, 0.8, 1.1, 1.4, 1.7, H];
    for (const s of [-1, 1]) {
      const pos = [];
      const col = [];
      const c = new THREE.Color();
      for (let i = 0; i + 1 < xs.length; i++) {
        for (let j = 0; j + 1 < ys.length; j++) {
          const p = (x, y) => [x, y, s * half(x) * flare(y)];
          const a = p(xs[i], ys[j]);
          const b = p(xs[i + 1], ys[j]);
          const d = p(xs[i], ys[j + 1]);
          const e = p(xs[i + 1], ys[j + 1]);
          // Teak below the settee line, cream above, with a batten at each row.
          c.set(ys[j] < 0.5 ? TEAK : j % 2 ? CREAM : '#e9e1cf');
          const quad = s > 0 ? [a, d, b, b, d, e] : [a, b, d, b, e, d];
          for (const q of quad) {
            pos.push(...q);
            col.push(c.r, c.g, c.b);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      parts.push(g);
      // Ceiling battens along the hull.
      for (const y of [1.1, 1.7]) {
        for (let i = 0; i + 1 < xs.length; i++) {
          const a = V(xs[i], y, s * (half(xs[i]) * flare(y) - 0.02));
          const b = V(xs[i + 1], y, s * (half(xs[i + 1]) * flare(y) - 0.02));
          parts.push(paint(segment(a, b, 0.02, 0.02, 4), TEAK));
        }
      }
    }
    // The deckhead: arched from side to side, cream with teak beams.
    const pos = [];
    const col = [];
    const c = new THREE.Color(CREAM);
    const zs = [-1, -0.6, -0.25, 0, 0.25, 0.6, 1];
    const top = (x, u) => [x, H - 0.14 * u * u, u * half(x) * flare(H)];
    for (let i = 0; i + 1 < xs.length; i++) {
      for (let j = 0; j + 1 < zs.length; j++) {
        const a = top(xs[i], zs[j]);
        const b = top(xs[i + 1], zs[j]);
        const d = top(xs[i], zs[j + 1]);
        const e = top(xs[i + 1], zs[j + 1]);
        for (const q of [a, b, d, b, e, d]) {
          pos.push(...q);
          col.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(g);
    const beams = [];
    for (let x = AFT + 0.6; x < FWD - 0.3; x += 0.7) {
      for (let j = 0; j + 1 < zs.length; j++) {
        const a = top(x, zs[j]);
        const b = top(x, zs[j + 1]);
        beams.push(paint(segment(V(a[0], a[1] - 0.03, a[2]), V(b[0], b[1] - 0.03, b[2]), 0.03, 0.03, 4), TEAK));
      }
    }
    this.overhead = new THREE.Mesh(mergeParts(beams), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.group.add(this.overhead);
  }

  /** Where the bear stands on arriving below. */
  get arrival() {
    return this.ladder.clone().add(ORIGIN);
  }

  /** Close enough to the steps to go up? */
  nearLadder(p) {
    const l = this.arrival;
    return Math.hypot(p.x - l.x, p.z - l.z) < 1.0 && Math.abs(p.y - l.y) < 1.5;
  }

  /** Standing at the galley stove? */
  nearStove(p) {
    const c = this.stove.clone().add(ORIGIN);
    return Math.hypot(p.x - c.x, p.z - c.z) < 0.95;
  }

  /** Standing at the chart table? */
  nearChartTable(p) {
    const c = this.chartTable.clone().add(ORIGIN);
    return Math.hypot(p.x - c.x, p.z - c.z) < 0.85;
  }

  /** Daylight in the portholes follows the sky. night: 0 day … 1 night. camera: hide the beams when looking in from above. */
  update(night, camera = null) {
    const above = camera ? camera.position.y > ORIGIN.y + H - 0.1 : false;
    this.overhead.visible = !above;
    for (const f of this.hatchFrames) f.visible = !above;
    this.portMat.color.setRGB(0.75 - 0.65 * night, 0.88 - 0.72 * night, 0.93 - 0.68 * night);
    this.shaftMat.opacity = 0.08 * (1 - night);
    // The lamps matter more once it's dark.
    for (const l of this.lamps) l.intensity = l.userData.base * (1 + 0.6 * night);
  }
}
