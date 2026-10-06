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
  }
}
