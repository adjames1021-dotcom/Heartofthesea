// Sailing physics for an 11.4 m cruising sloop (roughly an Oceanis 37 with a
// furling genoa). Plain JS so the server can run the same boat later.
//
// Model: 2D rigid body in the horizontal plane (surge u, sway v, yaw r) plus
// heel. Sails make lift and drag from the apparent wind; the keel resists
// sideways motion; the rudder needs water flowing past it. Approachable on
// purpose: real points of sail, trim and leeway, but no capsizing.
//
// Frames: heading ψ points the bow along (cos ψ, sin ψ) in world x/z;
// starboard is (−sin ψ, cos ψ). Boat-local x is forward, z is starboard.
// Positive yaw rate turns to starboard; positive heel is starboard side down.

import { clamp, lerp, smoothstep } from './noise.js';

const DEG = Math.PI / 180;
const RHO_AIR = 1.225;

export const BOAT = {
  length: 11.4,
  beam: 3.9,
  draft: 1.9,
  mass: 6800,
  inertiaYaw: 52000,
  inertiaRoll: 26000,
  mainArea: 30,
  jibArea: 28,
  ceHeight: 5.5,
  reefFactors: [1, 0.74, 0.55],
  rudderMax: 35 * DEG,
  mainSheetRange: [3 * DEG, 85 * DEG],
  jibSheetRange: [9 * DEG, 75 * DEG],
  rodeMax: 60,
  // Arcade handling: sails trim themselves, she turns and speeds up quickly,
  // barely heels, and makes way even close to the wind.
  arcade: true,
  bow: { x: 5.55, y: 1.3 },
  // Points that touch the seabed first: keel, forefoot, stern quarters, bilges.
  contacts: [
    { x: -0.3, z: 0, draft: 1.9 },
    { x: 5.3, z: 0, draft: 0.5 },
    { x: 2.8, z: -1.5, draft: 0.55 },
    { x: 2.8, z: 1.5, draft: 0.55 },
    { x: -2.6, z: -1.9, draft: 0.55 },
    { x: -2.6, z: 1.9, draft: 0.55 },
    { x: -5.4, z: -1.3, draft: 0.35 },
    { x: -5.4, z: 1.3, draft: 0.35 },
  ],
};

/** Lift coefficient vs angle of attack: peaks around 18°, stalls gently after. */
function liftCoef(a) {
  const d = a / DEG;
  if (d <= 0) return 0;
  if (d < 18) return 1.45 * Math.sin((d / 18) * (Math.PI / 2));
  if (d < 45) return 1.45 - ((d - 18) / 27) * 0.6;
  if (d < 90) return 0.85 * (1 - (d - 45) / 45);
  return 0;
}

function dragCoef(a, cl) {
  const s = Math.sin(clamp(a, 0, Math.PI / 2));
  return 0.05 + 1.25 * s * s + 0.1 * cl * cl;
}

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createBoat({ x = 0, z = 0, heading = 0 } = {}) {
  return {
    x, z, heading,
    u: 0, v: 0, r: 0,
    heel: 0, heelRate: 0,
    // Rig and controls (persist until someone changes them).
    rudder: 0, throttle: 0, engine: false,
    mainHoist: 0, reef: 0, mainSheet: 0.5,
    jibOut: 0, jibSheet: 0.5,
    lights: false,
    autopilot: { on: false, heading },
    anchor: { rode: 0, set: false, x: 0, z: 0, dragging: false, depth: 0, cmd: null },
    // Held inputs from whoever is at a station, each −1, 0 or 1.
    input: { steer: 0, throttle: 0, mainSheet: 0, jibSheet: 0, hoist: 0, furl: 0, windlass: 0 },
    // Derived every step, for instruments and visuals.
    aws: 0, awa: 0, tws: 0, twa: 0, depth: 0, aground: false,
    mainAngle: 0, jibAngle: 0, mainAoA: 0, jibAoA: 0, mainLoad: 0, jibLoad: 0,
    sog: 0,
  };
}

/** World position of a boat-local point (x forward, z starboard). */
export function boatPoint(b, lx, lz, out = {}) {
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  out.x = b.x + c * lx - s * lz;
  out.z = b.z + s * lx + c * lz;
  return out;
}

