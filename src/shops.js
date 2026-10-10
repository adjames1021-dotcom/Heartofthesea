import * as THREE from 'three';
import { SHOPS, shelvesAt, openAt, words, tag, goodsName } from '../shared/trade.js';
import { VILLAGERS } from '../shared/villages.js';
import { dayAt } from '../shared/environment.js';
import { worldTime } from './clock.js';
import { goodsModel, priceTag } from './goods3d.js';

// Shops you walk round. The day's goods sit where they'd sit (on the
// shelves, in baskets, on hooks), each with a price on a scrap of card. Pick
// a thing up, carry it to the counter and put it down; the keeper tells you
// what it comes to. Pay at the counter, or walk off and they go back. When the
// keeper's gone home the stall's covered over.
//
// The server decides (worker/rules.js buy): what's out today and what you've
// already bought come from shared/trade.js, so the shelves here and the
// server's count always agree.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _p = new THREE.Vector3();

class Shop {
  constructor(id, def, anchors, parent, talk, progress) {
    this.id = id;
    this.def = def;
    this.anchors = anchors;
    this.talk = talk;
    this.progress = progress;
    this.keeperName = VILLAGERS[def.keeper].name.split(' ')[0];
    this.group = new THREE.Group();
    this.group.name = `shop:${id}`;
    parent.add(this.group);
    const F = anchors.frame;
    this.F = F;
    // Where each place for goods is: shelves two to a board, baskets, hooks.
    const shelfPts = anchors.shelves.flatMap(({ a, b }) => [a.clone().lerp(b, 0.27), a.clone().lerp(b, 0.73)]);
    const pools = { shelf: shelfPts, table: (anchors.table ?? []).map((p) => p.clone()), basket: anchors.baskets.map((p) => p.clone()), hook: anchors.hooks.slice(anchors.hookFrom ?? 1).map((p) => p.clone()) };
    const used = { shelf: 0, table: 0, basket: 0, hook: 0 };
    this.slots = def.slots.map((type) => {
      const pos = pools[type][used[type]++] ?? anchors.counter[0].clone();
      const g = new THREE.Group();
      g.position.copy(pos);
      this.group.add(g);
      return { type, pos, group: g, shown: null };
    });
    this.counterAt = anchors.counter[0].clone();
    this.centre = F.at(0, 0);
    this.counter = []; // places you've brought things from, in order
    this.held = null; // { slot, mesh }
    this.counterGroup = new THREE.Group();
    this.group.add(this.counterGroup);
    this.cover = this.#cover();
    this.group.add(this.cover);
    this.open = null; // (not known till the first update, so a shop shut at the start gets covered)
    progress.onChange(() => (this.dirty = true));
    this.dirty = true;
  }

