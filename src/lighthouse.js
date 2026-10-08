import * as THREE from 'three';
import { groundAt, toWorld } from '../shared/world.js';
import { paint, mergeParts, segment } from './props.js';
import { deepenShadows } from './atmosphere.js';

// The lighthouse on Old Head, the crater lake on Kettle Island and the big
// tree on Green Island: the outer islands' landmarks.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

/** White tower, red band, gallery and lantern. The light turns at night and in storms. */
export class Lighthouse {
  constructor(isl, colliders) {
    const f = isl.features.light;
    const w = toWorld(isl, f.x, f.z);
    const y = groundAt(w.x, w.z) - 0.3;
    this.group = new THREE.Group();
    this.group.position.set(w.x, y, w.z);
    // The door looks back along the island, toward the cove.
    this.group.rotation.y = -isl.rot;

    const H = 14;
    const parts = [];
    const band = (y0, y1, r0, r1, color) => {
      const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 16, 1);
      g.translate(0, (y0 + y1) / 2, 0);
      parts.push(paint(g, color));
    };
    const rAt = (yy) => 2.3 - 0.8 * (yy / H);
    band(0, 6, rAt(0), rAt(6), '#f1eee6');
    band(6, 8, rAt(6), rAt(8), '#b8382d');
    band(8, H, rAt(8), rAt(H), '#f1eee6');
    // Gallery and railing.
    band(H, H + 0.25, 2.1, 2.1, '#2c2c2c');
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      parts.push(paint(segment(V(Math.cos(a) * 2.0, H + 0.25, Math.sin(a) * 2.0), V(Math.cos(a) * 2.0, H + 1.15, Math.sin(a) * 2.0), 0.03, 0.03, 4), '#2c2c2c'));
    }
    const rail = new THREE.TorusGeometry(2.0, 0.04, 4, 24);
    rail.rotateX(Math.PI / 2);
    rail.translate(0, H + 1.15, 0);
    parts.push(paint(rail, '#2c2c2c'));
    // Lantern frame and cap.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(paint(segment(V(Math.cos(a) * 1.15, H + 0.25, Math.sin(a) * 1.15), V(Math.cos(a) * 1.15, H + 2.3, Math.sin(a) * 1.15), 0.04, 0.04, 4), '#2c2c2c'));
    }
    const cap = new THREE.ConeGeometry(1.45, 1.1, 16);
    cap.translate(0, H + 2.85, 0);
    parts.push(paint(cap, '#b8382d'));
    const ball = new THREE.IcosahedronGeometry(0.18, 1);
    ball.translate(0, H + 3.5, 0);
    parts.push(paint(ball, '#2c2c2c'));
    // The door and two small windows, on the −x side.
    const door = new THREE.BoxGeometry(0.12, 2.0, 1.0);
    door.translate(-rAt(1) + 0.02, 1.0, 0);
    parts.push(paint(door, '#3b4a5a'));
    for (const yy of [5, 10]) {
      const win = new THREE.BoxGeometry(0.1, 0.7, 0.45);
      win.translate(-rAt(yy) + 0.02, yy, 0);
      parts.push(paint(win, '#2f3a44'));
    }
    const tower = new THREE.Mesh(mergeParts(parts), mat);
    tower.castShadow = true;
    tower.receiveShadow = true;
    this.group.add(tower);

    // The lamp behind the glass, and its two beams.
    this.lampMat = new THREE.MeshBasicMaterial({ color: '#4a4a44' });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.6, 12), this.lampMat);
    lamp.position.y = H + 1.3;
    this.group.add(lamp);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 2.05, 12, 1, true), new THREE.MeshLambertMaterial({ color: '#8fa7b0', transparent: true, opacity: 0.35, depthWrite: false }));
    glass.position.y = H + 1.27;
    this.group.add(glass);
    // The beam: brightest at the lamp, fading along its length and soft at
    // the edges (faces seen edge-on fade out), so it reads as light in the air.
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uLit: { value: 0 }, uColor: { value: new THREE.Color('#fff1cc') } },
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          vAlong = uv.y;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLit;
        uniform vec3 uColor;
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          float face = pow(abs(dot(normalize(vN), normalize(vView))), 1.5);
          float fall = pow(clamp(vAlong, 0.0, 1.0), 2.2);
          gl_FragColor = vec4(uColor * 0.22 * uLit * face * fall, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beams = new THREE.Group();
    this.beams.position.y = H + 1.3;
    for (const s of [-1, 1]) {
      const g = new THREE.ConeGeometry(11, 170, 20, 1, true);
      g.translate(0, -85, 0); // apex at the lamp
      g.rotateZ((s * Math.PI) / 2);
      const m = new THREE.Mesh(g, this.beamMat);
      m.frustumCulled = false;
      this.beams.add(m);
    }
    this.group.add(this.beams);
    this.light = new THREE.PointLight('#ffe7b0', 0, 60, 1.4);
    this.light.position.y = H + 1.3;
    this.group.add(this.light);

    colliders.push({ type: 'cyl', x: w.x, z: w.z, r: 2.3, y0: y - 1, y1: y + H + 3, noClimb: true });
    this.lit = 0;
  }

  /** dark: 0 (daylight) … 1 (night, or a black storm). */
  update(dt, dark) {
    const want = dark > 0.35 ? 1 : 0;
    this.lit += (want - this.lit) * Math.min(1, dt * 1.5);
    this.beams.rotation.y += dt * ((Math.PI * 2) / 12);
    this.beamMat.uniforms.uLit.value = this.lit;
    this.beams.visible = this.lit > 0.02;
    this.lampMat.color.setRGB(0.3 + 2.7 * this.lit, 0.3 + 2.5 * this.lit, 0.28 + 1.9 * this.lit);
    this.light.intensity = 30 * this.lit;
  }
}

