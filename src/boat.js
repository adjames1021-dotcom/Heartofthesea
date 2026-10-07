import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { BOAT, createBoat, stepBoat } from '../shared/boat.js';
import { heightAt } from '../shared/waves.js';
import { smoothstep, clamp } from '../shared/noise.js';
import { loftHull, loftDeck, canvasTexture } from './hull.js';
import { segment, paint, mergeParts } from './props.js';

// The player's boat: an 11.4 m sloop in the spirit of your photos (white hull,
// navy cove and boot stripes, teak decks, furling genoa). Physics lives in
// shared/boat.js; this file draws it, floats it on the waves, and describes
// the walkable surfaces and crew stations.
//
// Boat-local frame: +x forward, +y up (0 = waterline), +z starboard.

const L = BOAT.length;
const uOf = (x) => (L / 2 - x) / L;
export const hb = (u) =>
  1.95 * (u < 0.55 ? Math.pow(Math.sin((u / 0.55) * (Math.PI / 2)), 0.62) : 1 - 0.11 * smoothstep(0.55, 1, u));
export const sheerY = (u) => 1.27 - 0.27 * u + 0.06 * (1 - u) ** 3;
const keelD = (u) => 0.55 * smoothstep(0, 0.16, u) * (1 - 0.5 * smoothstep(0.72, 1, u));
export const deckAt = (x) => sheerY(uOf(x));
export const halfAt = (x) => hb(uOf(x));

export const LAYOUT = {
  cabin: { x0: -1.2, x1: 2.3, w0: 0.98, w1: 0.78, h: 0.55 },
  cockpit: { x0: -5.7, x1: -1.2, sole: 0.65, half: 1.4, benchX0: -3.2, benchIn: 0.9, benchTop: 1.0 },
  mast: { x: 1.4, top: 16.5, r: 0.11 },
  boom: { x: 1.27, y: 2.95, len: 4.6 },
  wheel: { x: -4.0, y: 1.5, r: 0.46 },
  platform: { x0: -6.35, x1: -5.7, half: 0.8, y: 0.3 },
  forestay: { tack: new THREE.Vector3(5.62, 1.35, 0), head: new THREE.Vector3(1.45, 16.35, 0) },
};

/** Crew stations, boat-local. `stand` is where the bear stands, facing +x. */
export const STATIONS = {
  helm: { stand: new THREE.Vector3(-4.62, LAYOUT.cockpit.sole, 0), label: 'Take the helm', anim: 'helm' },
  halyards: { stand: new THREE.Vector3(-1.62, LAYOUT.cockpit.sole, -0.85), label: 'Halyards', anim: 'haul' },
  windlass: { stand: new THREE.Vector3(4.35, deckAt(4.35), 0), label: 'Windlass', anim: 'crank' },
};

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

const V_TOP = 1.45;
const V_RANGE = 2.1;
const vOfY = (y) => (V_TOP - y) / V_RANGE;

