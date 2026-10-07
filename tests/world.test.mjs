// The shared world and the treasure server's rules. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, ISLAND_BY_ID, toWorld, diggableAt, groundAt, pellsBar, horseshoeCove, surfAt, gannetNest } from '../shared/world.js';
import { foreTopChest, hatchChest } from '../shared/wreck.js';
import { SPOTS, spotWorld, PUZZLES, COURSES, issueMap, verifyMap, dig, near, claim } from '../worker/treasure.js';

const SECRET = 'test-secret';

test('seven islands, the big one in the middle', () => {
  assert.equal(ISLANDS.length, 7);
  const saddle = ISLANDS.find((i) => i.id === 'saddle');
  assert.deepEqual([saddle.x, saddle.z], [0, 0]);
});

test('every map spot can be dug, and so can the ground round it', () => {
  for (const s of SPOTS) {
    const p = spotWorld(s);
    assert.ok(diggableAt(p.x, p.z), `${s.island}: ${s.note}`);
    let ok = 0;
    for (let a = 0; a < 16; a++) if (diggableAt(p.x + Math.cos((a / 16) * 6.283) * 1.2, p.z + Math.sin((a / 16) * 6.283) * 1.2)) ok++;
    assert.ok(ok >= 12, `${s.island} spot is too cramped (${ok}/16)`);
  }
});

test('puzzle spots can be dug', () => {
  for (const [name, at] of Object.entries(PUZZLES)) {
    const p = at();
    assert.ok(p && diggableAt(p.x, p.z), name);
  }
});

test("Pell's Bar shadow reaches the weed in the late afternoon", () => {
  const { hour, spot } = pellsBar();
  assert.ok(hour > 16 && hour < 18, `hour ${hour}`);
  assert.ok(groundAt(spot.x, spot.z) > 0.3);
});

test('the Horseshoe cove chest is out of the surf, the shelf is in it', () => {
  const { spot, refuges } = horseshoeCove();
  assert.equal(surfAt(spot.x, spot.z), null);
  assert.equal(refuges.length, 3);
  const isl = ISLAND_BY_ID.horseshoe;
  const { shelf, rc, w } = isl.features;
  const a = shelf.a0 + 0.2;
  const p = toWorld(isl, Math.cos(a) * (rc + w - 1.5), Math.sin(a) * (rc + w - 1.5));
  assert.ok(surfAt(p.x, p.z), 'the shelf should be in the surf');
});

test('a map leads to its chest, and only its own', async () => {
  const map = await issueMap(SECRET);
  assert.ok(!('spot' in map), 'the client must not get the spot');
  const { spot } = await verifyMap(SECRET, map.id);
  const p = spotWorld(spot);
  assert.equal((await dig(SECRET, { x: p.x + 1, z: p.z - 1, maps: [map.id] })).result, 'chest');
  assert.notEqual((await dig(SECRET, { x: p.x + 9, z: p.z, maps: [map.id] })).result, 'chest');
  const forged = map.id.slice(0, 17) + '0'.repeat(16);
  assert.notEqual((await dig(SECRET, { x: p.x, z: p.z, maps: [forged] })).result, 'chest');
  assert.equal(await verifyMap('other-secret', map.id), null);
});

test('the disturbed ground only shows up close', async () => {
  const map = await issueMap(SECRET);
  const p = spotWorld((await verifyMap(SECRET, map.id)).spot);
  const close = await near(SECRET, { x: p.x + 5, z: p.z + 3, maps: [map.id] });
  assert.equal(close.spots.length, 1);
  assert.ok(Math.hypot(close.spots[0].x - p.x, close.spots[0].z - p.z) < 0.02);
  assert.equal((await near(SECRET, { x: p.x + 20, z: p.z, maps: [map.id] })).spots.length, 0);
  assert.equal((await near(SECRET, { x: p.x, z: p.z, maps: [] })).spots.length, 0, 'no map, no hint');
  const forged = map.id.slice(0, 17) + '0'.repeat(16);
  assert.equal((await near(SECRET, { x: p.x, z: p.z, maps: [forged] })).spots.length, 0);
  // The puzzles only give themselves away right on top of the spot.
  const bar = PUZZLES['pells-bar']();
  assert.equal((await near(SECRET, { x: bar.x + 6, z: bar.z, maps: [] })).spots.length, 0);
  assert.equal((await near(SECRET, { x: bar.x + 2, z: bar.z, maps: [] })).spots[0].puzzle, 'pells-bar');
});

test('the drawn X is near the spot but not on it', async () => {
  for (let i = 0; i < 20; i++) {
    const map = await issueMap(SECRET);
    const p = spotWorld((await verifyMap(SECRET, map.id)).spot);
    const off = Math.hypot(map.mark.x - p.x, map.mark.z - p.z);
    assert.ok(off > 0.5 && off < 3, `X is ${off.toFixed(2)} m off`);
  }
});

test('about one wrong hole in four has a crab', async () => {
  let crabs = 0;
  for (let i = 0; i < 400; i++) if ((await dig(SECRET, { x: i * 7.3, z: 3, maps: [] })).result === 'crab') crabs++;
  assert.ok(crabs > 60 && crabs < 140, `${crabs}/400`);
});

test('climb chests only count from up there', () => {
  for (const [name, at] of Object.entries(COURSES)) {
    const p = at();
    assert.equal(claim({ course: name, x: p.x, y: p.y, z: p.z }).result, 'chest', name);
    assert.equal(claim({ course: name, x: p.x, y: p.y - 6, z: p.z }).result, 'nothing', name);
  }
  assert.equal(claim({ course: 'constructor', x: 0, y: 0, z: 0 }).result, 'nothing');
  assert.ok(foreTopChest().y > 10 && gannetNest().y > 20 && hatchChest().y > 2);
});
