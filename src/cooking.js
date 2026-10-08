import * as THREE from 'three';
import { ITEMS } from '../shared/items.js';
import { VESSELS, ROOM, EFFECTS, RECIPES, windowFor, cookable, describe, sameKey } from '../shared/food.js';
import { paint, mergeParts, segment } from './props.js';
import { foodModel, tint } from './food3d.js';
import { worldTime } from './clock.js';

// Cooking. The galley stove has a pan and a pot; the fire in Head Cove has a
// griddle once it's lit. Put things in and they start cooking; take them off
// when they look and sound right. There's no timer and no bar: raw fish is
// pale and barely hisses, done is golden and sizzling, and burnt is black,
// smoking and crackling. The server keeps the time and has the last word.
//
// A small card (like talking) chooses what goes in, and what to eat.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ironMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function panModel(r = 0.13) {
  const pan = new THREE.CylinderGeometry(r, r * 0.86, 0.035, 18, 1, true);
  const base = new THREE.CircleGeometry(r * 0.86, 18);
  base.rotateX(-Math.PI / 2);
  base.translate(0, -0.012, 0);
  const handle = segment(V(r, 0.01, 0), V(r + 0.17, 0.035, 0), 0.012, 0.01, 5);
  const m = new THREE.Mesh(mergeParts([paint(pan, '#2b2a28'), paint(base, '#57524c'), paint(handle, '#2b2a28')]), ironMat);
  m.material = m.material.clone();
  m.material.side = THREE.DoubleSide;
  return m;
}

function potModel() {
  const wall = new THREE.CylinderGeometry(0.105, 0.095, 0.15, 16, 1, true);
  wall.translate(0, 0.075, 0);
  const base = new THREE.CircleGeometry(0.095, 16);
  base.rotateX(-Math.PI / 2);
  const parts = [paint(wall, '#3a3d40'), paint(base, '#2a2c2e')];
  for (const s of [-1, 1]) {
    const h = new THREE.TorusGeometry(0.025, 0.007, 4, 8, Math.PI);
    h.rotateY(Math.PI / 2);
    h.translate(s * 0.11, 0.12, 0);
    parts.push(paint(h, '#3a3d40'));
  }
  const m = new THREE.Mesh(mergeParts(parts), ironMat.clone());
  m.material.side = THREE.DoubleSide;
  // The stew's surface, and bubbles on it.
  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.098, 16), new THREE.MeshLambertMaterial({ color: '#a7b6b0' }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.1;
  surface.visible = false;
  m.add(surface);
  const bubbles = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshLambertMaterial({ color: '#d8d2c0' }));
    b.visible = false;
    m.add(b);
    bubbles.push(b);
  }
  return { mesh: m, surface, bubbles };
}

/** Puffs of smoke or steam, from a small pool. */
class Puffs {
  constructor(parent) {
    this.list = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.028, 1), new THREE.MeshBasicMaterial({ color: '#8a8580', transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      parent.add(m);
      this.list.push({ m, life: 0 });
    }
    this.t = 0;
  }

  /** rate: puffs a second; dark: 0 steam … 1 smoke. at: local position of the source. */
  update(dt, rate, dark, at) {
    this.t -= dt * rate;
    if (rate > 0 && this.t <= 0) {
      this.t = 1;
      const p = this.list.find((q) => q.life <= 0);
      if (p) {
        p.life = 1;
        p.m.position.set(at.x + (Math.random() - 0.5) * 0.08, at.y + 0.04, at.z + (Math.random() - 0.5) * 0.08);
        p.m.material.color.setRGB(0.92 - 0.6 * dark, 0.91 - 0.6 * dark, 0.9 - 0.6 * dark);
        p.dark = dark;
        p.m.visible = true;
      }
    }
    for (const p of this.list) {
      if (p.life <= 0) continue;
      p.life -= dt / (1.6 + p.dark);
      p.m.position.y += dt * (0.25 + 0.15 * p.dark);
      p.m.position.x += dt * 0.03;
      p.m.scale.setScalar(1 + (1 - p.life) * (1.5 + 2.5 * p.dark));
      p.m.material.opacity = Math.max(0, p.life) * (0.18 + 0.32 * p.dark);
      if (p.life <= 0) p.m.visible = false;
    }
  }
}

