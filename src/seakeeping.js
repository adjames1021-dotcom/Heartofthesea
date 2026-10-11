import { heightAt } from '../shared/waves.js';
import { groundAt } from '../shared/world.js';
import { BOAT } from '../shared/boat.js';
import { halfAt, deckAt } from './boat.js';

// How the boat rides the sea: heave, pitch and roll from buoyancy, worked out
// along the whole hull rather than guessed from a few points. The sea is
// sampled under fourteen columns of hull (two rows, bow to stern); each pushes
// up by how deep it's in, and is damped against the water moving past it. So
// she sits in the water, rises to a swell and drops into the trough, and with
// way on in a big sea can come off a crest and land hard.
//
// Sail heel stays in shared/boat.js (b.heel); `roll` here is what the sea does
// on top of it.
//
// In a storm, and only then, the sea gets rough with her. Come over a crest
// fast and she leaves the water and lands hard. A breaking crest on the beam
// can knock her flat; a bad one rolls her right over. Like any keelboat she
// lies keel-up a few seconds, then her keel brings her the rest of the way
// round and up. `phase` says which: null, 'knock', 'over' or 'righting', and
// `events` what happened this step ('launch', 'slam', 'breaker', 'knock',
// 'over', 'up').

const G = 9.81;
const D = 0.36; // how far below the waterline each column floats at rest (stiffer: she follows the sea closely)
const XS = [-5.0, -3.35, -1.7, 0.0, 1.7, 3.35, 4.9];
// (Built on first use: src/boat.js, which has the hull's shape, imports this file.)
let COLS = null;
let W = 0;
let K = 0;
let C = 0;
let ROLL_DAMP = 0;
let TRIM = 0;
const M = BOAT.mass;
const I_PITCH = M * 3.2 * 3.2;
const I_ROLL = 26000;
// Her keel's righting moment once she's well over (newton metres at 90°).
const KEEL = 70000;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function columns() {
  if (COLS) return COLS;
  COLS = [];
  for (const x of XS) {
    const half = halfAt(Math.max(-5.6, Math.min(5.4, x)));
    for (const side of [-1, 1]) COLS.push({ x, z: side * half * 0.62, w: Math.max(0.35, half / 1.95), top: deckAt(x) + D });
  }
  W = COLS.reduce((s, c) => s + c.w, 0);
  // Spring per unit weight, so the whole boat floats at D at rest; damping
  // about half critical in heave; roll damped a little less.
  K = (M * G) / (W * D);
  C = (2 * 0.75 * M * Math.sqrt(G / D)) / W;
  ROLL_DAMP = 2 * 0.5 * Math.sqrt(I_ROLL * K * COLS.reduce((s, c) => s + c.w * c.z * c.z, 0));
  // Her weight sits over the middle of what floats her, so she trims level
  // (the stern's fuller than the bow).
  TRIM = -K * D * COLS.reduce((s, c) => s + c.w * c.x, 0);
  return COLS;
}

export class Seakeeping {
  constructor() {
    this.y = 0; // the waterline origin's height
    this.vy = 0;
    this.pitch = 0; // bow up +
    this.vp = 0;
    this.roll = 0; // port side up + (as the boat's quaternion takes it)
    this.vr = 0;
    this.t = undefined;
    this.h = new Float64Array(columns().length);
    this.wet = 1; // how much of her is in the water (0: in the air)
    this.airT = 0; // how long she's been clear of it
    this.slam = 0; // how hard she last came down (m/s), for spray and a thump
    this.phase = null;
    this.events = [];
    this.rising = false; // the sea under her lifting (for spotting a crest)
    this.random = Math.random;
  }

  /** Her whole roll: the sail's heel and the sea's, together. */
  total(b) {
    return (b.heel ?? 0) + this.roll;
  }

