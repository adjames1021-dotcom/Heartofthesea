import { ISLANDS, groundAt } from '../shared/world.js';
import { HAND } from './mapview.js';
import { CHANGES, VERSION, BUILD } from './version.js';

// Two screens you can call up: the controls (H), with a plan of the boat
// showing where each station is, and the chart (Tab) of the whole sea.

const ROWS = {
  'On foot': [
    ['W A S D', 'walk (Shift to run)'],
    ['Space', 'jump'],
    ['E', 'use, pick up, put down, read'],
    ['F', 'dig'],
    ['Q', 'fish: cast, then Q again when the float dips'],
    ['M', 'treasure maps (← → to flip)'],
    ['L', 'boat lights, from anywhere aboard'],
    ['E', 'talk to someone (then 1 2 3 to answer)'],
    ['E', 'at the stove below, or a lit fire: cook (then 1 2 3)'],
    ['E', 'below decks: pick a thing up, then the mouse moves it, Q turns it, E or a click puts it down'],
    ['J', 'journal'],
    ['Tab', 'chart'],
    ['H', 'this screen'],
  ],
  'At the helm': [
    ['A D', 'steer'],
    ['W S', 'sails up / down'],
    ['G', 'anchor up / down'],
    ['R', 'engine on / off (then W S is throttle)'],
    ['↑ ↓ ← →', 'trim the sails (realistic mode only)'],
    ['P', 'autopilot'],
    ['F', 'horn'],
    ['E', 'leave the helm'],
  ],
  Climbing: [
    ['Space', 'jump at a ledge or rope to grab it'],
    ['W', 'climb up'],
    ['S', 'let go'],
    ['A D', 'move along a ledge'],
    ['Space', 'let go of a rope'],
  ],
};

// Plan of the boat, bow to the right. Station marks match where you stand.
const BOAT_SVG = `
<svg viewBox="0 0 520 200" class="plan" aria-label="Plan of the boat">
  <path d="M30 60 L30 140 L330 152 Q470 140 505 100 Q470 60 330 48 Z" fill="#e9e3d4" stroke="#3a3128" stroke-width="3"/>
  <rect x="14" y="78" width="16" height="44" fill="#b9a27c" stroke="#3a3128" stroke-width="2"/>
  <rect x="34" y="66" width="160" height="68" rx="6" fill="#c9b48e" stroke="#3a3128" stroke-width="2"/>
  <rect x="200" y="70" width="120" height="60" rx="10" fill="#f4f0e6" stroke="#3a3128" stroke-width="2"/>
  <circle cx="300" cy="100" r="7" fill="#3a3128"/>
  <circle cx="70" cy="100" r="17" fill="none" stroke="#3a3128" stroke-width="4"/>
  <rect x="452" y="92" width="22" height="16" fill="#6b6f74"/>
  <g font-size="15" fill="#2b241d">
    <g class="mark"><circle cx="46" cy="100" r="9"/><text x="22" y="40">Helm</text><path d="M40 46 L46 88"/></g>
    <g class="mark"><circle cx="186" cy="80" r="9"/><text x="150" y="40">Halyards (mast)</text><path d="M186 46 L186 70"/></g>
    <g class="mark"><circle cx="196" cy="108" r="9"/><text x="268" y="188">Steps down to the cabin</text><path d="M290 174 L204 114"/></g>
    <g class="mark"><circle cx="430" cy="100" r="9"/><text x="396" y="40">Windlass (anchor)</text><path d="M440 46 L432 88"/></g>
    <g class="mark"><circle cx="22" cy="100" r="7"/><text x="4" y="188">Swim platform: climb aboard here</text><path d="M22 176 L22 110"/></g>
  </g>
  <text x="472" y="182" font-size="13" fill="#2b241d">bow →</text>
</svg>`;

export class Screens {
  constructor() {
    this.controls = document.createElement('div');
    this.controls.className = 'screen controls-screen';
    this.controls.innerHTML = `
      <div class="screen-card">
        <h2>Controls</h2>
        <p class="sub">Walk up to a mark on the boat and press <kbd>E</kbd> to use it.</p>
        ${BOAT_SVG}
        <div class="cols">
          ${Object.entries(ROWS)
            .map(
              ([title, rows]) => `<section><h3>${title}</h3>${rows
                .map(([k, what]) => `<div class="row"><span>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}</span>${what}</div>`)
                .join('')}</section>`,
            )
            .join('')}
        </div>
        <p class="sub">To go ashore: get close to an island, press <kbd>G</kbd> at the helm to drop the anchor, and swim.</p>
        <p class="sub">Treasure: you start with a map (<kbd>M</kbd>). Dig with <kbd>F</kbd> near the X, carry the chest back and put it down on the boat; there's usually another map inside. Out of maps? There's one on the chart table below decks.</p>
        <section class="news">
          <h3>Version ${VERSION} <span class="build">build ${BUILD.hash}${BUILD.date ? `, ${BUILD.date}` : ''}</span></h3>
          ${CHANGES.slice(0, 3)
            .map(([v, what]) => `<div class="row"><span>${v}</span>${what}</div>`)
            .join('')}
        </section>
        <p class="close">Press <kbd>H</kbd> to close</p>
      </div>`;
    document.body.appendChild(this.controls);

    this.chart = document.createElement('div');
    this.chart.className = 'screen chart-screen';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 760;
    this.canvas.height = 760;
    this.chart.appendChild(this.canvas);
    document.body.appendChild(this.chart);
    this.base = null;
    this.R = 1150; // metres from the centre to the chart edge
  }

