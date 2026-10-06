import * as THREE from 'three';
import { sampleSurface } from '../shared/waves.js';

// Three-band ramp for a chunky, hand-painted look.
const toonRamp = (() => {
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const toon = (color, extra = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, ...extra });

const wood = toon('#8a5a32');
const woodDark = toon('#5b3a1f');
const iron = toon('#3a3f45');
const red = toon('#b8342a');
const cream = toon('#efe2c4');

export function makeBarrel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), wood);
  const bulge = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.55, 14), wood);
  g.add(body, bulge);
  for (const y of [-0.42, 0.42]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.035, 6, 18), iron);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  g.rotation.z = Math.PI / 2; // floats on its side
  const holder = new THREE.Group();
  holder.add(g);
  return { object: holder, draft: 0.12, size: 0.6 };
}

export function makeCrate() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wood));
  const plank = new THREE.BoxGeometry(1.04, 0.14, 0.14);
  for (const [y, z] of [[0.43, 0.45], [-0.43, 0.45], [0.43, -0.45], [-0.43, -0.45]]) {
    const m = new THREE.Mesh(plank, woodDark);
    m.position.set(0, y, z);
    g.add(m);
  }
  return { object: g, draft: 0.3, size: 0.7 };
}

function makeBuoy() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 1.0, 16), red);
  base.position.y = 0.2;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.22, 16), cream);
  stripe.position.y = 0.45;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8), woodDark);
  pole.position.y = 1.9;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.35, 8), iron);
  cap.position.y = 3.65;
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.25) });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glass);
  flame.position.y = 3.3;
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.33, 0.33, 0.55, 6, 1, true),
    toon('#2b2f33', { wireframe: true }),
  );
  cage.position.y = 3.25;
  const light = new THREE.PointLight(0xffa04a, 0, 30, 1.6);
  light.position.y = 3.3;
  g.add(base, stripe, pole, cap, flame, cage, light);
  return { object: g, draft: 0.45, size: 1.1, lantern: { light, glass } };
}

const surf = {};
const up = new THREE.Vector3(0, 1, 0);
const nrm = new THREE.Vector3();
const qTilt = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();

export class Flotsam {
  /** buoy: world {x, z} for the moored lantern buoy. */
  constructor({ buoy }) {
    this.group = new THREE.Group();
    this.items = [];
    const rand = mulberry32(7);

    const add = (made, x, z) => {
      this.group.add(made.object);
      this.items.push({
        ...made,
        // Anchor = the *undisplaced* point on the surface. Displacing it with
        // the wave function yields the true orbital bobbing motion for free.
        ax: x,
        az: z,
        yaw: rand() * Math.PI * 2,
        spin: (rand() - 0.5) * 0.05,
        drift: new THREE.Vector2(0.18 + rand() * 0.1, 0.05 + rand() * 0.1),
        quat: new THREE.Quaternion(),
      });
    };

    this.buoy = makeBuoy();
    add(this.buoy, buoy.x, buoy.z);
    this.items[0].drift.set(0, 0); // the buoy is moored
    this.items[0].spin = 0;
  }

  update(t, dt, waveScale, night) {
    for (const it of this.items) {
      it.ax += it.drift.x * dt;
      it.az += it.drift.y * dt;
      it.yaw += it.spin * dt;

      sampleSurface(it.ax, it.az, t, waveScale, surf);
      it.object.position.set(surf.x, surf.y - it.draft, surf.z);

      // Lean with the surface, but a bit lazily (mass), and only partially
      // for big objects, so they don't look glued on.
      nrm.set(surf.nx, surf.ny, surf.nz).lerp(up, 0.25).normalize();
      qTilt.setFromUnitVectors(up, nrm);
      qYaw.setFromAxisAngle(up, it.yaw);
      const target = qTilt.multiply(qYaw);
      it.quat.slerp(target, 1 - Math.exp(-dt * 4));
      it.object.quaternion.copy(it.quat);
    }

    const { light, glass } = this.buoy.lantern;
    const flicker = 0.85 + 0.15 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.7);
    light.intensity = (2 + 18 * night) * flicker;
    glass.color.setRGB(1.0, 0.62, 0.25).multiplyScalar(1 + 4 * night * flicker);
  }
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
