import * as THREE from 'three';
import { heightAt } from '../shared/waves.js';
import { Bear } from './bear.js';
import { STATIONS } from './boat.js';

// The player: a bear that walks on islands and on the moving deck, wades,
// swims, jumps, and works the boat from its stations.
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

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Player {
  constructor(world, look = 'brown') {
    this.world = world;
    this.bear = new Bear(look);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.mode = 'ground'; // ground | air | swim | station
    this.grounded = false;
    this.platform = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
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
  }

  /** Put the bear somewhere; `platform` is a Body it is standing on, if any. */
  place(p, platform = null) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.platform = platform;
    this.mode = 'ground';
  }

  get head() {
    return _a.copy(this.pos).add(new THREE.Vector3(0, 1.15, 0));
  }

  emit(e) {
    this.events.push(e);
  }

  update(dt, input, ctx) {
    this.events.length = 0;
    // Ride along with whatever we stand on.
    if (this.platform && this.mode !== 'station') {
      const before = _b.copy(this.pos);
      this.platform.carry(this.pos);
      this.platformVel = this.pos.clone().sub(before).divideScalar(Math.max(dt, 1e-4));
      this.heading -= this.platform.yaw - this.platform.prevYaw;
    } else {
      this.platformVel = null;
    }

    if (this.mode === 'station') this.#station(input);
    else if (this.mode === 'dig') this.#dig(dt);
    else if (this.flopT > 0) this.#flop(dt);
    else if (this.mode === 'swim') this.#swim(dt, input, ctx);
    else this.#walk(dt, input, ctx);

    this.bear.root.position.copy(this.pos);
    // Swimming: the model lies forward from its feet, so lift it to keep
    // head and shoulders out of the water.
    if (this.mode === 'swim') this.bear.root.position.y += 0.62;
    this.bear.root.rotation.set(0, this.heading, 0);
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

    // Horizontal velocity, relative to whatever we're standing on.
    const accel = this.startleT > 0 ? 0 : this.grounded ? 16 : 5;
    const k = 1 - Math.exp(-dt * accel);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;
    this.#face(wish.x, wish.z, dt);

    if (input.pressed('Space')) this.jumpBuffer = BUFFER;
    else this.jumpBuffer -= dt;
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.carrying) {
      this.vel.y = JUMP_V;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.#leavePlatform();
      this.emit('jump');
    }

    this.vel.y -= GRAV * dt;
    const wasGrounded = this.grounded;
    const start = _b.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    if (!wasGrounded && this.vel.y < 0 && this.fallStart === null) this.fallStart = this.pos.y;

    const ground = this.#collide();
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
      // Landing.
      if (this.fallStart !== null && this.fallStart !== undefined) {
        const drop = this.fallStart - this.pos.y;
        if (drop > 4.5) {
          this.flopT = 0.9;
          this.emit('flop');
        } else if (drop > 0.6) this.emit('land');
      }
      this.fallStart = null;
      this.vel.y = Math.max(this.vel.y, 0);
      if (this.vel.y > 0) this.vel.y = 0;
    } else if (this.fallStart === null && this.vel.y < 0) {
      this.fallStart = this.pos.y;
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

    // Into deep water?
    const depth = heightAt(this.pos.x, this.pos.z, ctx.t, ctx.waveScale) - this.pos.y;
    if (depth > FLOAT_DEPTH + 0.05 && !(this.grounded && this.platform)) {
      if (this.vel.y < -6) this.emit('splash');
      this.mode = 'swim';
      this.vel.y = 0;
      this.#leavePlatform();
      this.fallStart = null;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (!this.grounded) this.animMode = 'air';
    else this.animMode = this.speed > 0.25 ? 'walk' : this.carrying ? 'carry' : 'idle';
    this.mode = this.grounded ? 'ground' : this.mode === 'swim' ? 'swim' : 'air';
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

    // Bump into hulls, rocks, cliffs.
    const mid = _a.copy(this.pos).add(new THREE.Vector3(0, 0.9, 0));
    this.world.resolveSphere(mid, 0.38);
    this.pos.x = mid.x;
    this.pos.z = mid.z;
    // Shore shelving up under us: stand and wade.
    const ground = this.world.probeDown(this.pos.x, this.pos.z, this.pos.y + 1.2, 3);
    if (ground && ground.y > targetY + 0.05 && ground.normal.y > 0.55 && !ground.collider?.body) {
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
