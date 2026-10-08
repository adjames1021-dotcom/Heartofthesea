import * as THREE from 'three';
import { paint, mergeParts, segment } from './props.js';
import { fishModel, FISH } from './fishing.js';
import { ITEMS } from '../shared/items.js';

// Food you can see: fish and fruit in the pan, a stew in the pot, fruit on
// the trees. Each model has its own material so it can colour as it cooks
// (see tint()).

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function meshOf(parts) {
  const m = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true;
  return m;
}

export function limeModel() {
  const g = new THREE.IcosahedronGeometry(0.045, 1);
  g.scale(1, 0.9, 1.15);
  const tip = new THREE.ConeGeometry(0.008, 0.016, 4);
  tip.rotateX(Math.PI / 2);
  tip.translate(0, 0, 0.055);
  return meshOf([paint(g, '#7fae3a'), paint(tip, '#5f8a2a')]);
}

export function coconutModel() {
  const g = new THREE.IcosahedronGeometry(0.11, 1);
  g.scale(1, 0.92, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.06 * Math.sin(p.getX(i) * 70) * Math.cos(p.getZ(i) * 60);
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  return meshOf([paint(g, '#6b4a2a')]);
}

export function plantainModel() {
  const parts = [];
  // A long curved finger, thicker in the middle.
  let prev = null;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const p = V(-0.13 + t * 0.26, 0.05 * Math.sin(t * Math.PI), 0);
    if (prev) parts.push(paint(segment(prev, p, 0.016 + 0.02 * Math.sin(((i - 1) / 6) * Math.PI), 0.016 + 0.02 * Math.sin(t * Math.PI), 6), '#c9b23e'));
    prev = p;
  }
  parts.push(paint(segment(V(0.13, 0, 0), V(0.155, 0.01, 0), 0.008, 0.008, 4), '#4a3a22'));
  return meshOf(parts);
}

export function saltfishModel() {
  const g = new THREE.BoxGeometry(0.26, 0.015, 0.12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getX(i) < 0) p.setZ(i, p.getZ(i) * 0.5);
  return meshOf([paint(g, '#d9cdb0')]);
}

/** A stew in a bowl (for dishes out of the pot), or a plate (out of the pan). */
export function dishModel(kind) {
  const parts = [];
  const pot = ITEMS[kind]?.name?.includes('bowl') || kind === 'potful';
  if (pot) {
    const bowl = new THREE.CylinderGeometry(0.09, 0.06, 0.06, 12, 1, true);
    parts.push(paint(bowl, '#e9e2d0'));
    const stew = new THREE.CircleGeometry(0.085, 12);
    stew.rotateX(-Math.PI / 2);
    stew.translate(0, 0.022, 0);
    parts.push(paint(stew, kind === 'fish-stew' ? '#e3c98a' : kind === 'squid-coconut' ? '#efe4c8' : '#b89a62'));
  } else {
    const plate = new THREE.CylinderGeometry(0.12, 0.1, 0.015, 14);
    parts.push(paint(plate, '#e9e2d0'));
  }
  return meshOf(parts);
}

/** Whatever this is, raw. */
export function foodModel(kind, kg = 0.6) {
  if (FISH[kind] && !FISH[kind].junk) return fishModel(FISH[kind], Math.min(kg, 1.2));
  if (kind === 'lime') return limeModel();
  if (kind === 'coconut') return coconutModel();
  if (kind === 'plantain') return plantainModel();
  if (kind === 'saltfish') return saltfishModel();
  return dishModel(kind);
}

const RAW = new THREE.Color(1, 1, 1);
const DONE = new THREE.Color(1.0, 0.72, 0.42);
const BURNT = new THREE.Color(0.24, 0.18, 0.13);
const _c = new THREE.Color();

/**
 * Colour food by how cooked it is: c from 0 (raw) to 1 (just done), on to
 * 2 (as burnt as it gets). Only the look; the server decides.
 */
export function tint(mesh, c) {
  if (c <= 1) _c.copy(RAW).lerp(DONE, Math.max(0, c) ** 1.4);
  else _c.copy(DONE).lerp(BURNT, Math.min(1, (c - 1) * 1.6));
  mesh.material.color.copy(_c);
}
