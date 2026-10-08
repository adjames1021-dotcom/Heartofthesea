// Talking to people: a small paper card at the bottom of the screen with
// what they say, and your replies underneath (1, 2, 3 or click). The words
// are in shared/talk.js; the server does whatever a reply does.

import { VILLAGERS } from '../shared/villages.js';
import { openingFor, lineText, repliesAt } from '../shared/talk.js';

export class Talk {
  constructor({ progress, hours }) {
    this.progress = progress;
    this.hours = hours; // () => the hour now
    this.v = null;
    this.el = document.createElement('div');
    this.el.className = 'talk';
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) this.choose(Number(b.dataset.pick));
    });
    document.body.appendChild(this.el);
  }

  get open() {
    return !!this.v;
  }

  /** Start talking to a villager. */
  begin(v) {
    const s = this.progress.state;
    const convo = openingFor(v.id, s, this.hours());
    if (!convo) return;
    this.v = v;
    this.convo = convo;
    this.line = '0';
    this.busy = false;
    v.listening = true;
    this.#render();
  }

  close() {
    if (this.v) this.v.listening = false;
    this.v = null;
    this.el.classList.remove('show');
  }

  #render() {
    const s = this.progress.state;
    const h = this.hours();
    const line = this.convo.lines[this.line];
    this.replies = repliesAt(line, s);
    const name = VILLAGERS[this.v.id].name.split(' ')[0];
    this.el.innerHTML = `
      <div class="who">${name}</div>
      <p class="said">${lineText(line, s, h)}</p>
      <div class="replies">${this.replies
        .map((r, i) => `<button type="button" data-pick="${i}"><kbd>${i + 1}</kbd>${typeof r.say === 'function' ? r.say(s, h) : r.say}</button>`)
        .join('')}</div>`;
    this.el.classList.add('show');
  }

  async choose(i) {
    const r = this.replies?.[i];
    if (!r || this.busy) return;
    this.busy = true;
    let res = null;
    try {
      res = await this.progress.act('talk', { who: this.v.id, convo: this.convo.id, line: this.line, pick: i });
    } catch {
      res = null;
    }
    this.busy = false;
    if (!this.v) return;
    // Offline, the talk still flows (nothing's kept); refused, it ends.
    const to = res?.ok ? res.to : !res || res.why === 'offline' ? r.to : null;
    if (to !== null && to !== undefined && this.convo.lines[to]) {
      this.line = String(to);
      this.#render();
    } else this.close();
  }

  /** Keys while talking, and walking off ends it. */
  update(input, player) {
    if (!this.v) return;
    for (let i = 0; i < 4; i++) if (input.pressed(`Digit${i + 1}`, `Numpad${i + 1}`)) this.choose(i);
    if (input.pressed('Escape')) this.close();
    const d = Math.hypot(player.pos.x - this.v.pos.x, player.pos.z - this.v.pos.z);
    if (d > 4.5 || !this.v.awakeNow) this.close();
  }
}
