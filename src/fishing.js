import * as THREE from 'three';
import { heightAt } from '../shared/waves.js';
import { groundAt, islandNear } from '../shared/world.js';
import { paint, mergeParts, segment } from './props.js';

// Fishing. Q casts from wherever you're standing (a beach, a rock, the deck),
// the float rides the swell, and when it dips you've a moment to press Q and
// strike. What bites depends on where you are: open water, sand, rock, reef,
// and the time of day.

const STORE = 'hots.fish';
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Where each fish lives. kg: [min, max]. Colours: back, belly, fins.
const FISH = {
  mackerel: { name: 'mackerel', kg: [0.3, 0.9], back: '#2f6a6e', belly: '#d9dfe0', fin: '#2b4a52', stripes: true },
  pollock: { name: 'pollock', kg: [0.8, 4], back: '#4c5a3a', belly: '#c9c7b0', fin: '#3b432c' },
  bass: { name: 'sea bass', kg: [0.6, 3.5], back: '#6c7880', belly: '#e6e8e6', fin: '#55616a' },
  plaice: { name: 'plaice', kg: [0.3, 1.6], back: '#8a6d4a', belly: '#efe8dc', fin: '#7a5e3e', flat: true, spots: true },
  mullet: { name: 'grey mullet', kg: [0.5, 2.5], back: '#77807f', belly: '#dfe2de', fin: '#626b6a' },
  wrasse: { name: 'ballan wrasse', kg: [0.4, 2], back: '#5f7d45', belly: '#c88f5a', fin: '#4d6a3a', spots: true },
  parrotfish: { name: 'parrotfish', kg: [0.6, 3], back: '#2fa59a', belly: '#e07fa0', fin: '#2b7fb8' },
  grouper: { name: 'grouper', kg: [3, 14], back: '#6b5444', belly: '#b39a80', fin: '#5a4536', spots: true },
  squid: { name: 'squid', kg: [0.2, 0.8], back: '#c9b3b8', belly: '#efe3e6', fin: '#b89aa2', squid: true },
  boot: { name: 'an old boot', kg: [0.6, 0.6], back: '#3b3129', belly: '#3b3129', fin: '#2a231d', junk: true },
};

/** Which fish might bite at (x, z), weighted. */
function fishHere(x, z, night) {
  const depth = -groundAt(x, z);
  const isl = islandNear(x, z, 60);
  const table = [];
  const add = (k, w) => table.push([k, w]);
  if (isl?.id === 'reef') {
    add('parrotfish', 4);
    add('wrasse', 2);
    add('grouper', depth > 3 ? 1 : 0.2);
  } else if (isl && (isl.id === 'stack' || isl.id === 'sow' || isl.id === 'horseshoe')) {
    add('wrasse', 4);
    add('pollock', 2);
    add('bass', 1.5);
  } else if (depth < 6) {
    add('plaice', 3);
    add('mullet', 3);
    add('bass', 1.5);
  } else {
    add('mackerel', 5);
    add('pollock', 2);
    add('bass', 1);
  }
  if (night) add('squid', 2.5);
  add('boot', 0.25);
  let total = 0;
  for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [k, w] of table) {
    r -= w;
    if (r <= 0) return k;
  }
  return table[0][0];
}

export function rodModel() {
  const parts = [
    paint(segment(V(0, 0, 0), V(0, -1.9, 0), 0.022, 0.008, 5), '#6b4a2a'),
    paint(segment(V(0, 0.05, 0), V(0, -0.35, 0), 0.03, 0.03, 6), '#2a2a2a'), // grip
  ];
  const reel = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10);
  reel.rotateZ(Math.PI / 2);
  reel.translate(0.05, -0.25, 0);
  parts.push(paint(reel, '#9aa0a4'));
  const m = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true;
  m.userData.tip = V(0, -1.9, 0);
  return m;
}

