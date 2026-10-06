import * as THREE from 'three';
import { heightAt } from '../shared/waves.js';
import { Bear } from './bear.js';
import { STATIONS } from './boat.js';

// The player: a bear that walks on islands and on the moving deck, wades,
// swims, jumps, catches ledges, climbs nets and rope ladders, swings on
// ropes, and works the boat from its stations.
//
// pos is the bottom of the feet. `heading` is the bear's three.js yaw
// (faces (sin h, 0, cos h)).

const GRAV = 22;
const JUMP_V = 7.2;
const R = 0.32;
const SPEED = { walk: 3.0, run: 5.2, wade: 1.8, swim: 1.8, carry: 2.0, carrySwim: 0.9 };
const FLOAT_DEPTH = 0.95; // feet this far under the surface and you float
const COYOTE = 0.14;
const BUFFER = 0.14;
// Ledges: you can catch a flat top this far above your feet, and you hang
// with your feet HANG below it. Kept generous on purpose.
const REACH_LO = 0.6;
const REACH_HI = 1.6;
const HANG = 1.0;
const CLIMB_UP_TIME = 0.55;
const WADE_JUMP_MAX = 0.75; // deeper than this and you can't jump
const HANDS = 1.25; // hands above the feet when hanging off a rope

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Player {
  constructor(world, look = 'brown') {
    this.world = world;
    this.bear = new Bear(look);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    // ground | air | swim | station | dig | hang | climbup | climb | rope
    this.mode = 'ground';
    this.grounded = false;
    this.platform = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.grabCooldown = 0;
    this.station = null;
    this.boat = null;
    this.carrying = null;
    this.fallStart = null;
    this.flopT = 0;
    this.animMode = 'idle';
    this.effort = 0;
    this.turning = 0;
    this.speed = 0;
    this.events = [];
    this.ledge = null; // { fx, fz } while hanging
    this.climb = null; // a haul up over an edge, or the net we're on
    this.rope = null; // { rope, len, p, v } while swinging
    this.lastRope = null;
    this.lastRopeT = 0;
  }

  /** Put the bear somewhere; `platform` is a Body it is standing on, if any. */
  place(p, platform = null) {
    this.#dropRope();
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.platform = platform;
    this.mode = 'ground';
    this.ledge = null;
    this.climb = null;
  }

  get head() {
    return _a.copy(this.pos).add(new THREE.Vector3(0, 1.15, 0));
  }

  /** Hands full of ledge, net or rope? */
  get clinging() {
    return this.mode === 'hang' || this.mode === 'climbup' || this.mode === 'climb' || this.mode === 'rope';
  }

  emit(e) {
    this.events.push(e);
  }

  update(dt, input, ctx) {
    this.events.length = 0;
    this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    this.lastRopeT = Math.max(0, this.lastRopeT - dt);
    // Ride along with whatever we stand (or hang) on.
    if (this.platform && this.mode !== 'station' && this.mode !== 'climbup') {
      const before = _b.copy(this.pos);
      this.platform.carry(this.pos);
      this.platformVel = this.pos.clone().sub(before).divideScalar(Math.max(dt, 1e-4));
      this.heading -= this.platform.yaw - this.platform.prevYaw;
    } else {
      this.platformVel = null;
    }

    if (this.mode === 'station') this.#station(input);
    else if (this.mode === 'dig') this.#dig(dt);
    else if (this.mode === 'hang') this.#hang(dt, input);
    else if (this.mode === 'climbup') this.#climbUp(dt);
    else if (this.mode === 'climb') this.#climbNet(dt, input, ctx);
    else if (this.mode === 'rope') this.#swing(dt, input, ctx);
    else if (this.flopT > 0) this.#flop(dt);
    else if (this.mode === 'swim') this.#swim(dt, input, ctx);
    else this.#walk(dt, input, ctx);

    this.bear.root.position.copy(this.pos);
    // Swimming: the model lies forward from its feet, so lift it to keep
    // head and shoulders out of the water.
    if (this.mode === 'swim') this.bear.root.position.y += 0.62;
    if (this.mode === 'rope' && this.rope) {
      // Hang along the rope.
      _a.copy(this.rope.p).normalize().negate();
      _q.setFromUnitVectors(UP, _a);
      _q2.setFromAxisAngle(UP, this.heading);
      this.bear.root.quaternion.copy(_q).multiply(_q2);
    } else if (this.mode === 'climb' && this.climb?.net) {
      // Lie along the net, back to the open air.
      const { net, side } = this.climb;
      _a.copy(net.n).multiplyScalar(-side); // facing the net
      _b.copy(net.u);
      _c.crossVectors(_b, _a);
      _m.makeBasis(_c, _b, _a);
      this.bear.root.quaternion.setFromRotationMatrix(_m);
    } else {
      this.bear.root.rotation.set(0, this.heading, 0);
    }
    this.bear.update(dt, {
      mode: this.animMode,
      speed: this.speed,
      t: ctx.t,
      effort: this.effort,
      turning: this.turning,
      carrying: !!this.carrying,
    });
  }

  #wish(input, ctx) {
    const { fx, fz, rx, rz } = ctx.camBasis;
    const f = input.axis('KeyS', 'KeyW');
    const r = input.axis('KeyA', 'KeyD');
    let x = fx * f + rx * r;
    let z = fz * f + rz * r;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z, len: Math.min(1, len) };
  }

  #face(dx, dz, dt, rate = 12) {
    if (Math.hypot(dx, dz) < 0.05) return;
    const target = Math.atan2(dx, dz);
    let d = target - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * (1 - Math.exp(-dt * rate));
  }

  #walk(dt, input, ctx) {
    const water = heightAt(this.pos.x, this.pos.z, ctx.t, ctx.waveScale);
    const wading = water - this.pos.y;
    // A startled hop carries on regardless of the keys for a moment.
    this.startleT = Math.max(0, (this.startleT ?? 0) - dt);
    const wish = this.startleT > 0 ? { x: 0, z: 0, len: 0 } : this.#wish(input, ctx);
    let speed = input.held('ShiftLeft', 'ShiftRight') ? SPEED.run : SPEED.walk;
    if (this.carrying) speed = SPEED.carry;
    if (wading > 0.35) speed = Math.min(speed, SPEED.wade);

    // Walking into a net or a rope ladder: get on it.
    if (this.grounded && wish.len > 0.3 && !this.carrying && this.#tryNet(wish)) return;

    // Horizontal velocity, relative to whatever we're standing on.
    const accel = this.startleT > 0 ? 0 : this.grounded ? 16 : 5;
    const k = 1 - Math.exp(-dt * accel);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;
    this.#face(wish.x, wish.z, dt);

    if (input.pressed('Space')) this.jumpBuffer = BUFFER;
    else this.jumpBuffer -= dt;
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.carrying && wading < WADE_JUMP_MAX) {
      // Jumping off something on its way up (a float on a swell) sends you higher.
      const lift = this.platformVel ? Math.min(Math.max(this.platformVel.y, 0), 2.5) : 0;
      this.vel.y = JUMP_V + lift * 0.8;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.#leavePlatform();
      this.emit('jump');
    }

    // Half the gravity before moving and half after: the same arc at any
    // frame rate (a jump peaks at the same height on a slow machine).
    this.vel.y -= GRAV * dt * 0.5;
    const wasGrounded = this.grounded;
    const start = this.pos.clone();
    if (!wasGrounded && this.vel.y < 0 && this.fallStart === null) this.fallStart = this.pos.y;
    // Move in short steps so a fast fall (or a slow frame) can't pass
    // straight through a thin deck or a hatch cover.
    const steps = Math.min(8, Math.max(1, Math.ceil((this.vel.length() * dt) / 0.2)));
    let ground = null;
    for (let i = 0; i < steps; i++) {
      this.pos.addScaledVector(this.vel, dt / steps);
      ground = this.#collide();
      if (ground && this.vel.y <= 0.5 && !wasGrounded) break;
    }
    this.vel.y -= GRAV * dt * 0.5;
    this.grounded = !!ground && this.vel.y <= 0.5;
    if (!this.grounded && wasGrounded && this.vel.y <= 0) {
      // Stick to the ground walking downhill or off small steps.
      const hit = this.world.probeDown(this.pos.x, this.pos.z, this.pos.y + 0.05, 0.45);
      if (hit && hit.normal.y > 0.6) {
        this.pos.y = hit.y;
        this.grounded = true;
        this.#setPlatform(hit.collider);
      }
    }
    if (this.grounded) {
      if (ground) this.#setPlatform(ground.collider);
      // Landing. A long drop onto something hard knocks you flat for a
      // moment; into the water it's just a splash. Nothing worse.
      if (this.fallStart !== null && this.fallStart !== undefined) {
        const drop = this.fallStart - this.pos.y;
        const wet = heightAt(this.pos.x, this.pos.z, ctx.t, ctx.waveScale) - this.pos.y > 0.3;
        if (drop > 4.5 && !wet) {
          this.flopT = 0.9;
          this.emit('flop');
        } else if (drop > 0.6) this.emit(wet ? 'splash' : 'land');
      }
      this.fallStart = null;
      this.vel.y = Math.max(this.vel.y, 0);
      if (this.vel.y > 0) this.vel.y = 0;
    } else if (this.fallStart === null && this.vel.y < 0) {
      this.fallStart = this.pos.y;
    }

    // In the air: a rope, a net, or a ledge within reach? Grab it.
    if (!this.grounded && this.grabCooldown <= 0 && !this.carrying && this.vel.y < 3) {
      if (this.#tryRope()) return;
      if (this.#tryNet(null)) return;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const fx = sp > 0.6 ? this.vel.x / sp : Math.sin(this.heading);
      const fz = sp > 0.6 ? this.vel.z / sp : Math.cos(this.heading);
      // Check the whole height the paws swept through this frame, so a
      // fast fall (or a slow machine) can't skip past an edge.
      const lo = Math.min(start.y, this.pos.y) + REACH_LO;
      const hi = Math.max(start.y, this.pos.y) + REACH_HI;
      const ledge = this.#findLedge(fx, fz, lo, hi);
      if (ledge) {
        this.#startHang(ledge);
        return;
      }
    }

    // Step up onto low ledges (deck to bench, sand to rock).
    const moved = Math.hypot(this.pos.x - start.x, this.pos.z - start.z);
    if (this.grounded && wish.len > 0.1 && moved < speed * dt * 0.4) {
      const sx = this.pos.x + wish.x * 0.45;
      const sz = this.pos.z + wish.z * 0.45;
      const hit = this.world.probeDown(sx, sz, this.pos.y + 0.5, 0.48);
      if (hit && hit.y > this.pos.y + 0.04 && hit.normal.y > 0.7) {
        this.pos.set(this.pos.x + wish.x * 0.08, hit.y + 0.01, this.pos.z + wish.z * 0.08);
        this.#setPlatform(hit.collider);
      }
    }

    // Keep walking into something waist to head high with a flat top and
    // you pull yourself up onto it. (Not on boats: bumping into the wheel
    // shouldn't put you on top of it.)
    const pushing = this.grounded && wish.len > 0.5 && !this.carrying && moved < speed * dt * 0.4 && wading < 0.5;
    this.pushT = pushing ? (this.pushT ?? 0) + dt : 0;
    if (pushing && this.pushT > 0.25) {
      const ledge = this.#findLedge(wish.x, wish.z, this.pos.y + 0.45, this.pos.y + 1.35);
      if (ledge && !ledge.collider?.body) {
        this.pushT = 0;
        this.heading = Math.atan2(wish.x, wish.z);
        this.ledge = { fx: wish.x / wish.len, fz: wish.z / wish.len };
        this.platform = null;
        this.#startClimbUp(ledge.y, ledge.x, ledge.z);
        return;
      }
    }

    // Into deep water? Floats that get dragged under wash you off sooner.
    const depth = heightAt(this.pos.x, this.pos.z, ctx.t, ctx.waveScale) - this.pos.y;
    const awash = !!this.platform?.awash;
    const onDeck = this.grounded && this.platform && !awash;
    if (depth > (awash ? 0.6 : FLOAT_DEPTH + 0.05) && !onDeck) {
      if (this.vel.y < -6) this.emit('splash');
      this.mode = 'swim';
      this.vel.y = 0;
      this.#leavePlatform();
      this.fallStart = null;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (!this.grounded) this.animMode = 'air';
    else this.animMode = this.speed > 0.25 ? 'walk' : this.carrying ? 'carry' : 'idle';
    if (this.mode !== 'swim') this.mode = this.grounded ? 'ground' : 'air';
  }

  #swim(dt, input, ctx) {
    const water = heightAt(this.pos.x, this.pos.z, ctx.t, ctx.waveScale);
    const wish = this.#wish(input, ctx);
    const speed = this.carrying ? SPEED.carrySwim : SPEED.swim;
    const k = 1 - Math.exp(-dt * 4);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;
    this.#face(wish.x, wish.z, dt, 6);
    const targetY = water - FLOAT_DEPTH;
    this.pos.y += (targetY - this.pos.y) * (1 - Math.exp(-dt * 6));
    this.vel.y = 0;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // A net hanging into the water: climb out on it.
    if (wish.len > 0.3 && !this.carrying && this.#tryNet(wish)) return;

    // Bump into hulls, rocks, cliffs.
    const mid = _a.copy(this.pos).add(new THREE.Vector3(0, 0.9, 0));
    this.world.resolveSphere(mid, 0.38);
    this.pos.x = mid.x;
    this.pos.z = mid.z;
    // Shore shelving up under us: stand and wade.
    const ground = this.world.probeDown(this.pos.x, this.pos.z, this.pos.y + 1.2, 3);
    if (ground && ground.y > targetY + 0.05 && ground.normal.y > 0.55 && !ground.collider?.body && !ground.collider?.noClimb) {
      this.pos.y = Math.max(this.pos.y, ground.y);
      this.mode = 'ground';
      this.grounded = true;
      this.#setPlatform(ground.collider);
    } else if (wish.len > 0.2) {
      // Haul out onto a ledge or the swim platform, if it's low enough.
      for (const reach of [0.25, 0.55, 0.85]) {
        const lx = this.pos.x + wish.x * reach;
        const lz = this.pos.z + wish.z * reach;
        const ledge = this.world.probeDown(lx, lz, water + 0.6, 1.4, { skip: (c) => c.noClimb || (c.body && !c.boardable) });
        if (ledge && ledge.y > water - 0.4 && ledge.normal.y > 0.7) {
          this.pos.set(lx, ledge.y + 0.02, lz);
          this.mode = 'ground';
          this.grounded = true;
          this.vel.set(0, 0, 0);
          this.#setPlatform(ledge.collider);
          this.emit('climbout');
          break;
        }
      }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.animMode = 'swim';
  }

  // ---------------------------------------------------------------------
  // Ledges
  // ---------------------------------------------------------------------

  /**
   * A flat top just in front, between waist and well above the head, with
   * room to stand on it and an edge we can get our paws over.
   */
  #findLedge(fx, fz, lo = this.pos.y + REACH_LO, hi = this.pos.y + REACH_HI) {
    const skip = (c) => c.noGrab;
    for (const r of [0.35, 0.55, 0.75, 0.95, 1.1]) {
      const x = this.pos.x + fx * r;
      const z = this.pos.z + fz * r;
      const hit = this.world.probeDown(x, z, hi, hi - lo, { skip });
      if (!hit || hit.normal.y < 0.75) continue;
      // Room up there for a bear.
      _c.set(x, hit.y + 0.75, z);
      if (this.world.blocked(_c, 0.28)) continue;
      // Walk back toward us until the top drops away: that's the edge.
      const has = (d) => {
        const h = this.world.probeDown(this.pos.x + fx * d, this.pos.z + fz * d, hit.y + 0.2, 0.45, { skip });
        return !!h && h.y > hit.y - 0.25;
      };
      let inner = r;
      let outer = Math.max(0, r - 0.65);
      if (has(outer)) continue; // it runs right under us: a slope, not a ledge
      for (let i = 0; i < 6; i++) {
        const mid = (inner + outer) / 2;
        if (has(mid)) inner = mid;
        else outer = mid;
      }
      return { y: hit.y, x: this.pos.x + fx * inner, z: this.pos.z + fz * inner, fx, fz, collider: hit.collider };
    }
    return null;
  }

  #startHang(ledge) {
    this.mode = 'hang';
    this.grounded = false;
    this.vel.set(0, 0, 0);
    this.ledge = { fx: ledge.fx, fz: ledge.fz };
    this.pos.set(ledge.x - ledge.fx * 0.3, ledge.y - HANG, ledge.z - ledge.fz * 0.3);
    this.heading = Math.atan2(ledge.fx, ledge.fz);
    this.platform = ledge.collider?.body ?? null;
    this.fallStart = null;
    this.emit('grab');
  }

  #hang(dt, input) {
    const L = this.ledge;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.animMode = 'hang';
    this.heading = Math.atan2(L.fx, L.fz);
    if (input.held('KeyW') || input.pressed('Space')) {
      this.#startClimbUp(this.pos.y + HANG, this.pos.x + L.fx * 0.3, this.pos.z + L.fz * 0.3);
      return;
    }
    if (input.pressed('KeyS')) {
      this.#letGo(-0.8);
      return;
    }
    const side = input.axis('KeyA', 'KeyD');
    if (side) {
      // Shimmy along the edge. Try straight along it, then turned a little
      // either way, so round tops (rock columns) can be followed.
      const keep = this.pos.clone();
      let moved = false;
      for (const turn of [0, 0.18, -0.18]) {
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        const fx = L.fx * c - L.fz * s;
        const fz = L.fx * s + L.fz * c;
        // Right, when facing (fx, fz), is (−fz, fx).
        this.pos.set(keep.x - fz * side * 0.85 * dt, keep.y, keep.z + fx * side * 0.85 * dt);
        const next = this.#findLedge(fx, fz, keep.y + HANG - 0.35, keep.y + HANG + 0.35);
        if (next) {
          this.pos.set(next.x - fx * 0.3, next.y - HANG, next.z - fz * 0.3);
          this.ledge = { fx, fz };
          moved = true;
          break;
        }
      }
      if (moved) {
        this.animMode = 'climb';
        this.speed = 0.8;
      } else {
        this.pos.copy(keep);
      }
      return;
    }
    // Still something to hold? (A float can drop away under your paws.)
    const still = this.#findLedge(L.fx, L.fz, this.pos.y + HANG - 0.4, this.pos.y + HANG + 0.4);
    if (!still) this.#letGo(-0.3);
  }

  #letGo(back) {
    const L = this.ledge;
    this.mode = 'air';
    this.grounded = false;
    this.vel.set((L?.fx ?? 0) * back, 0, (L?.fz ?? 0) * back);
    this.grabCooldown = 0.4;
    this.ledge = null;
    this.#leavePlatform();
    this.fallStart = this.pos.y;
  }

  /** Haul up over the edge at (ex, ez), whose top is at `top`. */
  #startClimbUp(top, ex, ez) {
    const L = this.ledge;
    // Stand just past the edge. If it's only a thin wall (a ship's side),
    // carry on over and down onto whatever is behind it.
    let tx = ex + L.fx * 0.45;
    let tz = ez + L.fz * 0.45;
    let hit = this.world.probeDown(tx, tz, top + 0.3, 1.7);
    if (!hit || hit.normal.y < 0.55) {
      tx = ex + L.fx * 0.22;
      tz = ez + L.fz * 0.22;
      hit = this.world.probeDown(tx, tz, top + 0.3, 0.6);
    }
    this.#beginClimbMove(new THREE.Vector3(tx, (hit ? hit.y : top) + 0.02, tz), top + 0.08, hit?.collider ?? null);
  }

  /** Haul up to `to`, passing over a lip at height `over` on the way. */
  #beginClimbMove(to, over, collider) {
    const body = this.platform;
    const from = this.pos.clone();
    const lift = over - Math.max(from.y, to.y);
    this.climb = {
      t: 0,
      lift,
      from: body ? from.applyMatrix4(body.inverse) : from,
      to: body ? to.clone().applyMatrix4(body.inverse) : to.clone(),
      body,
      collider,
    };
    this.mode = 'climbup';
    this.ledge = null;
    this.vel.set(0, 0, 0);
    this.emit('climbup');
  }

  #climbUp(dt) {
    const c = this.climb;
    c.t = Math.min(1, c.t + dt / CLIMB_UP_TIME);
    const from = c.body ? _a.copy(c.from).applyMatrix4(c.body.matrix) : _a.copy(c.from);
    const to = c.body ? _b.copy(c.to).applyMatrix4(c.body.matrix) : _b.copy(c.to);
    const over = Math.max(from.y, to.y) + c.lift;
    // Up over the lip first, then forward and down onto the top.
    const up = smooth(0, 0.5, c.t);
    const fwd = smooth(0.3, 1, c.t);
    const settle = smooth(0.55, 1, c.t);
    const y = from.y + (over - from.y) * up + (to.y - over) * settle;
    this.pos.set(from.x + (to.x - from.x) * fwd, y, from.z + (to.z - from.z) * fwd);
    this.animMode = 'climb';
    this.speed = 1;
    if (c.t >= 1) {
      this.mode = 'ground';
      this.grounded = true;
      this.vel.set(0, 0, 0);
      this.climb = null;
      this.platform = null;
      this.#setPlatform(c.collider);
      this.fallStart = null;
    }
  }

  // ---------------------------------------------------------------------
  // Nets and rope ladders. world.climbables: { o, r, u, n, w, h, exit? }
  // (o the bottom corner, r across, u up the net, n out of it).
  // ---------------------------------------------------------------------

  #tryNet(wish) {
    for (const net of this.world.climbables ?? []) {
      _a.copy(this.pos).add(new THREE.Vector3(0, 0.6, 0)).sub(net.o);
      const s = _a.dot(net.r);
      const t = _a.dot(net.u);
      const q = _a.dot(net.n);
      if (s < 0.2 || s > net.w - 0.2 || t < -0.5 || t > net.h - 0.3 || Math.abs(q) > 0.6) continue;
      const side = Math.sign(q) || 1;
      // On foot or swimming, only if heading into it.
      if (wish && wish.x * -side * net.n.x + wish.z * -side * net.n.z < 0.3) continue;
      this.mode = 'climb';
      this.grounded = false;
      this.vel.set(0, 0, 0);
      this.climb = { net, s, t: Math.max(0, t), side };
      this.platform = null;
      this.fallStart = null;
      this.emit('grab');
      return true;
    }
    return false;
  }

  #climbNet(dt, input, ctx) {
    const c = this.climb;
    const { net, side } = c;
    // Which way is "right" on the net, as the player sees it.
    _a.copy(net.n).multiplyScalar(-side); // facing
    _b.crossVectors(_a, UP).normalize(); // screen right
    const rs = Math.sign(_b.dot(net.r)) || 1;
    const up = input.axis('KeyS', 'KeyW');
    const across = input.axis('KeyA', 'KeyD');
    c.t += up * 0.95 * dt;
    c.s = Math.min(net.w - 0.25, Math.max(0.25, c.s + across * rs * 0.7 * dt));
    this.speed = Math.abs(up) + Math.abs(across);
    this.animMode = 'climb';
    this.heading = Math.atan2(_a.x, _a.z);

    if (input.pressed('Space')) {
      // Kick off backwards.
      this.mode = 'air';
      this.vel.set(net.n.x * side * 3.2, 4.5, net.n.z * side * 3.2);
      this.grabCooldown = 0.45;
      this.climb = null;
      this.fallStart = this.pos.y;
      return;
    }
    if (c.t >= net.h - 0.15 && up > 0) {
      // Over the top onto whatever's there.
      const exit = net.exit ?? _c.copy(net.o).addScaledVector(net.r, c.s).addScaledVector(net.u, net.h + 0.4).addScaledVector(net.n, -side * 0.4);
      const hit = this.world.probeDown(exit.x, exit.z, exit.y + 1.2, 2.4);
      if (hit && hit.normal.y > 0.55) {
        this.#beginClimbMove(new THREE.Vector3(exit.x, hit.y + 0.02, exit.z), Math.max(hit.y, this.pos.y + 0.6) + 0.15, hit.collider);
        return;
      }
      c.t = net.h - 0.15;
    }
    if (c.t < 0) {
      c.t = 0;
      if (up < 0) {
        // Off the bottom: let go.
        this.mode = 'air';
        this.climb = null;
        this.grabCooldown = 0.4;
        this.fallStart = this.pos.y;
        this.vel.set(net.n.x * side * 0.6, 0, net.n.z * side * 0.6);
        return;
      }
    }
    this.pos.copy(net.o).addScaledVector(net.r, c.s).addScaledVector(net.u, c.t).addScaledVector(net.n, side * 0.32);
    this.pos.y -= 0.6;
    const water = heightAt(this.pos.x, this.pos.z, ctx.t, ctx.waveScale);
    if (water - this.pos.y > 1.3) {
      // Climbed down into the sea.
      this.mode = 'swim';
      this.climb = null;
    }
  }

  // ---------------------------------------------------------------------
  // Ropes. world.ropes: { anchor, length, p (anchor → free end), v, held }
  // ---------------------------------------------------------------------

  #tryRope() {
    const hands = _a.copy(this.pos).add(new THREE.Vector3(0, HANDS, 0));
    for (const rope of this.world.ropes ?? []) {
      if (rope.held || (rope === this.lastRope && this.lastRopeT > 0)) continue;
      const dir = _b.copy(rope.p).normalize();
      const t = Math.min(rope.length, Math.max(1.4, _c.copy(hands).sub(rope.anchor).dot(dir)));
      const near = _c.copy(rope.anchor).addScaledVector(dir, t);
      if (near.distanceTo(hands) > 1.0) continue;
      const p = hands.clone().sub(rope.anchor);
      const len = Math.min(rope.length, Math.max(1.4, p.length()));
      p.setLength(len);
      const v = this.vel.clone();
      const pn = p.clone().normalize();
      v.addScaledVector(pn, -v.dot(pn));
      this.rope = { rope, len, p, v };
      rope.held = true;
      this.mode = 'rope';
      this.grounded = false;
      this.platform = null;
      this.fallStart = null;
      this.emit('grab');
      return true;
    }
    return false;
  }

  #swing(dt, input, ctx) {
    const S = this.rope;
    const { fx, fz, rx, rz } = ctx.camBasis;
    const pump = input.axis('KeyS', 'KeyW');
    const sway = input.axis('KeyA', 'KeyD');
    const steps = 4;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const pn = _a.copy(S.p).normalize();
      // Gravity, plus a bit of leg-kicking to pump the swing.
      _b.set(fx * pump * 5 + rx * sway * 2.5, -GRAV, fz * pump * 5 + rz * sway * 2.5);
      S.v.addScaledVector(_b, h);
      S.v.addScaledVector(pn, -S.v.dot(pn));
      S.v.multiplyScalar(1 - 0.12 * h);
      S.p.addScaledVector(S.v, h).setLength(S.len);
    }
    const pn = _a.copy(S.p).normalize();
    S.rope.p.copy(pn).multiplyScalar(S.rope.length);
    // Bump into the wreck: lose the speed going into it.
    const body = _c.copy(S.rope.anchor).add(S.p).addScaledVector(pn, 0.55);
    const before = body.clone();
    this.world.resolveSphere(body, 0.3);
    const push = body.sub(before);
    if (push.lengthSq() > 1e-6) {
      S.p.add(push).setLength(S.len);
      const n = push.normalize();
      const vn = S.v.dot(n);
      if (vn < 0) S.v.addScaledVector(n, -vn * 1.3);
    }
    pn.copy(S.p).normalize();
    this.pos.copy(S.rope.anchor).add(S.p).addScaledVector(pn, HANDS);
    if (Math.hypot(S.v.x, S.v.z) > 0.6) this.#face(S.v.x, S.v.z, dt, 4);
    this.vel.copy(S.v);
    this.speed = 0;
    this.animMode = 'rope';

    if (input.pressed('Space')) {
      // Let go, with a little kick up and on.
      this.vel.copy(S.v).multiplyScalar(1.05);
      this.vel.y += 2.4;
      this.#dropRope();
      this.mode = 'air';
      this.grabCooldown = 0.35;
      this.fallStart = this.pos.y;
      this.emit('jump');
      return;
    }
    const water = heightAt(this.pos.x, this.pos.z, ctx.t, ctx.waveScale);
    if (water - this.pos.y > 1.2) {
      this.#dropRope();
      this.mode = 'swim';
    }
  }

  #dropRope() {
    if (!this.rope) return;
    const rope = this.rope.rope;
    rope.held = false;
    // The rope carries on swinging by itself.
    rope.v.copy(this.rope.v).multiplyScalar(rope.length / this.rope.len);
    this.lastRope = rope;
    this.lastRopeT = 0.7;
    this.rope = null;
  }

  // ---------------------------------------------------------------------
  // Digging and odds and ends
  // ---------------------------------------------------------------------

  /** Dig a hole in front of you; `done(x, z)` fires when the shovel's done. */
  startDig(done) {
    if (this.mode !== 'ground' || !this.grounded || this.carrying) return false;
    this.mode = 'dig';
    this.digT = 1.7;
    this.digDone = done;
    this.vel.set(0, 0, 0);
    this.bear.setShovel(true);
    return true;
  }

  get digPoint() {
    return { x: this.pos.x + Math.sin(this.heading) * 0.65, z: this.pos.z + Math.cos(this.heading) * 0.65 };
  }

  #dig(dt) {
    this.digT -= dt;
    this.animMode = 'dig';
    this.speed = 0;
    if (this.digT <= 0) {
      this.mode = 'ground';
      this.bear.setShovel(false);
      const p = this.digPoint;
      this.digDone?.(p.x, p.z);
      this.digDone = null;
    }
  }

  /** Jump back from something (a crab out of a hole). */
  startle() {
    if (this.mode !== 'ground' || !this.grounded) return;
    this.vel.set(-Math.sin(this.heading) * 2.4, 3.6, -Math.cos(this.heading) * 2.4);
    this.grounded = false;
    this.startleT = 0.3;
    this.#leavePlatform();
  }

  #flop(dt) {
    this.flopT -= dt;
    this.vel.set(0, 0, 0);
    this.animMode = 'flop';
    this.speed = 0;
  }

  /** Resolve the feet and body spheres; returns the standing contact. */
  #collide() {
    const feet = _a.copy(this.pos).add(new THREE.Vector3(0, R, 0));
    const ground = this.world.resolveSphere(feet, R);
    this.pos.copy(feet).sub(new THREE.Vector3(0, R, 0));
    const body = _a.copy(this.pos).add(new THREE.Vector3(0, 0.95, 0));
    const before = body.clone();
    this.world.resolveSphere(body, 0.3, { terrain: false });
    this.pos.x += body.x - before.x;
    this.pos.z += body.z - before.z;
    if (body.y < before.y) {
      this.pos.y += body.y - before.y; // bumped head
      if (this.vel.y > 0) this.vel.y = 0;
    }
    if (ground && ground.normal.y > 0.55) {
      // Don't keep velocity pointing into the floor.
      const vn = this.vel.dot(ground.normal);
      if (vn < 0) this.vel.addScaledVector(ground.normal, -vn);
    }
    return ground;
  }

  #setPlatform(collider) {
    const body = collider?.body ?? null;
    if (body === this.platform) return;
    this.platform = body;
  }

  #leavePlatform() {
    if (this.platform && this.platformVel) {
      this.vel.x += this.platformVel.x;
      this.vel.z += this.platformVel.z;
    }
    this.platform = null;
  }

  // ---------------------------------------------------------------------
  // Boat stations
  // ---------------------------------------------------------------------

  enterStation(boat, name) {
    this.station = name;
    this.boat = boat;
    this.mode = 'station';
    this.vel.set(0, 0, 0);
  }

  leaveStation() {
    if (!this.station) return;
    const st = STATIONS[this.station];
    const back = st.stand.clone().add(new THREE.Vector3(-0.35, 0.02, 0));
    this.boat.toWorld(back, this.pos);
    this.mode = 'ground';
    this.grounded = true;
    this.platform = this.boat.body;
    this.station = null;
    const b = this.boat.state;
    for (const k of Object.keys(b.input)) b.input[k] = 0;
  }

  #station(input) {
    const boat = this.boat;
    const b = boat.state;
    const st = STATIONS[this.station];
    boat.toWorld(st.stand, this.pos);
    this.heading = Math.PI / 2 - b.heading;
    this.platform = boat.body;
    const i = b.input;
    for (const k of Object.keys(i)) i[k] = 0;
    this.effort = 0;
    this.turning = 0;
    if (this.station === 'helm') {
      i.steer = input.axis('KeyA', 'KeyD');
      i.throttle = input.axis('KeyS', 'KeyW');
      i.mainSheet = input.axis(['ArrowUp', 'KeyX'], ['ArrowDown', 'KeyZ']);
      i.jibSheet = input.axis(['ArrowRight', 'KeyV'], ['ArrowLeft', 'KeyC']);
      if (input.pressed('KeyR')) {
        b.engine = !b.engine;
        this.emit(b.engine ? 'engine-on' : 'engine-off');
      }
      if (input.pressed('KeyF')) this.emit('horn');
      if (input.pressed('KeyL')) {
        b.lights = !b.lights;
        this.emit('lights');
      }
      if (input.pressed('KeyP')) {
        b.autopilot.on = !b.autopilot.on;
        b.autopilot.heading = b.heading;
        this.emit(b.autopilot.on ? 'autopilot-on' : 'autopilot-off');
      }
      this.turning = i.steer;
      this.animMode = 'helm';
    } else if (this.station === 'halyards') {
      i.hoist = input.axis('KeyS', 'KeyW');
      i.furl = input.axis('KeyA', 'KeyD');
      if (input.pressed('KeyR')) {
        b.reef = (b.reef + 1) % 3;
        this.emit('reef');
      }
      this.effort = Math.abs(i.hoist) || Math.abs(i.furl) ? 1 : 0;
      this.animMode = 'haul';
    } else if (this.station === 'windlass') {
      i.windlass = input.axis('KeyS', 'KeyW');
      this.effort = Math.abs(i.windlass);
      this.animMode = 'crank';
    }
    if (input.pressed('KeyE', 'Escape')) this.leaveStation();
    this.speed = 0;
  }
}
