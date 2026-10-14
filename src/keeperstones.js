import * as THREE from 'three';
import { paint, mergeParts } from './props.js';
import { hash2 } from '../shared/noise.js';
import { KEEPERS, stonePoint, stoneNote } from '../shared/story.js';
import { drawSign } from './story.js';

// The keepers' families' stones: one standing by where each family's key was
// (shared/story.js says where), its sign cut in both faces and a count of
// notches under the sign. Read one (E) and its count goes in your journal;
// the temple's last door wants all eight.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GREY = ['#8f8a7f', '#86817a', '#9a958a'];
const LICHEN = '#a3a06a';

export class KeeperStones {
  constructor({ scene, world, progress }) {
    this.progress = progress;
    this.say = null;
    // The signs, on one strip.
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext('2d');
    for (let k = 1; k <= 8; k++) drawSign(ctx, KEEPERS[k].sign, (k - 0.5) * 128, 64, 100, { fill: '#4a453c', stroke: '#2d2a25', width: 1.2 });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const stoneMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.list = [];
    for (let n = 1; n <= 8; n++) {
      const p = stonePoint(n);
      const g = new THREE.Group();
      g.position.set(p.x, p.y - 0.15, p.z);
      g.rotation.y = hash2(n, 3, 41) * Math.PI * 2;
      // A slab of stone, a little out of true, lichen on its top.
      const slab = new THREE.BoxGeometry(0.95, 1.9, 0.36, 2, 4, 1);
      const pos = slab.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const taper = 1 - (y + 0.95) * 0.08;
        pos.setX(i, pos.getX(i) * taper + (hash2(i, n, 42) - 0.5) * 0.05);
        pos.setY(i, y + 0.95 + (y > 0.9 ? (hash2(i, n, 43) - 0.5) * 0.12 : 0));
      }
      const geo = paint(slab, GREY[n % GREY.length]);
      const top = new THREE.BoxGeometry(0.7, 0.04, 0.3);
      top.translate(0.05, 1.88, 0);
      const parts = [geo, paint(top, LICHEN)];
      // The notches, under the sign, both faces.
      const k = KEEPERS[n].notches;
      for (const face of [-1, 1]) {
        for (let i = 0; i < k; i++) {
          const m = new THREE.BoxGeometry(0.035, 0.16, 0.02);
          m.translate(-((k - 1) * 0.09) / 2 + i * 0.09, 0.62, face * 0.19);
          parts.push(paint(m, '#2d2a25'));
        }
      }
      const mesh = new THREE.Mesh(mergeParts(parts), stoneMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      for (const face of [-1, 1]) {
        const sq = new THREE.PlaneGeometry(0.62, 0.62);
        const uv = sq.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, (n - 1 + uv.getX(i)) / 8);
        if (face < 0) sq.rotateY(Math.PI);
        sq.translate(0, 1.2, face * 0.185);
        g.add(new THREE.Mesh(sq, signMat));
      }
      scene.add(g);
      world.addStatic({ type: 'cyl', x: p.x, z: p.z, r: 0.45, y0: p.y - 1, y1: p.y + 1.75 });
      this.list.push({ n, pos: V(p.x, p.y, p.z) });
    }
    this.near = this.list[0];
  }

  /** The nearest stone (for main.js, which only asks the set pieces close by). */
  get center() {
    return this.near.pos;
  }

  interaction(player) {
    let best = Infinity;
    for (const s of this.list) {
      const d = s.pos.distanceTo(player.pos);
      if (d < best) {
        best = d;
        this.near = s;
      }
    }
    if (best > 2.4 || player.mode === 'swim') return null;
    const s = this.near;
    return {
      key: 'E',
      label: 'Read the stone',
      act: () => {
        this.say?.(stoneNote(s.n), 5);
        this.progress
          .act('stone', { n: s.n, x: player.pos.x, z: player.pos.z })
          .then((res) => {
            if (res?.ok && !res.already) this.say?.(`${stoneNote(s.n)} It goes in your journal.`, 5);
          })
          .catch(() => {});
      },
    };
  }

  update() {}
}
