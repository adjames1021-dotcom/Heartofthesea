import * as THREE from 'three';
import { groundAt } from '../shared/world.js';

// Where villagers can walk: a grid over a village, each half-metre square
// either clear or not (a wall, a boat, a crate, the fire, the sea). Their
// routes go straight where they can and find a way round where they can't,
// so nobody walks through a hut.

const _p = new THREE.Vector3();

export class NavGrid {
  /**
   * world: the collision world; bounds: { x0, z0, x1, z1 } in world metres;
   * extra(x, z): anything else that's in the way (for walking only).
   */
  constructor(world, bounds, extra = () => false, cell = 0.5) {
    this.cell = cell;
    this.x0 = bounds.x0;
    this.z0 = bounds.z0;
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / cell);
    this.nz = Math.ceil((bounds.z1 - bounds.z0) / cell);
    this.blocked = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = this.x0 + (i + 0.5) * cell;
        const z = this.z0 + (j + 0.5) * cell;
        const g = groundAt(x, z);
        let b = g < 0.0 || extra(x, z);
        if (!b) b = world.blocked(_p.set(x, g + 0.55, z), 0.3, true) || world.blocked(_p.set(x, g + 1.05, z), 0.3, true);
        this.blocked[j * this.nx + i] = b ? 1 : 0;
      }
    }
  }

  #idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  free(x, z) {
    const k = this.#idx(x, z);
    return k < 0 || !this.blocked[k]; // off the grid: not ours to say
  }

  /** Can you walk straight from a to b? */
  lineClear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / 0.2));
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (!this.free(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** The nearest clear square to (x, z), as an index. */
  #nearestFree(x, z) {
    const i0 = Math.floor((x - this.x0) / this.cell);
    const j0 = Math.floor((z - this.z0) / this.cell);
    for (let r = 0; r < 12; r++) {
      let best = -1;
      let bd = Infinity;
      for (let j = j0 - r; j <= j0 + r; j++) {
        for (let i = i0 - r; i <= i0 + r; i++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const k = j * this.nx + i;
          if (this.blocked[k]) continue;
          const d = (i - i0) ** 2 + (j - j0) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  #center(k) {
    return { x: this.x0 + ((k % this.nx) + 0.5) * this.cell, z: this.z0 + (Math.floor(k / this.nx) + 0.5) * this.cell };
  }

  /**
   * A way round from a to b: the points to walk through between them
   * (not including a and b), or [] if it's straight or there's no way.
   */
  find(a, b) {
    if (this.lineClear(a, b)) return [];
    const start = this.#nearestFree(a.x, a.z);
    const goal = this.#nearestFree(b.x, b.z);
    if (start < 0 || goal < 0) return [];
    const n = this.nx * this.nz;
    const g = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gx = goal % this.nx;
    const gz = Math.floor(goal / this.nx);
    const h = (k) => Math.hypot((k % this.nx) - gx, Math.floor(k / this.nx) - gz);
    // A small binary heap of [f, k].
    const heap = [];
    const push = (f, k) => {
      heap.push([f, k]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    g[start] = 0;
    push(h(start), start);
    const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    let guard = 0;
    while (heap.length && guard++ < 40000) {
      const [, k] = pop();
      if (closed[k]) continue;
      if (k === goal) {
        found = true;
        break;
      }
      closed[k] = 1;
      const i = k % this.nx;
      const j = Math.floor(k / this.nx);
      for (const [di, dj, c] of steps) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.nx || nj >= this.nz) continue;
        const nk = nj * this.nx + ni;
        if (this.blocked[nk] || closed[nk]) continue;
        // No cutting corners past a wall.
        if (di && dj && (this.blocked[j * this.nx + ni] || this.blocked[nj * this.nx + i])) continue;
        const ng = g[k] + c;
        if (ng < g[nk]) {
          g[nk] = ng;
          from[nk] = k;
          push(ng + h(nk), nk);
        }
      }
    }
    if (!found) return [];
    const cells = [];
    for (let k = goal; k >= 0; k = from[k]) cells.push(this.#center(k));
    cells.reverse();
    // Pull it taut: keep only the corners you can't see past.
    const out = [];
    let anchor = a;
    for (let i = 1; i < cells.length; i++) {
      if (!this.lineClear(anchor, cells[i])) {
        out.push(cells[i - 1]);
        anchor = cells[i - 1];
      }
    }
    if (!this.lineClear(anchor, b) && cells.length) out.push(cells[cells.length - 1]);
    return out;
  }
}
