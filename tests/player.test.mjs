// The rules for a player's saved progress (worker/rules.js). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, freshState, publicState } from '../worker/rules.js';
import { verifyMap, spotWorld } from '../worker/treasure.js';

const ctx = (now = 1000) => ({ secret: 'test-secret', now });

test('a new player gets one map, once', async () => {
  let s = freshState(0);
  let r = await apply(s, { type: 'firstMap' }, ctx());
  assert.ok(r.reply.ok && r.state.maps.length === 1);
  s = r.state;
  r = await apply(s, { type: 'firstMap' }, ctx());
  assert.equal(r.reply.ok, false);
  assert.equal(r.state, s, 'a refused action changes nothing');
});

test('dig up the chest a map leads to, deliver it, and get the next map', async () => {
  let s = (await apply(freshState(0), { type: 'firstMap' }, ctx())).state;
  const { spot } = await verifyMap('test-secret', s.maps[0].id);
  const p = spotWorld(spot);
  let r = await apply(s, { type: 'dig', x: p.x + 30, z: p.z }, ctx());
  assert.notEqual(r.reply.result, 'chest');
  r = await apply(r.state, { type: 'dig', x: p.x + 0.5, z: p.z }, ctx());
  assert.equal(r.reply.result, 'chest');
  assert.equal(r.state.maps.length, 0, 'the map is used up');
  const chest = r.reply.chest;
  r = await apply(r.state, { type: 'deliver', chest }, ctx());
  assert.ok(r.reply.ok && r.state.maps.length === 1);
  const again = await apply(r.state, { type: 'deliver', chest }, ctx());
  assert.equal(again.reply.ok, false, 'a chest only opens once');
});

test('the spare map is only there when you have none', async () => {
  const s = (await apply(freshState(0), { type: 'firstMap' }, ctx())).state;
  assert.equal((await apply(s, { type: 'spareMap' }, ctx())).reply.ok, false);
  const empty = { ...s, maps: [] };
  assert.equal((await apply(empty, { type: 'spareMap' }, ctx())).reply.ok, true);
});

test('fish have to be the right size, and not come too fast', async () => {
  let s = freshState(0);
  assert.equal((await apply(s, { type: 'catch', kind: 'mackerel', kg: 40 }, ctx(10))).reply.ok, false);
  assert.equal((await apply(s, { type: 'catch', kind: 'kraken', kg: 1 }, ctx(10))).reply.ok, false);
  let r = await apply(s, { type: 'catch', kind: 'mackerel', kg: 0.6 }, ctx(10));
  assert.ok(r.reply.ok);
  assert.equal(r.state.items.length, 1);
  assert.equal((await apply(r.state, { type: 'catch', kind: 'mackerel', kg: 0.6 }, ctx(11))).reply.ok, false);
  r = await apply(r.state, { type: 'catch', kind: 'pollock', kg: 2 }, ctx(20));
  assert.deepEqual(r.state.catches.counts, { mackerel: 1, pollock: 1 });
  assert.equal(r.state.catches.biggest.kind, 'pollock');
});

test('finds are only real ones, and only once', async () => {
  const s = freshState(0);
  assert.equal((await apply(s, { type: 'find', id: 'golden-idol' }, ctx())).reply.ok, false);
  const r = await apply(s, { type: 'find', id: 'bottle' }, ctx());
  assert.deepEqual(r.state.finds, ['bottle']);
  const r2 = await apply(r.state, { type: 'find', id: 'bottle' }, ctx());
  assert.equal(r2.state.items.length, 1);
});

test('unknown actions and odd input are turned away', async () => {
  const s = freshState(0);
  for (const a of [null, {}, { type: 'constructor' }, { type: 'dig', x: 'here' }, { type: '__proto__' }]) {
    const r = await apply(s, a, ctx());
    assert.equal(r.reply.ok, false);
    assert.equal(r.state, s);
  }
  assert.ok(!('nextId' in publicState(s)));
});

// --- People and the things they ask of you ---
import { TALK, openingFor, repliesAt, lineText } from '../shared/talk.js';
import { QUESTS } from '../shared/quests.js';
import { ITEMS } from '../shared/items.js';
import { RECIPES } from '../shared/food.js';

/** Talk to someone: pick replies by number, one after another, as a player would. */
async function talk(s, who, picks, h = 12) {
  const convo = openingFor(who, s, h);
  assert.ok(convo, `${who} has something to say`);
  let line = '0';
  for (const pick of picks) {
    const r = await apply(s, { type: 'talk', who, convo: convo.id, line, pick }, ctx());
    assert.ok(r.reply.ok, `${who}/${convo.id}/${line} reply ${pick}: ${r.reply.why}`);
    s = r.state;
    if (r.reply.to === null) break;
    line = String(r.reply.to);
  }
  return { s, convo: convo.id };
}

const has = (s, kind) => s.items.some((i) => i.kind === kind);

