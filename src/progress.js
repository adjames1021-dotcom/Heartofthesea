// Your saved progress lives on the server (see worker/player.js). This keeps
// your save code, asks the server to do things, and holds the latest copy of
// what it says you have. Nothing here decides anything: the server does.

const CODE_KEY = 'hots.player';
const OLD_KEYS = ['hots.v1', 'hots.finds', 'hots.fish']; // saves from before the server kept them

export class Progress {
  constructor() {
    this.code = null;
    this.id = null;
    this.state = null;
    this.online = false;
    this.listeners = [];
  }

  /** Get (or make) a save code and load what's saved under it. */
  async connect() {
    try {
      this.code = localStorage.getItem(CODE_KEY);
    } catch {
      this.code = null;
    }
    try {
      if (!this.code) {
        const r = await this.#post('/api/player/new', {});
        this.#keep(r.code);
        for (const k of OLD_KEYS) localStorage.removeItem(k);
      }
      await this.act('hello');
      this.online = true;
    } catch {
      this.online = false; // no server (plain vite): play on without saving
    }
    return this.online;
  }

  /** Switch to another save code (from another device). */
  async useCode(code) {
    const clean = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 16) return false;
    const before = this.code;
    this.code = clean.match(/.{4}/g).join('-');
    try {
      await this.act('hello');
      this.#keep(this.code);
      return true;
    } catch {
      this.code = before;
      return false;
    }
  }

  #keep(code) {
    this.code = code;
    try {
      localStorage.setItem(CODE_KEY, code);
    } catch {
      // private mode: the code still works for this session
    }
  }

  /** Ask the server to do something. Resolves to its reply ({ ok, ... }). */
  async act(type, data = {}) {
    if (!this.code) return { ok: false, why: 'offline' };
    const r = await this.#post('/api/player', { code: this.code, action: { type, ...data } });
    this.id = r.id;
    // Replies can arrive out of order; keep the newest state.
    if (!this.state || (r.state?.rev ?? 0) >= (this.state.rev ?? 0)) {
      this.state = r.state;
      for (const f of this.listeners) f(this.state, type);
    }
    return r.reply;
  }

  /** Call f(state) whenever the saved state changes. */
  onChange(f) {
    this.listeners.push(f);
  }

  async #post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
  }
}
