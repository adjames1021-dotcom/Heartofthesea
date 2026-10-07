import * as THREE from 'three';
import { makeBox } from './collision.js';
import { paint, mergeParts, segment } from './props.js';

// Below decks. Roomier than the hull outside could ever hold (boats are like
// that), but laid out like a real cruising yacht: the companionway steps come
// down aft into the galley, the saloon table is amidships, and the owner's
// cabin is forward through a doorway.
//
// It's built well away from the world and the bear is moved there when it
// goes below, so the boat can keep sailing on its own outside.
//
// Local frame: +x toward the bow, +z to starboard, floor at y = 0.

const ORIGIN = new THREE.Vector3(-3000, 200, -3000);
const L = 7; // half length
const B = 3; // half breadth
const H = 2.35; // headroom

const TEAK = '#8a5a34';
const TEAK_DARK = '#6a4426';
const TEAK_LIGHT = '#a8774a';
const CREAM = '#efe8d8';
const NAVY = '#2e3e5c';
const NAVY_LIGHT = '#3f5478';
const STEEL = '#b9bec2';
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Interior {
  constructor({ scene, world }) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'interior';
    this.group.position.copy(ORIGIN);
    scene.add(this.group);
    this.inside = false;

    const parts = [];
    const box = (cx, cy, cz, sx, sy, sz, color, solid = true) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(cx, cy, cz);
      parts.push(paint(g, color));
      if (solid) world.addStatic(makeBox({ center: V(cx, cy, cz).add(ORIGIN), half: V(sx / 2, sy / 2, sz / 2) }));
    };

    // Shell: floor, ceiling, walls, with the hull's curve hinted by the
    // cabin sides leaning in at the top.
    box(0, -0.1, 0, 2 * L, 0.2, 2 * B, TEAK_LIGHT);
    box(0, H + 0.1, 0, 2 * L, 0.2, 2 * B, CREAM);
    box(-L - 0.1, H / 2, 0, 0.2, H, 2 * B, TEAK);
    box(L + 0.1, H / 2, 0, 0.2, H, 2 * B, TEAK);
    for (const s of [-1, 1]) {
      box(0, H / 2, s * (B + 0.1), 2 * L, H, 0.2, CREAM);
      // A teak strip and handrail along each side.
      box(0, 1.05, s * (B - 0.02), 2 * L, 0.12, 0.04, TEAK, false);
      box(0, 1.95, s * (B - 0.06), 2 * L - 1, 0.05, 0.05, TEAK_DARK, false);
    }
    // Ceiling beams.
    for (let x = -L + 1; x < L; x += 1.4) box(x, H - 0.05, 0, 0.1, 0.1, 2 * B, TEAK, false);
    // Floor planks: teak and holly lines.
    for (let z = -B + 0.3; z < B; z += 0.3) box(0, 0.002, z, 2 * L, 0.004, 0.025, '#e6dcc4', false);

    // ---- Companionway steps, aft, coming down from the cockpit ----
    for (let i = 0; i < 4; i++) {
      const x = -L + 0.35 + i * 0.32;
      const y = 1.6 - i * 0.4;
      box(x, y, 0, 0.32, 0.06, 0.8, TEAK_DARK, false);
    }
    for (const s of [-1, 1]) parts.push(paint(segment(V(-L + 0.2, 1.9, s * 0.44), V(-L + 1.45, 0, s * 0.44), 0.03, 0.03, 5), TEAK_DARK));
    this.ladder = V(-L + 1.9, 0, 0);

    // ---- Galley, aft to port ----
    const gz = -B + 0.35;
    box(-4.6, 0.45, gz, 3.6, 0.9, 0.7, TEAK); // counter
    box(-4.6, 0.92, gz, 3.6, 0.04, 0.72, '#d9d2c0', false); // worktop
    box(-5.6, 0.95, gz, 0.6, 0.04, 0.45, STEEL, false); // sink
    parts.push(paint(segment(V(-5.6, 0.95, gz - 0.2), V(-5.6, 1.25, gz - 0.2), 0.02, 0.02, 5), STEEL)); // tap
    parts.push(paint(segment(V(-5.6, 1.25, gz - 0.2), V(-5.6, 1.22, gz + 0.02), 0.02, 0.02, 5), STEEL));
    box(-4.1, 0.97, gz, 0.6, 0.06, 0.5, '#2a2a2a', false); // stove top
    for (const [dx, dz] of [[-0.14, -0.11], [0.14, -0.11], [-0.14, 0.11], [0.14, 0.11]]) {
      const ring = new THREE.TorusGeometry(0.07, 0.012, 4, 12);
      ring.rotateX(Math.PI / 2);
      ring.translate(-4.1 + dx, 1.01, gz + dz);
      parts.push(paint(ring, '#555555'));
    }
    // The kettle.
    const kettle = new THREE.SphereGeometry(0.11, 10, 8);
    kettle.scale(1, 0.85, 1);
    kettle.translate(-4.24, 1.1, gz - 0.11);
    parts.push(paint(kettle, '#c9473a'));
    parts.push(paint(segment(V(-4.16, 1.12, gz - 0.11), V(-4.07, 1.18, gz - 0.11), 0.018, 0.012, 5), '#c9473a'));
    box(-3.0, 0.75, gz, 0.6, 1.5, 0.7, '#e9e6de'); // fridge
    box(-4.6, 1.75, -B + 0.2, 3.6, 0.55, 0.4, TEAK, false); // lockers above
    for (let i = 0; i < 4; i++) box(-6.0 + i * 0.9, 1.75, -B + 0.41, 0.8, 0.45, 0.02, TEAK_LIGHT, false);
    // Mugs on a rack.
    for (let i = 0; i < 3; i++) {
      const mug = new THREE.CylinderGeometry(0.04, 0.04, 0.09, 8);
      mug.translate(-5.0 + i * 0.14, 1.0, gz + 0.22);
      parts.push(paint(mug, ['#f2efe6', NAVY_LIGHT, '#d5a440'][i]));
    }
    // Chart table, aft to starboard, across from the galley.
    box(-5.4, 0.42, B - 0.5, 1.4, 0.84, 0.9, TEAK);
    box(-5.4, 0.86, B - 0.5, 1.4, 0.04, 0.92, TEAK_LIGHT, false);
    box(-5.4, 0.89, B - 0.5, 0.8, 0.005, 0.55, '#e8dcb8', false); // a chart
    box(-4.4, 0.25, B - 0.6, 0.45, 0.5, 0.45, NAVY); // stool
    this.chartTable = V(-5.4, 0, B - 1.3);

    // ---- Saloon, amidships ----
    box(0, 0.36, 0, 2.2, 0.06, 0.9, TEAK_LIGHT, false); // table top
    // (Collision a little taller than the table, so nobody walks up onto it.)
    world.addStatic(makeBox({ center: V(0, 0.55, 0).add(ORIGIN), half: V(1.1, 0.55, 0.45) }));
    box(0, 0.18, 0, 0.18, 0.36, 0.5, TEAK_DARK, false);
    for (const s of [-1, 1]) {
      box(0, 0.22, s * (B - 0.45), 3.6, 0.44, 0.9, TEAK); // settee base
      box(0, 0.5, s * (B - 0.45), 3.6, 0.12, 0.88, NAVY, false); // cushion
      box(0, 0.8, s * (B - 0.08), 3.6, 0.5, 0.14, NAVY_LIGHT, false); // backrest
      box(0, 1.65, s * (B - 0.2), 3.6, 0.04, 0.36, TEAK_DARK, false); // bookshelf
      for (let i = 0; i < 12; i++) {
        const h = 0.18 + ((i * 37) % 7) * 0.012;
        box(-1.6 + i * 0.26, 1.67 + h / 2, s * (B - 0.2), 0.05, h, 0.24, ['#7a2f26', '#2f4a3a', '#c9a24a', '#3a4a6a'][i % 4], false);
      }
    }
    // Oil lamp over the table.
    parts.push(paint(segment(V(0, H, 0), V(0, 1.75, 0), 0.008, 0.008, 4), '#3a3a3a'));
    const glass = new THREE.CylinderGeometry(0.07, 0.09, 0.2, 10);
    glass.translate(0, 1.65, 0);
    parts.push(paint(glass, '#f6e2b0'));

    // ---- Bulkhead with a doorway, then the forward cabin ----
    const door = 0.5;
    box(3, H / 2, -(B + door) / 2, 0.12, H, B - door, TEAK);
    box(3, H / 2, (B + door) / 2, 0.12, H, B - door, TEAK);
    box(3, H - 0.25, 0, 0.12, 0.5, 2 * door, TEAK, false);
    // The bed: a wide berth with a quilt, two pillows and a blanket folded
    // at the foot.
    box(5.4, 0.3, 0, 3.0, 0.6, 3.6, TEAK);
    box(5.4, 0.66, 0, 2.9, 0.14, 3.5, '#f3efe6', false); // mattress
    box(5.15, 0.75, 0, 2.3, 0.05, 3.5, '#4f6b8f', false); // quilt
    for (const z of [-0.8, 0.8]) {
      const pillow = new THREE.SphereGeometry(1, 10, 6);
      pillow.scale(0.32, 0.1, 0.5);
      pillow.translate(6.55, 0.82, z);
      parts.push(paint(pillow, '#fbf8f0'));
    }
    box(4.25, 0.82, 0, 0.45, 0.08, 3.0, '#b8463b', false); // folded blanket
    box(L - 0.12, 1.1, 0, 0.1, 0.9, 3.2, TEAK_DARK, false); // headboard
    // A rug, a hanging locker and a little shelf.
    box(3.6, 0.01, 0, 1.0, 0.02, 1.6, '#9b5b3a', false);
    box(3.6, 1.0, -B + 0.35, 1.0, 2.0, 0.7, TEAK);
    box(3.6, 1.0, B - 0.35, 1.0, 2.0, 0.7, TEAK);
    box(5.4, 1.35, B - 0.12, 2.0, 0.04, 0.22, TEAK_DARK, false);

    // Portholes: daylight (or the dark) outside.
    this.portMat = new THREE.MeshBasicMaterial({ color: '#bfe0ec' });
    const rimMat = new THREE.MeshLambertMaterial({ color: '#b08a3c' });
    for (const x of [-4.6, -1.5, 1.5, 5.4]) {
      for (const s of [-1, 1]) {
        if (x < -4 && s < 0) continue; // the galley lockers are there
        const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), this.portMat);
        glassDisc.position.set(x, 1.45, s * (B - 0.005));
        glassDisc.rotation.y = s > 0 ? Math.PI : 0;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 18), rimMat);
        rim.position.copy(glassDisc.position);
        rim.rotation.y = glassDisc.rotation.y;
        this.group.add(glassDisc, rim);
      }
    }

    const mesh = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.group.add(mesh);

    // Warm lamps.
    this.lamps = [V(-4.2, 2.15, 0), V(0, 2.1, 0), V(5.2, 2.15, 0)].map((p) => {
      const light = new THREE.PointLight('#ffcf8a', 3.5, 9, 1.6);
      light.position.copy(p);
      this.group.add(light);
      return light;
    });
  }

  /** Where the bear stands on arriving below. */
  get arrival() {
    return this.ladder.clone().add(ORIGIN);
  }

  /** Close enough to the steps to go up? */
  nearLadder(p) {
    const l = this.arrival;
    return Math.hypot(p.x - l.x, p.z - l.z) < 1.3 && Math.abs(p.y - l.y) < 1.5;
  }

  /** Standing at the galley stove? */
  nearStove(p) {
    const c = V(-4.1, 0, -B + 1.0).add(ORIGIN);
    return Math.hypot(p.x - c.x, p.z - c.z) < 1.0;
  }

  /** Standing at the chart table? */
  nearChartTable(p) {
    const c = this.chartTable.clone().add(ORIGIN);
    return Math.hypot(p.x - c.x, p.z - c.z) < 1.1;
  }

  /**
   * What you've found on the islands, kept aboard: small things on the saloon
   * table, the logbook and spyglass on the chart table, the bell by the
   * steps, the name board on the saloon wall. make(id) builds each one.
   */
  showFinds(found, make) {
    const SLOTS = {
      bottle: [-0.8, 0.39, 0.12, 0.3], float: [-0.4, 0.39, -0.18, 0], lead: [-0.05, 0.39, 0.2, 0.8],
      cowrie: [0.3, 0.39, -0.12, 0.4], seaglass: [0.5, 0.39, 0.12, 0], scallop: [0.7, 0.39, -0.15, 2.4], pipe: [0.9, 0.39, 0.15, 1],
      log: [-5.7, 0.89, B - 0.32, 0.2], spyglass: [-5.2, 0.89, B - 0.25, -0.3],
      bell: [-L + 0.2, 1.95, 0.85, Math.PI / 2], nameboard: [0, 1.32, -B + 0.04, 0],
    };
    this.kept ??= new Map();
    for (const id of found) {
      if (this.kept.has(id) || !SLOTS[id]) continue;
      const o = make(id);
      if (!o) continue;
      const [x, y, z, yaw] = SLOTS[id];
      o.position.set(x, y, z);
      if (id !== 'nameboard') o.rotation.y = yaw;
      this.group.add(o);
      this.kept.set(id, o);
    }
  }

  /** Daylight in the portholes follows the sky. night: 0 day … 1 night. */
  update(night) {
    this.portMat.color.setRGB(0.75 - 0.65 * night, 0.88 - 0.72 * night, 0.93 - 0.68 * night);
  }
}
