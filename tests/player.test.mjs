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
