// Shared ocean model.
//
// This file is plain JS with no dependencies so the exact same wave math can run
// in the browser (rendering, local buoyancy) and in the Worker / a Durable Object
// (authoritative ship physics once multiplayer lands). Everyone who agrees on the
// clock agrees on the sea.

const G = 9.81;
const TAU = Math.PI * 2;

function wave(angleDeg, wavelength, steepness) {
  const a = (angleDeg * Math.PI) / 180;
  const k = TAU / wavelength;
  return {
    dirX: Math.cos(a),
    dirZ: Math.sin(a),
    k,
    steepness,
    omega: Math.sqrt(G * k), // deep-water dispersion
    wavelength,
  };
}

// Large swells: these displace the mesh (and are what physics samples).
// Sum of steepness stays below 1 at max wave scale so crests never loop over.
export const SWELLS = [
  wave(0, 140, 0.11),
  wave(28, 86, 0.13),
  wave(-33, 57, 0.13),
  wave(62, 36, 0.12),
  wave(-58, 23, 0.11),
  wave(14, 14.5, 0.1),
  wave(83, 9.1, 0.08),
  wave(-76, 6.2, 0.07),
];

// Small chop: shading only (normals + foam), never displaces geometry.
export const RIPPLES = [
  wave(8, 4.1, 0.045),
  wave(-41, 3.3, 0.04),
  wave(67, 2.6, 0.035),
  wave(-97, 2.1, 0.03),
  wave(121, 1.7, 0.028),
  wave(32, 1.35, 0.025),
  wave(-140, 1.1, 0.02),
  wave(170, 0.9, 0.02),
];

export const DEFAULT_WAVE_SCALE = 0.62;

/** Phase of each wave at time t (seconds), wrapped to [0, 2π) in double precision. */
export function wavePhases(waves, t, out = new Float32Array(waves.length)) {
  for (let i = 0; i < waves.length; i++) {
    out[i] = (waves[i].omega * t) % TAU;
  }
  return out;
}

/**
 * Gerstner displacement of the undisplaced surface point (x, z) at time t.
 * Returns the displaced world position plus the analytic surface normal.
 */
export function sampleSurface(x, z, t, scale = DEFAULT_WAVE_SCALE, out = {}) {
  let px = x, py = 0, pz = z;
  let tx = 1, ty = 0, tz = 0; // d/dx
  let bx = 0, by = 0, bz = 1; // d/dz
  for (const w of SWELLS) {
    const q = w.steepness * scale;
    const a = q / w.k;
    const f = w.k * (w.dirX * x + w.dirZ * z) - ((w.omega * t) % TAU);
    const c = Math.cos(f);
    const s = Math.sin(f);
    px += w.dirX * a * c;
    pz += w.dirZ * a * c;
    py += a * s;
    tx -= w.dirX * w.dirX * q * s;
    ty += w.dirX * q * c;
    tz -= w.dirX * w.dirZ * q * s;
    bx -= w.dirX * w.dirZ * q * s;
    by += w.dirZ * q * c;
    bz -= w.dirZ * w.dirZ * q * s;
  }
  // normal = normalize(cross(B, T))
  let nx = by * tz - bz * ty;
  let ny = bz * tx - bx * tz;
  let nz = bx * ty - by * tx;
  const len = Math.hypot(nx, ny, nz) || 1;
  out.x = px;
  out.y = py;
  out.z = pz;
  out.nx = nx / len;
  out.ny = ny / len;
  out.nz = nz / len;
  return out;
}

const scratch = {};

/**
 * Water height at a *world* (x, z). Gerstner waves move points sideways, so we
 * iterate to find the undisplaced point that lands on (x, z).
 */
export function heightAt(x, z, t, scale = DEFAULT_WAVE_SCALE) {
  let ux = x, uz = z;
  for (let i = 0; i < 4; i++) {
    sampleSurface(ux, uz, t, scale, scratch);
    ux -= scratch.x - x;
    uz -= scratch.z - z;
  }
  return sampleSurface(ux, uz, t, scale, scratch).y;
}
