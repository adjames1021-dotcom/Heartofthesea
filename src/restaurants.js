import * as THREE from 'three';
import { PLACES, MEALS, menuAt, dishName, cookIn } from '../shared/restaurants.js';
import { VILLAGERS } from '../shared/villages.js';
import { tag } from '../shared/trade.js';
import { worldTime } from './clock.js';
import { Smoke } from './kit.js';

// Places to eat (shared/restaurants.js has the menus and the cooks; you order
// by talking to the cook). Here: the board with what's on, chalked up fresh
// each meal; the cook calling a dish out over the counter as you pass; the
// fire going while there's cooking; a bowl in front of whoever's eating, and
// one put down on the counter for you when you've asked.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CHALK = "'Reenie Beanie', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
const MEAL_NAME = { breakfast: 'Breakfast', lunch: 'Dinner', supper: 'Supper' };
const MEAL_FROM = { breakfast: '6.30', lunch: '11.30', supper: '5.30' };

/** The next meal after hour h. */
function nextMeal(h) {
  const order = Object.entries(MEALS).sort((a, b) => a[1][0] - b[1][0]);
  return (order.find(([, [a]]) => a > h) ?? order[0])[0];
}

/** A bowl of something, from above it's mostly the stew. */
function bowlModel() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#7a5a40', side: THREE.DoubleSide }));
  b.position.y = 0.085;
  const stew = new THREE.Mesh(new THREE.CircleGeometry(0.088, 10), new THREE.MeshLambertMaterial({ color: '#a2703e' }));
  stew.rotation.x = -Math.PI / 2;
  stew.position.y = 0.07;
  g.add(b, stew);
  return g;
}

class Kitchen {
  constructor(id, def, k, parent, scene, { talk, progress, villages }) {
    this.id = id;
    this.def = def;
    this.k = k;
    this.talk = talk;
    this.progress = progress;
    this.villages = villages;
    this.cookName = VILLAGERS[def.cook].name.split(' ')[0];
    this.group = new THREE.Group();
    this.group.name = `kitchen:${id}`;
    parent.add(this.group);
    // The board: a canvas chalked up whenever what's on changes.
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 424;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const slate = new THREE.Mesh(new THREE.PlaneGeometry(k.board.w, k.board.h), new THREE.MeshLambertMaterial({ map: this.tex }));
    slate.position.copy(k.board.at);
    slate.lookAt(k.board.at.clone().add(k.board.normal));
    this.group.add(slate);
    this.slate = slate;
    this.chalked = null;
    document.fonts?.load(`40px ${CHALK}`).then(() => (this.chalked = null)).catch(() => {});
    // Embers in the fire.
    this.embers = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff7a2a', toneMapped: false }));
    this.embers.scale.set(1, 0.25, 1);
    this.embers.position.copy(k.fire).add(V(0, -0.14, 0));
    this.group.add(this.embers);
    this.smoke = new Smoke(scene, [k.smoke], 12);
    // A bowl for whoever's eating at the tables (made as needed), and yours.
    this.bowls = new Map();
    this.mine = bowlModel();
    this.mine.position.copy(k.plate);
    this.mine.visible = false;
    this.group.add(this.mine);
    this.mineUntil = 0;
    this.meals = progress.state?.meals?.[id] ?? 0;
    this.lastCall = -1e9;
    this.callIdx = 0;
    this.near = false;
  }

  /** Chalk the board up: the meal and what's on, or when it's on next. */
  #chalk(menu, h) {
    const key = menu ? `${menu.meal}|${menu.dishes.map((d) => d.dish + d.price).join(',')}` : `shut|${nextMeal(h)}`;
    if (key === this.chalked) return;
    this.chalked = key;
    const c = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const H = this.canvas.height;
    let seed = key.length * 31;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    c.fillStyle = '#2b302d';
    c.fillRect(0, 0, W, H);
    // Old chalk not quite rubbed out.
    for (let i = 0; i < 26; i++) {
      c.fillStyle = `rgba(220,220,210,${0.03 + r() * 0.05})`;
      c.beginPath();
      c.ellipse(r() * W, r() * H, 20 + r() * 60, 6 + r() * 14, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#e8e4d8';
    c.strokeStyle = '#e8e4d8';
    c.textBaseline = 'middle';
    const line = (text, x, y, size, align = 'left', rot = 0) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.font = `${size}px ${CHALK}`;
      c.textAlign = align;
      c.globalAlpha = 0.9;
      c.fillText(text, 0, 0);
      c.restore();
    };
    if (menu) {
      line(MEAL_NAME[menu.meal], W / 2, 48, 54, 'center', -0.03);
      c.globalAlpha = 0.6;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(70, 80);
      c.bezierCurveTo(130, 86, 200, 76, 250, 82);
      c.stroke();
      c.globalAlpha = 1;
      const n = menu.dishes.length;
      const gap = Math.min(78, 290 / Math.max(1, n));
      menu.dishes.forEach((d, i) => {
        const y = 120 + i * gap;
        const words = dishName(d.dish).split(' ');
        // Long names go over two lines.
        if (dishName(d.dish).length > 15 && words.length > 2) {
          const cut = Math.ceil(words.length / 2);
          line(words.slice(0, cut).join(' '), 20, y - 14, 34, 'left', (r() - 0.5) * 0.04);
          line(words.slice(cut).join(' '), 34, y + 16, 34, 'left', (r() - 0.5) * 0.04);
        } else line(dishName(d.dish), 20, y, 36, 'left', (r() - 0.5) * 0.05);
        line(tag(d.price), W - 18, y, 38, 'right', (r() - 0.5) * 0.06);
      });
    } else {
      const next = nextMeal(h);
      line('Shut', W / 2, 120, 72, 'center', -0.05);
      line(`${MEAL_NAME[next]} from ${MEAL_FROM[next]}`, W / 2, 210, 36, 'center', 0.02);
    }
    // A fish, drawn without much care, in the corner.
    c.globalAlpha = 0.75;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(212, 392);
    c.bezierCurveTo(232, 372, 270, 372, 288, 392);
    c.bezierCurveTo(270, 410, 232, 410, 212, 392);
    c.moveTo(212, 392);
    c.lineTo(196, 380);
    c.lineTo(198, 404);
    c.closePath();
    c.stroke();
    c.globalAlpha = 1;
    this.tex.needsUpdate = true;
  }