  /**
   * The sea at the columns (plan view; tilt is small for this), with her f of
   * the way from where she was at the last step to where she is now: so the
   * water under her changes evenly from substep to substep, however many
   * substeps a frame has (a jump all at once reads as the sea leaping).
   */
  #sample(b, t, scale, f = 1) {
    const L = this.last ?? b;
    const x = L.x + (b.x - L.x) * f;
    const z = L.z + (b.z - L.z) * f;
    const hd = L.heading + Math.atan2(Math.sin(b.heading - L.heading), Math.cos(b.heading - L.heading)) * f;
    const c = Math.cos(hd);
    const s = Math.sin(hd);
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      this.h[i] = heightAt(x + c * col.x - s * col.z, z + s * col.x + c * col.z, t, scale);
    }
  }

  #remember(b) {
    const L = (this.last ??= {});
    L.x = b.x;
    L.z = b.z;
    L.heading = b.heading;
  }

  /** Straight onto the water as it is (first frame, or after a long gap). */
  #settle(b, t, scale) {
    this.#sample(b, t, scale);
    let sum = 0;
    let fx = 0;
    let fz = 0;
    let xx = 0;
    let zz = 0;
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      sum += this.h[i] * col.w;
      fx += this.h[i] * col.w * col.x;
      fz += this.h[i] * col.w * col.z;
      xx += col.w * col.x * col.x;
      zz += col.w * col.z * col.z;
    }
    const mean = sum / W;
    this.y = mean;
    this.pitch = Math.atan((fx - mean * COLS.reduce((a, c2) => a + c2.w * c2.x, 0)) / xx);
    this.roll = -Math.atan(fz / zz);
    this.vy = this.vp = this.vr = 0;
  }

  /**
   * Move her on to world time t. b: the boat's state (where she is, which way
   * she's heading). Returns this.
   */
  step(b, t, scale, storm = 0) {
    this.events.length = 0;
    if (this.t === undefined || t - this.t > 0.6 || t < this.t) {
      this.last = null;
      this.#settle(b, t, scale);
      this.#remember(b);
      this.phase = null;
      this.t = t;
      return this;
    }
    const dw = t - this.t;
    const n = Math.min(12, Math.max(1, Math.ceil(dw / (1 / 90))));
    const h = dw / n;
    const prev = Float64Array.from(this.h);
    let wetSum = 0;
    for (let k = 1; k <= n; k++) {
      const tk = this.t + h * k;
      prev.set(this.h);
      this.#sample(b, tk, scale, k / n);
      let F = -M * G;
      let Mp = TRIM;
      let Mr = 0;
      const cp = Math.sin(this.pitch);
      // (Upside down the columns can't tell port from starboard: float her level.)
      const capsized = this.phase === 'over' || this.phase === 'righting';
      const cr = capsized ? 0 : Math.sin(this.roll);
      wetSum = 0;
      let vw = 0;
      let port = 0;
      let stbd = 0;
      let fore = 0;
      let aft = 0;
      for (let i = 0; i < COLS.length; i++) {
        const col = COLS[i];
        // This column's waterline in the world, and how much of it is under.
        const wl = this.y + col.x * cp - col.z * cr;
        const sub = Math.min(Math.max(this.h[i] - (wl - D), 0), col.top);
        if (sub <= 0) continue;
        const wetK = Math.min(1, sub / 0.25);
        wetSum += col.w * wetK;
        const vCol = this.vy + col.x * this.vp * Math.cos(this.pitch) - col.z * this.vr * Math.cos(this.roll);
        const vWater = (this.h[i] - prev[i]) / h;
        vw += vWater * col.w;
        const f = col.w * (K * sub - C * wetK * (vCol - vWater));
        F += f;
        Mp += f * col.x;
        Mr -= f * col.z;
      }
      for (let i = 0; i < COLS.length; i++) {
        const col = COLS[i];
        if (col.z < 0) port += this.h[i];
        else stbd += this.h[i];
        if (col.x > 1) fore += this.h[i];
        else if (col.x < -1) aft += this.h[i];
      }
      vw /= W;
      // Her keel, once she's well over: brings her back (until she's past it).
      const phi = this.total(b);
      if (!capsized && Math.abs(phi) > 0.5) Mr -= KEEL * Math.sin(phi) * smooth(0.5, 1.1, Math.abs(phi));
      // Over a crest (the sea under her stops rising and starts to fall)?
      // Which way it came at her is how the face of it sloped across her on
      // the way up (at the very top it's level).
      const lat = (port - stbd) / (COLS.length / 2);
      const lon = (fore - aft) / (COLS.length / 2);
      if (vw > 0.45) {
        if (!this.rising) this.face = { lat: 0, lon: 0 };
        this.rising = true;
        if (Math.abs(lat) > Math.abs(this.face.lat)) this.face.lat = lat;
        if (Math.abs(lon) > Math.abs(this.face.lon)) this.face.lon = lon;
      } else if (this.rising && vw < 0) {
        this.rising = false;
        // (Only with her in the water: not again on the way up.)
        if (storm > 0.3 && !this.phase && this.wet > 0.6) this.#crest(b, storm, this.face.lat, this.face.lon);
      }
      // Aground: the keel sits on the bottom.
      const keel = this.y - BOAT.contacts[0].draft;
      const bed = groundAt(b.x, b.z);
      if (bed > keel) {
        F += (bed - keel) * 2.5e5 - this.vy * 4e4;
      }
      // Clear of the water she drops back quickly: a hop off a crest, not a hang.
      if (this.wet < 0.05) F -= 0.9 * M * G;
      this.vy += (F / M) * h;
      if (this.wet < 0.05 && this.vy < -11) this.vy = -11;
      this.vp += (Mp / I_PITCH - this.vp * 2.0) * h;
      const before = this.vy;
      this.y += this.vy * h;
      this.pitch += this.vp * h;
      if (capsized) this.#capsized(b, h);
      else {
        this.vr += ((Mr - ROLL_DAMP * this.vr) / I_ROLL) * h;
        this.roll += this.vr * h;
        this.#knockdown(b);
      }
      // How hard she lands, coming back from the air.
      if (this.wet < 0.05 && wetSum / W > 0.05 && before < -1.5) {
        this.slam = -before;
        this.maxSlam = Math.max(this.maxSlam ?? 0, this.slam);
        this.events.push('slam');
      }
      this.wet = wetSum / W;
    }
    this.airT = this.wet < 0.02 ? this.airT + dw : 0;
    // Keep the angles sane (a wave never stands her on end).
    this.pitch = Math.max(-0.45, Math.min(0.45, this.pitch));
    this.t = t;
    this.#remember(b);
    return this;
  }

  /**
   * At the top of a sea in a storm: come over it fast and she flies; take a
   * breaking one on the beam and it can knock her down. lat: how much higher
   * the sea is to port than to starboard; lon: at the bow than the stern.
   */
  #crest(b, storm, lat, lon) {
    const sog = b.sog ?? 0;
    const now = this.t ?? 0;
    // Driving hard over the top of one, now and then she takes off.
    if (sog > 3.5 && this.vy > -0.1 && now - (this.lastLaunch ?? -1e9) > 4) {
      const chance = Math.min(1, (sog - 3.5) / 3) * storm * 0.95;
      if (this.random() < chance) {
        this.vy += Math.min(2.0, (0.5 + 0.4 * this.random()) * (1 + 0.15 * sog) * storm);
        this.vp += 0.18 * storm;
        this.lastLaunch = now;
        this.events.push('launch');
      }
    }
    // Beam-on (the slope's across her, not along her) is when one breaks over her.
    const beamOn = Math.abs(lat) / (Math.abs(lat) + 0.5 * Math.abs(lon) + 0.05);
    const side = Math.sign(lat) || 1; // a higher sea to port puts her starboard side down
    const pressed = Math.sign(b.heel ?? 0) === side && Math.abs(b.heel ?? 0) > 0.35;
    const chance = storm * storm * smooth(0.35, 0.8, beamOn) * 0.45 + (pressed ? 0.15 * storm : 0);
    if (this.random() < chance) {
      this.vr += side * (1.6 + 3.3 * this.random() ** 1.5 + (pressed ? 0.9 : 0)) * storm;
      this.events.push('breaker');
    }
  }

  /** Knocked flat, or rolled right over? (And back up from a knockdown.) */
  #knockdown(b) {
    const phi = this.total(b);
    if (!this.phase && Math.abs(phi) > 1.15) {
      this.phase = 'knock';
      this.events.push('knock');
    }
    if (this.phase === 'knock') {
      if (Math.abs(phi) > 2.1) {
        this.phase = 'over';
        this.side = Math.sign(phi);
        this.hold = 2.2 + 1.8 * this.random();
        this.events.push('over');
      } else if (Math.abs(phi) < 0.6) {
        this.phase = null;
        this.events.push('up');
      }
    }
  }

  /** Keel-up a few seconds, wallowing; then round the rest of the way and up. */
  #capsized(b, h) {
    const heel = b.heel ?? 0;
    if (this.phase === 'over') {
      this.hold -= h;
      this.wallow = (this.wallow ?? 0) + h;
      const target = this.side * (Math.PI + 0.12 * Math.sin(this.wallow * 1.7)) - heel;
      this.roll += (target - this.roll) * (1 - Math.exp(-h * 2.5));
      this.vr = 0;
      if (this.hold <= 0) {
        this.phase = 'righting';
        this.rightT = 0;
        this.from = this.roll + heel;
      }
      return;
    }
    // Righting: on round, the same way she went over, a bit of a wobble at the end.
    this.rightT += h / 2.6;
    const p = Math.min(1, this.rightT);
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const end = this.side * 2 * Math.PI;
    this.roll = this.from + (end - this.from) * e - heel;
    if (p >= 1) {
      this.roll -= this.side * 2 * Math.PI;
      this.vr = -this.side * 0.6;
      this.phase = null;
      this.wallow = 0;
      this.events.push('up');
    }
  }
}
