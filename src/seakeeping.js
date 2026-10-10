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
  }

  /** Columns' positions in the world (plan view; tilt is small for this). */
  #sample(b, t, scale) {
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      this.h[i] = heightAt(b.x + c * col.x - s * col.z, b.z + s * col.x + c * col.z, t, scale);
    }
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
  step(b, t, scale) {
    if (this.t === undefined || t - this.t > 0.6 || t < this.t) {
      this.#settle(b, t, scale);
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
      this.#sample(b, tk, scale);
      let F = -M * G;
      let Mp = TRIM;
      let Mr = 0;
      const cp = Math.sin(this.pitch);
      const cr = Math.sin(this.roll);
      wetSum = 0;
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
        const f = col.w * (K * sub - C * wetK * (vCol - vWater));
        F += f;
        Mp += f * col.x;
        Mr -= f * col.z;
      }
      // Aground: the keel sits on the bottom.
      const keel = this.y - BOAT.contacts[0].draft;
      const bed = groundAt(b.x, b.z);
      if (bed > keel) {
        F += (bed - keel) * 2.5e5 - this.vy * 4e4;
      }
      this.vy += (F / M) * h;
      this.vp += (Mp / I_PITCH - this.vp * 2.0) * h;
      this.vr += ((Mr - ROLL_DAMP * this.vr) / I_ROLL) * h;
      const before = this.vy;
      this.y += this.vy * h;
      this.pitch += this.vp * h;
      this.roll += this.vr * h;
      // How hard she lands, coming back from the air.
      if (this.wet < 0.05 && wetSum / W > 0.05 && before < -1.5) this.slam = Math.max(this.slam, -before);
      this.wet = wetSum / W;
    }
    this.airT = this.wet < 0.02 ? this.airT + dw : 0;
    // Keep the angles sane (a wave never stands her on end).
    this.pitch = Math.max(-0.45, Math.min(0.45, this.pitch));
    this.t = t;
    return this;
  }
}
