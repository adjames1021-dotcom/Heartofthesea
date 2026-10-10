import * as THREE from 'three';
import { paint, mergeParts, segment } from './props.js';
import { foodModel } from './food3d.js';
import { fishModel } from './fishing.js';
import { SHAPES } from './kit.js';
import { mulberry32 } from '../shared/noise.js';

// What the shops sell, as it sits on a shelf, in a basket or on a hook; and
// the little price tags, written by hand.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const geos = new Map();

function once(key, make) {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
}

/** A small bag, tied at the neck. */
function bag(color, h = 0.42) {
  const g = SHAPES.sack();
  g.scale(h, h, h);
  const c = new THREE.Color(color);
  const col = g.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
  return g;
}

const MAKERS = {
  rice: () => bag('#e6dfcc'),
  flour: () => bag('#efe9dc'),
  oats: () => bag('#cdb68a'),
  beans: () => bag('#b49a6e', 0.36),
  sugar: () => bag('#a98252', 0.36),
  pepper: () => {
    // A twist of paper.
    const g = new THREE.ConeGeometry(0.035, 0.13, 7);
    g.rotateX(Math.PI);
    g.translate(0, 0.065, 0);
    const top = new THREE.SphereGeometry(0.03, 6, 4);
    top.scale(1, 0.6, 1);
    top.translate(0, 0.13, 0);
    return mergeParts([paint(g, '#e6dcc4'), paint(top, '#d8cdb2'), paint(segment(V(0, 0.115, 0), V(0, 0.15, 0), 0.006, 0.006, 3), '#5a4a3a')]);
  },
  curry: () => {
    const jar = new THREE.CylinderGeometry(0.045, 0.05, 0.12, 9);
    jar.translate(0, 0.06, 0);
    const lid = new THREE.CylinderGeometry(0.05, 0.05, 0.025, 9);
    lid.translate(0, 0.13, 0);
    const label = new THREE.CylinderGeometry(0.051, 0.051, 0.05, 9, 1, true);
    label.translate(0, 0.06, 0);
    return mergeParts([paint(jar, '#b8862e'), paint(lid, '#6a5a44'), paint(label, '#e2d6b4')]);
  },
  ginger: () => {
    const parts = [];
    const r = mulberry32(7);
    for (let i = 0; i < 4; i++) parts.push(paint(segment(V(0, 0.03, 0), V((r() - 0.5) * 0.14, 0.03 + r() * 0.03, (r() - 0.5) * 0.1), 0.022, 0.016, 5), '#c9a46a'));
    return mergeParts(parts);
  },
  onion: () => {
    const g = new THREE.SphereGeometry(0.05, 8, 6);
    g.scale(1, 0.9, 1);
    g.translate(0, 0.045, 0);
    const tip = new THREE.ConeGeometry(0.018, 0.045, 5);
    tip.translate(0, 0.105, 0);
    return mergeParts([paint(g, '#b9873e'), paint(tip, '#9a6a2e')]);
  },
  onionString: () => {
    // Onions plaited on a string, hanging.
    const parts = [paint(segment(V(0, 0, 0), V(0, -0.38, 0), 0.008, 0.008, 3), '#c9b48a')];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.SphereGeometry(0.045, 7, 5);
      g.translate((i % 2 ? 1 : -1) * 0.035, -0.08 - i * 0.065, (i % 3) * 0.01);
      parts.push(paint(g, i % 2 ? '#b9873e' : '#a8783a'));
    }
    return mergeParts(parts);
  },
  potato: () => {
    const g = new THREE.IcosahedronGeometry(0.045, 1);
    g.scale(1.3, 0.85, 1);
    g.translate(0, 0.035, 0);
    return mergeParts([paint(g, '#a8865a')]);
  },
  leek: () => mergeParts([paint(segment(V(-0.18, 0.03, 0), V(0.05, 0.03, 0), 0.025, 0.025, 6), '#e8e4d0'), paint(segment(V(0.05, 0.03, 0), V(0.2, 0.05, 0), 0.025, 0.035, 6), '#5d7a3a')]),
  cabbage: () => {
    const g = new THREE.IcosahedronGeometry(0.09, 1);
    g.translate(0, 0.08, 0);
    const leaf = new THREE.SphereGeometry(0.1, 7, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 3);
    leaf.translate(0, 0.08, 0);
    return mergeParts([paint(g, '#8aa45a'), paint(leaf, '#6d8a44')]);
  },
  cheese: () => {
    const g = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 12);
    g.translate(0, 0.035, 0);
    return mergeParts([paint(g, '#e3d6a8')]);
  },
  crab: () => {
    const body = new THREE.SphereGeometry(0.08, 8, 5);
    body.scale(1.2, 0.45, 1);
    body.translate(0, 0.035, 0);
    const parts = [paint(body, '#8a4a32')];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) parts.push(paint(segment(V(s * 0.06, 0.03, -0.04 + i * 0.04), V(s * 0.13, 0.01, -0.06 + i * 0.05), 0.008, 0.006, 3), '#7a3e2a'));
      parts.push(paint(segment(V(s * 0.05, 0.035, 0.06), V(s * 0.08, 0.04, 0.12), 0.016, 0.02, 4), '#7a3e2a'));
    }
    return mergeParts(parts);
  },
  kipper: () => {
    const g = new THREE.BoxGeometry(0.22, 0.012, 0.1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getX(i) < 0) p.setZ(i, p.getZ(i) * 0.45);
    g.translate(0, 0.008, 0);
    return mergeParts([paint(g, '#9a5a2a')]);
  },
  pilchard: () => {
    const g = fishModel({ back: '#3f5a6a', belly: '#d8dcd8', fin: '#5a6a72' }, 0.02).geometry;
    g.scale(0.55, 0.55, 0.55);
    g.translate(0, 0.02, 0);
    return g;
  },
};

