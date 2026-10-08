import * as THREE from 'three';
import { groundAt } from '../shared/world.js';
import { heightAt } from '../shared/waves.js';

// Third-person camera that orbits the bear. While aboard it turns with the
// boat so the view doesn't spin away under you.

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // camera sits at target + (sin yaw, ·, cos yaw) * dist
    this.pitch = 0.32;
    this.dist = 5.5;
    this.zoom = { foot: 5.5, helm: 11, cabin: 4.6 };
    this.context = 'foot';
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.first = true;
    this.sensitivity = 0.0025;
  }

  /** Horizontal forward/right for camera-relative movement. */
  basis() {
    return {
      fx: -Math.sin(this.yaw), fz: -Math.cos(this.yaw),
      rx: Math.cos(this.yaw), rz: -Math.sin(this.yaw),
    };
  }

  update(dt, input, target, { context = 'foot', yawDelta = 0, t = 0, waveScale = 0.6, world = null } = {}) {
    this.yaw += yawDelta;
    this.yaw -= input.mouse.dx * this.sensitivity;
    this.pitch = Math.min(1.25, Math.max(-0.25, this.pitch + input.mouse.dy * this.sensitivity));
    if (input.mouse.wheel) {
      this.zoom[context] = Math.min(24, Math.max(2.5, this.zoom[context] * (1 + input.mouse.wheel * 0.12)));
    }
    this.context = context;
    const want = this.zoom[context];
    this.dist += (want - this.dist) * (1 - Math.exp(-dt * 4));

    if (this.first) {
      this.smoothTarget.copy(target);
      this.first = false;
    }
    // Follow tightly sideways, a little softer vertically (bobbing on deck).
    const k = 1 - Math.exp(-dt * 14);
    const ky = 1 - Math.exp(-dt * 6);
    this.smoothTarget.x += (target.x - this.smoothTarget.x) * k;
    this.smoothTarget.z += (target.z - this.smoothTarget.z) * k;
    this.smoothTarget.y += (target.y - this.smoothTarget.y) * ky;

    // Below decks the camera looks down into the cabin from above, like a
    // cutaway: the walls and deckhead between it and the bear are only drawn
    // from the inside, so they drop out of the way.
    const cabin = context === 'cabin';
    const pitch = cabin ? 0.92 : this.pitch;
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
    // Pull in if a hill, a hull or a rock is in the way.
    let d = this.dist;
    for (let s = 0.6; !cabin && s <= this.dist; s += 0.4) {
      const p = this.smoothTarget.clone().addScaledVector(dir, s);
      if (groundAt(p.x, p.z) > p.y - 0.4 || (world && world.blocked(p, 0.25, true))) {
        d = Math.max(1.0, s - 0.5);
        break;
      }
    }
    // Ease back out instead of snapping.
    if (this.blockedDist !== undefined && d > this.blockedDist) d = this.blockedDist + (d - this.blockedDist) * (1 - Math.exp(-dt * 3));
    this.blockedDist = d;
    const pos = this.smoothTarget.clone().addScaledVector(dir, d);
    const floor = Math.max(groundAt(pos.x, pos.z) + 0.4, heightAt(pos.x, pos.z, t, waveScale) + 0.35);
    if (pos.y < floor && !cabin) pos.y = floor;
    this.camera.position.copy(pos);
    this.camera.lookAt(this.smoothTarget);
  }
}
