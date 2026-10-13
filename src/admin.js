// Admin settings, for testing. In Settings, type the key ("sea") into the
// admin box and three more controls open: the time of day, the weather and
// how fast the boat goes. They change this screen only; nothing goes to the
// server, and anyone else still has the shared sky. (The key is here in
// plain sight on purpose: it keeps the controls out of the way, that's all.)

export const ADMIN_KEY = 'sea';

// Each kind of weather as overrides for the shared clock (null: leave it to the clock).
const WEATHER = {
  world: { label: 'World', storm: null, clouds: null, swell: null, wind: null },
  calm: { label: 'Calm', storm: 0, clouds: 0.08, swell: 0.3, wind: 2.5 },
  fair: { label: 'Fair', storm: 0, clouds: 0.3, swell: 0.62, wind: 7.5 },
  grey: { label: 'Grey', storm: 0, clouds: 0.9, swell: 0.85, wind: 11 },
  storm: { label: 'Storm', storm: 1, clouds: null, swell: null, wind: null },
};
const STORE = 'hots.admin';

const clock = (h) => {
  const m = Math.round(h * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export class Admin {
  /**
   * dev: main.js's overrides (hours, storm, clouds, swell, wind), changed in place.
   * env: the boat's surroundings (env.fast scales her speed).
   * forceStorm: shared/environment.js's, so the storm itself follows.
   */
  constructor({ rows, dev, env, forceStorm }) {
    this.dev = dev;
    this.env = env;
    this.forceStorm = forceStorm;
    this.weather = dev.storm === null && dev.clouds === null && dev.swell === null && dev.wind === null ? 'world' : null;

    const before = rows.querySelector('.ver');
    this.keyForm = document.createElement('form');
    this.keyForm.className = 'load-code admin-key';
    this.keyForm.innerHTML = '<input type="password" placeholder="Admin key" spellcheck="false" autocomplete="off" maxlength="20" aria-label="Admin key" /><button type="submit">Open</button>';
    rows.insertBefore(this.keyForm, before);

    this.el = document.createElement('div');
    this.el.className = 'admin';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="admin-head"><span>Admin</span><button type="button" class="admin-lock">Lock</button></div>
      <label class="admin-row">
        <span>Time <b class="admin-time-out"></b></span>
        <input type="range" class="admin-time" min="0" max="24" step="0.25" />
      </label>
      <div class="admin-pick admin-clock"><button type="button" data-clock="world">World clock</button><button type="button" data-clock="6.25">Dawn</button><button type="button" data-clock="12">Noon</button><button type="button" data-clock="17.75">Dusk</button><button type="button" data-clock="0">Night</button></div>
      <div class="admin-row"><span>Weather</span></div>
      <div class="admin-pick admin-weather">${Object.entries(WEATHER).map(([k, w]) => `<button type="button" data-weather="${k}" aria-pressed="false">${w.label}</button>`).join('')}</div>
      <label class="admin-row">
        <span>Boat speed <b class="admin-fast-out"></b></span>
        <input type="range" class="admin-fast" min="1" max="6" step="0.5" value="1" />
      </label>
      <p class="admin-note">This screen only. The shops still keep the world's hours.</p>`;
    rows.insertBefore(this.el, before);

    this.timeIn = this.el.querySelector('.admin-time');
    this.timeOut = this.el.querySelector('.admin-time-out');
    this.fastIn = this.el.querySelector('.admin-fast');
    this.fastOut = this.el.querySelector('.admin-fast-out');

    this.keyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = this.keyForm.querySelector('input');
      const ok = input.value.trim().toLowerCase() === ADMIN_KEY;
      input.value = '';
      input.placeholder = ok ? 'Admin key' : 'Not that';
      if (ok) this.unlock(true);
    });
    this.el.querySelector('.admin-lock').addEventListener('click', () => this.unlock(false));
    this.timeIn.addEventListener('input', () => this.setHours(Number(this.timeIn.value)));
    this.el.querySelector('.admin-clock').addEventListener('click', (e) => {
      const b = e.target.closest('[data-clock]');
      if (b) this.setHours(b.dataset.clock === 'world' ? null : Number(b.dataset.clock));
    });
    this.el.querySelector('.admin-weather').addEventListener('click', (e) => {
      const b = e.target.closest('[data-weather]');
      if (b) this.setWeather(b.dataset.weather);
    });
    this.fastIn.addEventListener('input', () => this.setSpeed(Number(this.fastIn.value)));

    let open = false;
    try {
      open = localStorage.getItem(STORE) === 'open';
    } catch {
      // fine
    }
    this.unlock(open);
    this.setSpeed(1);
    this.#showWeather();
  }

  get unlocked() {
    return !this.el.hidden;
  }

  /** Show the controls (the right key), or put them away again (Lock). Remembered in this browser. */
  unlock(on) {
    this.el.hidden = !on;
    this.keyForm.hidden = on;
    try {
      localStorage.setItem(STORE, on ? 'open' : 'shut');
    } catch {
      // fine
    }
  }

  /** The hour (0–24), or null to go back to the world's clock. */
  setHours(h) {
    this.dev.hours = h === null ? null : ((h % 24) + 24) % 24;
    if (h !== null) this.timeIn.value = String(this.dev.hours);
  }

  setWeather(kind) {
    const w = WEATHER[kind];
    if (!w) return;
    this.weather = kind;
    this.dev.storm = w.storm;
    this.dev.clouds = w.clouds;
    this.dev.swell = w.swell;
    this.dev.wind = w.wind;
    this.forceStorm(w.storm);
    this.#showWeather();
  }

  /** 1 is her own speed; up to 6 times it. */
  setSpeed(k) {
    this.env.fast = Math.min(6, Math.max(1, k || 1));
    this.fastIn.value = String(this.env.fast);
    this.fastOut.textContent = this.env.fast === 1 ? 'normal' : `× ${this.env.fast}`;
  }

  #showWeather() {
    for (const b of this.el.querySelectorAll('[data-weather]')) b.setAttribute('aria-pressed', String(b.dataset.weather === this.weather));
  }

  /** Each frame while Settings is open: the clock readout (and the slider, while it follows the world). */
  update(worldHours) {
    if (this.el.hidden) return;
    const h = this.dev.hours ?? worldHours;
    if (this.dev.hours === null && document.activeElement !== this.timeIn) this.timeIn.value = String(h);
    this.timeOut.textContent = `${clock(h)}${this.dev.hours === null ? ' (world)' : ''}`;
    for (const b of this.el.querySelectorAll('[data-clock]')) b.setAttribute('aria-pressed', String(b.dataset.clock === 'world' ? this.dev.hours === null : Number(b.dataset.clock) === this.dev.hours));
  }
}
