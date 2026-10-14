// The Heart of the Sea, the main story (shared/story.js), on the server's
// rules (worker/rules.js). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, freshState } from '../worker/rules.js';
import { pellsBar, horseshoeCove, gannetNest } from '../shared/world.js';
import { foreTopChest, hatchChest } from '../shared/wreck.js';
import { kittiwakeChest } from '../shared/kittiwake.js';
import { beaconSpot } from '../shared/beacon.js';
import { zawnChest } from '../shared/zawn.js';
import { templeGate, templeHeart } from '../shared/temple.js';
import { CHAPTERS, TEMPLE, DONE, LETTER, LETTER2, LETTER2_NOTE, KEEPERS, TEMPLE_CLUE, DONE_NOTE, TARGETS, stoneNote, stonePoint } from '../shared/story.js';

const ctx = (now = 1000) => ({ secret: 'test-secret', now });
const DIGS = { 'pells-bar': () => pellsBar().spot, horseshoe: () => horseshoeCove().spot, beacon: () => beaconSpot() };
const CLIMBS = { 'molly-ann': hatchChest, wreck: foreTopChest, gannet: gannetNest, kittiwake: kittiwakeChest, zawn: zawnChest };

/** Get the chest at a chapter's place: dig for it, or claim it at the top of the climb. */
async function fetch(s, id, now = 1000) {
  if (DIGS[id]) {
    const p = DIGS[id]();
    return apply(s, { type: 'dig', x: p.x + 0.3, z: p.z - 0.2 }, ctx(now));
  }
  const p = CLIMBS[id]();
  return apply(s, { type: 'claim', course: id, x: p.x, y: p.y + 0.3, z: p.z }, ctx(now));
}

test('the story: eight chests, in order, a key in each', () => {
  assert.equal(CHAPTERS.length, 9);
  assert.equal(new Set(TARGETS).size, 8);
  for (const id of TARGETS) assert.ok(DIGS[id] || CLIMBS[id], id);
});

