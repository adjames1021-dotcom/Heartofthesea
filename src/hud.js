// The few bits of text on screen: an interaction prompt, the keys for the
// station you're at, the boat's instruments at the helm, and short notices.
// Plain and flat on purpose.

const KN = 1.9438;

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

  setInstruments(b) {
    if (!b) {
      if (this.last.inst !== '') {
        this.instruments.innerHTML = '';
        this.last.inst = '';
      }
      return;
    }
    const hdg = Math.round((((b.heading * 180) / Math.PI + 90) % 360 + 360) % 360);
    const awa = Math.round((Math.abs(b.awa) * 180) / Math.PI);
    const side = b.awa >= 0 ? 'stbd' : 'port';
    const parts = [
      `${(b.sog * KN).toFixed(1)} kn`,
      `hdg ${String(hdg).padStart(3, '0')}`,
      `wind ${(b.aws * KN).toFixed(0)} kn ${awa}° ${side}`,
      `depth ${b.depth > 60 ? '--' : b.depth.toFixed(1)}`,
    ];
    if (b.engine) parts.push(`engine ${Math.round(Math.abs(b.throttle) * 100)}%${b.throttle < -0.02 ? ' astern' : ''}`);
    if (b.autopilot.on) parts.push('autopilot');
    if (b.anchor.rode > 0.2) parts.push(`chain ${b.anchor.rode.toFixed(0)} m`);
    const html = parts.map((p) => `<span>${p}</span>`).join('');
    if (html === this.last.inst) return;
    this.last.inst = html;
    this.instruments.innerHTML = html;
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