export class Cooking {
  constructor({ progress, hud, audio, interior, villages }) {
    this.progress = progress;
    this.hud = hud;
    this.audio = audio;
    this.interior = interior;
    this.places = {};
    // The galley stove: pan on the front burner, pot on the back one.
    const st = interior.stove;
    const panG = panModel();
    panG.position.set(st.x + 0.12, 0.95, st.z + 0.1);
    const pot = potModel();
    pot.mesh.position.set(st.x + 0.12, 0.94, st.z - 0.11);
    interior.group.add(panG, pot.mesh);
    const flame = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 4, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.9, 2.4) }));
    flame.rotation.x = Math.PI / 2;
    const flame2 = flame.clone();
    flame.position.set(st.x + 0.12, 0.922, st.z + 0.1);
    flame2.position.set(st.x + 0.12, 0.922, st.z - 0.1);
    interior.group.add(flame, flame2);
    this.places.galley = {
      name: 'The stove',
      parent: interior.group,
      vessels: { pan: { mesh: panG, food: [], flame }, pot: { mesh: pot.mesh, pot, food: [], flame: flame2 } },
      puffs: new Puffs(interior.group),
    };
    // Each village fire: a griddle on the stones.
    for (const fire of villages.fires) {
      const g = panModel(0.2);
      g.position.set(0.42, 0.24, -0.38);
      g.rotation.y = 2.4;
      fire.group.add(g);
      this.places[`fire:${fire.village}`] = { name: 'The fire', parent: fire.group, fire, vessels: { pan: { mesh: g, food: [] } }, puffs: new Puffs(fire.group) };
    }
    this.card = document.createElement('div');
    this.card.className = 'talk cook';
    this.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) this.choose(Number(b.dataset.pick));
    });
    document.body.appendChild(this.card);
    this.at = null; // the place the card's open at
    this.vessel = 'pan';
    this.mode = 'menu';
    progress.onChange(() => this.at && this.#render());
  }

  get open() {
    return !!this.at;
  }

  /**
   * Where to look from while the card's open: down into the pan (or pot)
   * from beside it, so you can watch it cook. World positions.
   */
  view(player) {
    const place = this.places[this.at];
    const v = place.vessels[this.vessel] ?? place.vessels.pan;
    const target = v.mesh.getWorldPosition(new THREE.Vector3());
    let eye;
    if (this.at === 'galley') eye = target.clone().add(new THREE.Vector3(0.62, 0.58, 0.22));
    else {
      const d = new THREE.Vector3(player.pos.x - target.x, 0, player.pos.z - target.z).normalize();
      eye = target.clone().addScaledVector(d, 0.75).add(new THREE.Vector3(0, 1.25, 0));
    }
    return { eye, target };
  }

  /** Where you could cook, standing at pos (or null). */
  placeAt(pos, inside) {
    if (inside) return this.interior.nearStove(pos) ? 'galley' : null;
    for (const [where, f] of Object.entries(this.places)) {
      if (!f.fire) continue;
      const g = f.fire.group.position;
      if (f.fire.lit && Math.hypot(pos.x - g.x, pos.z - g.z) < 2.4 && Math.abs(pos.y - g.y) < 2) return where;
    }
    return null;
  }

  /** How far pos is from a place's fire (or stove). */
  near(pos, where) {
    const g = this.places[where].parent.position;
    return Math.hypot(pos.x - g.x, pos.z - g.z);
  }

  begin(where) {
    this.at = where;
    if (!VESSELS[where].includes(this.vessel)) this.vessel = VESSELS[where][0];
    this.mode = 'menu';
    this.#render();
  }

  close() {
    this.at = null;
    this.card.classList.remove('show');
  }

  #on(where, vessel) {
    return this.progress.state?.cooking?.[`${where}/${vessel}`] ?? null;
  }

  /** What you can eat, grouped: cooked things, dishes, fruit, salt fish; and things gone off, to throw out. */
  #edible() {
    const groups = new Map();
    for (const it of this.progress.state?.items ?? []) {
      const k = ITEMS[it.kind]?.kind;
      if (!['fish', 'fruit', 'food', 'dish'].includes(k)) continue;
      if (k === 'fish' && !it.cooked && !it.off) continue;
      const key = sameKey(it);
      if (!groups.has(key)) groups.set(key, { it, n: 0 });
      groups.get(key).n++;
    }
    return [...groups.values()];
  }

  /** Raw things you could put in, grouped. */
  #ingredients() {
    const groups = new Map();
    for (const it of this.progress.state?.items ?? []) {
      if (!cookable(it)) continue;
      const key = sameKey(it);
      if (!groups.has(key)) groups.set(key, { it, n: 0 });
      groups.get(key).n++;
    }
    return [...groups.values()].slice(0, 6);
  }

  #render() {
    const where = this.at;
    const place = this.places[where];
    const opts = [];
    let said = '';
    if (this.mode === 'menu') {
      const on = this.#on(where, this.vessel);
      const word = this.vessel === 'pan' ? (where === 'galley' ? 'pan' : 'griddle') : 'pot';
      said = on ? `${word === 'griddle' ? 'On' : 'In'} the ${word}: ${on.items.map((i) => describe(i)).join(' and ')}.` : `The ${word}'s empty.`;
      if (on) opts.push({ say: 'Take it off the heat', go: () => this.#take() });
      if (!on || on.items.length < ROOM[this.vessel]) {
        for (const g of this.#ingredients()) opts.push({ say: `Put in ${describe(g.it)}`, go: () => this.#put(g.it) });
      }
      const other = VESSELS[where].find((v) => v !== this.vessel);
      if (other) opts.push({ say: other === 'pot' ? 'Use the pot' : 'Use the pan', go: () => { this.vessel = other; this.#render(); } });
      if (this.#edible().length) opts.push({ say: 'Eat something', go: () => { this.mode = 'eat'; this.#render(); } });
    } else if (this.mode === 'eat') {
      said = 'What, then?';
      for (const g of this.#edible().slice(0, 6)) {
        opts.push({ say: g.it.off ? `Throw out ${describe(g.it)}` : `Eat ${describe(g.it)}`, go: () => this.#eat(g.it) });
      }
      opts.push({ say: 'Nothing for now', go: () => { this.mode = 'menu'; this.#render(); } });
    } else if (this.mode === 'after') {
      said = this.afterSaid;
      const item = (this.progress.state?.items ?? []).find((i) => i.id === this.afterItem);
      if (item) opts.push({ say: 'Eat it now', go: () => this.#eat(item) });
      opts.push({ say: 'Keep it for later', go: () => { this.mode = 'menu'; this.#render(); } });
    }
    this.opts = opts.slice(0, 9);
    this.card.innerHTML = `
      <div class="who">${place.name}</div>
      <p class="said">${esc(said)}</p>
      <div class="replies">${this.opts.map((o, i) => `<button type="button" data-pick="${i}"><kbd>${i + 1}</kbd>${esc(o.say)}</button>`).join('')}</div>`;
    this.card.classList.add('show');
  }

  choose(i) {
    if (this.busy) return;
    this.opts?.[i]?.go();
  }

  async #act(type, data) {
    this.busy = true;
    try {
      return await this.progress.act(type, data);
    } catch {
      return null;
    } finally {
      this.busy = false;
    }
  }

  async #put(it) {
    const r = await this.#act('cookPut', { where: this.at, vessel: this.vessel, item: it.id });
    if (!r?.ok) this.hud.say(r?.why === 'full' ? 'No room.' : "That won't go in.");
    if (this.at) this.#render();
  }

  async #take() {
    const vessel = this.vessel;
    const r = await this.#act('cookTake', { where: this.at, vessel });
    if (!r?.ok) return;
    let said;
    if (r.result === 'raw') said = 'Still raw. Back in the hold.';
    else if (r.result === 'burnt') said = 'Burnt.';
    else if (r.recipe) said = r.learned ? `${RECIPES[r.recipe].name}. Worth writing down.` : `${RECIPES[r.recipe].name}.`;
    else if (r.kind === 'potful' || r.kind === 'fryup') said = `${cap(describe({ kind: r.kind }))}. Edible.`;
    else said = `${cap(describe({ kind: r.kind, cooked: 'done' }))}.`;
    this.hud.say(said, 3.5);
    if (!this.at) return;
    if (r.result === 'raw') this.#render();
    else {
      this.mode = 'after';
      this.afterSaid = said;
      this.afterItem = r.item;
      this.#render();
    }
  }

  async #eat(it) {
    const r = await this.#act('eat', { item: it.id });
    if (!r?.ok) {
      if (r?.why === 'raw') this.hud.say('Not raw.');
      return;
    }
    const said = r.result === 'fed' ? EFFECTS[r.effect].feel : r.result === 'off' ? 'Over the side with it.' : r.result === 'burnt' ? "You eat it anyway. It's not good." : 'Not bad.';
    this.hud.say(said, 3.5);
    this.mode = 'menu';
    if (this.at) this.#render();
  }

  /** Keys while the card's open; walking off closes it. */
  #keys(input, player, inside) {
    if (!this.at) return;
    for (let i = 0; i < 9; i++) if (input.pressed(`Digit${i + 1}`, `Numpad${i + 1}`)) this.choose(i);
    if (input.pressed('Escape')) this.close();
    else if (this.placeAt(player.pos, inside) !== this.at) this.close();
  }

  /** Food in the pans and pots as it cooks, the smoke, and the sizzle. */
  update(dt, { input, player, inside }) {
    this.#keys(input, player, inside);
    const now = worldTime();
    let sizzle = 0;
    let crackle = 0;
    let bubble = 0;
    for (const [where, place] of Object.entries(this.places)) {
      const hear = where === 'galley' ? (inside ? 1 : 0) : Math.max(0, 1 - Math.hypot(player.pos.x - place.parent.position.x, player.pos.z - place.parent.position.z) / 10);
      let smoke = 0;
      let steam = 0;
      let from = null;
      for (const [vessel, v] of Object.entries(place.vessels)) {
        const on = this.#on(where, vessel);
        const items = on?.items ?? [];
        // Make the food match what's in there.
        const want = vessel === 'pot' ? [] : items;
        if (v.food.length !== want.length || v.food.some((f, i) => f.userData.id !== want[i].id)) {
          for (const f of v.food) v.mesh.remove(f);
          v.food = want.map((it, i) => {
            const m = foodModel(it.kind, it.kg ?? 0.5);
            m.material = m.material.clone();
            // Fish lie on their side in the pan; everything fits in it.
            const fish = ITEMS[it.kind]?.kind === 'fish';
            m.geometry.computeBoundingBox();
            const bb = m.geometry.boundingBox;
            const ex = bb.max.x - bb.min.x;
            const ey = bb.max.y - bb.min.y;
            const ez = bb.max.z - bb.min.z;
            const room = where === 'galley' ? 0.21 : 0.32;
            const k = Math.min(1, room / Math.max(ex, fish ? ey : ez));
            m.scale.setScalar(k);
            m.rotation.set(fish ? Math.PI / 2 : 0, 0, 0, 'YXZ');
            m.rotation.y = i * 1.3 + 0.4;
            m.position.set(i ? 0.05 : -0.02, -0.01 + ((fish ? ez : ey) * k) / 2, i ? 0.04 : -0.01);
            m.userData.id = it.id;
            v.mesh.add(m);
            return m;
          });
        }
        if (v.flame) v.flame.visible = !!on;
        if (!on) {
          if (v.pot) {
            v.pot.surface.visible = false;
            for (const b of v.pot.bubbles) b.visible = false;
          }
          continue;
        }
        const secs = now - on.since;
        const better = where === 'galley' && (this.progress.state?.upgrades ?? []).includes('stove');
        const [a, b] = windowFor(vessel, items.map((i) => i.kind), better);
        // 0 raw … 1 just done … 2 as burnt as it gets; the last stretch before
        // burning starts to darken, so a careful eye can catch it.
        const late = Math.min(1, Math.max(0, (secs - (b - (b - a) * 0.3)) / ((b - a) * 0.3)));
        const c = secs < a ? secs / a : secs < b ? 1 + 0.2 * late : 1.3 + Math.min(0.7, (secs - b) / 10);
        for (const f of v.food) tint(f, c);
        const burning = secs >= b;
        from = v.mesh.position;
        if (v.pot) {
          v.pot.surface.visible = true;
          const col = v.pot.surface.material.color;
          col.set('#a7b6b0').lerp(new THREE.Color('#d9b878'), Math.min(1, c));
          if (c > 1.2) col.lerp(new THREE.Color('#3a2a1c'), Math.min(1, (c - 1.2) * 1.4));
          const boil = Math.min(1, secs / a);
          v.pot.bubbles.forEach((bb, i) => {
            const phase = (now * (0.8 + i * 0.37) + i * 0.29) % 1;
            bb.visible = boil > i / 6;
            bb.position.set(Math.cos(i * 2.4) * 0.06 * (1 - phase * 0.3), 0.1 + phase * 0.012, Math.sin(i * 2.4) * 0.06);
            bb.scale.setScalar(0.4 + phase);
          });
          bubble = Math.max(bubble, hear * boil);
          steam = Math.max(steam, boil);
        } else {
          sizzle = Math.max(sizzle, hear * (burning ? 0.55 : 0.25 + 0.6 * Math.min(1, c)));
          steam = Math.max(steam, Math.min(1, c) * 0.7);
        }
        if (burning) {
          smoke = Math.max(smoke, Math.min(1, (secs - b) / 8 + 0.4));
          crackle = Math.max(crackle, hear);
        } else if (c > 1.15) crackle = Math.max(crackle, hear * 0.2);
      }
      if (from) {
        const pos = from.clone();
        place.puffs.update(dt, smoke > 0 ? 3 + 5 * smoke : steam * 2, smoke > 0 ? Math.min(1, smoke) : 0, pos);
      } else place.puffs.update(dt, 0, 0, V(0, 0, 0));
    }
    this.audio.cook?.(dt, { sizzle, crackle, bubble });
  }
}