function applyRates(b, dt) {
  const i = b.input;
  if (b.autopilot.on) {
    b.autopilot.heading = wrapAngle(b.autopilot.heading + i.steer * 0.35 * dt);
    const err = wrapAngle(b.autopilot.heading - b.heading);
    const cmd = clamp(1.8 * err - 2.5 * b.r, -1, 1);
    b.rudder += clamp(cmd - b.rudder, -1.2 * dt, 1.2 * dt);
  } else {
    const rate = BOAT.arcade ? 3 : 0.8;
    b.rudder = clamp(b.rudder + i.steer * rate * dt, -1, 1);
    // Let go of the wheel and it centres itself.
    if (BOAT.arcade && !i.steer) b.rudder -= clamp(b.rudder, -2.5 * dt, 2.5 * dt);
  }
  if (b.engine) b.throttle = clamp(b.throttle + i.throttle * 0.7 * dt, -1, 1);
  else b.throttle = 0;
  b.mainSheet = clamp(b.mainSheet + i.mainSheet * 0.25 * dt, 0, 1);
  b.jibSheet = clamp(b.jibSheet + i.jibSheet * 0.25 * dt, 0, 1);
  const k = BOAT.arcade ? 4 : 1;
  b.mainHoist = clamp(b.mainHoist + (i.hoist > 0 ? 0.14 : 0.35) * k * i.hoist * dt, 0, 1);
  b.jibOut = clamp(b.jibOut + i.furl * 0.2 * k * dt, 0, 1);
  // One-touch anchor (from the helm): runs the windlass until it's done.
  const a = b.anchor;
  let wl = i.windlass;
  if (a.cmd === 'up') {
    wl = 1;
    if (a.rode <= 0) a.cmd = null;
  } else if (a.cmd === 'down') {
    wl = -1;
    if ((a.set && a.rode >= Math.min(BOAT.rodeMax, a.depth * 3 + 2)) || a.rode >= BOAT.rodeMax) a.cmd = null;
  }
  if (wl > 0) a.rode = Math.max(0, a.rode - 0.7 * k * dt);
  if (wl < 0) a.rode = Math.min(BOAT.rodeMax, a.rode + 1.4 * k * dt);
}

const _p = {};
const _g = {};

/**
 * Advance the boat by dt seconds.
 * env: { wind: {x, z, speed}, ground(x, z) → seabed/land height }
 */
