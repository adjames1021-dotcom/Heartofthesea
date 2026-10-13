// Your journal (J): a notebook open at two pages. First what you've jotted
// down about the people you're helping, in your own words; then, on a fresh
// page, what's in the hold and the dishes you know. When it runs past two
// pages you turn over (the arrow keys, or the corners). All of it comes from
// your saved state on the server; nothing here is counted or scored.

import { ITEMS, FIND_IDS } from '../shared/items.js';
import { QUESTS } from '../shared/quests.js';
import { RECIPES, describe, sameKey } from '../shared/food.js';
import { UPGRADES } from '../shared/upgrades.js';
import { aboutCabin } from '../shared/decor.js';
import { words } from '../shared/trade.js';
import { keySvg } from './story.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const HAND = '24px "Reenie Beanie"';
// One page at a time on a narrow screen (as the CSS lays it out).
const NARROW = '(max-width: 640px)';

export class Journal {
  constructor({ progress }) {
    this.progress = progress;
    this.el = document.createElement('div');
    this.el.className = 'screen journal-screen';
    document.body.appendChild(this.el);
    this.pages = []; // each page's writing, laid out to fit
    this.at = 0; // the first page showing
    progress.onChange(() => this.open && this.#render());
    addEventListener('resize', () => this.open && this.#render());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-turn]');
      if (!b) return;
      b.blur(); // (or the keys stop reaching the game)
      this.turn(Number(b.dataset.turn));
    });
  }

  get open() {
    return this.el.classList.contains('open');
  }

  /** Pages showing at once: two side by side, or one on a narrow screen. */
  get across() {
    return matchMedia(NARROW).matches ? 1 : 2;
  }

  toggle(force) {
    const on = this.el.classList.toggle('open', force);
    if (on) {
      this.at = 0;
      this.#render();
      // Let go of the mouse so the corners can be clicked.
      if (document.pointerLockElement) document.exitPointerLock();
      // How much fits on a page depends on the hand it's written in: lay it out again once that's in.
      if (document.fonts && !document.fonts.check(HAND)) document.fonts.load(HAND).then(() => this.open && this.#render()).catch(() => {});
    }
  }

  /** Over a page (1) or back one (-1); two at a time when there are two showing. */
  turn(d) {
    const at = this.at + d * this.across;
    if (at < 0 || at >= this.pages.length) return;
    this.at = at;
    this.#show();
  }

  update(input) {
    if (!this.open) return;
    if (input.pressed('ArrowRight', 'PageDown')) this.turn(1);
    if (input.pressed('ArrowLeft', 'PageUp')) this.turn(-1);
  }

  /** Notes grouped by what they're about: things still going on first. */
  #notes(s) {
    const groups = new Map();
    for (const n of s.journal ?? []) {
      const key = n.quest ?? '';
      if (!groups.has(key)) groups.set(key, { id: key, notes: [], last: 0 });
      const g = groups.get(key);
      g.notes.push(n.text);
      g.last = Math.max(g.last, n.t ?? 0);
    }
    const done = (g) => !!s.quests?.[g.id]?.done;
    // (The main story at the top while it's going on.)
    const story = (g) => (g.id === 'heart' && !done(g) ? 0 : 1);
    return [...groups.values()].sort((a, b) => done(a) - done(b) || story(a) - story(b) || b.last - a.last);
  }

