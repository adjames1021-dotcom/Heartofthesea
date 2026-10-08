// Procedural ocean ambience: filtered noise swelling in slow, overlapping
// "breaths", plus a low wind bed. No audio files to ship.

export class OceanAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  async toggle() {
    if (!this.ctx) this.#build();
    if (this.ctx.state === 'running') await this.ctx.suspend();
    else await this.ctx.resume();
    return this.running;
  }

  /** Diesel thump that follows the throttle. */
  setEngine(on, throttle) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.engine) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 38;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain).connect(gain.gain);
      osc.connect(lp).connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.engine = { osc, gain, lfo };
    }
    const now = this.ctx.currentTime;
    const a = Math.abs(throttle);
    this.engine.gain.gain.setTargetAtTime(on ? 0.08 + 0.1 * a : 0, now, 0.25);
    this.engine.osc.frequency.setTargetAtTime(38 + 30 * a, now, 0.4);
    this.engine.lfo.frequency.setTargetAtTime(9 + 10 * a, now, 0.4);
  }

  horn() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.05);
    g.gain.setValueAtTime(0.18, now + 1.1);
    g.gain.linearRampToValueAtTime(0, now + 1.3);
    g.connect(this.master);
    for (const f of [233, 294]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      o.connect(lp).connect(g);
      o.start(now);
      o.stop(now + 1.35);
    }
  }

  /** Wind and rain follow the weather: storm 0..1, wind speed in m/s. */
  setWeather(storm, windSpeed) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.wind) return;
    const now = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(0.05 + 0.006 * windSpeed + 0.22 * storm, now, 0.8);
    this.wind.bp.frequency.setTargetAtTime(600 + 30 * windSpeed + 500 * storm, now, 0.8);
    if (!this.rainGain && storm > 0) {
      // Rain: a hiss of high noise.
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = 3.1;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2400;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      src.connect(hp).connect(this.rainGain).connect(this.master);
      src.start();
    }
    this.rainGain?.gain.setTargetAtTime(storm > 0.25 ? 0.12 * Math.min(1, (storm - 0.25) / 0.6) : 0, now, 1.2);
  }

  /** Thunder from dist metres away: a crack if it's close, then the long rumble. */
  thunder(dist, muffled = false) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.noise) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const near = Math.max(0, 1 - dist / 700);
    const loud = (0.35 + 0.5 * near) * (muffled ? 0.6 : 1);
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise;
    rumble.playbackRate.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = muffled ? 160 : 260 + 300 * near;
    const g = ctx.createGain();
    const len = 3 + 3 * (1 - near) + Math.random() * 2;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(loud, now + 0.05 + 0.4 * (1 - near));
    // Rolls: a few swells as it echoes off the cloud.
    for (let i = 1; i < 4; i++) g.gain.linearRampToValueAtTime(loud * (0.5 + 0.5 * Math.random()) * (1 - i / 5), now + (i * len) / 4);
    g.gain.exponentialRampToValueAtTime(0.001, now + len);
    rumble.connect(lp).connect(g).connect(this.master);
    rumble.start(now, Math.random() * 2);
    rumble.stop(now + len + 0.1);
    if (near > 0.4 && !muffled) {
      // A close one cracks first.
      const crack = ctx.createBufferSource();
      crack.buffer = this.noise;
      crack.playbackRate.value = 2.5;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.6 * near, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      crack.connect(hp).connect(cg).connect(this.master);
      crack.start(now);
      crack.stop(now + 0.4);
    }
  }

  /** A herring gull: two or three falling, slightly nasal calls. */
  gull() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const now = ctx.currentTime + i * 0.32;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = 1500 + Math.random() * 250;
      o.frequency.setValueAtTime(f, now);
      o.frequency.exponentialRampToValueAtTime(f * 0.62, now + 0.24);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.045, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      o.connect(bp).connect(g).connect(this.master);
      o.start(now);
      o.stop(now + 0.3);
    }
  }

  splash(gain = 0.5, freq = 900, len = 0.7) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.noise) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + len);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now, Math.random());
    src.stop(now + len + 0.1);
  }

  #build() {
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // Brown-ish noise buffer, looped.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }

    this.noise = buf;

    // Wash layers: each a band-limited noise whose level and cutoff breathe.
    const layers = [
      { period: 9.0, freq: 520, gain: 0.55, pan: -0.5 },
      { period: 12.7, freq: 380, gain: 0.5, pan: 0.45 },
      { period: 7.3, freq: 900, gain: 0.25, pan: 0.0 },
    ];
    for (const l of layers) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = l.freq;
      filter.Q.value = 0.4;

      const amp = ctx.createGain();
      amp.gain.value = l.gain * 0.5;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 1 / l.period;
      const lfoAmp = ctx.createGain();
      lfoAmp.gain.value = l.gain * 0.45;
      lfo.connect(lfoAmp).connect(amp.gain);

      const lfoF = ctx.createGain();
      lfoF.gain.value = l.freq * 0.6;
      lfo.connect(lfoF).connect(filter.frequency);

      const pan = ctx.createStereoPanner();
      pan.pan.value = l.pan;

      src.connect(filter).connect(amp).connect(pan).connect(this.master);
      src.start(0, Math.random() * 4);
      lfo.start(ctx.currentTime + Math.random() * l.period);
    }

    // Wind bed.
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    wind.playbackRate.value = 1.7;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.8;
    const wg = ctx.createGain();
    wg.gain.value = 0.06;
    wind.connect(bp).connect(wg).connect(this.master);
    wind.start();
    this.wind = { gain: wg, bp };
  }
}