/** One of something, as it sits for sale. Hung things (on a hook) hang from their top. */
export function goodsModel(kind, hung = false) {
  const key = hung && kind === 'onion' ? 'onionString' : kind;
  if (MAKERS[key]) {
    const m = new THREE.Mesh(once(key, MAKERS[key]), mat);
    m.castShadow = true;
    return m;
  }
  const m = foodModel(kind);
  if (hung) m.rotation.z = Math.PI / 2;
  return m;
}

// ---------------------------------------------------------------------------
// Price tags: a scrap of card with the price in pencil, a hole and a string.
// ---------------------------------------------------------------------------

const tags = new Map();
function tagTexture(text) {
  if (tags.has(text)) return tags.get(text);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const ctx = c.getContext('2d');
  const r = mulberry32(text.length * 31 + text.charCodeAt(0));
  ctx.fillStyle = '#e6dcc0';
  ctx.beginPath();
  ctx.moveTo(4, 6);
  ctx.lineTo(124, 2);
  ctx.lineTo(126, 76);
  ctx.lineTo(2, 78);
  ctx.closePath();
  ctx.fill();
  // Grubby edges, a fold.
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(120,100,70,${0.08 + r() * 0.12})`;
    ctx.fillRect(r() * 128, r() < 0.5 ? r() * 10 : 70 + r() * 10, 2 + r() * 6, 1 + r() * 2);
  }
  ctx.fillStyle = '#5a4a38';
  ctx.beginPath();
  ctx.arc(14, 16, 4, 0, Math.PI * 2);
  ctx.fill();
  // The price, in a hurry.
  ctx.save();
  ctx.translate(64, 46);
  ctx.rotate((r() - 0.5) * 0.12);
  ctx.fillStyle = '#2f2a26';
  ctx.font = "italic 600 40px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tags.set(text, tex);
  return tex;
}

const tagGeo = new THREE.PlaneGeometry(0.11, 0.07);
const tagMats = new Map();

/** A price tag (facing +z), for a price already written out ("4d", "1/6"). */
export function priceTag(text) {
  if (!tagMats.has(text)) tagMats.set(text, new THREE.MeshLambertMaterial({ map: tagTexture(text), side: THREE.DoubleSide }));
  const m = new THREE.Mesh(tagGeo, tagMats.get(text));
  return m;
}
