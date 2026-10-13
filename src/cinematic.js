import * as THREE from 'three';

// A few seconds of film: the camera moves from shot to shot on its own, with
// a line of words under each, black bars top and bottom, and the bear left
// standing still. Space (or Esc) skips it. The opening (the story of the
// Heart, down to your boat and the letter) and the ending (the Heart lifted)
// are built in src/main.js from the places they show.
//
// A shot: { from, to, look, lookTo?, dur, say?, big? } where from/to/look are
// functions returning world Vector3s (so a shot can follow something that
// moves, like your boat), or Vector3s.

const at = (p) => (typeof p === 'function' ? p() : p);
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export class Cinematic {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'cine';
    this.el.innerHTML = '<div class="bar top"></div><div class="bar bottom"></div><p class="caption"></p><p class="skip">Space to skip</p>';
    document.body.appendChild(this.el);
    this.caption = this.el.querySelector('.caption');
    this.shots = null;
    this.look = new THREE.Vector3();
  }

  get active() {
    return !!this.shots;
  }

  /** Roll it. onDone runs when it ends (or is skipped). */
  play(shots, onDone = null) {
    this.shots = shots;
    this.i = 0;
    this.t = 0;
    this.onDone = onDone;
    this.el.classList.add('on');
    document.body.classList.add('in-cine');
    this.#caption(shots[0].say, shots[0].big);
  }

  stop() {
    if (!this.shots) return;
    this.shots = null;
    this.el.classList.remove('on');
    document.body.classList.remove('in-cine');
    this.caption.classList.remove('on');
    const f = this.onDone;
    this.onDone = null;
    f?.();
  }

  #caption(text, big = false) {
    this.caption.classList.remove('on');
    clearTimeout(this.capT);
    if (!text) return;
    this.capT = setTimeout(() => {
      this.caption.textContent = text;
      this.caption.classList.toggle('big', big);
      this.caption.classList.add('on');
    }, 350);
  }

  /** A frame of it: moves the camera. Call instead of the follow camera while active. */
  update(dt, camera, input) {
    if (!this.shots) return;
    if (input?.pressed('Space', 'Escape')) {
      this.stop();
      return;
    }
    const s = this.shots[this.i];
    this.t += dt;
    const k = ease(Math.min(1, this.t / s.dur));
    camera.position.copy(at(s.from)).lerp(at(s.to), k);
    this.look.copy(at(s.look)).lerp(at(s.lookTo ?? s.look), k);
    camera.lookAt(this.look);
    if (this.t >= s.dur) {
      this.i++;
      this.t = 0;
      if (this.i >= this.shots.length) this.stop();
      else this.#caption(this.shots[this.i].say, this.shots[this.i].big);
    }
  }
}
