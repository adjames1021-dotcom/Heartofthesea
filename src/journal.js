// Your journal (J): a notebook open at two pages. On the left, what you've
// jotted down about the people you're helping, in your own words; on the
// right, what's in the hold and the dishes you know. All of it comes from
// your saved state on the server; nothing here is counted or scored.

import { ITEMS, FIND_IDS, countOf } from '../shared/items.js';
import { QUESTS } from '../shared/quests.js';
import { RECIPES } from '../shared/food.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Journal {
  constructor({ progress }) {
    this.progress = progress;
    this.el = document.createElement('div');
    this.el.className = 'screen journal-screen';
    document.body.appendChild(this.el);
    progress.onChange(() => this.open && this.#render());
  }

  get open() {
    return this.el.classList.contains('open');
  }

  toggle(force) {
    const on = this.el.classList.toggle('open', force);
    if (on) {
      this.#render();
      // Let go of the mouse so the pages can be scrolled.
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  /** Arrow keys scroll the notes too. */
  update(input) {
    if (!this.open) return;
    const page = this.el.querySelector('.page');
    if (input.held('ArrowDown')) page.scrollTop += 8;
    if (input.held('ArrowUp')) page.scrollTop -= 8;
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
    return [...groups.values()].sort((a, b) => done(a) - done(b) || b.last - a.last);
  }

  /** Once something's sorted, just how it started and how it ended. */
  #shown(g, s) {
    if (!s.quests?.[g.id]?.done || g.notes.length <= 2) return g.notes;
    return [g.notes[0], g.notes[g.notes.length - 1]];
  }

  /** What's aboard, in words: "three mackerel", "a sheet of copper". */
  #hold(s) {
    const counts = new Map();
    for (const it of s.items ?? []) {
      if (FIND_IDS.includes(it.kind) || !ITEMS[it.kind]) continue;
      counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
    }
    return [...counts].map(([kind, n]) => countOf(kind, n));
  }

  #render() {
    const s = this.progress.state ?? {};
    const groups = this.#notes(s);
    const hold = this.#hold(s);
    const recipes = (s.recipes ?? []).filter((r) => RECIPES[r]);
    const left = groups.length
      ? groups
          .map(
            (g) => `<div class="entry${s.quests?.[g.id]?.done ? ' done' : ''}">
              ${QUESTS[g.id]?.title ? `<h3>${esc(QUESTS[g.id].title)}</h3>` : ''}
              ${this.#shown(g, s).map((t) => `<p>${esc(t)}</p>`).join('')}
            </div>`,
          )
          .join('')
      : '<p class="empty">Nothing written down yet.</p>';
    const right = `
      <h3>In the hold</h3>
      ${hold.length ? `<ul>${hold.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="empty">Not much.</p>'}
      ${recipes.length ? `<h3>Cooking</h3>${recipes.map((r) => `<p><b>${esc(RECIPES[r].name)}.</b> ${esc(RECIPES[r].note)}</p>`).join('')}` : ''}`;
    this.el.innerHTML = `
      <div class="journal">
        <section class="page">${left}</section>
        <section class="page">${right}<p class="close">J to close</p></section>
      </div>`;
  }
}
