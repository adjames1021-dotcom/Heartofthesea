import * as THREE from 'three';
import { paint, mergeParts } from './props.js';
import { CHAPTERS, TEMPLE, DONE, LETTER, TEMPLE_CLUE } from '../shared/story.js';
import { foreTopChest, hatchChest } from '../shared/wreck.js';
import { gannetNest, ISLAND_BY_ID } from '../shared/world.js';
import { kittiwakeChest } from '../shared/kittiwake.js';
import { zawnChest } from '../shared/zawn.js';

// The Heart of the Sea, in the browser (the story itself: shared/story.js;
// the server keeps your place in it). Elowen's letter on the chart table,
// the card when you find a key, and, when a chapter's key is in a chest you
// already had out of a climb, that chest put back for you to fetch again.

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Where the climbs' chests sit (and how far up off their spot), for putting one back. */
const CLIMB_CHESTS = {
  'molly-ann': () => ({ ...hatchChest(), lift: 0.35 }),
  wreck: () => ({ ...foreTopChest(), lift: 0 }),
  gannet: () => ({ ...gannetNest(), lift: 0 }),
  kittiwake: () => ({ ...kittiwakeChest(), lift: 0.3 }),
  zawn: () => ({ ...zawnChest(), lift: 0.3 }),
};

/** A key's look, drawn: each has its own bow, and its own metal. */
const KEY_LOOK = [
  null,
  { metal: '#8b8f93', bow: 'sun' },
  { metal: '#b88a3e', bow: 'ship' },
  { metal: '#7d7f82', bow: 'ring' },
  { metal: '#c9b27a', bow: 'wing' },
  { metal: '#a77b3f', bow: 'star' },
  { metal: '#6f7478', bow: 'anchor' },
  { metal: '#d3a64f', bow: 'flame' },
  { metal: '#5f6a63', bow: 'wave' },
];

/** A little SVG of key n (1…8), found or just its outline. */
export function keySvg(n, found = true, size = 34) {
  const k = KEY_LOOK[n];
  const c = found ? k.metal : 'none';
  const s = found ? '#3a2f22' : 'rgba(58, 47, 34, 0.45)';
  const bows = {
    sun: '<circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
    ship: '<path d="M5 13h14l-3 5H8z"/><path d="M12 4v9M12 5l5 6h-5"/>',
    ring: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4" fill="#ece3cc"/>',
    wing: '<path d="M4 14c4-1 6-6 8-10 2 4 4 9 8 10-4 1-6 4-8 6-2-2-4-5-8-6z"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    anchor: '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V20M7 11h10M4 15c1 4 5 5 8 5s7-1 8-5"/>',
    flame: '<path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 3 0-2-1-4 0-6z"/>',
    wave: '<path d="M3 12c2-4 5-4 6 0s4 4 6 0 5-4 6 0v6H3z"/>',
  };
  return `<svg class="key" width="${size * 2.2}" height="${size}" viewBox="0 0 53 24" fill="${c}" stroke="${s}" stroke-width="1.3" stroke-linejoin="round">
    <g>${bows[k.bow]}</g><path d="M21 10.5h28v3h-3v4h-3v-4h-3v3h-3v-3h-16z"/></svg>`;
}

export class Story {
  constructor({ progress, hud, interior, treasure }) {
    this.progress = progress;
    this.hud = hud;
    this.treasure = treasure;
    this.keysSeen = null; // how many keys at the last look (null until the first)

    // The letter, folded on the chart table, a wax seal on it.
    const parts = [];
    const sheet = new THREE.BoxGeometry(0.21, 0.004, 0.15);
    sheet.rotateZ(0.08);
    sheet.translate(-0.1, 0.802, 1.16);
    parts.push(paint(sheet, '#efe6cf'));
    const fold = new THREE.BoxGeometry(0.21, 0.004, 0.075);
    fold.rotateX(-0.35);
    fold.translate(-0.1, 0.815, 1.1);
    parts.push(paint(fold, '#e7dcc1'));
    const seal = new THREE.CylinderGeometry(0.018, 0.018, 0.006, 10);
    seal.translate(-0.1, 0.83, 1.12);
    parts.push(paint(seal, '#8e1f1a'));
    this.letter = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    interior.group.add(this.letter);

    // What you read it in, and the card when a key turns up.
    this.view = document.createElement('div');
    this.view.className = 'screen letter-screen';
    document.body.appendChild(this.view);
    this.card = document.createElement('div');
    this.card.className = 'key-card';
    document.body.appendChild(this.card);
    this.cardT = 0;

    progress.onChange(() => this.sync());
    this.sync();
  }