test("Oda's nets: offered to help, found the copper, told her", async () => {
  let s = freshState(0);
  ({ s } = await talk(s, 'oda', [0]));
  assert.ok(s.met.oda);
  let c;
  ({ s, convo: c } = await talk(s, 'oda', [0, 0, 0, 0]));
  assert.equal(c, 'nets-ask');
  assert.equal(s.quests.nets.stage, 0);
  assert.match(s.journal.at(-1).text, /Oda's nets keep coming in cut/);
  // Not from across the sea; and only once you're there.
  const at = QUESTS.nets.steps.copper.at;
  let r = await apply(s, { type: 'quest', id: 'nets', step: 'copper', x: 0, z: 0 }, ctx());
  assert.equal(r.reply.ok, false);
  r = await apply(s, { type: 'quest', id: 'nets', step: 'copper', x: at[0] + 1, z: at[1] }, ctx());
  assert.ok(r.reply.ok && has(r.state, 'copper') && r.state.quests.nets.stage === 1);
  s = r.state;
  r = await apply(s, { type: 'quest', id: 'nets', step: 'copper', x: at[0], z: at[1] }, ctx());
  assert.equal(r.reply.ok, false, 'only the once');
  ({ s, convo: c } = await talk(s, 'oda', [0, 0, 0, 0]));
  assert.equal(c, 'nets-report');
  assert.ok(s.quests.nets.done && has(s, 'corkfloat'));
  // She remembers.
  assert.match(lineText(openingFor('oda', s, 14).lines[0], s, 14), /copper/);
  assert.equal(openingFor('tam', s, 12).id, 'foretop-ask', "Tam's turn now");
});

test("Gwen's knife: fetched from Silas, handed back, and a recipe for it", async () => {
  let s = freshState(0);
  ({ s } = await talk(s, 'gwen', [0]));
  ({ s } = await talk(s, 'gwen', [0, 0, 0]));
  assert.equal(s.quests.knife.stage, 0);
  assert.equal(openingFor('gwen', s, 12).id, 'knife-wait');
  // Can't hand over what you haven't got.
  const ret = TALK.gwen.find((c) => c.id === 'knife-return');
  assert.equal(repliesAt(ret.lines[0], s).length, 0);
  let r = await apply(s, { type: 'talk', who: 'gwen', convo: 'knife-return', line: '0', pick: 0 }, ctx());
  assert.equal(r.reply.ok, false);
  ({ s } = await talk(s, 'silas', [0, 0, 0]));
  assert.ok(has(s, 'knife') && s.quests.sail);
  ({ s } = await talk(s, 'gwen', [0, 0, 0]));
  assert.ok(s.quests.knife.done && !has(s, 'knife') && has(s, 'saltfish'));
  assert.deepEqual(s.recipes, ['mackerel-lime']);
  r = await apply(s, { type: 'talk', who: 'gwen', convo: 'knife-return', line: '0', pick: 0 }, ctx());
  assert.equal(r.reply.ok, false, 'that conversation is over');
});

test('every conversation hangs together', () => {
  for (const [who, convos] of Object.entries(TALK)) {
    for (const c of convos) {
      for (const [n, line] of Object.entries(c.lines)) {
        for (const r of line.replies) {
          if (r.to !== undefined) assert.ok(c.lines[r.to], `${who}/${c.id}/${n} goes to a line that exists`);
          for (const [what, a] of r.do ?? []) {
            if (['start', 'note', 'stage', 'done'].includes(what)) assert.ok(QUESTS[a]?.title, `${who}/${c.id}: quest ${a}`);
            if (what === 'give' || what === 'take') assert.ok(ITEMS[a], `${who}/${c.id}: item ${a}`);
            if (what === 'learn') assert.ok(RECIPES[a], `${who}/${c.id}: recipe ${a}`);
          }
        }
      }
    }
  }
});

test('the writing: short lines, no stock phrases, no shouting', () => {
  const states = [freshState(0), { ...freshState(0), met: { oda: 1, tam: 1, gwen: 1, silas: 1 }, quests: { nets: { stage: 1, done: true }, knife: { stage: 0, done: true }, sail: { stage: 0 } } }];
  const texts = [];
  for (const convos of Object.values(TALK)) {
    for (const c of convos) {
      for (const line of Object.values(c.lines)) {
        for (const s of states) {
          for (const h of [6, 12, 20]) {
            texts.push(lineText(line, s, h));
            for (const r of line.replies) {
              texts.push(typeof r.say === 'function' ? r.say(s, h) : r.say);
              for (const [what, , text] of r.do ?? []) if (what === 'note') texts.push(text);
            }
          }
        }
      }
    }
  }
  for (const q of Object.values(QUESTS)) for (const st of Object.values(q.steps)) texts.push(st.say, ...st.do.filter((d) => d[0] === 'note').map((d) => d[2]));
  const banned = /greetings|traveller|traveler|ahoy|matey|adventurer|brave|quest|objective|ancient|legendary|epic|mysterious|\d+\s*\/\s*\d+/i;
  for (const t of texts) {
    assert.ok(!t.includes('!'), `no exclamation marks: ${t}`);
    assert.ok(!banned.test(t), `no stock phrases: ${t}`);
    assert.ok(t.length <= 190, `short: ${t}`);
  }
});