export function stepBoat(b, dt, env) {
  applyRates(b, dt);

  const fx = Math.cos(b.heading);
  const fz = Math.sin(b.heading);
  const sx = -fz;
  const sz = fx;

  // --- Wind ---
  const W = env.wind;
  const wtx = W.x * W.speed;
  const wtz = W.z * W.speed;
  const vbx = b.u * fx + b.v * sx;
  const vbz = b.u * fz + b.v * sz;
  const wax = wtx - vbx;
  const waz = wtz - vbz;
  const aws = Math.hypot(wax, waz);
  const waf = wax * fx + waz * fz;
  const was = wax * sx + waz * sz;
  b.aws = aws;
  b.awa = Math.atan2(-was, -waf);
  b.tws = W.speed;
  b.twa = Math.atan2(-(wtx * sx + wtz * sz), -(wtx * fx + wtz * fz));
  b.sog = Math.hypot(vbx, vbz);

  const q = 0.5 * RHO_AIR * aws * aws;
  const df = aws > 1e-3 ? waf / aws : 0;
  const ds = aws > 1e-3 ? was / aws : 0;
  // Lift is perpendicular to the airflow, on the side that pulls forward.
  let lf = -ds;
  let ls = df;
  if (lf < 0) {
    lf = -lf;
    ls = -ls;
  }
  const absAwa = Math.abs(b.awa);
  const lee = b.awa >= 0 ? -1 : 1; // sails swing out to leeward
  const heelK = Math.cos(b.heel) ** 2;

  let Ff = 0;
  let Fs = 0;

  // --- Mainsail ---
  const mainArea = BOAT.mainArea * b.mainHoist * BOAT.reefFactors[b.reef];
  const autoTrim = (range) => clamp(absAwa - 16 * DEG, range[0], range[1]);
  const mainMax = BOAT.arcade ? autoTrim(BOAT.mainSheetRange) : lerp(BOAT.mainSheetRange[0], BOAT.mainSheetRange[1], b.mainSheet);
  const mainAng = Math.min(mainMax, absAwa);
  b.mainAngle = lee * mainAng;
  b.mainAoA = absAwa - mainAng;
  const clM = liftCoef(b.mainAoA);
  const cdM = dragCoef(b.mainAoA, clM);
  const mainForce = q * mainArea * heelK;
  Ff += mainForce * (clM * lf + cdM * df);
  Fs += mainForce * (clM * ls + cdM * ds);
  b.mainLoad = mainArea > 0 ? clamp((clM + 0.3 * cdM) / 1.5, 0, 1) : 0;

  // --- Genoa (blanketed by the main on a dead run) ---
  const jibArea = BOAT.jibArea * b.jibOut * lerp(1, 0.25, smoothstep(150 * DEG, 170 * DEG, absAwa));
  const jibMax = BOAT.arcade ? autoTrim(BOAT.jibSheetRange) : lerp(BOAT.jibSheetRange[0], BOAT.jibSheetRange[1], b.jibSheet);
  const jibAng = Math.min(jibMax, absAwa);
  b.jibAngle = lee * jibAng;
  b.jibAoA = absAwa - jibAng;
  const clJ = liftCoef(b.jibAoA);
  const cdJ = dragCoef(b.jibAoA, clJ);
  const jibForce = q * jibArea * heelK;
  Ff += jibForce * (clJ * lf + cdJ * df);
  Fs += jibForce * (clJ * ls + cdJ * ds);
  b.jibLoad = jibArea > 0 ? clamp((clJ + 0.3 * cdJ) / 1.5, 0, 1) : 0;

  if (BOAT.arcade) {
    // Extra drive, and some even pointing high: forgiving, and quicker.
    const sail = (mainArea + jibArea) / (BOAT.mainArea + BOAT.jibArea);
    const twa = Math.abs(b.twa);
    Ff = Math.max(Ff, 0) * 1.6 + sail * W.speed * W.speed * 28 * (0.5 + 0.5 * smoothstep(0.3, 1.4, twa));
    Fs *= 0.6;
  }
  const FsAero = Fs;

  // --- Engine ---
  if (b.engine) Ff += b.throttle * (b.throttle >= 0 ? 2300 : 1400);

  // --- Hull ---
  // Past hull speed the bow wave holds her back, hard. Arcade lets her go a
  // bit quicker, and in a gale she gets up and planes.
  const storm = env.storm ?? 0;
  const hullSpeed = BOAT.arcade ? lerp(4.8, 9, storm) : 4.1;
  const au = Math.abs(b.u);
  Ff -= Math.sign(b.u) * (60 * au + 78 * b.u * b.u * (1 + 2 * (au / hullSpeed) ** 4));
  Fs -= 4800 * b.v * (au + 0.2) + 4000 * b.v * Math.abs(b.v);

  // --- Yaw ---
  let uEff = b.u + (b.engine && b.throttle > 0 ? 1.6 * b.throttle : 0);
  // Arcade: the rudder bites even at a crawl.
  if (BOAT.arcade) uEff = Math.sign(uEff || 1) * Math.max(Math.abs(uEff), 2.2) * 1.1;
  let M = 3300 * b.rudder * BOAT.rudderMax * uEff * Math.abs(uEff);
  M -= b.r * (26000 * (au + 0.25) + 20000 * Math.abs(b.r));
  // Weather helm: heeled over, she wants to round up into the wind.
  M += 2.0 * Math.abs(FsAero) * Math.abs(Math.sin(b.heel)) * (b.awa >= 0 ? 1 : -1);
  // Prop walk going astern.
  if (b.engine && b.throttle < 0) M += 900 * -b.throttle;

  // --- Point forces: anchor rode and the seabed ---
  const pointForce = (px, pz, Fx, Fz) => {
    const pf = Fx * fx + Fz * fz;
    const ps = Fx * sx + Fz * sz;
    Ff += pf;
    Fs += ps;
    M += px * ps - pz * pf;
  };
  const pointVel = (px, pz, out) => {
    const vf = b.u - b.r * pz;
    const vs = b.v + b.r * px;
    out.x = vf * fx + vs * sx;
    out.z = vf * fz + vs * sz;
    return out;
  };

  // Hull and rig windage, a little abaft the middle: at anchor it swings the
  // bow into the wind; under way it's a small drag.
  const windage = q * (4 + 6 * Math.abs(ds));
  pointForce(-0.8, 0, windage * (df * fx + ds * sx), windage * (df * fz + ds * sz));

  stepAnchor(b, dt, env, pointForce, pointVel);

  // --- Waves: run down the face of one and she surfs; catch one on the
  // quarter and it slews the stern round (worked out at bow and stern, so
  // the difference turns her). Gusts in a gale knock her head about.
  if (env.waveGrad) {
    const k = BOAT.mass * 9.81 * (0.22 + 0.3 * storm);
    for (const px of [3.2, -3.2]) {
      boatPoint(b, px, 0, _p);
      const g = env.waveGrad(_p.x, _p.z, _g);
      pointForce(px, 0, -g.x * k, -g.z * k);
    }
  }
  M += (env.kick ?? 0) * 16000;

  let aground = false;
  const vel = {};
  for (const c of BOAT.contacts) {
    boatPoint(b, c.x, c.z, _p);
    const h = env.ground(_p.x, _p.z);
    const pen = c.draft + h; // seabed above the bottom of this part of the hull
    if (pen <= 0) continue;
    aground = aground || pen > 0.05;
    const gx = env.ground(_p.x + 0.7, _p.z) - env.ground(_p.x - 0.7, _p.z);
    const gz = env.ground(_p.x, _p.z + 0.7) - env.ground(_p.x, _p.z - 0.7);
    const gl = Math.hypot(gx, gz);
    pointVel(c.x, c.z, vel);
    let nx;
    let nz;
    if (gl > 1e-3) {
      nx = -gx / gl;
      nz = -gz / gl;
    } else {
      const vl = Math.hypot(vel.x, vel.z) || 1;
      nx = -vel.x / vl;
      nz = -vel.z / vl;
    }
    const p = Math.min(pen, 1.5);
    // Push toward deeper water and grind the boat to a stop on the sand.
    pointForce(c.x, c.z, nx * 9000 * p - vel.x * 5000 * p, nz * 9000 * p - vel.z * 5000 * p);
  }
  b.aground = aground;

  // --- Integrate (rotating body frame) ---
  const mSurge = BOAT.mass * 1.05;
  const mSway = BOAT.mass * 1.6;
  b.u += (Ff / mSurge + b.v * b.r) * dt;
  b.v += (Fs / mSway - b.u * b.r) * dt;
  b.r += (M / BOAT.inertiaYaw) * dt;
  if (aground) {
    const k = Math.exp(-1.5 * dt);
    b.u *= k;
    b.v *= k;
    b.r *= k;
  }
  b.heading = wrapAngle(b.heading + b.r * dt);
  b.x += (b.u * fx + b.v * sx) * dt;
  b.z += (b.u * fz + b.v * sz) * dt;

  // --- Heel ---
  const heelMoment = FsAero * heelK * BOAT.ceHeight * (BOAT.arcade ? lerp(0.5, 0.75, storm) : 1);
  const sh = Math.sin(b.heel);
  const righting = 42000 * sh * (1 + 0.6 * sh * sh);
  b.heelRate += ((heelMoment - righting - 18000 * b.heelRate) / BOAT.inertiaRoll) * dt;
  b.heel = clamp(b.heel + b.heelRate * dt, -0.66, 0.66);

  boatPoint(b, 0, 0, _p);
  b.depth = -env.ground(b.x, b.z);
}

