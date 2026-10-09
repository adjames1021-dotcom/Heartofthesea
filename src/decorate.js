import * as THREE from 'three';
import { ITEMS } from '../shared/items.js';
import { cabinLayout, decorable } from '../shared/decor.js';
import { describe } from '../shared/food.js';
import { paint, mergeParts, segment } from './props.js';
import { keepsake } from './finds.js';

// Decorating the cabin. Everything you've found is on show below decks
// (shared/decor.js says where it first goes). Walk up to something and pick
// it up; it then follows the mouse over whatever's under it (a table, a
// shelf, the floor, a wall) and sits on it or hangs from it. Q or the wheel
// turns it; E or a click puts it down; Esc puts it back. The locker under
// the berth holds what isn't out. Things rock a little with the boat.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const BRASS = '#c09a48';
const GOLD = '#d4af4a';
const SILVER = '#c8ccd0';

function meshOf(parts) {
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = true;
  return m;
}

/** Models for the things that aren't finds: the cork float and what came out of chests. */
function valuableModel(kind) {
  const p = [];
  switch (kind) {
    case 'corkfloat': {
      const c = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10);
      c.translate(0, 0.025, 0);
      p.push(paint(c, '#b98d58'));
      p.push(paint(segment(V(0, 0.03, -0.06), V(0, 0.03, 0.06), 0.008, 0.008, 4), '#cf6a2e'));
      break;
    }
    case 'shillings': {
      const bag = new THREE.SphereGeometry(0.06, 8, 6);
      bag.scale(1, 0.75, 1);
      bag.translate(0, 0.045, 0);
      p.push(paint(bag, '#6e4a2c'));
      p.push(paint(segment(V(0, 0.09, 0), V(0, 0.11, 0), 0.02, 0.012, 6), '#5a3c22'));
      for (let i = 0; i < 3; i++) {
        const coin = new THREE.CylinderGeometry(0.014, 0.014, 0.003, 10);
        coin.translate(0.08 + i * 0.012, 0.002 + i * 0.003, 0.02);
        p.push(paint(coin, SILVER));
      }
      break;
    }
    case 'watch': {
      const w = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14);
      w.translate(0, 0.006, 0);
      const face = new THREE.CircleGeometry(0.025, 14);
      face.rotateX(-Math.PI / 2);
      face.translate(0, 0.0125, 0);
      p.push(paint(w, GOLD), paint(face, '#f4efe0'));
      p.push(paint(segment(V(0, 0.01, -0.03), V(0.02, 0.004, -0.09), 0.003, 0.003, 3), GOLD));
      break;
    }
    case 'ring': {
      const r = new THREE.TorusGeometry(0.012, 0.004, 5, 12);
      r.rotateX(Math.PI / 2);
      r.translate(0, 0.004, 0);
      p.push(paint(r, GOLD));
      break;
    }
    case 'snuffbox': {
      const b = new THREE.BoxGeometry(0.07, 0.022, 0.045);
      b.translate(0, 0.011, 0);
      p.push(paint(b, SILVER));
      break;
    }
    case 'candlesticks': {
      for (const s of [-1, 1]) {
        const base = new THREE.CylinderGeometry(0.035, 0.04, 0.012, 10);
        base.translate(s * 0.07, 0.006, 0);
        p.push(paint(base, BRASS), paint(segment(V(s * 0.07, 0.01, 0), V(s * 0.07, 0.15, 0), 0.012, 0.01, 8), BRASS));
        const cup = new THREE.CylinderGeometry(0.02, 0.012, 0.02, 8);
        cup.translate(s * 0.07, 0.16, 0);
        p.push(paint(cup, BRASS), paint(segment(V(s * 0.07, 0.17, 0), V(s * 0.07, 0.25, 0), 0.011, 0.011, 8), '#efe8d6'));
      }
      break;
    }
    case 'pearls': {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        const b = new THREE.IcosahedronGeometry(0.007, 0);
        b.translate(Math.cos(a) * 0.05, 0.007, Math.sin(a) * 0.035);
        p.push(paint(b, '#f2ede2'));
      }
      break;
    }
    case 'buttons': {
      const card = new THREE.BoxGeometry(0.09, 0.004, 0.12);
      card.translate(0, 0.002, 0);
      p.push(paint(card, '#e8e0cc'));
      for (let i = 0; i < 6; i++) {
        const b = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 8);
        b.translate(-0.02 + (i % 2) * 0.04, 0.006, -0.04 + Math.floor(i / 2) * 0.04);
        p.push(paint(b, GOLD));
      }
      break;
    }
    case 'sextant': {
      const arc = new THREE.TorusGeometry(0.12, 0.008, 4, 12, Math.PI / 3);
      arc.rotateZ(Math.PI / 3);
      arc.translate(0, 0.0, 0);
      p.push(paint(arc, BRASS));
      for (const a of [Math.PI / 3, (2 * Math.PI) / 3]) p.push(paint(segment(V(0, 0.12, 0), V(Math.cos(a) * 0.12, 0.12 - Math.sin(a) * 0.12 + 0.0, 0), 0.006, 0.006, 4), BRASS));
      p.push(paint(segment(V(0, 0.12, 0), V(0.02, 0.0, 0), 0.006, 0.006, 4), BRASS));
      p.push(paint(segment(V(0.03, 0.09, 0), V(0.03, 0.09, 0.05), 0.012, 0.012, 8), '#3a3a3a'));
      const m = meshOf(p);
      m.position.y = 0.0;
      return m;
    }
    default:
      return null;
  }
  return meshOf(p);
}