  /** A cloth thrown over the counter and the shelves (or the whole table) when it's shut. */
  #cover() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: '#8f8470', side: THREE.DoubleSide });
    const c = this.anchors.cloth?.at ?? this.counterAt;
    const along = this.F.Vv;
    const cloth = new THREE.PlaneGeometry(this.anchors.cloth?.w ?? 2.7, this.anchors.cloth?.d ?? 0.9, 6, 2);
    const p = cloth.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3) * 0.03 - Math.abs(p.getY(i)) * 0.1);
    const m = new THREE.Mesh(cloth, mat);
    m.position.copy(c).add(V(0, 0.02, 0));
    m.lookAt(m.position.clone().add(V(0, 1, 0)));
    m.rotateZ(Math.atan2(along.z, along.x));
    g.add(m);
    for (const s of this.anchors.shelves.filter((_, i) => i % 3 === 2)) {
      const top = s.a.clone().lerp(s.b, 0.5);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.4, 3, 3), mat);
      sheet.position.copy(top).addScaledVector(this.F.U, 0.22).add(V(0, -0.6, 0));
      sheet.lookAt(sheet.position.clone().add(this.F.U));
      g.add(sheet);
    }
    g.visible = false;
    return g;
  }

  /** How many of a place's goods are still on it (less what's on the counter or in your paws). */
  #left(i) {
    const st = this.stock?.[i];
    if (!st) return 0;
    return st.left - this.counter.filter((k) => k === i).length - (this.held?.slot === i ? 1 : 0);
  }

  /** Lay the shelves out as they are now. */
  #layout() {
    this.slots.forEach((sl, i) => {
      const st = this.stock?.[i];
      const n = Math.min(3, Math.max(0, this.#left(i)));
      const key = st && n > 0 ? `${st.kind}:${n}:${st.price}` : '';
      if (sl.shown === key) return;
      sl.shown = key;
      sl.group.clear();
      if (!key) return;
      const hung = sl.type === 'hook';
      for (let k = 0; k < n; k++) {
        const m = goodsModel(st.kind, hung);
        if (hung) m.position.set(0, -0.02 - k * 0.02, 0).addScaledVector(this.F.Vv, (k - (n - 1) / 2) * 0.06);
        else if (sl.type === 'basket') m.position.set(Math.sin(k * 2.4) * 0.09, k * 0.04 - 0.08, Math.cos(k * 2.4) * 0.09);
        else if (sl.type === 'table') m.position.copy(this.F.Vv.clone().multiplyScalar((k - (n - 1) / 2) * 0.1)).addScaledVector(this.F.U, (k % 2) * 0.05 - 0.02);
        else m.position.copy(this.F.Vv.clone().multiplyScalar((k - (n - 1) / 2) * 0.13));
        m.rotation.y = k * 1.7;
        sl.group.add(m);
      }
      // The price, on a bit of card propped against it (or hung on a string).
      const t = priceTag(tag(st.price));
      if (hung) t.position.set(0, 0.06, 0).addScaledVector(this.F.U, 0.06);
      else t.position.copy(this.F.U.clone().multiplyScalar(sl.type === 'basket' ? 0.3 : sl.type === 'table' ? 0.11 : 0.14)).add(V(0, sl.type === 'basket' ? 0.05 : 0.04, 0));
      t.lookAt(t.position.clone().add(this.F.U).add(V(0, 0.4, 0)));
      t.rotateZ(((i * 37) % 9) * 0.03 - 0.12);
      sl.group.add(t);
    });
    // On the counter, in a row.
    this.counterGroup.clear();
    this.counter.forEach((i, k) => {
      const m = goodsModel(this.stock[i].kind);
      m.position.copy(this.anchors.counterSpot(k)).add(V(0, 0.01, 0));
      m.rotation.y = k;
      this.counterGroup.add(m);
    });
  }

  get total() {
    return this.counter.reduce((t, i) => t + (this.stock[i]?.price ?? 0), 0);
  }

  #say(text) {
    this.talk.say(this.keeperName, text);
  }

  /** Put everything back where it came from. */
  #putAllBack(why = null) {
    const had = this.counter.length || this.held;
    if (this.held) this.held.mesh.removeFromParent();
    this.held = null;
    this.counter = [];
    this.dirty = true;
    if (had && why) this.#say(why);
  }

  /** What E would do here, if anything. */
  interaction(player) {
    const near = (p, r) => Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < r && Math.abs(p.y - player.pos.y) < 2.2;
    if (!this.open) return null;
    if (this.held) {
      if (near(this.counterAt, 1.5)) return { key: 'E', label: 'Put it on the counter', act: () => this.#toCounter() };
      return { key: 'E', label: 'Put it back', act: () => this.#putAllBack() };
    }
    if (this.counter.length && near(this.counterAt, 1.6)) return { key: 'E', label: `Pay ${words(this.total)}`, act: () => this.#pay() };
    let best = null;
    let bd = 1.15;
    this.slots.forEach((sl, i) => {
      if (this.#left(i) <= 0) return;
      const d = Math.hypot(sl.pos.x - player.pos.x, sl.pos.z - player.pos.z);
      if (d < bd && Math.abs(sl.pos.y - player.pos.y) < 2) {
        bd = d;
        best = i;
      }
    });
    if (best === null) return null;
    const kind = this.stock[best].kind;
    return { key: 'E', label: `Pick up ${goodsName(kind)}`, act: () => this.#pickUp(best) };
  }

  #pickUp(i) {
    const mesh = goodsModel(this.stock[i].kind);
    this.group.add(mesh);
    this.held = { slot: i, mesh };
    this.dirty = true;
  }

  #toCounter() {
    const i = this.held.slot;
    this.held.mesh.removeFromParent();
    this.held = null;
    this.counter.push(i);
    this.dirty = true;
    const s = this.def.says;
    this.#say(this.counter.length === 1 ? s.first(this.total) : s.more(this.total, this.counter.length));
  }

  async #pay() {
    const s = this.def.says;
    const total = this.total;
    const slots = [...this.counter];
    const purse = this.progress.state?.pence ?? 0;
    if (purse < total) {
      this.#putAllBack(s.short(total - purse));
      return;
    }
    let r = null;
    try {
      r = await this.progress.act('buy', { shop: this.id, slots });
    } catch {
      r = null;
    }
    if (r?.ok) {
      this.counter = [];
      this.dirty = true;
      this.#say(s.thanks[Math.floor(Math.random() * s.thanks.length)]);
    } else if (r?.why === 'full') this.#putAllBack(s.full);
    else if (r?.why === 'short') this.#putAllBack(s.short(Math.max(1, total - (this.progress.state?.pence ?? 0))));
    else this.#putAllBack(s.back);
  }

  update(dt, { player, hours, t, camera }) {
    // The goods and their tags are small: past a stone's throw, don't draw them.
    const eye = camera?.position ?? player.pos;
    this.group.visible = Math.hypot(eye.x - this.centre.x, eye.z - this.centre.z) < 28;
    const open = openAt(this.id, hours);
    if (open !== this.open) {
      this.open = open;
      if (!open) this.#putAllBack();
      this.cover.visible = !open;
      this.group.children.forEach((c) => c !== this.cover && (c.visible = open));
      this.dirty = true;
    }
    const day = dayAt(t);
    if (day !== this.day) {
      this.day = day;
      this.#putAllBack();
      this.dirty = true;
    }
    if (this.dirty) {
      this.stock = shelvesAt(this.id, t, this.progress.state);
      this.dirty = false;
      this.#layout();
    }
    if (!open) return;
    // What's in your paws goes along with you.
    if (this.held) {
      const f = V(Math.sin(player.heading), 0, Math.cos(player.heading));
      _p.copy(player.pos).addScaledVector(f, 0.38).add(V(0, 0.72, 0));
      this.held.mesh.position.lerp(_p, Math.min(1, dt * 20));
      this.held.mesh.rotation.y = player.heading;
    }
    // Walk off with it and it goes back (and you hear about it).
    const away = Math.hypot(player.pos.x - this.centre.x, player.pos.z - this.centre.z) > 7.5;
    if (away && this.held) this.#putAllBack(this.def.says.oi);
    else if (away && this.counter.length) this.#putAllBack(this.def.says.back);
  }
}

export class Shops {
  constructor({ villages, progress, talk }) {
    this.list = [];
    for (const [id, def] of Object.entries(SHOPS)) {
      const hv = villages.hand.find((h) => h.id === def.village);
      const anchors = hv?.goods?.[id];
      if (!anchors) continue;
      this.list.push(new Shop(id, def, anchors, hv.detail, talk, progress));
    }
  }

  /** Are you holding something from a shop? */
  get holding() {
    return this.list.some((s) => s.held);
  }

  interaction(player) {
    if (player.carrying || player.mode !== 'ground') return null;
    for (const s of this.list) {
      const it = s.interaction(player);
      if (it) return it;
    }
    return null;
  }

  update(dt, { player, hours, camera }) {
    const t = worldTime();
    for (const s of this.list) s.update(dt, { player, hours, t, camera });
  }
}
