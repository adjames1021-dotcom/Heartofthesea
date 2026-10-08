import { ISLAND_BY_ID, islandGrid, toWorld } from '../shared/world.js';
import { mulberry32 } from '../shared/noise.js';

// Draws a treasure map the way someone would: the island's outline traced
// from its real shape, its landmarks inked in, an X, and a scribbled note.
// North is up. Nothing on it glows.

const W = 560;
const H = 430;
const INK = '#4e321b';
const RED = '#7d2a18';
export const HAND = '"Reenie Beanie", "Comic Sans MS", cursive';

/** Marching squares at `level` over an island grid. Returns world-space segments. */
function contour(g, level) {
  const segs = [];
  const { nx, nz, cell, minX, minZ, h } = g;
  const lerp = (a, b) => (level - a) / (b - a);
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      const a = h[k];
      const b = h[k + 1];
      const c = h[k + nx + 1];
      const d = h[k + nx];
      const idx = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x0 = minX + i * cell;
      const z0 = minZ + j * cell;
      const top = [x0 + lerp(a, b) * cell, z0];
      const right = [x0 + cell, z0 + lerp(b, c) * cell];
      const bottom = [x0 + lerp(d, c) * cell, z0 + cell];
      const left = [x0, z0 + lerp(a, d) * cell];
      const S = {
        1: [[left, top]], 2: [[top, right]], 3: [[left, right]], 4: [[right, bottom]],
        5: [[left, top], [right, bottom]], 6: [[top, bottom]], 7: [[left, bottom]], 8: [[bottom, left]],
        9: [[bottom, top]], 10: [[top, right], [bottom, left]], 11: [[bottom, right]], 12: [[right, left]],
        13: [[right, top]], 14: [[top, left]],
      }[idx];
      for (const s of S) segs.push(s);
    }
  }
  return segs;
}

const contourCache = new Map();
function contours(isl) {
  let c = contourCache.get(isl.id);
  if (!c) {
    const g = islandGrid(isl);
    c = {
      coast: contour(g, 0.3),
      hills: [8, 18, 40, 70].map((l) => contour(g, l)),
      // Where a reef dries or nearly dries, charted as a dotted edge.
      reef: isl.id === 'reef' ? contour(g, -0.7) : [],
      grid: g,
    };
    contourCache.set(isl.id, c);
  }
  return c;
}