  get open() {
    return this.controls.classList.contains('open') || this.chart.classList.contains('open');
  }

  toggleControls(force) {
    this.chart.classList.remove('open');
    this.controls.classList.toggle('open', force);
  }

  toggleChart() {
    this.controls.classList.remove('open');
    this.chart.classList.toggle('open');
  }

  #toPx(x, z) {
    const s = this.canvas.width / (2 * this.R);
    return [this.canvas.width / 2 + x * s, this.canvas.height / 2 + z * s];
  }

  /** Coastlines, drawn once from the real terrain. */
  #drawBase() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#dccfae';
    ctx.fillRect(0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const step = 2;
    for (let py = 0; py < c.height; py += step) {
      for (let px = 0; px < c.width; px += step) {
        const x = ((px + 1) / c.width) * 2 * this.R - this.R;
        const z = ((py + 1) / c.height) * 2 * this.R - this.R;
        const h = groundAt(x, z);
        let col;
        if (h > 0.3) col = h > 8 ? [150, 135, 100] : [196, 178, 132];
        else if (h > -3) col = [176, 196, 182];
        else col = [208, 199, 172];
        for (let dy = 0; dy < step; dy++) {
          for (let dx = 0; dx < step; dx++) {
            const k = ((py + dy) * c.width + px + dx) * 4;
            img.data[k] = col[0];
            img.data[k + 1] = col[1];
            img.data[k + 2] = col[2];
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#3a2c1c';
    ctx.font = `24px ${HAND}`;
    ctx.textAlign = 'center';
    for (const isl of ISLANDS) {
      const [x, y] = this.#toPx(isl.x, isl.z);
      const below = isl.id === 'saddle' ? 0 : Math.min(isl.land, 90) * (c.width / (2 * this.R)) * 0.75 + 18;
      ctx.fillText(isl.name, x, y + below);
    }
    // Frame and north arrow.
    ctx.strokeStyle = '#3a2c1c';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
    ctx.beginPath();
    ctx.moveTo(c.width - 44, 72);
    ctx.lineTo(c.width - 44, 30);
    ctx.lineTo(c.width - 52, 44);
    ctx.moveTo(c.width - 44, 30);
    ctx.lineTo(c.width - 36, 44);
    ctx.stroke();
    ctx.fillText('N', c.width - 44, 96);
    this.base = c;
  }

  /** Redraw the chart with the boat, the bear and the wind. */
  update({ boat, player, wind, aboard = false, catchLog = [], finds = null }) {
    if (!this.chart.classList.contains('open')) return;
    if (!this.base) this.#drawBase();
    const ctx = this.canvas.getContext('2d');
    ctx.drawImage(this.base, 0, 0);
    // The boat: an arrow along her heading.
    const b = boat.state;
    const [bx, by] = this.#toPx(b.x, b.z);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(b.heading);
    ctx.fillStyle = '#7d2a18';
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-9, -7);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#7d2a18';
    ctx.font = `20px ${HAND}`;
    ctx.textAlign = 'left';
    ctx.fillText(b.anchor.set ? 'your boat (anchored)' : 'your boat', bx + 14, by - 10);
    // You, if you're not aboard.
    if (!aboard && Math.hypot(player.pos.x - b.x, player.pos.z - b.z) > 12) {
      const [px, py] = this.#toPx(player.pos.x, player.pos.z);
      ctx.fillStyle = '#2b4f7a';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('you', px + 9, py + 5);
    }
    // Wind, top left: the arrow points where it blows to.
    ctx.save();
    ctx.translate(70, 70);
    ctx.strokeStyle = '#3a2c1c';
    ctx.lineWidth = 3;
    ctx.rotate(Math.atan2(wind.z, wind.x));
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(26, 0);
    ctx.lineTo(16, -8);
    ctx.moveTo(26, 0);
    ctx.lineTo(16, 8);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#3a2c1c';
    ctx.textAlign = 'center';
    ctx.fillText(`wind ${Math.round(wind.speed * 1.944)} kn`, 70, 122);
    ctx.fillText('Tab to close', this.canvas.width / 2, this.canvas.height - 22);
    // What you've found on the islands.
    if (finds?.names.length) {
      const lines = finds.names.slice(-6);
      const right = this.canvas.width - 30;
      ctx.textAlign = 'right';
      ctx.fillText('Found', right, this.canvas.height - 40 - lines.length * 22);
      lines.forEach((line, i) => ctx.fillText(line, right, this.canvas.height - 40 - (lines.length - 1 - i) * 22));
    }
    // What you've caught.
    if (catchLog.length) {
      ctx.textAlign = 'left';
      ctx.fillText('Catch', 30, this.canvas.height - 40 - catchLog.length * 22);
      catchLog.forEach((line, i) => ctx.fillText(line, 30, this.canvas.height - 40 - (catchLog.length - 1 - i) * 22));
    }
  }
}
