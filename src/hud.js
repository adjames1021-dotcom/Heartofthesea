// The few bits of text on screen: an interaction prompt, the keys for the
// station you're at, the boat's instruments at the helm, and short notices.
// Plain and flat on purpose.

const KN = 1.9438;
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Set an element's text only when it changes. */
function put(e, text) {
  if (e.textContent !== text) e.textContent = text;
}

function el(tag, cls, parent = document.body) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}

export class Hud {
  constructor() {
    this.root = el('div', 'hud');
    this.prompt = el('div', 'hud-prompt', this.root);
    this.keys = el('div', 'hud-keys', this.root);
    this.instruments = el('div', 'hud-instruments', this.root);
    this.notice = el('div', 'hud-notice', this.root);
    this.anchor = el('div', 'hud-anchor', this.root);
    this.noticeT = 0;
    this.last = { prompt: null, keys: null, inst: null };
  }

  setPrompt(key, label) {
    const text = label ? `${key}|${label}` : '';
    if (text === this.last.prompt) return;
    this.last.prompt = text;
    this.prompt.innerHTML = label ? `<kbd>${key}</kbd> ${label}` : '';
  }

  /** rows: [[keys, what], ...] or null */
  setKeys(rows) {
    const text = rows ? JSON.stringify(rows) : '';
    if (text === this.last.keys) return;
    this.last.keys = text;
    this.keys.innerHTML = rows
      ? rows.map(([k, what]) => `<div><span>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}</span>${what}</div>`).join('')
      : '';
  }

  /** The instrument card at the helm (b = boat state), or null to hide it. */
  setInstruments(b) {
    if (!b) {
      if (this.last.inst !== '') {
        this.instruments.classList.remove('on');
        this.last.inst = '';
      }
      return;
    }
    if (!this.inst) this.#buildInstruments();
    if (this.last.inst !== 'on') {
      this.instruments.classList.add('on');
      this.last.inst = 'on';
    }
    const I = this.inst;
    const hdg = Math.round((((b.heading * 180) / Math.PI + 90) % 360 + 360) % 360) % 360;
    const shallow = b.depth < 3;
    const sail = (b.mainHoist + b.jibOut) / 2;
    const status = [
      sail > 0.97 ? 'Sails up' : sail < 0.03 ? 'Sails down' : `Sails ${Math.round(sail * 100)}% up`,
      b.engine ? `Engine ${Math.round(Math.abs(b.throttle) * 100)}%${b.throttle < -0.02 ? ' astern' : ''}` : '',
      b.autopilot.on ? 'Autopilot' : '',
      b.lights ? 'Lights' : '',
    ].filter(Boolean).join('  ·  ');
    put(I.sog, (b.sog * KN).toFixed(1));
    put(I.hdg, `${String(hdg).padStart(3, '0')}°`);
    put(I.point, POINTS[Math.round(hdg / 45) % 8]);
    put(I.aws, (b.aws * KN).toFixed(0));
    put(I.depth, b.depth > 60 ? 'deep' : b.depth.toFixed(1));
    put(I.depthLabel, shallow ? 'shallow' : b.depth > 60 ? 'depth' : 'depth m');
    put(I.status, status);
    I.depthCell.classList.toggle('warn', shallow);
    // Where the wind comes from, relative to the bow (starboard to the right).
    const awa = Math.round((b.awa * 180) / Math.PI);
    if (awa !== I.awa) {
      I.awa = awa;
      I.mark.setAttribute('transform', `rotate(${awa})`);
    }
  }

  #buildInstruments() {
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      const r0 = i % 3 === 0 ? 25 : 27.5;
      return `<line x1="${(Math.sin(a) * r0).toFixed(2)}" y1="${(-Math.cos(a) * r0).toFixed(2)}" x2="${(Math.sin(a) * 31).toFixed(2)}" y2="${(-Math.cos(a) * 31).toFixed(2)}"/>`;
    }).join('');
    // The arc either side of the bow where she can't sail.
    const ng = (deg) => [Math.sin((deg * Math.PI) / 180) * 31, -Math.cos((deg * Math.PI) / 180) * 31].map((v) => v.toFixed(2)).join(' ');
    this.instruments.innerHTML = `
      <svg class="wind-dial" viewBox="-40 -40 80 80" aria-hidden="true">
        <path class="nogo" d="M ${ng(-35)} A 31 31 0 0 1 ${ng(35)}"/>
        <circle class="rim" r="31"/>
        <g class="ticks">${ticks}</g>
        <path class="hull" d="M0 -14 C 5.5 -8 6.5 3 4.5 13 L -4.5 13 C -6.5 3 -5.5 -8 0 -14 Z"/>
        <g class="mark"><path d="M0 -17 L 5.5 -33 L -5.5 -33 Z"/></g>
      </svg>
      <div class="cell"><b data-k="aws">0</b><small>kn wind</small></div>
      <div class="cell"><b data-k="sog">0.0</b><small>knots</small></div>
      <div class="cell"><b data-k="hdg">000°</b><small data-k="point">N</small></div>
      <div class="cell" data-k="depthCell"><b data-k="depth">--</b><small data-k="depthLabel">depth m</small></div>
      <div class="status" data-k="status"></div>`;
    const I = { awa: null };
    for (const e of this.instruments.querySelectorAll('[data-k]')) I[e.dataset.k] = e;
    I.mark = this.instruments.querySelector('.mark');
    this.inst = I;
  }

  /** The anchor's state while you're aboard or near the boat (b = boat state), or null. */
  setAnchor(b) {
    let text = '';
    let cls = '';
    if (b) {
      const a = b.anchor;
      if (a.cmd === 'up' || (a.rode > 0.2 && b.input.windlass > 0)) [text, cls] = [`Raising anchor  ${a.rode.toFixed(0)} m`, 'moving'];
      else if (a.cmd === 'down' || (b.input.windlass < 0)) [text, cls] = [a.set ? `Anchor down, letting out chain  ${a.rode.toFixed(0)} m` : `Lowering anchor  ${a.rode.toFixed(0)} m`, 'moving'];
      else if (a.set && a.dragging) [text, cls] = ['Anchor down, dragging', 'warn'];
      else if (a.set) [text, cls] = ['Anchor down', 'down'];
      else if (a.rode > 0.2) [text, cls] = ['Anchor hanging, not holding', 'warn'];
      else [text, cls] = ['Anchor up', 'up'];
    }
    const key = `${cls}|${text}`;
    if (key === this.last.anchor) return;
    this.last.anchor = key;
    this.anchor.className = `hud-anchor ${cls}`;
    this.anchor.textContent = text;
  }

  say(text, seconds = 2.6) {
    this.notice.textContent = text;
    this.notice.classList.add('show');
    this.noticeT = seconds;
  }

  update(dt) {
    if (this.noticeT > 0) {
      this.noticeT -= dt;
      if (this.noticeT <= 0) this.notice.classList.remove('show');
    }
  }
}
