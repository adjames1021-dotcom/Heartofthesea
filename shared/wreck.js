// The wreck on Molly Ann Reef: a two-masted trader that broke her back on the
// reef. The stern half sits heeled on the coral; the bow half lies a few
// metres off, with the foremast still standing.
//
// Plain numbers shared by the renderer (src/wreck.js), the climbing course
// (src/course.js) and the server, which needs to know where the chest on the
// fore top is. Everything is in "section-local" metres: +x toward the bow,
// +y up from sea level, +z to starboard.

import { ISLAND_BY_ID, toWorld } from './world.js';
import { smoothstep } from './noise.js';

export const WRECK = {
  length: 27,
  keel: 2.2,
  deck: 2.8,
  quarterRise: 1.2,
  sternU: [0.53, 1],
  bowU: [0, 0.36],
  heel: -0.3, // starboard up
  pitch: 0.03,
  bow: { offset: { x: 0.7, y: 0.3, z: 1.3 }, yaw: 0.22, heel: -0.3, pitch: -0.05 },
  mainmast: { x: -2.2, top: 10.5, r: 0.36 },
  foremast: { x: 7.56, top: 18, r: 0.33, foreTop: 12.5 },
  // The plank along the starboard side the main shrouds were spread on.
  channel: { x0: -6.4, x1: -2.8, y: 2.36, width: 0.45 },
  hatch: { x: -5.6, w: 2.2, d: 1.7 },
};

/** Station u (0 at the bow, 1 at the stern) for section-local x. */
export const stationU = (x) => (WRECK.length / 2 - x) / WRECK.length;
export const halfBreadth = (u) =>
  3.6 * (u < 0.4 ? Math.pow(Math.sin((u / 0.4) * (Math.PI / 2)), 0.6) : 1 - 0.18 * smoothstep(0.62, 1, u));
export const deckHeight = (u) =>
  WRECK.deck + 0.5 * ((u - 0.55) / 0.55) ** 2 + WRECK.quarterRise * smoothstep(0.74, 0.77, u) + 0.8 * smoothstep(0.13, 0.1, u);
export const sheerHeight = (u) => deckHeight(u) + 0.8;
export const keelDepth = (u) => WRECK.keel * Math.pow(smoothstep(0, 0.14, u), 0.7);

// Rotation matrices (row-major) matching three.js Euler orders.
function euler(x, y, z, order) {
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ce = c * e;
  const cf = c * f;
  const de = d * e;
  const df = d * f;
  if (order === 'YXZ') return [ce + df * b, de * b - cf, a * d, a * f, a * e, -b, cf * b - de, df + ce * b, a * c];
  // ZXY
  return [ce - df * b, -a * f, de + cf * b, cf + de * b, a * e, df - ce * b, -a * d, b, a * c];
}
const STERN_M = euler(WRECK.heel, 0, WRECK.pitch, 'ZXY');
const BOW_M = euler(WRECK.bow.heel, WRECK.bow.yaw, WRECK.bow.pitch, 'YXZ');

/** World position of a section-local point on the 'stern' or 'bow' half. */
export function wreckPoint(section, x, y, z, out = {}) {
  const m = section === 'bow' ? BOW_M : STERN_M;
  let px = m[0] * x + m[1] * y + m[2] * z;
  let py = m[3] * x + m[4] * y + m[5] * z;
  let pz = m[6] * x + m[7] * y + m[8] * z;
  if (section === 'bow') {
    px += WRECK.bow.offset.x;
    py += WRECK.bow.offset.y;
    pz += WRECK.bow.offset.z;
  }
  const isl = ISLAND_BY_ID.reef;
  const wr = isl.features.wreck;
  const at = toWorld(isl, wr.x, wr.z);
  const yaw = -(isl.rot + wr.rot); // three.js rotation.y of the wreck
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = at.x + px * c + pz * s;
  out.y = py;
  out.z = at.z - px * s + pz * c;
  return out;
}

/** Where the chest sits on the fore top, in world coordinates. */
export function foreTopChest() {
  const f = WRECK.foremast;
  return wreckPoint('bow', f.x + 0.55, f.foreTop + 0.11, -0.45);
}