function stepAnchor(b, dt, env, pointForce, pointVel) {
  const a = b.anchor;
  const bow = boatPoint(b, BOAT.bow.x, 0, {});
  const depthBow = -env.ground(bow.x, bow.z);
  a.depth = depthBow;
  if (a.rode <= 0.01) {
    a.set = false;
    a.dragging = false;
    return;
  }
  if (!a.set) {
    // Hanging: it bites once there is chain enough to reach the bottom.
    if (depthBow < BOAT.rodeMax && a.rode >= depthBow - 0.3) {
      a.set = true;
      a.x = bow.x;
      a.z = bow.z;
    }
    return;
  }
  const D = Math.max(0.5, -env.ground(a.x, a.z));
  if (a.rode < D + 0.2) {
    // Chain hauled straight up and down: the anchor breaks out.
    a.set = false;
    a.dragging = false;
    return;
  }
  const reach = Math.sqrt(Math.max(0, a.rode * a.rode - D * D));
  const dx = a.x - bow.x;
  const dz = a.z - bow.z;
  const dist = Math.hypot(dx, dz);
  a.dragging = false;
  if (dist <= reach || dist < 1e-3) return;
  const nx = dx / dist;
  const nz = dz / dist;
  const vel = pointVel(BOAT.bow.x, 0, {});
  const away = -(vel.x * nx + vel.z * nz);
  const stretch = dist - reach;
  const F = Math.max(0, 5000 * stretch + 4000 * away);
  // Short scope drags; a 3:1 scope or better holds most weather.
  const hold = 3000 * clamp(a.rode / D / 2.5, 0.25, 1.6);
  if (F > hold) {
    a.dragging = true;
    const slip = Math.min(stretch, ((F - hold) / 5000) * dt * 2);
    a.x -= nx * slip;
    a.z -= nz * slip;
  }
  pointForce(BOAT.bow.x, 0, nx * Math.min(F, hold * 1.2), nz * Math.min(F, hold * 1.2));
}