function paper(ctx, rand) {
  ctx.fillStyle = '#e6d8b8';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(110, 80, 40, ${rand() * 0.06})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let i = 0; i < 3; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 30 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(150, 110, 60, 0.0)');
    g.addColorStop(0.85, 'rgba(150, 110, 60, 0.10)');
    g.addColorStop(1, 'rgba(150, 110, 60, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  edge.addColorStop(0, 'rgba(90, 60, 25, 0)');
  edge.addColorStop(1, 'rgba(90, 60, 25, 0.35)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  // Folds.
  ctx.strokeStyle = 'rgba(80, 55, 25, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 + rand() * 6, 0);
  ctx.lineTo(W / 2 - rand() * 6, H);
  ctx.moveTo(0, H / 2 + rand() * 5);
  ctx.lineTo(W, H / 2 - rand() * 5);
  ctx.stroke();
}

function glyphs(ctx, isl, P, rand) {
  const f = isl.features;
  const at = (p) => P(toWorld(isl, p.x, p.z));
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const palmGlyph = (x, y, split) => {
    const trunk = (dx) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dx * 0.4, y - 10, x + dx, y - 17);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.62;
        ctx.beginPath();
        ctx.moveTo(x + dx, y - 17);
        ctx.quadraticCurveTo(x + dx + Math.cos(a) * 6, y - 17 + Math.sin(a) * 6 - 2, x + dx + Math.cos(a) * 10, y - 17 + Math.sin(a) * 9 + 3);
        ctx.stroke();
      }
    };
    trunk(3);
    if (split) trunk(-7);
  };
  const rockGlyph = (x, y, r) => {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = r * (0.8 + rand() * 0.35);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.7;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y + r * 0.1);
    ctx.lineTo(x + r * 0.2, y - r * 0.3);
    ctx.stroke();
  };
  for (const p of f.palms ?? []) {
    const { x, y } = at(p);
    palmGlyph(x, y, p.split);
  }
  for (const r of f.rocks ?? []) {
    const { x, y } = at(r);
    rockGlyph(x, y, 4 + r.s * 1.6);
  }
  for (const s of f.shrubs ?? []) {
    const { x, y } = at(s);
    ctx.beginPath();
    ctx.arc(x - 3, y, 3, Math.PI, 0);
    ctx.arc(x + 3, y, 3, Math.PI, 0);
    ctx.stroke();
  }
  for (const s of f.stumps ?? []) {
    const { x, y } = at(s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x + 2, y - 6);
    ctx.lineTo(x + 3, y - 9);
    ctx.stroke();
  }
  for (const s of f.deadShrubs ?? []) {
    const { x, y } = at(s);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (i - 1.5) * 3, y - 5 - rand() * 3);
      ctx.stroke();
    }
  }
  for (const p of f.piglets ?? []) {
    const { x, y } = at(p);
    rockGlyph(x, y, 3 + p.r * 0.6);
  }
  // A standing rock: lumpy sides, a broken top, hatching down the shady side.
  const stack = (p, hgt, w) => {
    const { x, y } = at(p);
    const j = (a) => (rand() - 0.5) * a;
    const left = [];
    const right = [];
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      const half = w * (1 - k * 0.45);
      left.push([x - half + j(w * 0.25), y - hgt * k + j(2)]);
      right.push([x + half * 0.9 + j(w * 0.25), y - hgt * k + j(2)]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const q of left.slice(1)) ctx.lineTo(q[0], q[1]);
    // Broken top: a notch and a lean.
    const tl = left[4];
    const tr = right[4];
    ctx.lineTo(tl[0] + (tr[0] - tl[0]) * 0.35, tl[1] - 3);
    ctx.lineTo(tl[0] + (tr[0] - tl[0]) * 0.55, tl[1] + 2);
    ctx.lineTo(tr[0], tr[1] - 1);
    for (const q of right.slice(0, 4).reverse()) ctx.lineTo(q[0], q[1]);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = 0; i < Math.round(hgt / 5); i++) {
      const k = (i + 0.5) / Math.round(hgt / 5);
      const yy = y - hgt * k;
      const xr = x + w * (1 - k * 0.45) * 0.9;
      ctx.beginPath();
      ctx.moveTo(xr - 1, yy + 1);
      ctx.lineTo(xr - w * 0.45, yy + 3.5);
      ctx.stroke();
    }
    ctx.lineWidth = 1.6;
  };
  if (f.spire) stack(f.spire, 34, 9);
  if (f.big) stack(f.big, 30, 10);
  if (f.small) stack(f.small, 22, 8);
  if (f.light) {
    // The lighthouse: a tapering tower, a lantern, a cap.
    const { x, y } = at(f.light);
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x - 2.5, y - 20);
    ctx.lineTo(x + 2.5, y - 20);
    ctx.lineTo(x + 4, y);
    ctx.moveTo(x - 3.2, y - 10);
    ctx.lineTo(x + 3.2, y - 10);
    ctx.stroke();
    ctx.strokeRect(x - 2.5, y - 25, 5, 5);
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 25);
    ctx.lineTo(x, y - 29);
    ctx.lineTo(x + 3.5, y - 25);
    ctx.stroke();
  }
  if (f.bigTree) {
    const { x, y } = at(f.bigTree);
    ctx.beginPath();
    ctx.moveTo(x - 1.5, y);
    ctx.lineTo(x - 1, y - 9);
    ctx.moveTo(x + 1.5, y);
    ctx.lineTo(x + 1, y - 9);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI;
      ctx.arc(x + Math.cos(a) * 8, y - 14 + Math.sin(a) * 5, 4.5, a - 1.2, a + 1.2);
    }
    ctx.stroke();
  }
  if (f.lake) {
    // The crater lake: a ring with a few ripples.
    const { x, y } = at({ x: 0, z: 0 });
    ctx.beginPath();
    ctx.ellipse(x, y, 13, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const [dx, dy] of [[-5, -2], [3, 2]]) {
      ctx.beginPath();
      ctx.moveTo(x + dx - 3, y + dy);
      ctx.quadraticCurveTo(x + dx, y + dy - 2, x + dx + 3, y + dy);
      ctx.stroke();
    }
    ctx.lineWidth = 1.6;
  }
  if (f.rock) stack(f.rock, 16, 6);
  if (f.wreck) {
    const { x, y } = at(f.wreck);
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 2);
    ctx.quadraticCurveTo(x, y + 8, x + 14, y - 2);
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x - 2, y - 18);
    ctx.moveTo(x + 5, y);
    ctx.lineTo(x + 8, y - 12);
    ctx.stroke();
  }
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw `map` ({ id, island, title, mark, note }) into a new canvas. */
export function drawMap(map) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  let seed = 0;
  for (const ch of map.id ?? map.island) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rand = mulberry32(seed);
  paper(ctx, rand);

  const isl = ISLAND_BY_ID[map.island];
  const c = contours(isl);
  // Frame the island's land.
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [[ax, az], [bx, bz]] of c.coast) {
    x0 = Math.min(x0, ax, bx);
    x1 = Math.max(x1, ax, bx);
    z0 = Math.min(z0, az, bz);
    z1 = Math.max(z1, az, bz);
  }
  // ...and the things off the beach people steer by.
  const f = isl.features ?? {};
  const marks = [];
  if (f.wreck) marks.push([f.wreck.x, f.wreck.z, 16]);
  for (const p of f.piglets ?? []) marks.push([p.x, p.z, p.r + 2]);
  for (const [lx, lz, r] of marks) {
    const w = toWorld(isl, lx, lz);
    x0 = Math.min(x0, w.x - r);
    x1 = Math.max(x1, w.x + r);
    z0 = Math.min(z0, w.z - r);
    z1 = Math.max(z1, w.z + r);
  }
  const pad = 0.22;
  const spanX = (x1 - x0) * (1 + pad * 2) || 1;
  const spanZ = (z1 - z0) * (1 + pad * 2) || 1;
  const box = { x: 40, y: 58, w: W - 80, h: H - 170 };
  const scale = Math.min(box.w / spanX, box.h / spanZ);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const P = (p) => ({ x: box.x + box.w / 2 + (p.x - cx) * scale, y: box.y + box.h / 2 + (p.z - cz) * scale });

  // Everything drawn from the island stays inside its part of the sheet.
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x - 20, box.y - 10, box.w + 40, box.h + 22);
  ctx.clip();
  if (c.reef.length) {
    ctx.fillStyle = 'rgba(78, 50, 27, 0.55)';
    for (let i = 0; i < c.reef.length; i += 3) {
      const p = P({ x: c.reef[i][0][0], z: c.reef[i][0][1] });
      ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
    }
  }
  // Shallows: short hatching just off the coast.
  ctx.strokeStyle = 'rgba(78, 50, 27, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < c.coast.length; i += 9) {
    const [[ax, az]] = c.coast[i];
    const p = P({ x: ax, z: az });
    ctx.beginPath();
    ctx.moveTo(p.x + 3, p.y + 3);
    ctx.lineTo(p.x + 7, p.y + 5);
    ctx.stroke();
  }
  // Hills, then the coast.
  ctx.strokeStyle = 'rgba(78, 50, 27, 0.45)';
  ctx.lineWidth = 1;
  for (const segs of c.hills) {
    for (const [a, b] of segs) {
      const pa = P({ x: a[0], z: a[1] });
      const pb = P({ x: b[0], z: b[1] });
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  for (const [a, b] of c.coast) {
    const pa = P({ x: a[0], z: a[1] });
    const pb = P({ x: b[0], z: b[1] });
    ctx.beginPath();
    ctx.moveTo(pa.x + (rand() - 0.5) * 0.8, pa.y + (rand() - 0.5) * 0.8);
    ctx.lineTo(pb.x + (rand() - 0.5) * 0.8, pb.y + (rand() - 0.5) * 0.8);
    ctx.stroke();
  }
  glyphs(ctx, isl, P, rand);
  ctx.restore();

  // The X.
  if (map.mark) {
    const m = P(map.mark);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m.x - 8, m.y - 8);
    ctx.lineTo(m.x + 8, m.y + 7);
    ctx.moveTo(m.x + 8, m.y - 7);
    ctx.lineTo(m.x - 7, m.y + 8);
    ctx.stroke();
  }

  // North.
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(W - 46, 74);
  ctx.lineTo(W - 46, 40);
  ctx.lineTo(W - 51, 49);
  ctx.moveTo(W - 46, 40);
  ctx.lineTo(W - 41, 49);
  ctx.stroke();
  ctx.font = `26px ${HAND}`;
  ctx.fillText('N', W - 53, 34);

  // Title and note.
  ctx.font = `30px ${HAND}`;
  ctx.fillText(map.title ?? isl.name, 34, 40);
  ctx.font = `26px ${HAND}`;
  const lines = wrap(ctx, map.note ?? '', W - 70);
  lines.forEach((l, i) => ctx.fillText(l, 34, H - 92 + i * 27));
  return canvas;
}
