import * as THREE from 'three';

// The player character: a chubby, sleepy bear modelled on the reference art.
// Big round head, small oval muzzle low on the face, bead eyes set wide,
// round ears with coloured insides, a big oval belly patch, a zip down the
// back, and a dark ink outline like the drawings. Everything is primitives
// animated procedurally (no skeleton).
//
// Faces +z. Feet at y = 0. About 1.36 m tall.

export const LOOKS = {
  brown: {
    fur: '#b9762f', patch: '#f4e8cc', ear: '#f2b33a', eye: '#2a180c', ink: '#4a2a12', zip: true, button: null,
  },
  white: {
    fur: '#f6eedb', patch: '#ffffff', ear: '#f4a3c4', eye: '#2a180c', ink: '#6a5a48', zip: false, button: '#d43b2e',
  },
};

const ramp = (() => {
  const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const SPHERE = new THREE.SphereGeometry(1, 24, 18);
const SPHERE_LO = new THREE.SphereGeometry(1, 14, 10);

function bodyGeometry() {
  // A soft pear, slightly flattened front to back.
  const pts = [
    [0, 0.13], [0.2, 0.16], [0.31, 0.26], [0.35, 0.42], [0.33, 0.58], [0.27, 0.72], [0.17, 0.81], [0, 0.85],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 28);
  g.scale(1, 1, 0.88);
  g.computeVertexNormals();
  return g;
}
const BODY = bodyGeometry();

function capsule(r, len) {
  return new THREE.CapsuleGeometry(r, len, 6, 14);
}

export class Bear {
  constructor(look = 'brown') {
    const L = LOOKS[look] ?? LOOKS.brown;
    this.look = L;
    const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });
    this.mat = {
      fur: toon(L.fur),
      patch: toon(L.patch),
      ear: toon(L.ear),
      eye: new THREE.MeshBasicMaterial({ color: L.eye }),
      ink: new THREE.MeshBasicMaterial({ color: L.ink, side: THREE.BackSide }),
      zip: new THREE.MeshBasicMaterial({ color: '#6b4520' }),
      pull: toon('#c8c8c4'),
      button: L.button ? toon(L.button) : null,
    };

    this.root = new THREE.Group();
    this.root.name = 'bear';
    this.pivot = new THREE.Group(); // whole-body lean / bob
    this.root.add(this.pivot);

    const part = (parent, geo, mat, pos, scale, { ink = 0.02, shadow = true } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.scale.copy(scale);
      m.castShadow = shadow;
      parent.add(m);
      if (ink > 0) {
        const o = new THREE.Mesh(geo, this.mat.ink);
        o.position.copy(pos);
        const avg = (scale.x + scale.y + scale.z) / 3;
        o.scale.copy(scale).multiplyScalar(1 + ink / avg);
        parent.add(o);
      }
      return m;
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    // --- Body ---
    this.hips = new THREE.Group();
    this.pivot.add(this.hips);
    part(this.hips, BODY, this.mat.fur, V(0, 0, 0), V(1, 1, 1), { ink: 0.018 });
    if (!L.button) part(this.hips, SPHERE, this.mat.patch, V(0, 0.45, 0.255), V(0.21, 0.235, 0.075), { ink: 0.012, shadow: false });
    part(this.hips, SPHERE_LO, this.mat.fur, V(0, 0.29, -0.3), V(0.065, 0.065, 0.065), { ink: 0.012 });
    if (L.zip) {
      // The zip down the back: a dark seam following the curve, with a pull at the top.
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const y = 0.8 - (i / 10) * 0.46;
        // Back surface of the lathe body at this height, nudged out a hair.
        const prof = [[0.13, 0], [0.16, 0.2], [0.26, 0.31], [0.42, 0.35], [0.58, 0.33], [0.72, 0.27], [0.81, 0.17], [0.85, 0]];
        let r = 0;
        for (let k = 0; k + 1 < prof.length; k++) {
          const [y0, r0] = prof[k];
          const [y1, r1] = prof[k + 1];
          if (y >= y0 && y <= y1) r = r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
        }
        pts.push(new THREE.Vector3(0, y, -(r * 0.88 + 0.004)));
      }
      const seam = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 4, false),
        this.mat.zip,
      );
      this.hips.add(seam);
      const pull = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.01), this.mat.pull);
      pull.position.set(0.012, 0.765, pts[0].z - 0.01);
      pull.rotation.x = 0.3;
      this.hips.add(pull);
    }
    if (L.button) part(this.hips, SPHERE_LO, this.mat.button, V(0, 0.6, 0.29), V(0.05, 0.05, 0.025), { ink: 0.008, shadow: false });

    // --- Arms ---
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      // Short and stubby, set on the outside of the body so they read from the front.
      shoulder.position.set(side * 0.29, 0.62, 0.05);
      this.hips.add(shoulder);
      part(shoulder, capsule(0.092, 0.17), this.mat.fur, V(side * 0.035, -0.13, 0.015), V(1, 1, 1), { ink: 0.016 });
      part(shoulder, SPHERE_LO, this.mat.fur, V(side * 0.045, -0.26, 0.035), V(0.1, 0.095, 0.1), { ink: 0.014 });
      shoulder.rotation.z = -side * 0.4;
      return shoulder;
    });

    // --- Legs ---
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.14, 0.24, 0.02);
      this.pivot.add(hip);
      part(hip, capsule(0.105, 0.08), this.mat.fur, V(0, -0.1, 0), V(1, 1, 1), { ink: 0.016 });
      part(hip, SPHERE_LO, this.mat.fur, V(0, -0.17, 0.05), V(0.115, 0.075, 0.14), { ink: 0.014 });
      return hip;
    });

    // --- Head ---
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.8, 0);
    this.hips.add(this.neck);
    const head = new THREE.Group();
    this.head = head;
    this.neck.add(head);
    const hy = 0.22;
    part(head, SPHERE, this.mat.fur, V(0, hy, 0), V(0.39, 0.35, 0.37), { ink: 0.02 });
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.26, hy + 0.27, -0.02);
      ear.rotation.z = -side * 0.35;
      head.add(ear);
      part(ear, SPHERE_LO, this.mat.fur, V(0, 0, 0), V(0.125, 0.125, 0.075), { ink: 0.016 });
      part(ear, SPHERE_LO, this.mat.ear, V(0, -0.008, 0.05), V(0.088, 0.088, 0.035), { ink: 0, shadow: false });
    }
    part(head, SPHERE, this.mat.patch, V(0, hy - 0.11, 0.305), V(0.15, 0.105, 0.06), { ink: 0.012, shadow: false });
    // Nose and the little mouth under it.
    const nose = new THREE.Mesh(SPHERE_LO, this.mat.eye);
    nose.position.set(0, hy - 0.065, 0.358);
    nose.scale.set(0.04, 0.03, 0.028);
    head.add(nose);
    const stroke = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 5), this.mat.eye);
      m.position.set((x0 + x1) / 2, hy + (y0 + y1) / 2 - 0.005, 0.36);
      m.rotation.z = Math.atan2(-(x1 - x0), y1 - y0);
      head.add(m);
    };
    stroke(0, -0.085, 0, -0.115);
    stroke(0, -0.115, -0.03, -0.14);
    stroke(0, -0.115, 0.03, -0.14);
    // Eyes: plain black beads, set wide.
    this.eyes = [-1, 1].map((side) => {
      const e = new THREE.Mesh(SPHERE_LO, this.mat.eye);
      e.position.set(side * 0.165, hy - 0.005, 0.318);
      e.scale.set(0.038, 0.048, 0.025);
      head.add(e);
      return e;
    });

    this.root.traverse((o) => {
      if (o.isMesh) o.receiveShadow = false;
    });

    // A spade, only out while digging.
    this.shovel = null;

    // Animation state
    this.phase = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.idleT = 0;
    this.pose = this.#emptyPose();
  }

  /** A fishing rod in the right paw, angled up and out. */
  setRod(visible, model = null) {
    if (!this.rod && model) {
      this.rod = model;
      this.rod.position.set(0.04, -0.26, 0.05);
      this.rod.rotation.x = -0.9;
      this.arms[1].add(this.rod);
    }
    if (this.rod) this.rod.visible = visible;
  }

  setShovel(visible, model = null) {
    if (!this.shovel && model) {
      this.shovel = model;
      this.shovel.position.set(0.04, -0.24, 0.06);
      this.shovel.rotation.x = 0.35;
      this.arms[1].add(this.shovel);
    }
    if (this.shovel) this.shovel.visible = visible;
  }

  #emptyPose() {
    return {
      bob: 0, lean: 0, roll: 0, headX: 0, headZ: 0, headY: 0,
      armX: [0, 0], armZ: [-0.4, 0.4], legX: [0, 0], // arms hang a little away from the body
    };
  }

  /**
   * Animate. s: { mode, speed (m/s), t (seconds), effort (0..1, e.g. cranking) }
   * Modes: idle, walk, air, swim, helm, crank, haul, dig, carry, flop, hang, climb, rope.
   */
  update(dt, s) {
    const target = this.#emptyPose();
    // Standing on a heeling deck: arms out a little for balance.
    const brace = Math.min(1, Math.max(0, ((s.brace ?? 0) - 0.08) / 0.35));
    target.armZ = [-0.4 - 0.9 * brace, 0.4 + 0.9 * brace];
    const t = s.t;
    const k = 1 - Math.exp(-dt * 12);
    const speed = s.speed ?? 0;

    switch (s.mode) {
      case 'walk': {
        this.phase += dt * (4 + speed * 2.4);
        const sw = Math.sin(this.phase);
        const amp = Math.min(1, speed / 3);
        target.legX = [sw * 0.65 * amp, -sw * 0.65 * amp];
        target.armX = [-sw * 0.5 * amp, sw * 0.5 * amp];
        target.bob = Math.abs(Math.cos(this.phase)) * 0.04 * amp;
        target.roll = sw * 0.09 * amp; // waddle
        target.lean = 0.08 * amp;
        target.headZ = -sw * 0.05 * amp;
        if (s.carrying) {
          target.armX = [-1.25, -1.25];
          target.armZ = [0.1, -0.1];
        }
        break;
      }
      case 'air':
        target.armX = [-2.2, -2.2];
        target.armZ = [-0.55, 0.55];
        target.legX = [0.5, -0.2];
        break;
      case 'swim': {
        // Treading water when still; a steady paddle, quicker with speed.
        const go = Math.min(1, speed / 2.6);
        this.phase += dt * (2.5 + 4 * go);
        const sw = Math.sin(this.phase);
        target.lean = 0.35 + 0.6 * go;
        target.headX = -0.25 - 0.55 * go;
        target.armX = [-1.0 - 0.6 * go + sw * (0.4 + 0.7 * go), -1.0 - 0.6 * go - sw * (0.4 + 0.7 * go)];
        target.armZ = [0.5 + 0.3 * (1 - go), -0.5 - 0.3 * (1 - go)];
        target.legX = [0.3 + 0.3 * go + sw * 0.4, 0.3 + 0.3 * go - sw * 0.4];
        target.bob = Math.sin(t * 2.2) * 0.03 * (1 - go);
        break;
      }
      case 'helm':
        target.armX = [-1.25, -1.25];
        target.armZ = [0.05, -0.05];
        target.headX = -0.05 + Math.sin(t * 0.6) * 0.03;
        target.roll = (s.turning ?? 0) * 0.12;
        break;
      case 'crank': {
        // Winch handle / windlass: one arm goes round and round.
        const e = s.effort ?? 0;
        this.phase += dt * 7 * e;
        target.lean = 0.2;
        target.armX = [-1.0 + Math.sin(this.phase) * 0.5 * e, -0.9];
        target.armZ = [0.2 + Math.cos(this.phase) * 0.25 * e, -0.15];
        target.headX = 0.2;
        break;
      }
      case 'haul': {
        const e = s.effort ?? 0;
        this.phase += dt * 5 * e;
        const sw = Math.sin(this.phase);
        target.lean = -0.1 + 0.2 * e;
        target.armX = [-2.4 + sw * 0.9 * e, -2.4 - sw * 0.9 * e];
        target.armZ = [0.15, -0.15];
        target.headX = -0.25;
        break;
      }
      case 'dig': {
        this.phase += dt * 6;
        const sw = Math.sin(this.phase);
        target.lean = 0.45 + sw * 0.15;
        target.armX = [-1.0 + sw * 0.6, -1.0 + sw * 0.6];
        target.armZ = [0.05, -0.05];
        target.headX = 0.35;
        break;
      }
      case 'fish':
        // Rod held out, the other paw on the reel.
        target.armX = [-1.0, -1.25];
        target.armZ = [0.0, -0.15];
        target.headX = 0.12;
        target.bob = Math.sin(t * 1.6) * 0.008;
        break;
      case 'cast': {
        // Back over the shoulder, then whip it forward.
        const k2 = s.effort ?? 0; // 0 → 1 through the cast
        const swing = k2 < 0.45 ? -2.9 * (k2 / 0.45) : -2.9 + 1.9 * ((k2 - 0.45) / 0.55);
        target.armX = [-1.0, swing];
        target.armZ = [0.0, -0.1];
        target.lean = -0.08 + 0.18 * k2;
        break;
      }
      case 'carry':
        target.armX = [-1.25, -1.25];
        target.armZ = [0.1, -0.1];
        break;
      case 'flop':
        target.lean = 1.4;
        target.armX = [-2.8, -2.8];
        target.armZ = [0.6, -0.6];
        target.legX = [0.4, 0.4];
        target.bob = -0.25;
        break;
      case 'hang':
        target.armX = [-2.9, -2.9];
        target.armZ = [0.25, -0.25];
        target.legX = [0.15, -0.1];
        break;
      case 'climb': {
        this.phase += dt * 6 * Math.min(1, speed);
        const sw = Math.sin(this.phase);
        target.armX = [-2.6 + sw * 0.4, -2.6 - sw * 0.4];
        target.armZ = [0.3, -0.3];
        target.legX = [-0.4 - sw * 0.4, -0.4 + sw * 0.4];
        target.lean = -0.1;
        break;
      }
      case 'rope':
        target.armX = [-3.0, -2.9];
        target.armZ = [0.1, -0.1];
        target.legX = [0.5, 0.3];
        break;
      default: {
        // Idle: breathing, a lazy sway, and now and then a big stretch.
        this.idleT += dt;
        target.bob = Math.sin(t * 1.6) * 0.008;
        target.headZ = Math.sin(t * 0.45) * 0.06;
        target.headX = Math.sin(t * 0.3) * 0.03;
        const cycle = this.idleT % 22;
        if (cycle > 18 && cycle < 20.5) {
          const y = Math.sin(((cycle - 18) / 2.5) * Math.PI);
          target.armX = [-2.6 * y, -2.6 * y];
          target.armZ = [0.25 + 0.4 * y, -0.25 - 0.4 * y];
          target.headX = -0.35 * y;
        }
      }
    }
    if (s.mode !== 'idle') this.idleT = 0;

    const p = this.pose;
    for (const key of ['bob', 'lean', 'roll', 'headX', 'headZ', 'headY']) p[key] += (target[key] - p[key]) * k;
    for (let i = 0; i < 2; i++) {
      p.armX[i] += (target.armX[i] - p.armX[i]) * k;
      p.armZ[i] += (target.armZ[i] - p.armZ[i]) * k;
      p.legX[i] += (target.legX[i] - p.legX[i]) * k;
    }

    this.pivot.position.y = p.bob;
    this.pivot.rotation.set(p.lean, 0, p.roll);
    this.neck.rotation.set(p.headX, p.headY, p.headZ);
    this.arms.forEach((a, i) => {
      a.rotation.x = p.armX[i];
      a.rotation.z = p.armZ[i];
    });
    this.legs.forEach((l, i) => {
      l.rotation.x = p.legX[i];
    });

    // Blink.
    this.blinkT -= dt;
    const closed = this.blinkT < 0.12 && this.blinkT > 0;
    if (this.blinkT <= 0) this.blinkT = 2.5 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = closed ? 0.006 : 0.048;
  }
}
