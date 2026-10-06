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

/** Swell height multiplier for shared/waves.js. Drifts slowly between calmer and heavier seas. */
export function swellScaleAt(t) {
  return 0.62 + 0.09 * Math.sin((TAU * t) / 3100 + 0.7) + 0.05 * Math.sin((TAU * t) / 1170 + 2.1);
}

/** Cloud cover 0–1. */
export function cloudCoverAt(t) {
  return clamp(0.42 + 0.22 * Math.sin((TAU * t) / 2300 + 1.3) + 0.1 * Math.sin((TAU * t) / 830), 0.05, 0.85);
}

/**
 * True wind: unit direction the air moves toward (x, z) and speed in m/s.
 * Mostly blowing toward +x, the same way the long swells run, with slow
 * shifts and the odd gust.
 */
export function windAt(t, out = {}) {
  const ang = 0.18 * Math.sin((TAU * t) / 640 + 0.3) + 0.07 * Math.sin((TAU * t) / 151 + 1.7);
  let speed = 7.2 + 1.3 * Math.sin((TAU * t) / 1900 + 0.9);
  const gust = Math.max(0, Math.sin((TAU * t) / 37 + 0.4)) ** 3 * Math.max(0, Math.sin((TAU * t) / 113));
  speed += 2.2 * gust;
  out.x = Math.cos(ang);
  out.z = Math.sin(ang);
  out.speed = speed;
  return out;
}
