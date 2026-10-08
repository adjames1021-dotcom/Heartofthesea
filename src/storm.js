import * as THREE from 'three';

// What a storm looks and sounds like up close: rain driven on the wind,
// lightning forking down onto the sea with the sky lighting up behind it,
// and thunder arriving a few seconds later from however far away it struck.
// Purely local, like the birds: the storm itself (wind, sea, cloud) comes
// from the shared clock in shared/environment.js.

const DROPS = 2200;
const BOX = 34; // half-size of the box of rain that follows the camera
const TAU = Math.PI * 2;

export class Storm {
  constructor({ scene, audio = null }) {
    this.audio = audio;
    this.flash = 0; // 0..1, how lit up the sky is right now

    // Rain: short streaks, each a line from its head back along its fall.
    this.drops = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) {
      this.drops[i * 3] = (Math.random() * 2 - 1) * BOX;
      this.drops[i * 3 + 1] = Math.random() * 2 * BOX;
      this.drops[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
    }
    const geo = new THREE.BufferGeometry();
    this.rainPos = new THREE.BufferAttribute(new Float32Array(DROPS * 6), 3);
    this.rainPos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.rainPos);
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#c9d3db', transparent: true, opacity: 0.4, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // Lightning: one bolt mesh, rebuilt for each strike.
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 3.0), fog: false, transparent: true });
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    scene.add(this.bolt);
    this.strike = null;
    this.nextStrike = 6;
  }

  /**
   * storm: 0..1. camera: the scene camera. wind: { x, z, speed }. inside: in
   * the cabin (no rain indoors, and thunder sounds muffled but still comes).
   * Returns the flash (0..1) for the sky and lights.
   */
  update(dt, { storm, camera, wind, inside = false, night = 0 }) {
    const cam = camera.position;
    this.#rain(dt, storm, cam, wind, inside);
    // Rain is grey streaks by day, barely there at night until the lightning catches it.
    const lit = 1 - 0.75 * night + 0.75 * this.flash;
    this.rain.material.color.setRGB(0.79 * lit, 0.83 * lit, 0.86 * lit);

    // Lightning, once it's properly blowing.
    this.nextStrike -= dt;
    if (storm > 0.55 && this.nextStrike <= 0 && !this.strike) {
      this.#newStrike(cam, storm);
      this.nextStrike = (14 - 9 * storm) * (0.5 + Math.random());
    }
    let flash = 0;
    if (this.strike) {
      const s = this.strike;
      s.t += dt;
      // Flicker: a pattern of on and off, the first stroke brightest.
      let on = 0;
      for (const [t0, t1, k] of s.pattern) if (s.t >= t0 && s.t < t1) on = k;
      this.bolt.visible = s.bolt && on > 0;
      this.boltMat.opacity = on;
      flash = on * s.power;
      if (!s.thundered && s.t > s.delay) {
        s.thundered = true;
        this.audio?.thunder?.(s.dist, inside);
      }
      if (s.t > Math.max(s.delay + 0.1, 1.2)) {
        this.strike = null;
        this.bolt.visible = false;
      }
    }
    // The sky glow fades a little slower than the bolt.
    this.flash = Math.max(flash, this.flash - dt * 6);
    return this.flash;
  }

  #rain(dt, storm, cam, wind, inside) {
    const on = storm > 0.25 && !inside;
    this.rain.visible = on;
    if (!on) return;
    const count = Math.floor(DROPS * Math.min(1, (storm - 0.25) / 0.6));
    const fall = 15;
    const wx = wind.x * wind.speed * 0.7;
    const wz = wind.z * wind.speed * 0.7;
    const len = 0.06; // seconds of fall each streak shows
    const d = this.drops;
    const p = this.rainPos.array;
    for (let i = 0; i < count; i++) {
      let x = d[i * 3] + wx * dt;
      let y = d[i * 3 + 1] - fall * dt;
      let z = d[i * 3 + 2] + wz * dt;
      // Keep the box round the camera: wrap anything that leaves it.
      if (y < -4) y += 2 * BOX;
      if (x > BOX) x -= 2 * BOX;
      else if (x < -BOX) x += 2 * BOX;
      if (z > BOX) z -= 2 * BOX;
      else if (z < -BOX) z += 2 * BOX;
      const rx = x + cam.x;
      const rz = z + cam.z;
      d[i * 3] = x;
      d[i * 3 + 1] = y;
      d[i * 3 + 2] = z;
      const ry = y + cam.y - BOX * 0.6;
      p[i * 6] = rx;
      p[i * 6 + 1] = ry;
      p[i * 6 + 2] = rz;
      p[i * 6 + 3] = rx - wx * len;
      p[i * 6 + 4] = ry + fall * len;
      p[i * 6 + 5] = rz - wz * len;
    }
    this.rain.geometry.setDrawRange(0, count * 2);
    this.rainPos.needsUpdate = true;
    this.rain.material.opacity = 0.25 + 0.25 * storm;
  }

  #newStrike(cam, storm) {
    // Somewhere out on the sea, now and then close by.
    const a = Math.random() * TAU;
    const dist = Math.random() < 0.15 ? 120 + Math.random() * 150 : 300 + Math.random() * 1100;
    const x = cam.x + Math.cos(a) * dist;
    const z = cam.z + Math.sin(a) * dist;
    // Sometimes just the cloud lights up with no bolt to be seen.
    const bolt = Math.random() < 0.75;
    if (bolt) this.#buildBolt(x, z, dist);
    const strokes = 1 + Math.floor(Math.random() * 3);
    const pattern = [];
    let t = 0;
    for (let i = 0; i < strokes; i++) {
      const on = 0.05 + Math.random() * 0.07;
      pattern.push([t, t + on, i === 0 ? 1 : 0.55 + Math.random() * 0.4]);
      t += on + 0.04 + Math.random() * 0.12;
    }
    this.strike = {
      t: 0,
      bolt,
      pattern,
      dist,
      delay: dist / 343,
      power: (bolt ? 1 : 0.55) * THREE.MathUtils.clamp(1.3 - dist / 1600, 0.35, 1) * (0.6 + 0.4 * storm),
      thundered: false,
    };
  }

  /** A forked bolt from the cloud base down to the water, as a thin ribbon of tubes. */
  #buildBolt(x, z, dist) {
    const top = 260 + Math.random() * 80;
    const pts = [new THREE.Vector3(x, top, z)];
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const p = pts[i - 1].clone();
      p.y = top * (1 - i / steps);
      p.x += (Math.random() - 0.5) * 34;
      p.z += (Math.random() - 0.5) * 34;
      pts.push(p);
    }
    const r = THREE.MathUtils.clamp(dist / 450, 0.6, 2.6);
    const geos = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 60, r, 4, false)];
    // A fork or two off the main channel.
    for (let f = 0; f < 2; f++) {
      if (Math.random() < 0.35) continue;
      const k = 3 + Math.floor(Math.random() * 6);
      const branch = [pts[k].clone()];
      for (let i = 1; i <= 4; i++) {
        const p = branch[i - 1].clone();
        p.y -= 22 + Math.random() * 18;
        p.x += (Math.random() - 0.5) * 40;
        p.z += (Math.random() - 0.5) * 40;
        branch.push(p);
      }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branch), 16, r * 0.6, 4, false));
    }
    this.bolt.geometry.dispose();
    this.bolt.geometry = mergeTubes(geos);
  }
}

function mergeTubes(geos) {
  let n = 0;
  let m = 0;
  for (const g of geos) {
    n += g.attributes.position.count;
    m += g.index.count;
  }
  const pos = new Float32Array(n * 3);
  const idx = new Uint32Array(m);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