let tex = null;
function textures() {
  if (tex) return tex;
  const hull = canvasTexture(1024, 256, (ctx, w, h) => {
    const Y = (y) => vOfY(y) * h;
    ctx.fillStyle = '#f4f3ef';
    ctx.fillRect(0, 0, w, h);
    // Navy cove stripe just under the sheer, following it bow to stern.
    ctx.fillStyle = '#1f3157';
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const u = i / 64;
      const x = u * w;
      const y = Y(sheerY(u) - 0.07);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = 64; i >= 0; i--) {
      const u = i / 64;
      ctx.lineTo(u * w, Y(sheerY(u) - 0.17));
    }
    ctx.closePath();
    ctx.fill();
    // Hull windows.
    ctx.fillStyle = '#20262c';
    const win = (u0, u1, y0, y1) => ctx.fillRect(u0 * w, Y(y1), (u1 - u0) * w, Y(y0) - Y(y1));
    win(0.36, 0.53, 0.6, 0.72);
    win(0.255, 0.3, 0.64, 0.72);
    // Boot stripe and antifouling.
    ctx.fillStyle = '#1f3157';
    ctx.fillRect(0, Y(0.14), w, Y(0.03) - Y(0.14));
    ctx.fillStyle = '#1a1f29';
    ctx.fillRect(0, Y(0.03), w, h - Y(0.03));
  });
  const teak = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b8895a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${120 + (i % 5) * 9}, ${84 + (i % 3) * 6}, 50, 0.18)`;
      ctx.fillRect((i * 71) % w, (i * 29) % h, 40 + (i % 7) * 12, 7);
    }
    ctx.fillStyle = '#3a2a1c';
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1.5);
  }, { repeat: [3, 1] });
  const sail = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f5f2ea';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(150,145,135,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i / 9) * h);
      ctx.lineTo(w, (i / 9) * h * 0.92 + h * 0.04);
      ctx.stroke();
    }
    // Leech tape.
    ctx.fillStyle = 'rgba(160,150,135,0.5)';
    ctx.fillRect(w - 5, 0, 5, h);
  });
  tex = { hull, teak, sail };
  return tex;
}

// ---------------------------------------------------------------------------

const WHITE = '#f2f1ec';
const METAL = '#b9bec3';
const DARK = '#2b3034';
const NAVY = '#1f3157';

function sideStrip(x0, x1, inner, outer, height, n = 10) {
  // Two strips (port and starboard) of deck between z = inner(x) and outer(x).
  const pos = [];
  const uv = [];
  const idx = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = height(x);
      pos.push(x, y, side * inner(x), x, y, side * outer(x));
      uv.push(uOf(x), 0, uOf(x), 0.25);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      if (side > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  return g;
}

function buildStatic() {
  const t = textures();
  const group = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ map: t.hull });
  const teakMat = new THREE.MeshLambertMaterial({ map: t.teak });
  const whiteMat = new THREE.MeshLambertMaterial({ color: WHITE, side: THREE.DoubleSide });
  const fitMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const add = (geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Hull.
  add(loftHull({ length: L, stations: 30, ring: 9, halfBreadth: hb, sheer: sheerY, keel: keelD, power: 3.4, transom: false, vOfY }), hullMat);

  // Transom, with a step down to the swim platform in the middle.
  {
    const u = 1;
    const ring = 9;
    const shape = new THREE.Shape();
    const pts = [];
    for (let k = 0; k <= 2 * ring; k++) {
      const tt = (k - ring) / ring;
      const phi = (1 - Math.abs(tt)) * (Math.PI / 2);
      const e = 2 / 3.4;
      const xs = hb(u) * Math.pow(Math.cos(phi), e);
      const y = sheerY(u) - (sheerY(u) + keelD(u)) * Math.pow(Math.sin(phi), e);
      pts.push(new THREE.Vector2((tt < 0 ? -1 : 1) * xs, y));
    }
    shape.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) shape.lineTo(p.x, p.y);
    const gap = 0.6;
    shape.lineTo(gap, sheerY(u));
    shape.lineTo(gap, LAYOUT.cockpit.sole);
    shape.lineTo(-gap, LAYOUT.cockpit.sole);
    shape.lineTo(-gap, sheerY(u));
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateY(-Math.PI / 2);
    g.translate(-L / 2, 0, 0);
    add(g, whiteMat);
  }

  // Decks.
  const c = LAYOUT.cabin;
  const k = LAYOUT.cockpit;
  add(loftDeck({ length: L, u0: 0, u1: uOf(c.x1), stations: 10, halfBreadth: hb, sheer: sheerY, camber: 0.03 }), teakMat);
  const cabinHalf = (x) => c.w0 + ((x - c.x0) / (c.x1 - c.x0)) * (c.w1 - c.w0);
  add(sideStrip(c.x0, c.x1, cabinHalf, halfAt, deckAt), teakMat);
  add(sideStrip(k.x0, k.x1, () => k.half, halfAt, deckAt), teakMat);
  // Cockpit sole and walls.
  add(quad([k.x0, k.sole, -k.half], [k.x0, k.sole, k.half], [k.x1, k.sole, k.half], [k.x1, k.sole, -k.half]), teakMat);
  for (const side of [-1, 1]) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const xa = k.x0 + ((k.x1 - k.x0) * i) / n;
      const xb = k.x0 + ((k.x1 - k.x0) * (i + 1)) / n;
      add(quad([xa, k.sole, side * k.half], [xb, k.sole, side * k.half], [xb, deckAt(xb), side * k.half], [xa, deckAt(xa), side * k.half]), whiteMat, false);
    }
  }
  // Bulkhead under the companionway.
  add(quad([k.x1, k.sole, -k.half], [k.x1, k.sole, k.half], [k.x1, deckAt(k.x1), k.half], [k.x1, deckAt(k.x1), -k.half]), whiteMat, false);
  // Benches.
  for (const side of [-1, 1]) {
    const bench = new THREE.BoxGeometry(k.x1 - k.benchX0, k.benchTop - k.sole, k.half - k.benchIn);
    bench.translate((k.x1 + k.benchX0) / 2, (k.benchTop + k.sole) / 2, side * (k.half + k.benchIn) / 2);
    add(bench, teakMat);
  }
  // Swim platform.
  const p = LAYOUT.platform;
  const plat = new THREE.BoxGeometry(p.x1 - p.x0, 0.1, p.half * 2);
  plat.translate((p.x0 + p.x1) / 2, p.y - 0.05, 0);
  add(plat, teakMat);

  // Coachroof.
  const d0 = deckAt(c.x0);
  const d1 = deckAt(c.x1);
  const roof = new ConvexGeometry([
    new THREE.Vector3(c.x0, d0 - 0.05, -c.w0), new THREE.Vector3(c.x0, d0 - 0.05, c.w0),
    new THREE.Vector3(c.x1, d1 - 0.05, -c.w1), new THREE.Vector3(c.x1, d1 - 0.05, c.w1),
    new THREE.Vector3(c.x0 + 0.1, d0 + c.h, -(c.w0 - 0.13)), new THREE.Vector3(c.x0 + 0.1, d0 + c.h, c.w0 - 0.13),
    new THREE.Vector3(c.x1 - 0.35, d1 + c.h - 0.06, -(c.w1 - 0.13)), new THREE.Vector3(c.x1 - 0.35, d1 + c.h - 0.06, c.w1 - 0.13),
  ]);
  add(roof, new THREE.MeshLambertMaterial({ color: WHITE, flatShading: true }));

  // Fittings: keel, rudder, mast, spars, rails, winches... all one mesh.
  const parts = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Fin keel and bulb.
  const fin = new THREE.BoxGeometry(1.15, 1.25, 0.16);
  fin.translate(-0.25, -0.5 - 0.62, 0);
  parts.push(paint(fin, DARK));
  const bulb = new THREE.SphereGeometry(1, 12, 8);
  bulb.scale(1.0, 0.2, 0.26);
  bulb.translate(-0.4, -1.78, 0);
  parts.push(paint(bulb, DARK));
  const rudder = new THREE.BoxGeometry(0.5, 1.1, 0.08);
  rudder.translate(-4.65, -0.75, 0);
  parts.push(paint(rudder, DARK));
  // Mast and spreaders.
  const m = LAYOUT.mast;
  parts.push(paint(segment(V(m.x, deckAt(m.x) + c.h - 0.05, 0), V(m.x, m.top, 0), m.r, m.r * 0.6, 8), METAL));
  for (const [y, w] of [[7.2, 0.95], [11.7, 0.62]]) {
    parts.push(paint(segment(V(m.x - 0.05, y, -w), V(m.x - 0.05, y, w), 0.03, 0.03, 4), METAL));
  }
  // Stanchions, pulpit, pushpit.
  const posts = [4.85, 3.55, 2.2, 0.8, -0.6, -2.0, -3.4, -4.8, -5.55];
  for (const x of posts) {
    for (const side of [-1, 1]) {
      const z = side * (halfAt(x) - 0.06);
      parts.push(paint(segment(V(x, deckAt(x), z), V(x, deckAt(x) + 0.62, z), 0.02, 0.02, 4), METAL));
    }
  }
  const pulpitY = deckAt(5.2) + 0.62;
  parts.push(paint(segment(V(4.85, pulpitY, -(halfAt(4.85) - 0.06)), V(5.45, pulpitY, 0), 0.022, 0.022, 4), METAL));
  parts.push(paint(segment(V(4.85, pulpitY, halfAt(4.85) - 0.06), V(5.45, pulpitY, 0), 0.022, 0.022, 4), METAL));
  parts.push(paint(segment(V(5.45, deckAt(5.45), 0), V(5.45, pulpitY, 0), 0.022, 0.022, 4), METAL));
  const pushY = deckAt(-5.55) + 0.62;
  for (const side of [-1, 1]) {
    parts.push(paint(segment(V(-5.55, pushY, side * (halfAt(-5.55) - 0.06)), V(-5.6, pushY, side * 0.62), 0.022, 0.022, 4), METAL));
    parts.push(paint(segment(V(-5.6, deckAt(-5.6), side * 0.62), V(-5.6, pushY, side * 0.62), 0.022, 0.022, 4), METAL));
  }
  // Wheel pedestal.
  const w = LAYOUT.wheel;
  parts.push(paint(segment(V(w.x - 0.08, k.sole, 0), V(w.x - 0.08, w.y - 0.05, 0), 0.07, 0.06, 8), DARK));
  // Winches: primaries on the coamings, halyard winches on the coachroof.
  for (const side of [-1, 1]) {
    for (const [x, y, z] of [[-3.55, deckAt(-3.55), side * 1.62], [-0.95, d0 + c.h, side * 0.72]]) {
      parts.push(paint(segment(V(x, y, z), V(x, y + 0.17, z), 0.1, 0.08, 10), METAL));
    }
  }
  // Windlass and the anchor in its bow roller.
  const wl = new THREE.BoxGeometry(0.35, 0.22, 0.3);
  wl.translate(4.95, deckAt(4.95) + 0.11, 0);
  parts.push(paint(wl, METAL));
  const anchor = new THREE.BoxGeometry(0.45, 0.12, 0.3);
  anchor.translate(5.75, 1.25, 0);
  parts.push(paint(anchor, '#7d8288'));
  // Companionway hatch.
  const hatch = new THREE.BoxGeometry(0.05, 0.42, 0.62);
  hatch.translate(c.x0 - 0.01, (d0 + k.sole) / 2 + 0.12, 0);
  parts.push(paint(hatch, '#33393f'));
  // Cabin windows.
  for (const side of [-1, 1]) {
    const win = new THREE.BoxGeometry(1.9, 0.13, 0.02);
    win.rotateX(-side * 0.21);
    win.translate((c.x0 + c.x1) / 2 - 0.15, d0 + 0.3, side * (c.w0 + c.w1) / 2 - side * 0.06);
    parts.push(paint(win, '#20262c'));
  }
  const fittings = new THREE.Mesh(mergeParts(parts), fitMat);
  fittings.castShadow = true;
  fittings.receiveShadow = true;
  group.add(fittings);

  // Rigging and lifelines as thin lines.
  const rig = [];
  const line = (a, b) => rig.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const top = V(m.x, m.top - 0.1, 0);
  line(LAYOUT.forestay.tack, LAYOUT.forestay.head);
  line(top, V(-5.62, deckAt(-5.6) + 0.1, 0));
  for (const side of [-1, 1]) {
    const chain = V(1.05, deckAt(1.05), side * (halfAt(1.05) - 0.08));
    const sp1 = V(m.x - 0.05, 7.2, side * 0.95);
    const sp2 = V(m.x - 0.05, 11.7, side * 0.62);
    line(chain, sp1);
    line(sp1, sp2);
    line(sp2, top);
    line(V(1.75, deckAt(1.75), side * (halfAt(1.75) - 0.1)), V(m.x, 7.0, 0));
    for (const hgt of [0.32, 0.62]) {
      for (let i = 0; i + 1 < posts.length; i++) {
        const a = posts[i];
        const b = posts[i + 1];
        line(V(a, deckAt(a) + hgt, side * (halfAt(a) - 0.06)), V(b, deckAt(b) + hgt, side * (halfAt(b) - 0.06)));
      }
    }
  }
  const rigGeo = new THREE.BufferGeometry();
  rigGeo.setAttribute('position', new THREE.Float32BufferAttribute(rig, 3));
  group.add(new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({ color: '#3c4246' })));
  return group;
}

// ---------------------------------------------------------------------------
// Sails: cloth grids rebuilt every frame from the physics.
// ---------------------------------------------------------------------------

class SailMesh {
  constructor(nu, nv, material) {
    this.nu = nu;
    this.nv = nv;
    const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
    const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
    const idx = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const k = j * (nu + 1) + i;
        uv[k * 2] = i / nu;
        uv[k * 2 + 1] = j / nv;
        if (i < nu && j < nv) {
          const a = k;
          const b = k + 1;
          const c = k + nu + 1;
          const d = c + 1;
          idx.push(a, b, c, b, d, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  /** fn(i/nu, j/nv, out) writes the boat-local vertex. */
  build(fn) {
    const p = this.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let j = 0; j <= this.nv; j++) {
      for (let i = 0; i <= this.nu; i++) {
        fn(i / this.nu, j / this.nv, v);
        p.setXYZ(j * (this.nu + 1) + i, v.x, v.y, v.z);
      }
    }
    p.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

const REEF_LUFF = [1, 0.82, 0.66];

export class Boat {
  constructor({ x, z, heading }) {
    this.state = createBoat({ x, z, heading });
    this.root = new THREE.Group();
    this.root.name = 'boat';
    this.root.add(buildStatic());

    const t = textures();
    const sailMat = new THREE.MeshLambertMaterial({ map: t.sail, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.04 });
    this.main = new SailMesh(6, 10, sailMat);
    this.jib = new SailMesh(6, 9, sailMat);
    this.root.add(this.main.mesh, this.jib.mesh);

    // Boom with the lazy bag on top.
    this.boom = new THREE.Group();
    this.boom.position.set(LAYOUT.boom.x, LAYOUT.boom.y, 0);
    const boomParts = [
      paint(segment(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-LAYOUT.boom.len, 0, 0), 0.075, 0.06, 8), METAL),
    ];
    const bag = new THREE.BoxGeometry(LAYOUT.boom.len - 0.3, 0.32, 0.26);
    bag.translate(-LAYOUT.boom.len / 2 - 0.1, 0.2, 0);
    boomParts.push(paint(bag, NAVY));
    const boomMesh = new THREE.Mesh(mergeParts(boomParts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    boomMesh.castShadow = true;
    this.boom.add(boomMesh);
    this.root.add(this.boom);

    // Furled genoa: a slim roll up the forestay with its navy sun strip.
    const fs = LAYOUT.forestay;
    this.furl = new THREE.Mesh(
      mergeParts([paint(segment(fs.tack.clone().add(new THREE.Vector3(-0.03, 0.4, 0)), fs.tack.clone().lerp(fs.head, 0.84), 0.075, 0.035, 6), NAVY)]),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    this.root.add(this.furl);

    // Wheel.
    this.wheel = new THREE.Group();
    this.wheel.position.set(LAYOUT.wheel.x, LAYOUT.wheel.y, 0);
    const wparts = [];
    const rim = new THREE.TorusGeometry(LAYOUT.wheel.r, 0.025, 6, 28);
    rim.rotateY(Math.PI / 2);
    wparts.push(paint(rim, METAL));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      wparts.push(paint(segment(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, Math.cos(a) * LAYOUT.wheel.r, Math.sin(a) * LAYOUT.wheel.r), 0.012, 0.012, 4), METAL));
    }
    const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10);
    hub.rotateZ(Math.PI / 2);
    wparts.push(paint(hub, DARK));
    this.wheel.add(new THREE.Mesh(mergeParts(wparts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    this.root.add(this.wheel);

    // The black anchor ball: hoisted on the forestay while she's at anchor,
    // so anyone can see from afar that she's anchored.
    const fsl = LAYOUT.forestay;
    this.anchorBall = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshLambertMaterial({ color: '#141414' }));
    this.anchorBall.castShadow = true;
    this.anchorBallUp = fsl.tack.clone().lerp(fsl.head, 0.33).add(new THREE.Vector3(-0.15, 0, 0));
    this.anchorBallDown = fsl.tack.clone().lerp(fsl.head, 0.04).add(new THREE.Vector3(-0.15, 0, 0));
    this.anchorBall.position.copy(this.anchorBallDown);
    this.anchorBall.visible = false;
    this.root.add(this.anchorBall);

    // Masthead wind indicator and a pennant on the backstay.
    this.windex = new THREE.Group();
    this.windex.position.set(LAYOUT.mast.x, LAYOUT.mast.top + 0.12, 0);
    const vane = new THREE.Mesh(
      mergeParts([paint(segment(new THREE.Vector3(0.35, 0, 0), new THREE.Vector3(-0.35, 0, 0), 0.012, 0.012, 3), DARK)]),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    );
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshBasicMaterial({ color: '#c23a2b', side: THREE.DoubleSide }));
    fin.position.set(-0.3, 0.02, 0);
    this.windex.add(vane, fin);
    this.root.add(this.windex);

    this.pennant = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9 * 3), 3)),
      new THREE.MeshLambertMaterial({ color: NAVY, side: THREE.DoubleSide }),
    );
    this.pennant.frustumCulled = false;
    this.root.add(this.pennant);

    // Navigation lights.
    // Navigation lights, each in a small black housing where a real boat
    // carries them: red and green on the bow flanks, white on the stern
    // rail, a steaming light on the front of the mast, the anchor light on top.
    const housingMat = new THREE.MeshLambertMaterial({ color: '#1c1e20' });
    const lamp = (color, pos, housing = null) => {
      const mat = new THREE.MeshBasicMaterial({ color: '#333333' });
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat);
      m.position.copy(pos);
      this.root.add(m);
      if (housing) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(...housing.size), housingMat);
        h.position.copy(pos).add(housing.offset);
        this.root.add(h);
      }
      // Bright enough to bloom a little, not enough to glare.
      return { mat, on: new THREE.Color(color).multiplyScalar(white(color) ? 1.6 : 2.6), off: new THREE.Color('#2f3336') };
    };
    const white = (c) => c === '#fff3d6';
    const sx = 4.3;
    const sy = deckAt(sx) - 0.12;
    const sz = halfAt(sx) + 0.04;
    const side = { size: [0.26, 0.16, 0.06], offset: new THREE.Vector3(-0.08, 0, 0) };
    const sternX = -5.62;
    this.lamps = {
      port: lamp('#ff2a20', new THREE.Vector3(sx, sy, -sz), { ...side, offset: new THREE.Vector3(-0.08, 0, 0.03) }),
      starboard: lamp('#22ff55', new THREE.Vector3(sx, sy, sz), { ...side, offset: new THREE.Vector3(-0.08, 0, -0.03) }),
      stern: lamp('#fff3d6', new THREE.Vector3(sternX, deckAt(sternX) + 0.72, 0), { size: [0.1, 0.12, 0.14], offset: new THREE.Vector3(0.06, 0, 0) }),
      steaming: lamp('#fff3d6', new THREE.Vector3(LAYOUT.mast.x + 0.16, 9.2, 0), { size: [0.1, 0.14, 0.14], offset: new THREE.Vector3(-0.07, 0, 0) }),
      anchor: lamp('#fff3d6', new THREE.Vector3(LAYOUT.mast.x, LAYOUT.mast.top + 0.22, 0), { size: [0.05, 0.2, 0.05], offset: new THREE.Vector3(0, -0.14, 0) }),
      // Working lights so you can see the deck: a floodlight on the front of
      // the mast under the spreaders, and a lamp over the companionway.
      deck: lamp('#ffe6b8', new THREE.Vector3(LAYOUT.mast.x + 0.17, 6.85, 0), { size: [0.12, 0.1, 0.2], offset: new THREE.Vector3(-0.05, 0.05, 0) }),
      cockpit: lamp('#ffd9a0', new THREE.Vector3(LAYOUT.cabin.x0 - 0.06, deckAt(LAYOUT.cabin.x0) + LAYOUT.cabin.h + 0.02, 0), { size: [0.1, 0.06, 0.22], offset: new THREE.Vector3(0.02, 0.05, 0) }),
    };
    // The real light they throw. Kept in the scene and dimmed rather than
    // removed, so switching them doesn't make every material recompile.
    this.deckLight = new THREE.PointLight('#ffe2b0', 0, 13, 1.4);
    this.deckLight.position.set(LAYOUT.mast.x + 0.4, 6.6, 0);
    this.cockpitLight = new THREE.PointLight('#ffcf8a', 0, 7, 1.5);
    this.cockpitLight.position.set(LAYOUT.cabin.x0 - 0.4, deckAt(LAYOUT.cabin.x0) + LAYOUT.cabin.h - 0.05, 0);
    this.root.add(this.deckLight, this.cockpitLight);

    // Telltales: wool ribbons on the shrouds and the stern rail that stream
    // away from the wind, so you can see where it's coming from.
    this.telltales = [];
    const ribbon = (color, pos) => {
      const pivot = new THREE.Group();
      pivot.position.copy(pos);
      const g = new THREE.PlaneGeometry(0.6, 0.09, 6, 1);
      g.translate(0.3, 0, 0);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
      pivot.add(mesh);
      this.root.add(pivot);
      this.telltales.push({ pivot, mesh, base: g.attributes.position.array.slice(), phase: Math.random() * 10 });
    };
    for (const sideZ of [-1, 1]) {
      // On each upper shroud, about head height above the side deck.
      const a = new THREE.Vector3(1.05, deckAt(1.05), sideZ * (halfAt(1.05) - 0.08));
      const b2 = new THREE.Vector3(LAYOUT.mast.x - 0.05, 7.2, sideZ * 0.95);
      for (const h of [1.7, 2.4]) {
        const t = h / (b2.y - a.y);
        ribbon(sideZ < 0 ? '#c8322a' : '#2f9a4a', a.clone().lerp(b2, t));
      }
    }
    ribbon('#d8d0bd', new THREE.Vector3(-5.62, deckAt(-5.6) + 0.95, 0));

    // Anchor chain, from the roller down toward the water.
    this.chain = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3)),
      new THREE.LineBasicMaterial({ color: '#4a4f54' }),
    );
    this.chain.frustumCulled = false;
    this.root.add(this.chain);

    // Smoothed visual state.
    this.vis = { heave: 0, heaveV: 0, pitch: 0, roll: 0, boom: 0, boomV: 0, jib: 0, fillM: 0, fillJ: 0 };
    this.matrix = new THREE.Matrix4();
    this.prevMatrix = new THREE.Matrix4();
    this.colliders = buildColliders();
    this.time = 0;
  }

  /** Fixed-step physics. */
  step(dt, env) {
    stepBoat(this.state, dt, env);
  }

  /** Float on the waves, move the spars and sails. Call once per frame. */
  update(dt, t, waveScale) {
    const b = this.state;
    const v = this.vis;
    // Follow the water on world time, so a slow frame can't leave the hull
    // behind the swell.
    const dw = this.time === undefined ? dt : Math.min(Math.max(t - this.time, 0), 1);
    this.time = t;
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    const at = (lx, lz) => heightAt(b.x + c * lx - s * lz, b.z + s * lx + c * lz, t, waveScale);
    const hBow = at(4.2, 0);
    const hStern = at(-4.2, 0);
    const hPort = at(0, -1.7);
    const hStar = at(0, 1.7);
    const heave = (hBow + hStern + hPort + hStar) / 4;
    const k = 1 - Math.exp(-dw * 4);
    v.heave += (heave - v.heave) * k;
    v.pitch += (Math.atan2(hBow - hStern, 8.4) * 0.85 - v.pitch) * k;
    v.roll += (Math.atan2(hPort - hStar, 3.4) * 0.6 - v.roll) * k;

    this.prevMatrix.copy(this.matrix);
    this.root.position.set(b.x, v.heave - 0.02, b.z);
    _qYaw.setFromAxisAngle(_Y, -b.heading);
    _qPitch.setFromAxisAngle(_Z, v.pitch);
    _qRoll.setFromAxisAngle(_X, b.heel + v.roll);
    this.root.quaternion.copy(_qYaw).multiply(_qPitch).multiply(_qRoll);
    this.root.updateMatrixWorld(true);
    this.matrix.copy(this.root.matrixWorld);

    // Boom swings with some weight to it (a gybe slams across).
    const maxRate = 2.6;
    v.boom += clamp(b.mainAngle - v.boom, -maxRate * dt, maxRate * dt);
    v.jib += clamp(b.jibAngle - v.jib, -maxRate * dt, maxRate * dt);
    this.boom.rotation.y = v.boom;
    v.fillM += (smoothstep(0.04, 0.2, b.mainAoA) * Math.min(1, b.aws / 3) - v.fillM) * k;
    v.fillJ += (smoothstep(0.04, 0.2, b.jibAoA) * Math.min(1, b.aws / 3) - v.fillJ) * k;

    this.#buildMain(t);
    this.#buildJib(t);
    this.furl.scale.set(1 - b.jibOut * 0.6, 1, 1 - b.jibOut * 0.6);

    this.wheel.rotation.x = b.rudder * 2.4;
    this.windex.rotation.y = -b.awa; // points into the apparent wind
    this.#updateTelltales(t);
    this.#buildPennant(t);
    this.#updateLights();
    this.#buildChain();
    // Up the forestay once the anchor holds; down and stowed otherwise.
    const ball = this.anchorBall;
    const want = b.anchor.set ? 1 : 0;
    this.ballT = (this.ballT ?? 0) + Math.sign(want - (this.ballT ?? 0)) * Math.min(Math.abs(want - (this.ballT ?? 0)), dt * 0.8);
    ball.visible = this.ballT > 0.02;
    ball.position.lerpVectors(this.anchorBallDown, this.anchorBallUp, this.ballT);
  }

  #buildMain(t) {
    const b = this.state;
    const v = this.vis;
    const h = b.mainHoist;
    this.main.mesh.visible = h > 0.02;
    if (!this.main.mesh.visible) return;
    const luff = 12.9 * REEF_LUFF[b.reef] * h;
    const y0 = LAYOUT.boom.y + 0.12;
    const twist = 0.06 + 0.3 * b.mainSheet;
    const side = Math.sign(v.boom) || 1;
    const fill = v.fillM;
    const aws = b.aws;
    this.main.build((s, tt, out) => {
      const y = y0 + luff * tt;
      const chord = (LAYOUT.boom.len - 0.15) * (1 - tt) + 0.3 * tt + 0.55 * Math.sin(Math.PI * tt) * (1 - tt);
      const ang = v.boom + side * twist * tt;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const along = chord * s;
      let x = LAYOUT.mast.x - 0.13 - ca * along;
      let z = sa * along;
      // Belly to leeward; flat and fluttering when luffing.
      const belly = 0.11 * chord * 4 * s * (1 - s) * fill;
      const flutter = (1 - fill) * Math.min(1, aws / 4) * 0.09 * Math.sin(s * 9 - t * 15 + tt * 5) * s;
      const n = belly + flutter;
      x += side * sa * n;
      z += side * ca * n;
      out.set(x, y, z);
    });
  }

  #buildJib(t) {
    const b = this.state;
    const v = this.vis;
    const f = b.jibOut;
    this.jib.mesh.visible = f > 0.02;
    if (!this.jib.mesh.visible) return;
    const fs = LAYOUT.forestay;
    const tack = fs.tack;
    const head = _tmp1.copy(tack).lerp(fs.head, 0.84);
    const side = Math.sign(v.jib) || 1;
    const fill = v.fillJ;
    const foot = 4.9 * f;
    const twist = 0.08 + 0.25 * b.jibSheet;
    this.jib.build((s, tt, out) => {
      const lx = tack.x + (head.x - tack.x) * tt;
      const ly = tack.y + 0.35 + (head.y - tack.y - 0.35) * tt;
      const chord = foot * (1 - tt) + 0.15 * tt;
      const ang = v.jib + side * twist * tt;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      let x = lx - ca * chord * s;
      let y = ly + 0.55 * (1 - tt) * s;
      let z = sa * chord * s;
      const belly = 0.12 * chord * 4 * s * (1 - s) * fill;
      const flutter = (1 - fill) * Math.min(1, b.aws / 4) * 0.08 * Math.sin(s * 10 - t * 16 + tt * 6) * s;
      const n = belly + flutter;
      x += side * sa * n;
      z += side * ca * n;
      out.set(x, y, z);
    });
  }

  #buildPennant(t) {
    // A small triangle streaming away from the apparent wind.
    const b = this.state;
    const p = this.pennant.geometry.attributes.position;
    // Tied to the backstay a couple of metres above the cockpit.
    const top = LAYOUT.mast;
    const y = 3.4;
    const k = (y - 1.1) / (top.top - 0.1 - 1.1);
    const base = _tmp1.set(-5.62 + (top.x + 5.62) * k, y, 0);
    const dir = Math.PI + b.awa; // blows downwind in boat frame
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    const len = 0.5;
    const pts = [];
    for (let i = 0; i <= 2; i++) {
      const s = i / 2;
      const wave = Math.sin(t * 9 - s * 4) * 0.06 * s;
      pts.push([base.x + dx * len * s - dz * wave, base.y + 0.08 * (1 - s), base.z + dz * len * s + dx * wave]);
      pts.push([base.x + dx * len * s - dz * wave, base.y - 0.08 * (1 - s), base.z + dz * len * s + dx * wave]);
    }
    const tri = [0, 1, 2, 1, 3, 2, 2, 3, 4];
    tri.forEach((k, i) => p.setXYZ(i, ...pts[k]));
    p.needsUpdate = true;
    this.pennant.geometry.computeVertexNormals();
  }

  #updateTelltales(t) {
    const b = this.state;
    // Where the apparent wind blows to, in the boat's frame (x forward, z starboard).
    const dx = -Math.cos(b.awa);
    const dz = -Math.sin(b.awa);
    const yaw = Math.atan2(-dz, dx);
    const strength = Math.min(1, b.aws / 4);
    for (const tt of this.telltales) {
      tt.pivot.rotation.set(0, yaw, -(1 - strength) * 1.3, 'YXZ');
      // Flutter: a ripple running down the ribbon, stronger in more wind.
      const p = tt.mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = tt.base[i * 3];
        p.setZ(i, Math.sin(x * 14 - t * (8 + 10 * strength) + tt.phase) * 0.05 * (x / 0.6) * (0.4 + strength));
      }
      p.needsUpdate = true;
    }
  }

  #updateLights() {
    const b = this.state;
    const L = this.lamps;
    const on = b.lights;
    const anchored = b.anchor.set;
    const set = (lamp, lit) => lamp.mat.color.copy(lit ? lamp.on : lamp.off);
    set(L.port, on && !anchored);
    set(L.starboard, on && !anchored);
    set(L.stern, on && !anchored);
    set(L.steaming, on && !anchored && b.engine);
    set(L.anchor, on && anchored);
    set(L.deck, on);
    set(L.cockpit, on);
    this.deckLight.intensity = on ? 5 : 0;
    this.cockpitLight.intensity = on ? 3 : 0;
  }

  #buildChain() {
    const b = this.state;
    const p = this.chain.geometry.attributes.position;
    const out = b.anchor.rode;
    this.chain.visible = out > 0.3;
    if (!this.chain.visible) return;
    // From the roller, sagging down and away toward the anchor (in boat frame).
    const start = _tmp1.set(5.75, 1.2, 0);
    let ax = 1;
    let az = 0;
    if (b.anchor.set) {
      const c = Math.cos(b.heading);
      const s = Math.sin(b.heading);
      const dx = b.anchor.x - b.x;
      const dz = b.anchor.z - b.z;
      const lx = c * dx + s * dz;
      const lz = -s * dx + c * dz;
      const len = Math.hypot(lx, lz) || 1;
      ax = lx / len;
      az = lz / len;
    }
    const reach = Math.min(out, 6);
    for (let i = 0; i < 12; i++) {
      const s = i / 11;
      p.setXYZ(i, start.x + ax * reach * s * 0.6, start.y - Math.min(out, 3) * s - 0.3 * Math.sin(Math.PI * s), start.z + az * reach * s * 0.6);
    }
    p.needsUpdate = true;
  }

  /** World position of a boat-local point (uses the floating visual transform). */
  toWorld(local, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.matrix);
  }
}

// ---------------------------------------------------------------------------
// Walkable surfaces and walls, as boxes in the boat's frame. Boxes reach down
// to y = −0.6 so they also keep swimmers out of the hull.
// ---------------------------------------------------------------------------

function buildColliders() {
  const out = [];
  const box = (x0, x1, y0, y1, z0, z1, extra = {}) =>
    out.push({ center: new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), half: new THREE.Vector3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), yaw: 0, ...extra });
  const k = LAYOUT.cockpit;
  const c = LAYOUT.cabin;
  // Foredeck in tapering slices.
  for (const [x0, x1] of [[4.35, 5.6], [3.2, 4.35], [2.3, 3.2]]) {
    const hz = halfAt(x0) + 0.05;
    box(x0, x1, -0.6, deckAt((x0 + x1) / 2), -hz, hz);
  }
  // Side decks by the cabin, and the coachroof.
  box(c.x0, c.x1, -0.6, deckAt(0.5), -1.98, 1.98);
  box(c.x0, c.x1 - 0.3, deckAt(0.5), deckAt(0.5) + c.h, -c.w0 + 0.05, c.w0 - 0.05);
  // Cockpit: sole, benches, side decks.
  box(k.x0, k.x1, -0.6, k.sole, -k.half, k.half);
  for (const side of [-1, 1]) {
    const zIn = side * k.benchIn;
    const zOut = side * k.half;
    box(k.benchX0, k.x1, k.sole, k.benchTop, Math.min(zIn, zOut), Math.max(zIn, zOut));
    const z0 = side * k.half;
    const z1 = side * 1.98;
    box(k.x0, k.x1, -0.6, deckAt(-3.5), Math.min(z0, z1), Math.max(z0, z1));
  }
  // Swim platform: the one place you can get aboard from the water.
  const p = LAYOUT.platform;
  box(p.x0, p.x1, p.y - 0.12, p.y, -p.half, p.half, { boardable: true });
  // Lifelines: low walls along the edge you can jump over.
  const posts = [5.45, 4.85, 3.55, 2.2, 0.8, -0.6, -2.0, -3.4, -4.8, -5.55];
  for (const side of [-1, 1]) {
    for (let i = 0; i + 1 < posts.length; i++) {
      const xa = posts[i];
      const xb = posts[i + 1];
      const za = side * (i === 0 ? 0 : halfAt(xa) - 0.06);
      const zb = side * (halfAt(xb) - 0.06);
      const cx = (xa + xb) / 2;
      const cz = (za + zb) / 2;
      const len = Math.hypot(xb - xa, zb - za);
      const y0 = deckAt(cx);
      out.push({
        center: new THREE.Vector3(cx, y0 + 0.32, cz),
        half: new THREE.Vector3(len / 2, 0.32, 0.05),
        yaw: Math.atan2(zb - za, xb - xa),
        rail: true,
      });
    }
    // Pushpit, leaving a gate to the swim platform.
    out.push({ center: new THREE.Vector3(-5.6, deckAt(-5.6) + 0.32, side * 1.15), half: new THREE.Vector3(0.05, 0.32, 0.55), yaw: 0, rail: true });
    // Transom corners beside the gate.
    box(-5.75, -5.55, k.sole, deckAt(-5.6), side > 0 ? 0.6 : -1.75, side > 0 ? 1.75 : -0.6);
  }
  // Mast, wheel and pedestal.
  box(LAYOUT.mast.x - 0.12, LAYOUT.mast.x + 0.12, 1.0, 14, -0.12, 0.12);
  box(LAYOUT.wheel.x - 0.08, LAYOUT.wheel.x + 0.04, k.sole, LAYOUT.wheel.y + LAYOUT.wheel.r, -LAYOUT.wheel.r, LAYOUT.wheel.r);
  return out;
}

const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
const _X = new THREE.Vector3(1, 0, 0);
const _qYaw = new THREE.Quaternion();
const _qPitch = new THREE.Quaternion();
const _qRoll = new THREE.Quaternion();
const _tmp1 = new THREE.Vector3();