  /** The cook, if they're at the counter now. */
  #cookHere() {
    const p = this.villages.people.find((x) => x.id === this.def.cook);
    if (!p || p.path.length || p.spot !== this.def.spot) return null;
    return p;
  }

  /** A bowl in front of each person sitting down to eat at the tables. */
  #bowls() {
    for (const p of this.villages.people) {
      const eating = /\d$/.test(p.spot ?? '') && p.spot.startsWith(this.id) && p.act === 'sit' && !p.path.length && p.bear.root.visible;
      let bowl = this.bowls.get(p.id);
      if (!eating) {
        if (bowl) bowl.visible = false;
        continue;
      }
      if (!bowl) {
        bowl = bowlModel();
        this.group.add(bowl);
        this.bowls.set(p.id, bowl);
      }
      // On the table, the nearest one, in front of them.
      const t = this.k.tables.reduce((a, b) => (a.c.distanceToSquared(p.pos) < b.c.distanceToSquared(p.pos) ? a : b));
      const q = t.c.clone().addScaledVector(t.along, THREE.MathUtils.clamp(p.pos.clone().sub(t.c).dot(t.along), -0.65, 0.65));
      const out = V(p.pos.x - q.x, 0, p.pos.z - q.z).normalize();
      bowl.position.copy(q).addScaledVector(out, 0.2);
      bowl.position.y = t.c.y + 0.01;
      bowl.visible = true;
    }
  }

  update(dt, { player, hours, t, wind, night }) {
    const menu = menuAt(this.id, t, hours);
    this.#chalk(menu, hours);
    const cooking = cookIn(this.id, hours);
    // The fire: going while she's at it, low embers otherwise.
    const f = 0.75 + 0.15 * Math.sin(t * 7.3) + 0.1 * Math.sin(t * 17.1);
    this.embers.material.color.setRGB(1, 0.45, 0.16).multiplyScalar((cooking ? 0.9 : 0.25) * f * (0.6 + 0.6 * night));
    this.smoke.update(dt, wind, cooking ? 0.55 : 0.06, 1 - night, innerHeight);
    this.#bowls();
    // Your bowl, once you've had something (it's cleared away after a while).
    const had = this.progress.state?.meals?.[this.id] ?? 0;
    if (had > this.meals) this.mineUntil = t + 45;
    this.meals = had;
    this.mine.visible = t < this.mineUntil;
    // The cook calls out what's on as you come past, and now and then after.
    const d = Math.hypot(player.pos.x - this.k.plate.x, player.pos.z - this.k.plate.z);
    const near = d < 11 && Math.abs(player.pos.y - this.k.plate.y) < 3;
    const cook = menu && this.#cookHere();
    if (near && cook && !this.talk.open && menu.dishes.length) {
      const since = t - this.lastCall;
      if ((!this.near && since > 20) || since > 38) {
        const dish = menu.dishes[this.callIdx++ % menu.dishes.length].dish;
        const said = this.def.calls[dish];
        if (said) {
          this.talk.say(this.cookName, said, 5);
          this.lastCall = t;
        }
      }
    }
    this.near = near;
  }
}

export class Restaurants {
  constructor({ scene, villages, progress, talk }) {
    this.list = [];
    for (const [id, def] of Object.entries(PLACES)) {
      const hv = villages.hand.find((h) => h.id === def.village);
      const k = hv?.kitchens?.[id];
      if (!k) continue;
      this.list.push(new Kitchen(id, def, k, hv.detail, scene, { talk, progress, villages }));
    }
  }

  update(dt, { player, hours, wind, night }) {
    const t = worldTime();
    for (const k of this.list) k.update(dt, { player, hours, t, wind, night });
  }
}