  get state() {
    return this.progress.state?.story ?? { ch: 0, keys: [] };
  }

  /** Still waiting to be read? (The story hasn't begun.) */
  get letterWaiting() {
    return !!this.progress.state && this.state.ch === 0;
  }

  get open() {
    return this.view.classList.contains('open');
  }

  /** What's changed: a key found; a chest to put back. */
  sync() {
    if (!this.progress.state) return;
    const st = this.state;
    this.letter.visible = st.ch === 0;
    const n = (st.keys ?? []).length;
    if (this.keysSeen !== null && n > this.keysSeen) this.#showKey(st.keys[n - 1], st);
    this.keysSeen = n;
    this.#putBack(st);
  }

  /**
   * This chapter's key is in a climb's chest you had out before the story got
   * there: it's back where it was, for you to fetch again.
   */
  #putBack(st) {
    const ch = st.ch >= 1 && st.ch <= 8 ? CHAPTERS[st.ch] : null;
    const at = ch && CLIMB_CHESTS[ch.target]?.();
    if (!at || !(this.progress.state.solved ?? []).includes(ch.target)) return;
    if (this.treasure.loose.some((c) => c.course === ch.target)) return;
    this.treasure.placeCourseChest(ch.target, { x: at.x, y: at.y + at.lift, z: at.z }, { again: true });
  }

  /** For the chart: the island this chapter's key is on (the temple's on Saddle), ringed. */
  chartMark() {
    const st = this.state;
    if (!this.progress.state || st.ch < 1 || st.ch >= DONE) return null;
    const isl = ISLAND_BY_ID[st.ch === TEMPLE ? 'saddle' : CHAPTERS[st.ch].island];
    return { x: isl.x, z: isl.z, r: Math.min(isl.land, 130), label: st.ch === TEMPLE ? 'the temple' : CHAPTERS[st.ch].key };
  }

  readLetter() {
    this.view.innerHTML = `<div class="letter">${LETTER.map((l) => (l ? `<p>${esc(l)}</p>` : '<p class="gap"></p>')).join('')}<p class="close">E to fold it up</p></div>`;
    this.view.classList.add('open');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Done reading: if it's the first time, the story's begun. */
  closeLetter() {
    this.view.classList.remove('open');
    if (this.state.ch !== 0) return;
    this.progress
      .act('storyBegin', {})
      .then((res) => {
        if (res?.ok) this.hud.say('The Heart of the Sea: a new page in your journal (J). Pell’s Bar first.', 5);
      })
      .catch(() => {});
  }

  #showKey(n, st) {
    const next = st.ch === TEMPLE ? TEMPLE_CLUE : st.ch >= 1 && st.ch <= 8 ? CHAPTERS[st.ch].clue : '';
    const row = Array.from({ length: 8 }, (_, i) => keySvg(i + 1, (st.keys ?? []).includes(i + 1), 18)).join('');
    this.card.innerHTML = `
      <div class="key-big">${keySvg(n, true, 46)}</div>
      <h3>You found ${esc(CHAPTERS[n].key)}.</h3>
      <div class="key-row">${row}</div>
      <p>${esc(next)}</p>
      <p class="close">${n === 8 ? 'All eight.' : `${(st.keys ?? []).length} of 8.`} E to put it away</p>`;
    this.card.classList.add('open');
    this.cardT = 14;
  }

  closeCard() {
    this.card.classList.remove('open');
    this.cardT = 0;
  }

  get cardOpen() {
    return this.card.classList.contains('open');
  }

  update(dt) {
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.closeCard();
    }
  }
}

export { DONE };
