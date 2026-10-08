import * as THREE from 'three';
import { groundAt } from '../shared/world.js';
import { QUESTS } from '../shared/quests.js';
import { mergeParts, rock, paint, segment } from './props.js';
import { netMesh } from './village.js';
import { mulberry32, hash2 } from '../shared/noise.js';
import { deepenShadows } from './atmosphere.js';

// The things out in the world that belong to a quest (shared/quests.js):
// for now, the sheet of copper off the Molly Ann standing up out of the reef
// with Oda's net caught on it. They're always there; you can only look at
// one once you've got that far with the person who asked.

const mat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));

const VERDIGRIS = ['#5d8774', '#6b947f', '#557c6a'];
const COPPER = ['#a0603a', '#8d5434'];
const CORAL = ['#c4a088', '#b39479', '#cdb092'];

/**
 * A buckled sheet of copper sheathing, torn off the wreck and stood up on
 * its end in the coral, with a rag of orange net caught over the top.
 * (Its foot is at the origin; it leans toward +z.)
 */
function copperSheet() {
  const rand = mulberry32(77);
  const W = 0.85;
  const L = 1.8;
  const LEAN = 0.32;
  // The sheet: crumpled, folded once across the corner, ragged at the torn top.
  const g = new THREE.PlaneGeometry(W, L, 6, 9).toNonIndexed();
  const p = g.attributes.position;
  const bend = (x, y) => {
    const u = y / L;
    let z = 0.07 * Math.sin((x / W) * Math.PI * 2.2 + 0.6) + 0.18 * u * u; // buckle and curl
    z += Math.max(0, x / W + u - 1.05) * 0.5; // the folded corner
    z += (hash2(Math.round(x * 40), Math.round(y * 40)) - 0.5) * 0.05; // dents
    return z;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i) + L / 2;
    if (y > L - 0.01) y -= 0.08 + 0.14 * hash2(Math.round(x * 30), 3); // torn edge
    p.setXYZ(i, x, y, bend(x, y));
  }
  // Mostly green with age; bright copper where it's been scraped and torn.
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < p.count; f += 3) {
    const top = Math.max(p.getY(f), p.getY(f + 1), p.getY(f + 2)) > L - 0.35;
    c.set(top && rand() < 0.55 ? COPPER[(rand() * 2) | 0] : VERDIGRIS[(rand() * 3) | 0]);
    for (let k = 0; k < 3; k++) c.toArray(col, (f + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g.rotateX(LEAN);
  const parts = [g];
  // Coral heads it's jammed between.
  [[-0.5, 0.15, 0.42], [0.45, -0.1, 0.36], [0.1, 0.45, 0.3], [-0.15, -0.4, 0.33]].forEach(([x, z, s], i) => {
    const r = rock(s, 300 + i, CORAL[i % 3], 0.7);
    r.translate(x, 0.05, z);
    parts.push(r);
  });
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(mergeParts(parts), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  // The net: a rag of it hooked over the top, hanging down both faces.
  const net = new THREE.PlaneGeometry(0.62, 1.15, 6, 10);
  const q = net.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const x = q.getX(i);
    const v = q.getY(i) / 1.15 + 0.5; // 0..1 along the rag
    const over = (v - 0.45) * 1.15; // + down the front, - down the back
    const y = L - 0.12 - Math.abs(over) * 0.95 - 0.05 * Math.sin(x * 9);
    const z = bend(x + 0.1, Math.max(0, y)) + Math.sign(over) * (0.03 + Math.abs(over) * 0.12) + 0.04 * Math.sin(x * 7 + v * 5);
    q.setXYZ(i, x + 0.1 + 0.08 * Math.sin(v * 4), y, z);
  }
  net.rotateX(LEAN);
  net.computeVertexNormals();
  const netMat = netMesh('#d2662a', [2, 3]);
  group.add(new THREE.Mesh(net, netMat));
  return group;
}

const MODELS = { copper: copperSheet, bale: canvasBales };

/** Two bales of sailcloth washed up on the shingle, one half buried. */
function canvasBales() {
  const g = new THREE.Group();
  const parts = [];
  for (const [x, z, yaw, sink] of [[0, 0, 0.3, 0.12], [0.85, 0.5, -0.5, 0.28]]) {
    const b = new THREE.CylinderGeometry(0.32, 0.32, 0.95, 10);
    b.rotateZ(Math.PI / 2);
    b.rotateY(yaw);
    b.translate(x, 0.32 - sink, z);
    parts.push(paint(b, '#d8cfb6'));
    for (const t of [-0.3, 0.3]) {
      const band = new THREE.TorusGeometry(0.33, 0.02, 4, 12);
      band.rotateY(Math.PI / 2 + yaw);
      band.translate(x + Math.cos(yaw) * t, 0.32 - sink, z - Math.sin(yaw) * t);
      parts.push(paint(band, '#7a6a4a'));
    }
  }
  // Weed caught on them.
  parts.push(paint(segment(new THREE.Vector3(-0.3, 0.55, 0.1), new THREE.Vector3(0.2, 0.6, -0.15), 0.02, 0.01, 3), '#4a5a2a'));
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

export class QuestWorld {
  constructor({ scene, progress }) {
    this.progress = progress;
    this.group = new THREE.Group();
    this.group.name = 'quest-things';
    scene.add(this.group);
    this.steps = [];
    for (const [quest, q] of Object.entries(QUESTS)) {
      for (const [step, s] of Object.entries(q.steps)) {
        // Some steps are things already there (the cairn); some need a model.
        const make = MODELS[step];
        let m = null;
        if (make) {
          m = make();
          const [x, z] = s.at;
          m.position.set(x, groundAt(x, z) - 0.1, z);
          m.rotation.y = 2.1;
          this.group.add(m);
        }
        this.steps.push({ quest, step, def: s, mesh: m });
      }
    }
  }

  /** A quest thing close enough to look at, if you've got to that point. */
  near(pos) {
    const s = this.progress.state;
    for (const st of this.steps) {
      const q = s?.quests?.[st.quest];
      if (!q || q.done || q.stage !== st.def.stage) continue;
      if (Math.hypot(pos.x - st.def.at[0], pos.z - st.def.at[1]) < st.def.reach) return st;
    }
    return null;
  }

  /** Look at it (the server decides whether it counts). Returns what you see, or null. */
  async look(st, pos) {
    try {
      const r = await this.progress.act('quest', { id: st.quest, step: st.step, x: pos.x, z: pos.z });
      return r?.ok ? r.say : null;
    } catch {
      return null;
    }
  }
}