/** Whatever this is, as it sits in the cabin. */
export function decorModel(kind) {
  const o = keepsake(kind) ?? valuableModel(kind);
  if (!o) return null;
  const g = new THREE.Group();
  g.add(o);
  if (kind === 'nameboard') {
    o.rotation.order = 'YXZ';
    o.scale.setScalar(0.5);
  }
  return g;
}

export class Decorating {
  constructor({ interior, progress, hud, camera, canvas }) {
    this.interior = interior;
    this.progress = progress;
    this.hud = hud;
    this.camera = camera;
    this.canvas = canvas;
    this.objects = new Map(); // item id → { obj, entry, sway }
    this.layout = [];
    this.visiting = null; // someone else's layout, when you're visiting
    this.holding = null; // { id, kind, obj, from, yaw, at, wall, ok }
    this.mouse = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    addEventListener('mousemove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
    canvas.addEventListener('wheel', (e) => {
      if (this.holding) this.holding.yaw += Math.sign(e.deltaY) * (Math.PI / 8);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.holding && e.button === 0) {
        e.stopImmediatePropagation();
        this.putDown();
      }
    }, { capture: true });
    // The locker under the berth (src/interior.js), and its card.
    this.card = document.createElement('div');
    this.card.className = 'talk cook';
    this.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) this.choose(Number(b.dataset.pick));
    });
    document.body.appendChild(this.card);
    this.lockerOpen = false;
    progress.onChange(() => !this.visiting && this.sync(cabinLayout(progress.state ?? {})));
    this.sync(cabinLayout(progress.state ?? {}));
  }

  /** Show someone else's cabin instead (a visit). */
  visit(layout) {
    this.visiting = layout;
    this.sync(layout);
  }

  /** Make what's in the cabin match a layout. */
  sync(layout) {
    this.layout = layout;
    const keep = new Set();
    for (const e of layout) {
      if (this.holding?.id === e.item) {
        keep.add(e.item);
        continue;
      }
      let o = this.objects.get(e.item);
      if (!o || o.entry.kind !== e.kind) {
        if (o) this.interior.group.remove(o.obj);
        const obj = decorModel(e.kind);
        if (!obj) continue;
        this.interior.group.add(obj);
        o = { obj, entry: e, sway: { a: 0, v: 0, b: 0, w: 0 } };
        this.objects.set(e.item, o);
      }
      o.entry = e;
      o.obj.position.set(...e.at);
      o.obj.rotation.set(0, e.yaw, 0);
      keep.add(e.item);
    }
    for (const [id, o] of this.objects) {
      if (keep.has(id)) continue;
      this.interior.group.remove(o.obj);
      this.objects.delete(id);
    }
  }

  /** Something on show close enough to pick up (cabin-local positions). */
  near(pos) {
    if (this.visiting || this.holding) return null;
    const p = this.interior.toLocal(pos);
    let best = null;
    let bd = 1.45;
    for (const [id, o] of this.objects) {
      const a = o.entry.at;
      const d = Math.hypot(a[0] - p.x, a[2] - p.z);
      if (d < bd && a[1] - p.y < 1.9) {
        bd = d;
        best = { id, d, kind: o.entry.kind, label: `Pick up the ${ITEMS[o.entry.kind].name.replace(/^the /, '')}` };
      }
    }
    return best;
  }

  nearLocker(pos) {
    if (this.visiting) return false;
    return this.interior.nearLocker(pos);
  }

  /** Pick something up off its place (or out of the locker). */
  pickUp(id) {
    const it = (this.progress.state?.items ?? []).find((i) => i.id === id);
    if (!it || !decorable(it.kind)) return;
    let o = this.objects.get(id);
    if (!o) {
      const obj = decorModel(it.kind);
      if (!obj) return;
      this.interior.group.add(obj);
      o = { obj, entry: null, sway: { a: 0, v: 0, b: 0, w: 0 } };
      this.objects.set(id, o);
    }
    this.holding = { id, kind: it.kind, obj: o.obj, from: o.entry, yaw: o.entry?.yaw ?? 0, at: o.entry?.at ?? null, wall: !!o.entry?.wall, ok: !!o.entry };
    // Free the mouse so it can be moved about.
    if (document.pointerLockElement) document.exitPointerLock();
  }

  async putDown() {
    const h = this.holding;
    if (!h) return;
    if (!h.ok) {
      this.hud.say("It won't go there.", 1.5);
      return;
    }
    this.holding = null;
    const at = h.obj.position.toArray();
    const yaw = h.obj.rotation.y;
    try {
      const r = await this.progress.act('place', { item: h.id, at, yaw, wall: h.wall });
      if (!r?.ok) this.hud.say("It won't go there.", 1.5);
    } catch {
      // offline: it stays where it's put for now
    }
    this.sync(cabinLayout(this.progress.state ?? {}));
  }

  /** Put it back where it was. */
  cancel() {
    if (!this.holding) return;
    this.holding = null;
    this.sync(this.layout);
  }

  async stow() {
    const h = this.holding;
    if (!h) return;
    this.holding = null;
    await this.progress.act('stow', { item: h.id }).catch(() => null);
    this.sync(cabinLayout(this.progress.state ?? {}));
  }

  // ---- The locker card ----

  #inLocker() {
    const shown = new Set(this.layout.map((e) => e.item));
    return (this.progress.state?.items ?? []).filter((i) => decorable(i.kind) && !shown.has(i.id));
  }

  openLocker() {
    this.lockerOpen = true;
    this.#render();
  }

  closeLocker() {
    this.lockerOpen = false;
    this.card.classList.remove('show');
  }

  #render() {
    const things = this.#inLocker().slice(0, 8);
    this.opts = things.map((it) => ({ say: `Take out ${describe(it)}`, go: () => { this.closeLocker(); this.pickUp(it.id); } }));
    this.opts.push({ say: 'Shut it', go: () => this.closeLocker() });
    this.card.innerHTML = `
      <div class="who">The locker</div>
      <p class="said">${things.length ? 'Things put by.' : 'Nothing in here but a spare jumper.'}</p>
      <div class="replies">${this.opts.map((o, i) => `<button type="button" data-pick="${i}"><kbd>${i + 1}</kbd>${esc(o.say)}</button>`).join('')}</div>`;
    this.card.classList.add('show');
  }

  choose(i) {
    this.opts?.[i]?.go();
  }

  /** Where the thing you're holding would go: the surface under the mouse. */
  #aim() {
    const h = this.holding;
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.ray.intersectObject(this.interior.mesh, false)[0];
    if (!hit || !hit.face) return;
    // In the cabin's own frame (the mesh isn't turned within it), facing the camera.
    const toward = (h, from) => (h.face.normal.dot(from) > 0 ? h.face.normal.clone().negate() : h.face.normal.clone());
    let p = this.interior.toLocal(hit.point);
    let n = toward(hit, p.clone().sub(this.interior.toLocal(this.ray.ray.origin)));
    if (Math.abs(n.y) < 0.35) {
      // The lip of a shelf or a fiddle rail: if there's a top just behind it, use that.
      this.down ??= new THREE.Raycaster();
      const from = this.interior.toWorld(p.clone().addScaledVector(n, -0.09).add(V(0, 0.2, 0)));
      const below = this.interior.toWorld(p.clone().addScaledVector(n, -0.09).add(V(0, -0.2, 0))).sub(from).normalize();
      this.down.set(from, below);
      this.down.far = 0.4;
      const top = this.down.intersectObject(this.interior.mesh, false)[0];
      if (top?.face) {
        const tn = toward(top, V(0, -1, 0));
        if (tn.y > 0.6) {
          n = tn;
          p = this.interior.toLocal(top.point);
        }
      }
    }
    if (n.y > 0.6) {
      h.wall = false;
      h.obj.position.copy(p);
      h.obj.rotation.set(0, h.yaw, 0);
      h.ok = true;
    } else if (Math.abs(n.y) < 0.35 && p.y > 0.25) {
      // On a wall: hung flat against it, facing out.
      h.wall = true;
      p.addScaledVector(n, 0.03);
      h.obj.position.copy(p);
      h.obj.rotation.set(0, Math.atan2(n.x, n.z), 0);
      h.ok = true;
    }
  }

  /** Each frame: aim what you're holding, the locker card's keys, and things rocking with the boat. */
  update(dt, { input, boat, player, inside }) {
    if (this.lockerOpen) {
      for (let i = 0; i < 9; i++) if (input.pressed(`Digit${i + 1}`, `Numpad${i + 1}`)) this.choose(i);
      if (input.pressed('Escape') || !inside || !this.nearLocker(player.pos)) this.closeLocker();
    }
    if (this.holding) {
      if (!inside) this.cancel();
      else {
        if (input.pressed('KeyQ')) this.holding.yaw += Math.PI / 8;
        if (input.pressed('Escape')) this.cancel();
        else this.#aim();
      }
    }
    if (!inside) return;
    // The boat's heel and pitch, and things answering them: standing things
    // rock a little on their bases; hung things swing.
    const m = boat.matrix.elements;
    const pitch = Math.asin(Math.max(-1, Math.min(1, m[1])));
    const roll = Math.asin(Math.max(-1, Math.min(1, m[9])));
    for (const [id, o] of this.objects) {
      if (this.holding?.id === id || !o.entry) continue;
      const s = o.sway;
      const hung = o.entry.wall;
      const ta = hung ? -roll * 0.9 : roll * 0.12;
      const tb = hung ? -pitch * 0.9 : pitch * 0.12;
      const k = hung ? 9 : 30;
      s.v += ((ta - s.a) * k - s.v * 2.2) * dt;
      s.w += ((tb - s.b) * k - s.w * 2.2) * dt;
      s.a += s.v * dt;
      s.b += s.w * dt;
      o.obj.rotation.set(s.a, o.entry.yaw, s.b, 'YXZ');
    }
  }
}