/** The crater lake: a still sheet of water a hand's depth over the crater floor. */
export function craterLake(isl) {
  const f = isl.features.lake;
  const w = toWorld(isl, 0, 0);
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(f.r + 1.5, 40),
    new THREE.MeshPhongMaterial({ color: '#3d6e70', specular: '#9fbfc2', shininess: 80, transparent: true, opacity: 0.88 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(w.x, f.y, w.z);
  m.receiveShadow = true;
  m.name = 'crater-lake';
  return m;
}

/** One great spreading tree. */
export function bigTree(isl, colliders) {
  const f = isl.features.bigTree;
  const w = toWorld(isl, f.x, f.z);
  const y = groundAt(w.x, w.z) - 0.3;
  const parts = [paint(segment(V(0, 0, 0), V(0.3, 5.5, 0.2), 1.0, 0.65, 8), '#6b4f36')];
  // Big boughs, and a canopy of lumps.
  const boughs = [[3.5, 7.5, 1.5], [-3.2, 7.2, 2.2], [0.8, 7.8, -3.4], [-1.5, 8.2, -1.8]];
  for (const [x, yy, z] of boughs) parts.push(paint(segment(V(0.2, 5, 0.1), V(x, yy, z), 0.45, 0.25, 6), '#6b4f36'));
  const greens = ['#4f7f38', '#5a8c3e', '#467534', '#629544'];
  let i = 0;
  for (const [x, yy, z, r] of [[0, 10, 0, 4.5], [4, 9, 2, 3.4], [-4, 9.2, 2.5, 3.6], [1.5, 9.6, -4, 3.5], [-2.5, 10.5, -2.8, 3.2], [3, 11, -1, 3], [-1, 12, 1.5, 3]]) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, yy, z);
    parts.push(paint(g, greens[i++ % greens.length]));
  }
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.position.set(w.x, y, w.z);
  m.scale.setScalar(1.4);
  colliders.push({ type: 'cyl', x: w.x, z: w.z, r: 1.45, y0: y - 1, y1: y + 9 });
  return m;
}