function fishModel(f, kg) {
  const parts = [];
  const len = 0.25 + Math.cbrt(kg) * 0.22;
  if (f.squid) {
    const mantle = new THREE.ConeGeometry(0.06, len, 8);
    mantle.rotateZ(Math.PI / 2);
    parts.push(paint(mantle, f.back));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(paint(segment(V(-len / 2, 0, 0), V(-len / 2 - 0.18, Math.cos(a) * 0.04, Math.sin(a) * 0.04), 0.01, 0.004, 3), f.belly));
    }
  } else if (f.junk) {
    const boot = new THREE.BoxGeometry(0.28, 0.12, 0.1);
    boot.translate(0.04, -0.08, 0);
    const leg = new THREE.BoxGeometry(0.11, 0.24, 0.1);
    leg.translate(-0.06, 0.06, 0);
    parts.push(paint(boot, f.back), paint(leg, f.back));
  } else {
    const body = new THREE.SphereGeometry(1, 10, 7);
    body.scale(len / 2, f.flat ? len * 0.08 : len * 0.17, f.flat ? len * 0.32 : len * 0.09);
    // Dark back, pale belly.
    const flat = body.index ? body.toNonIndexed() : body;
    const p = flat.attributes.position;
    const col = new Float32Array(p.count * 3);
    const back = new THREE.Color(f.back);
    const belly = new THREE.Color(f.belly);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const up = f.flat ? p.getY(i) : p.getY(i);
      c.copy(belly).lerp(back, up > 0 ? 1 : 0);
      if (f.spots && up > 0 && Math.sin(p.getX(i) * 60) * Math.cos(p.getZ(i) * 50) > 0.6) c.multiplyScalar(f.flat ? 1.6 : 0.7);
      if (f.stripes && up > 0 && Math.sin(p.getX(i) * 70 + p.getY(i) * 40) > 0.4) c.multiplyScalar(0.55);
      col.set([c.r, c.g, c.b], i * 3);
    }
    flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
    flat.deleteAttribute('uv');
    parts.push(flat);
    const tail = new THREE.ConeGeometry(len * 0.16, len * 0.24, 4);
    tail.rotateZ(Math.PI / 2);
    tail.scale(1, 1, f.flat ? 1.8 : 0.3);
    tail.translate(-len * 0.58, 0, 0);
    parts.push(paint(tail, f.fin));
    const fin = new THREE.ConeGeometry(len * 0.08, len * 0.18, 3);
    fin.translate(0, len * 0.16, 0);
    if (!f.flat) parts.push(paint(fin, f.fin));
    for (const s of [-1, 1]) {
      const eye = new THREE.SphereGeometry(len * 0.025, 5, 4);
      eye.translate(len * 0.36, len * 0.04, s * (f.flat ? len * 0.06 : len * 0.06));
      parts.push(paint(eye, '#111111'));
    }
  }
  const m = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true;
  return m;
}

export class Fishing {
  constructor({ scene, hud, player, audio }) {
    this.scene = scene;
    this.hud = hud;
    this.player = player;
    this.audio = audio;
    this.state = 'idle'; // idle | cast | wait | bite | reel | show
    this.t = 0;
    this.log = this.#load();

    this.rod = rodModel();
    player.bear.setRod(false, this.rod);

    this.float = new THREE.Group();
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshLambertMaterial({ color: '#d8392b' }));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.061, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f2efe6' }));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4), new THREE.MeshLambertMaterial({ color: '#d8392b' }));
    stick.position.y = 0.08;
    this.float.add(fl, cap, stick);
    this.float.visible = false;
    scene.add(this.float);

