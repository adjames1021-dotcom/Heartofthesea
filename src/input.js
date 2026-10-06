// Keyboard and mouse. Mouse look uses pointer lock once the player clicks in.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.hits = new Set(); // pressed this frame
    this.mouse = { dx: 0, dy: 0, wheel: 0 };
    this.locked = false;
    this.dragging = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLElement && e.target.closest('button, input')) return;
      this.down.add(e.code);
      this.hits.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && e.button === 0) canvas.requestPointerLock?.();
      this.dragging = true;
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  held(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  pressed(...codes) {
    return codes.some((c) => this.hits.has(c));
  }

  /** −1, 0 or 1 from a pair of keys. */
  axis(neg, pos) {
    return (this.held(...[].concat(pos)) ? 1 : 0) - (this.held(...[].concat(neg)) ? 1 : 0);
  }

  endFrame() {
    this.hits.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }
}
