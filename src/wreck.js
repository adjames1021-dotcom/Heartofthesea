import * as THREE from 'three';
import { loftHull, loftDeck, canvasTexture } from './hull.js';
import { segment, paint, mergeParts } from './props.js';
import { WRECK, halfBreadth, deckHeight, sheerHeight, keelDepth } from '../shared/wreck.js';

// The wreck on Molly Ann Reef, drawn from the numbers in shared/wreck.js: the
// stern half heeled on the coral, the bow half a few metres off with the
// foremast still standing.

export { WRECK };
const hb = halfBreadth;
const deckY = deckHeight;
const sheer = sheerHeight;
const keel = keelDepth;

let textures = null;
function wreckTextures() {
  if (textures) return textures;
  const hull = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#86735c';
    ctx.fillRect(0, 0, w, h);
    const wl = h * 0.6;
    ctx.fillStyle = '#4f6e63';
    ctx.fillRect(0, wl, w, h - wl);
    ctx.fillStyle = '#3a3029';
    ctx.fillRect(0, h * 0.1, w, h * 0.05);
    ctx.strokeStyle = 'rgba(40,32,25,0.75)';
    ctx.lineWidth = 2;
    for (let y = 8; y < h; y += 11) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      for (let x = (y * 37) % 90; x < w; x += 90 + ((x * 13) % 40)) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 11);
        ctx.stroke();
      }
    }
    // Stove-in planks.
    ctx.fillStyle = '#1d1712';
    for (const [x, y, w2, h2] of [[60, 70, 46, 18], [300, 95, 30, 26], [410, 60, 22, 14], [180, 120, 38, 12]]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w2, y + 4);
      ctx.lineTo(x + w2 - 6, y + h2);
      ctx.lineTo(x + 5, y + h2 - 3);
      ctx.closePath();
      ctx.fill();
    }
    // Weathering streaks running down from the rail.
    for (let i = 0; i < 70; i++) {
      const x = (i * 97) % w;
      ctx.fillStyle = `rgba(30,25,20,${0.05 + (i % 5) * 0.02})`;
      ctx.fillRect(x, 0, 3 + (i % 4), h * (0.3 + (i % 7) * 0.08));
    }
  });
  const deck = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9c8b72';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(45,36,28,0.7)';
    ctx.lineWidth = 2;
    for (let y = 0; y < h; y += 9) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(60,48,36,${0.08 + (i % 4) * 0.05})`;
      ctx.fillRect((i * 131) % w, (i * 53) % h, 20 + (i % 6) * 9, 9);
    }
  });
  textures = { hull, deck };
  return textures;
}

function section(u0, u1, seed) {
  const t = wreckTextures();
  const hullMat = new THREE.MeshLambertMaterial({ map: t.hull, side: THREE.DoubleSide, flatShading: true });
  const deckMat = new THREE.MeshLambertMaterial({ map: t.deck, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const spec = { length: WRECK.length, u0, u1, stations: 14, ring: 7, halfBreadth: hb, sheer, keel, power: 2.3, jag: 1.6, seed };
  const hull = new THREE.Mesh(loftHull(spec), hullMat);
  const deck = new THREE.Mesh(
    loftDeck({ length: WRECK.length, u0, u1, stations: 14, halfBreadth: hb, sheer: deckY, inset: 0.22, camber: 0.05 }),
    deckMat,
  );
  for (const m of [hull, deck]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

const WOOD = '#5a4a39';
const WOOD_DARK = '#43372b';
const ROPE = '#7d6a4d';

/** Deck furniture and spars for the stern half. */
function sternFittings() {
  const parts = [];
  const { mainmast, channel, hatch } = WRECK;
  const u = (x) => (WRECK.length / 2 - x) / WRECK.length;
  const dy = (x) => deckY(u(x));
  // Mainmast stump with a splintered top.
  parts.push(paint(segment(new THREE.Vector3(mainmast.x, dy(mainmast.x) - 0.5, 0), new THREE.Vector3(mainmast.x, mainmast.top, 0), mainmast.r, mainmast.r * 0.85, 8), WOOD));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const s = new THREE.Vector3(mainmast.x + Math.cos(a) * 0.18, mainmast.top, Math.sin(a) * 0.18);
    parts.push(paint(segment(s, s.clone().add(new THREE.Vector3(Math.cos(a) * 0.1, 0.5 + (i % 3) * 0.35, Math.sin(a) * 0.1)), 0.09, 0.02, 4), WOOD));
  }
  // Main channel on the starboard side: the plank the shrouds were spread on.
  const cx = (channel.x0 + channel.x1) / 2;
  const ch = new THREE.BoxGeometry(channel.x1 - channel.x0, 0.14, channel.width);
  ch.translate(cx, channel.y, hb(u(cx)) + channel.width / 2 - 0.05);
  parts.push(paint(ch, WOOD_DARK));
  // Deadeyes and a few broken shrouds running up toward the stump.
  for (let i = 0; i < 3; i++) {
    const x = channel.x0 + 0.6 + i * 1.2;
    const base = new THREE.Vector3(x, channel.y + 0.1, hb(u(x)) + 0.2);
    const dead = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8);
    dead.rotateX(Math.PI / 2);
    dead.translate(base.x, base.y + 0.15, base.z);
    parts.push(paint(dead, '#2f2924'));
    const up = new THREE.Vector3(mainmast.x + 0.2, mainmast.top - 1.2 - i * 1.6, 0.3);
    const end = base.clone().lerp(up, 0.35 + i * 0.18);
    parts.push(paint(segment(base, end, 0.035, 0.03, 4), ROPE));
  }
  // After hatch coaming.
  const hc = new THREE.BoxGeometry(hatch.w, 0.35, hatch.d);
  hc.translate(hatch.x, dy(hatch.x) + 0.12, 0);
  parts.push(paint(hc, WOOD_DARK));
  // Quarterdeck rail posts.
  for (let i = 0; i < 6; i++) {
    const x = -8.5 - i * 0.9;
    for (const side of [-1, 1]) {
      const z = side * (hb(u(x)) - 0.25);
      parts.push(paint(segment(new THREE.Vector3(x, dy(x), z), new THREE.Vector3(x, dy(x) + 0.9, z), 0.06, 0.06, 4), WOOD));
    }
  }
  return mergeParts(parts);
}

/** Foremast, its top, and the yard hanging askew over the gap. */
function bowFittings() {
  const parts = [];
  const { foremast } = WRECK;
  const u = (x) => (WRECK.length / 2 - x) / WRECK.length;
  const dy = (x) => deckY(u(x));
  const base = new THREE.Vector3(foremast.x, dy(foremast.x) - 0.5, 0);
  parts.push(paint(segment(base, new THREE.Vector3(foremast.x, foremast.top, 0), foremast.r, foremast.r * 0.6, 8), WOOD));
  // Fore top: a small platform with a low rail.
  const top = new THREE.BoxGeometry(2.6, 0.22, 2.6);
  top.translate(foremast.x, foremast.foreTop, 0);
  parts.push(paint(top, WOOD_DARK));
  for (const [dx, dz] of [[1.2, 1.2], [1.2, -1.2], [-1.2, 1.2], [-1.2, -1.2]]) {
    const p = new THREE.Vector3(foremast.x + dx, foremast.foreTop, dz);
    parts.push(paint(segment(p, p.clone().add(new THREE.Vector3(0, 0.6, 0)), 0.05, 0.05, 4), WOOD));
  }
  // Fore yard, slipped and hanging askew so its after end reaches over the gap.
  const pivot = new THREE.Vector3(foremast.x, 10, 0);
  const yardDir = new THREE.Vector3(-Math.sin(1.22), -0.17, Math.cos(1.22)).normalize();
  const aft = pivot.clone().addScaledVector(yardDir, 6.8);
  const fwd = pivot.clone().addScaledVector(yardDir, -6.0);
  parts.push(paint(segment(fwd, aft, 0.16, 0.12, 6), WOOD));
  // Ratlines on the starboard fore shrouds: a ladder of rope up to the top.
  const lo = new THREE.Vector3(foremast.x - 0.8, dy(foremast.x) + 0.9, hb(u(foremast.x)) - 0.1);
  const hi = new THREE.Vector3(foremast.x - 0.3, foremast.foreTop - 0.1, 1.25);
  const lo2 = lo.clone().add(new THREE.Vector3(1.6, 0, 0));
  const hi2 = hi.clone().add(new THREE.Vector3(0.8, 0, 0));
  for (const [a, b] of [[lo, hi], [lo2, hi2], [lo.clone().lerp(lo2, 0.5), hi.clone().lerp(hi2, 0.5)]]) {
    parts.push(paint(segment(a, b, 0.04, 0.04, 4), ROPE));
  }
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    parts.push(paint(segment(lo.clone().lerp(hi, t), lo2.clone().lerp(hi2, t), 0.025, 0.025, 3), ROPE));
  }
  return { geometry: mergeParts(parts), ropeAnchor: aft, ratlines: { lo, hi, lo2, hi2 } };
}

export function buildWreck() {
  const root = new THREE.Group();
  root.name = 'wreck';
  const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const stern = section(WRECK.sternU[0], WRECK.sternU[1], 3);
  stern.rotation.order = 'ZXY';
  stern.rotation.x = WRECK.heel;
  stern.rotation.z = WRECK.pitch;
  const sf = new THREE.Mesh(sternFittings(), woodMat);
  sf.castShadow = true;
  sf.receiveShadow = true;
  stern.add(sf);
  root.add(stern);

  const bow = section(WRECK.bowU[0], WRECK.bowU[1], 9);
  bow.position.set(WRECK.bow.offset.x, WRECK.bow.offset.y, WRECK.bow.offset.z);
  bow.rotation.order = 'YXZ';
  bow.rotation.y = WRECK.bow.yaw;
  bow.rotation.x = WRECK.bow.heel;
  bow.rotation.z = WRECK.bow.pitch;
  const bf = bowFittings();
  const bfm = new THREE.Mesh(bf.geometry, woodMat);
  bfm.castShadow = true;
  bfm.receiveShadow = true;
  bow.add(bfm);
  root.add(bow);

  // The rest of the mainmast, lying on the reef beside the wreck.
  const fallen = new THREE.Mesh(
    mergeParts([paint(segment(new THREE.Vector3(-6, -0.15, -6.8), new THREE.Vector3(5.5, -0.75, -10.5), 0.3, 0.24, 7), WOOD)]),
    woodMat,
  );
  fallen.castShadow = true;
  root.add(fallen);

  root.userData = { stern, bow, ropeAnchorLocal: bf.ropeAnchor, ratlines: bf.ratlines };
  return root;
}