    this.line = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3)),
      new THREE.LineBasicMaterial({ color: '#e8e4da', transparent: true, opacity: 0.7 }),
    );
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);

    this.target = V(0, 0, 0);
    this.from = V(0, 0, 0);
    this.catch = null;
    this.shown = null;
  }

  #load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (s && s.counts) return s;
    } catch {
      // ignore
    }
    return { counts: {}, biggest: null, kept: 0 };
  }

  #save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.log));
    } catch {
      // ignore
    }
  }

  get active() {
    return this.state !== 'idle';
  }

  /** Fish caught so far that are still in the cool box (for cooking). */
  get kept() {
    return this.log.kept;
  }

  cookOne() {
    if (this.log.kept <= 0) return false;
    this.log.kept--;
    this.#save();
    return true;
  }

  /** Lines for the catch log on the chart. */
  summary() {
    const rows = Object.entries(this.log.counts).map(([k, n]) => `${FISH[k]?.name ?? k} ×${n}`);
    if (this.log.biggest) rows.push(`biggest: ${this.log.biggest.name}, ${this.log.biggest.kg.toFixed(1)} kg`);
    return rows;
  }

  #tip(out = V(0, 0, 0)) {
    return this.rod.localToWorld(out.copy(this.rod.userData.tip));
  }

  /** Q: cast, strike, or reel in. ctx: { t, waveScale, night, canFish } */
  press(ctx) {
    const P = this.player;
    if (this.state === 'idle') {
      if (!ctx.canFish) return;
      // Where will it land? ~8 m out in front, or further to clear the boat.
      const f = V(Math.sin(P.heading), 0, Math.cos(P.heading));
      this.target.copy(P.pos).addScaledVector(f, 8);
      if (ctx.onBoat?.(this.target)) this.target.addScaledVector(f, 6);
      if (ctx.onBoat?.(this.target)) {
        this.hud.say('Face the water to cast.');
        return;
      }
      const depth = heightAt(this.target.x, this.target.z, ctx.t, ctx.waveScale) - groundAt(this.target.x, this.target.z);
      if (depth < 0.6) {
        this.hud.say('Too shallow to fish there. Face the water.');
        return;
      }
      this.state = 'cast';
      this.t = 0;
      P.bear.setRod(true);
      P.vel.set(0, 0, 0);
    } else if (this.state === 'bite') {
      // Struck in time.
      this.state = 'reel';
      this.t = 0;
      this.audio?.splash(0.35, 1200, 0.4);
    } else if (this.state === 'wait') {
      this.hud.say('Reeled in. Nothing.');
      this.stop();
    } else if (this.state === 'show') {
      this.#finishShow();
    }
  }

  stop() {
    this.state = 'idle';
    this.float.visible = false;
    this.line.visible = false;
    this.player.bear.setRod(false);
    this.player.animOverride = null;
    this.player.effort = 0;
    if (this.shown) this.#finishShow();
  }

  #finishShow() {
    if (this.shown) {
      this.shown.removeFromParent();
      this.shown = null;
    }
    if (this.state === 'show') this.stop();
  }

  update(dt, ctx) {
    if (this.state === 'idle') return;
    const P = this.player;
    // Walking off, swimming or anything else puts the rod away.
    if (P.mode !== 'ground' || P.speed > 0.6 || P.carrying) {
      this.stop();
      return;
    }
    this.t += dt;
    const tip = this.#tip();
    const water = heightAt(this.target.x, this.target.z, ctx.t, ctx.waveScale);
    P.animOverride = this.state === 'cast' ? 'cast' : this.state === 'show' ? 'carry' : 'fish';

    if (this.state === 'cast') {
      P.effort = Math.min(1, this.t / 0.7);
      if (this.t > 0.45) {
        // The float flies out in an arc.
        const k = Math.min(1, (this.t - 0.45) / 0.6);
        if (!this.float.visible) {
          this.from.copy(tip);
          this.float.visible = true;
          this.line.visible = true;
        }
        this.float.position.lerpVectors(this.from, V(this.target.x, water, this.target.z), k);
        this.float.position.y += Math.sin(k * Math.PI) * 2.5;
        if (k >= 1) {
          this.state = 'wait';
          this.t = 0;
          this.biteAt = 3 + Math.random() * 9;
          this.audio?.splash(0.2, 1600, 0.3);
        }
      }
    } else if (this.state === 'wait' || this.state === 'bite') {
      this.float.position.set(this.target.x, water, this.target.z);
      if (this.state === 'wait') {
        // Little twitches before the real bite.
        this.float.position.y -= this.t > this.biteAt - 1.2 && Math.sin(this.t * 22) > 0.85 ? 0.04 : 0;
        if (this.t >= this.biteAt) {
          this.state = 'bite';
          this.t = 0;
          this.catch = fishHere(this.target.x, this.target.z, ctx.night);
          this.audio?.splash(0.3, 1400, 0.35);
        }
      } else {
        // Under it goes: strike now.
        this.float.position.y -= 0.12 + Math.sin(this.t * 18) * 0.05;
        if (this.t > 1.4) {
          this.hud.say('It got away.');
          this.state = 'wait';
          this.t = 0;
          this.biteAt = 4 + Math.random() * 8;
        }
      }
    } else if (this.state === 'reel') {
      // Wind it in, the fish thrashing on the way.
      const k = Math.min(1, this.t / 2.2);
      const near = V(P.pos.x, 0, P.pos.z).lerp(V(this.target.x, 0, this.target.z), 0.12);
      const x = THREE.MathUtils.lerp(this.target.x, near.x, k);
      const z = THREE.MathUtils.lerp(this.target.z, near.z, k);
      this.float.position.set(x + Math.sin(this.t * 13) * 0.15 * (1 - k), heightAt(x, z, ctx.t, ctx.waveScale) - 0.05, z);
      if (Math.random() < dt * 3) this.audio?.splash(0.12, 1800, 0.2);
      if (k >= 1) this.#land();
    } else if (this.state === 'show') {
      // Turn round to show it off.
      if (ctx.camYaw !== undefined) {
        const d = Math.atan2(Math.sin(ctx.camYaw - P.heading), Math.cos(ctx.camYaw - P.heading));
        P.heading += d * (1 - Math.exp(-dt * 6));
      }
      if (this.t > 3) this.#finishShow();
    }

    // The line: a sagging curve from the rod tip to the float.
    if (this.line.visible) {
      const a = this.#tip();
      const b = this.float.position;
      const arr = this.line.geometry.attributes.position.array;
      for (let i = 0; i < 16; i++) {
        const k = i / 15;
        arr[i * 3] = a.x + (b.x - a.x) * k;
        arr[i * 3 + 1] = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * (this.state === 'reel' ? 0.1 : 0.5);
        arr[i * 3 + 2] = a.z + (b.z - a.z) * k;
      }
      this.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  #land() {
    const key = this.catch ?? 'mackerel';
    const f = FISH[key];
    const kg = f.kg[0] + (f.kg[1] - f.kg[0]) * Math.random() ** 2;
    this.float.visible = false;
    this.line.visible = false;
    this.state = 'show';
    this.t = 0;
    this.player.bear.setRod(false);
    this.player.animOverride = 'carry';
    // Hold it up for a moment.
    const m = fishModel(f, kg);
    m.position.set(0, 0.95, 0.42);
    m.rotation.set(0, Math.PI / 2, 0.25);
    this.player.bear.root.add(m);
    this.shown = m;
    if (f.junk) {
      this.hud.say('An old boot.', 3);
    } else {
      this.log.counts[key] = (this.log.counts[key] ?? 0) + 1;
      this.log.kept++;
      if (!this.log.biggest || kg > this.log.biggest.kg) this.log.biggest = { name: f.name, kg };
      this.#save();
      const article = /^[aeiou]/.test(f.name) ? 'An' : 'A';
      this.hud.say(`${article} ${f.name}. ${kg.toFixed(1)} kg.`, 3);
    }
  }
}

export { FISH };
