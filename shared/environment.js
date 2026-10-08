// Time of day, weather and wind, all derived from the shared world clock.
//
// Like the waves, these are pure functions of time, so every player and the
// server agree on them without sending anything. Puzzles lean on this: a shadow
// that only lines up in late afternoon is late afternoon for everyone at once.

import { clamp } from './noise.js';

const TAU = Math.PI * 2;

/** Real seconds per in-game day. One in-game hour lasts one real minute. */
export const DAY_LENGTH = 24 * 60;

// Shifts the world day so a fresh deploy doesn't always start at midnight.
const EPOCH_HOURS = 7;

/** In-game hour (0–24) at world time t (seconds). */
export function hoursAt(t) {
  const h = ((t / DAY_LENGTH) * 24 + EPOCH_HOURS) % 24;
  return h < 0 ? h + 24 : h;
}

/**
 * Unit vector toward the sun. It rises in the east (+x), passes high to the
 * south (+z) and sets in the west (−x); 06:00 and 18:00 are on the horizon.
 */
export function sunDirection(hours, out = {}) {
  const theta = ((hours - 6) / 24) * TAU;
  const x = Math.cos(theta);
  const y = Math.sin(theta) * 0.92;
  const z = 0.38;
  const len = Math.hypot(x, y, z);
  out.x = x / len;
  out.y = y / len;
  out.z = z / len;
  return out;
}

// ---------------------------------------------------------------------------
// Storms. World time is cut into 12-minute slots; about half of them have a
// storm in them somewhere, two and a half to four and a half minutes long
// with a minute or so either side to blow up and die away. Which slots, and when in them, comes from a hash of
// the slot number, so it's the same storm for everyone.
// ---------------------------------------------------------------------------

export const STORM_SLOT = 720;

function slotHash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const ramp = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The storm in slot k, or null: { start, end } of its height (ramps lie outside). */
export function stormInSlot(k) {
  if (slotHash(k * 3 + 1) > 0.55) return null;
  const len = 150 + 120 * slotHash(k * 3 + 2);
  const start = k * STORM_SLOT + 70 + (STORM_SLOT - len - 160) * slotHash(k * 3 + 3);
  return { start, end: start + len };
}

let forced = null;
/** For trying things out (?storm=…): pin the storm strength, or null to follow the clock. */
export function forceStorm(v) {
  forced = v;
}

/** How stormy it is at world time t: 0 fair … 1 full gale. */
export function stormAt(t) {
  if (forced !== null) return forced;
  const k = Math.floor(t / STORM_SLOT);
  let s = 0;
  for (let i = k - 1; i <= k + 1; i++) {
    const st = stormInSlot(i);
    if (!st) continue;
    s = Math.max(s, ramp(st.start - 70, st.start, t) * (1 - ramp(st.end, st.end + 90, t)));
  }
  return s;
}

/** Seconds until the next storm starts blowing up (0 if one is on now). */
export function nextStormIn(t) {
  if (stormAt(t) > 0) return 0;
  const k = Math.floor(t / STORM_SLOT);
  for (let i = k; i < k + 12; i++) {
    const st = stormInSlot(i);
    if (st && st.start - 70 > t) return st.start - 70 - t;
  }
  return Infinity;
}

/** Swell height multiplier for shared/waves.js. Drifts slowly between calmer and heavier seas; big in a storm. */
export function swellScaleAt(t) {
  const fair = 0.62 + 0.09 * Math.sin((TAU * t) / 3100 + 0.7) + 0.05 * Math.sin((TAU * t) / 1170 + 2.1);
  // 1.1 keeps the summed Gerstner steepness under 1, so crests never fold over.
  return fair + (1.1 - fair) * stormAt(t);
}

/** Cloud cover 0–1. */
export function cloudCoverAt(t) {
  const fair = clamp(0.42 + 0.22 * Math.sin((TAU * t) / 2300 + 1.3) + 0.1 * Math.sin((TAU * t) / 830), 0.05, 0.85);
  return Math.max(fair, Math.min(1, stormAt(t) * 1.4));
}

/**
 * True wind: unit direction the air moves toward (x, z) and speed in m/s.
 * Mostly blowing toward +x, the same way the long swells run, with slow
 * shifts and the odd gust.
 */
export function windAt(t, out = {}) {
  const storm = stormAt(t);
  let ang = 0.18 * Math.sin((TAU * t) / 640 + 0.3) + 0.07 * Math.sin((TAU * t) / 151 + 1.7);
  let speed = 7.2 + 1.3 * Math.sin((TAU * t) / 1900 + 0.9);
  const gust = Math.max(0, Math.sin((TAU * t) / 37 + 0.4)) ** 3 * Math.max(0, Math.sin((TAU * t) / 113));
  speed += 2.2 * gust;
  if (storm > 0) {
    // A gale: 30–45 knots, gusting hard, and swinging about.
    const squall = Math.max(0, Math.sin((TAU * t) / 11 + 0.9)) ** 2 * (0.5 + 0.5 * Math.sin((TAU * t) / 29));
    const gale = 16 + 3 * Math.sin((TAU * t) / 53) + 6 * squall;
    speed += (gale - speed) * storm;
    ang += storm * (0.3 * Math.sin((TAU * t) / 47 + 2) + 0.12 * Math.sin((TAU * t) / 13));
  }
  out.x = Math.cos(ang);
  out.z = Math.sin(ang);
  out.speed = speed;
  out.storm = storm;
  return out;
}