  /** Once something's sorted, just how it started and how it ended. */
  #shown(g, s) {
    if (!s.quests?.[g.id]?.done || g.notes.length <= 2) return g.notes;
    return [g.notes[0], g.notes[g.notes.length - 1]];
  }

  /** What's aboard, in words: "three mackerel", "a burnt pollock", "a sheet of copper". */
  #hold(s) {
    const groups = new Map();
    const shown = aboutCabin(s); // what's out in the cabin isn't in the hold
    for (const it of s.items ?? []) {
      if (FIND_IDS.includes(it.kind) || !ITEMS[it.kind] || shown.has(it.id)) continue;
      const key = sameKey(it);
      if (!groups.has(key)) groups.set(key, { it, n: 0 });
      groups.get(key).n++;
    }
    return [...groups.values()].map((g) => describe(g.it, g.n));
  }

  /**
   * Everything to write down, in order, as entries: a heading (and what goes
   * with it), then the lines under it. An entry can run on over a page; the
   * heading is written again at the top of the next one.
   */
  #entries(s) {
    const titled = (title, extra = '') => ({
      head: title ? `<h3>${esc(title)}</h3>${extra}` : extra,
      again: title ? `<h3>${esc(title)} <span class="cont">cont.</span></h3>` : '',
    });
    const out = [];
    const groups = this.#notes(s);
    for (const g of groups) {
      const keys = g.id === 'heart' ? `<div class="key-row">${Array.from({ length: 8 }, (_, i) => keySvg(i + 1, (s.story?.keys ?? []).includes(i + 1), 14)).join('')}</div>` : '';
      out.push({
        cls: `entry${s.quests?.[g.id]?.done ? ' done' : ''}`,
        ...titled(QUESTS[g.id]?.title, keys),
        lines: this.#shown(g, s).map((t) => `<p>${esc(t)}</p>`),
      });
    }
    if (!groups.length) out.push({ cls: 'entry', head: '', again: '', lines: ['<p class="empty">Nothing written down yet.</p>'] });
    // The hold and so on start a fresh page.
    const hold = this.#hold(s);
    const purse = s.pence ? `${words(s.pence).replace(/^./, (c) => c.toUpperCase())} in the purse.` : 'Not a penny in the purse.';
    out.push({
      cls: 'entry',
      fresh: true,
      ...titled('In the hold'),
      lines: [...(hold.length ? hold.map((t) => `<ul><li>${esc(t)}</li></ul>`) : ['<p class="empty">Not much.</p>']), `<p>${esc(purse)}</p>`],
    });
    const done = (s.upgrades ?? []).filter((u) => UPGRADES[u]);
    if (done.length) out.push({ cls: 'entry', ...titled('Done to her'), lines: done.map((u) => `<p>${esc(UPGRADES[u].say)}</p>`) });
    const recipes = (s.recipes ?? []).filter((r) => RECIPES[r]);
    if (recipes.length) out.push({ cls: 'entry', ...titled('Cooking'), lines: recipes.map((r) => `<p><b>${esc(RECIPES[r].name)}.</b> ${esc(RECIPES[r].note)}</p>`) });
    return out;
  }

  /**
   * Write the entries into a page-sized box a line at a time, starting a new
   * page whenever the next line won't fit (a heading always keeps its first
   * line with it).
   */
  #lay(box, entries) {
    const pages = [];
    const over = () => box.scrollHeight > box.clientHeight + 1;
    const next = () => {
      pages.push(box.innerHTML);
      box.innerHTML = '';
    };
    box.innerHTML = '';
    for (const e of entries) {
      if (e.fresh && box.childElementCount) next();
      let el = null;
      const begin = () => {
        el = document.createElement('div');
        el.className = e.cls;
        box.appendChild(el);
      };
      begin();
      let lead = e.head;
      for (const line of e.lines) {
        const before = el.innerHTML;
        el.insertAdjacentHTML('beforeend', lead + line);
        // Doesn't fit: over the page with it (unless it has the page to itself already, and still won't).
        if (over() && (before || box.childElementCount > 1)) {
          if (before) el.innerHTML = before;
          else el.remove();
          next();
          begin();
          el.insertAdjacentHTML('beforeend', (before ? e.again : e.head) + line);
        }
        lead = '';
      }
    }
    if (box.childElementCount || !pages.length) next();
    return pages;
  }

  #render() {
    const s = this.progress.state ?? {};
    const n = this.across;
    const page = (i) => `<section class="page"><div class="text"></div><footer class="foot">
        <span>${i === 0 ? '<button type="button" class="turn" data-turn="-1" aria-label="Turn back a page">&lsaquo;</button>' : n === 2 ? '<span class="hint">J to close</span>' : ''}</span>
        <span class="num"></span>
        <span>${i === n - 1 ? '<button type="button" class="turn" data-turn="1" aria-label="Turn over a page">&rsaquo;</button>' : ''}</span>
      </footer></section>`;
    this.el.innerHTML = `<div class="journal${n === 1 ? ' single' : ''}">${Array.from({ length: n }, (_, i) => page(i)).join('')}</div>`;
    // (Laid out in the first page's own box, so it's exactly the size the writing gets.)
    this.pages = this.#lay(this.el.querySelector('.text'), this.#entries(s));
    // Stay at the same place if it's still there (and at the start of a pair of pages).
    this.at = Math.min(this.at - (this.at % n), Math.floor((this.pages.length - 1) / n) * n);
    this.#show();
  }

  /** Fill in the pages showing, number them, and show or hide the corners. */
  #show() {
    const els = this.el.querySelectorAll('.page');
    els.forEach((p, i) => {
      const k = this.at + i;
      p.querySelector('.text').innerHTML = this.pages[k] ?? '';
      p.querySelector('.num').textContent = k < this.pages.length ? String(k + 1) : '';
    });
    const back = this.el.querySelector('[data-turn="-1"]');
    const on = this.el.querySelector('[data-turn="1"]');
    back?.classList.toggle('gone', this.at === 0);
    on?.classList.toggle('gone', this.at + els.length >= this.pages.length);
  }
}