test('the Heart of the Sea, start to end: the letter, the keys, the gate, the Heart', async () => {
  let s = freshState(0);
  // Before the letter's read, a chest is just a chest.
  let r = await fetch(s, 'pells-bar');
  assert.equal(r.reply.result, 'chest');
  assert.equal(r.reply.key, undefined);
  s = r.state;
  assert.equal(s.story.ch, 0);
  // The letter: the story begins (once).
  r = await apply(s, { type: 'storyBegin' }, ctx());
  assert.ok(r.reply.ok);
  s = r.state;
  assert.equal(s.story.ch, 1);
  assert.equal((await apply(s, { type: 'storyBegin' }, ctx())).reply.ok, false);
  assert.equal(s.quests.heart.stage, 1);
  // Pell's Bar was dug before the story got there: the spot shows again, and the key's in it now.
  const p = pellsBar().spot;
  r = await apply(s, { type: 'near', x: p.x + 1, z: p.z }, ctx());
  assert.equal(r.reply.spots.length, 1);
  r = await fetch(s, 'pells-bar');
  assert.deepEqual(r.reply.key, { n: 1, name: CHAPTERS[1].key });
  s = r.state;
  assert.equal(s.story.ch, 2);
  assert.equal((await fetch(s, 'pells-bar')).reply.result, 'nothing', 'only the once');
  // The wrong chest has no key in it (and Gannet Stack's had now, before its turn).
  r = await fetch(s, 'gannet');
  assert.equal(r.reply.result, 'chest');
  assert.equal(r.reply.key, undefined);
  s = r.state;
  // The rest, in order (the gannet's key in a chest put back for it).
  for (let n = 2; n <= 8; n++) {
    r = await fetch(s, CHAPTERS[n].target, 1000 + n);
    assert.equal(r.reply.result, 'chest', CHAPTERS[n].target);
    assert.equal(r.reply.key?.n, n, CHAPTERS[n].target);
    s = r.state;
  }
  assert.deepEqual(s.story.keys, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(s.story.ch, TEMPLE);
  // The gate: only with the keys, and only at it. The Heart: only once the gate's open, and only by it.
  const g = templeGate();
  const h = templeHeart();
  assert.equal((await apply(s, { type: 'heart', x: h.x, y: h.y, z: h.z }, ctx())).reply.ok, false);
  assert.equal((await apply(s, { type: 'templeOpen', x: g.x + 40, z: g.z }, ctx())).reply.ok, false);
  r = await apply(s, { type: 'templeOpen', x: g.x + 1, z: g.z - 1 }, ctx());
  assert.ok(r.reply.ok);
  s = r.state;
  assert.equal((await apply(s, { type: 'heart', x: h.x + 10, y: h.y, z: h.z }, ctx())).reply.ok, false);
  r = await apply(s, { type: 'heart', x: h.x + 0.8, y: h.y - 1, z: h.z }, ctx(5000));
  assert.ok(r.reply.ok);
  s = r.state;
  assert.equal(s.story.ch, DONE);
  assert.ok(s.quests.heart.done);
  assert.ok(s.journal.filter((n) => n.quest === 'heart').length >= 10);
});

test("a new player's gate won't open, and the Heart won't come", async () => {
  const s = freshState(0);
  const g = templeGate();
  const h = templeHeart();
  assert.equal((await apply(s, { type: 'templeOpen', x: g.x, z: g.z }, ctx())).reply.ok, false);
  assert.equal((await apply(s, { type: 'heart', x: h.x, y: h.y, z: h.z }, ctx())).reply.ok, false);
});

test('saves from before the story begin it from the letter', async () => {
  const old = freshState(0);
  delete old.story;
  const r = await apply(old, { type: 'storyBegin' }, ctx());
  assert.ok(r.reply.ok);
  assert.equal(r.state.story.ch, 1);
});

test("the story's writing: no shouting, no stock phrases", () => {
  const texts = [
    ...LETTER,
    ...LETTER2,
    LETTER2_NOTE,
    TEMPLE_CLUE,
    DONE_NOTE,
    ...CHAPTERS.slice(1).flatMap((c) => [c.title, c.key, c.clue, c.found]),
    ...KEEPERS.slice(1).flatMap((k, i) => [k.carving, stoneNote(i + 1)]),
  ];
  const banned = /greetings|traveller|traveler|ahoy|matey|adventurer|brave|quest|objective|ancient|legendary|epic|mysterious/i;
  for (const t of texts) {
    assert.ok(!t.includes('!'), `no exclamation marks: ${t}`);
    assert.ok(!banned.test(t), `no stock phrases: ${t}`);
    assert.ok(t.length <= 320, `not too long: ${t}`);
  }
});

test("each key comes with its family's words; the fourth with a second letter from Elowen", async () => {
  let s = freshState(0);
  s = (await apply(s, { type: 'storyBegin' }, ctx())).state;
  for (let n = 1; n <= 4; n++) {
    const r = await fetch(s, CHAPTERS[n].target, 1000 + n);
    assert.equal(r.reply.key.n, n);
    s = r.state;
    assert.ok(s.journal.some((j) => j.quest === 'heart' && j.text === CHAPTERS[n].found), `key ${n}'s words in the journal`);
    assert.equal(!!s.story.letter2, n >= 4);
  }
  assert.ok(s.journal.some((j) => j.text === LETTER2_NOTE));
});

test("the keepers' stones: read by them, once each, their counts in the journal", async () => {
  let s = freshState(0);
  const p = stonePoint(3);
  // Not from a long way off.
  let r = await apply(s, { type: 'stone', n: 3, x: p.x + 40, z: p.z }, ctx());
  assert.equal(r.reply.ok, false);
  assert.equal((await apply(s, { type: 'stone', n: 9, x: p.x, z: p.z }, ctx())).reply.ok, false);
  r = await apply(s, { type: 'stone', n: 3, x: p.x + 1.5, z: p.z - 1 }, ctx());
  assert.ok(r.reply.ok);
  assert.equal(r.reply.notches, KEEPERS[3].notches);
  s = r.state;
  assert.deepEqual(s.story.stones, [3]);
  assert.equal(s.journal.filter((j) => j.quest === 'stones').length, 1);
  assert.match(s.journal.at(-1).text, /ring/);
  r = await apply(s, { type: 'stone', n: 3, x: p.x, z: p.z }, ctx());
  assert.ok(r.reply.already);
  assert.equal(r.state.journal.filter((j) => j.quest === 'stones').length, 1, 'only the once');
  // Every stone on dry ground, and every count a different place round the Heart.
  for (let n = 1; n <= 8; n++) assert.ok(stonePoint(n).y > 0.5, `stone ${n} above the sea`);
  assert.equal(new Set(KEEPERS.slice(1).map((k) => k.notches)).size, 8);
});
