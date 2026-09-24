const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./game-core.js');
const base = { difficulty: 'easy', limb: 'hands', theme: 'fruit', weights: false };
test('legs never spawn bombs and keep objects in the calibrated narrow column', () => {
  for (let n = 0; n < 3000; n++) {
    const item = R.spawn({ ...base, limb: 'legs' }, { id: 1, center: 0.6 });
    assert.notEqual(item.kind, 'bomb'); assert.ok(item.x >= 0.45 && item.x <= 0.75); assert.equal(item.owner, 1);
  }
});
test('hands keep hazards and good items; weights slow the fall', () => {
  assert.equal(R.spawn(base, { id: 0 }, () => 0.99).kind, 'bomb');
  assert.equal(R.spawn(base, { id: 0 }, () => 0.85).kind, 'rotten');
  assert.equal(R.spawn(base, { id: 0 }, () => 0.2).points, 10);
  assert.ok(R.spawn({ ...base, weights: true }, { id: 0 }, () => 0.2).speed < R.spawn(base, { id: 0 }, () => 0.2).speed);
});
test('custom objects are bounded with an empty-input fallback', () => {
  assert.deepEqual(R.objectList('custom', '⭐, Books, '), ['⭐', 'Books']);
  assert.deepEqual(R.objectList('custom', ' , '), R.themes.fruit);
  assert.equal(R.objectList('custom', 'a,b,c,d,e,f,g').length, 6);
});
test('warning starts before disappearance', () => {
  assert.equal(R.warning({ y: 0.5, speed: 0.1 }), false);
  assert.equal(R.warning({ y: 0.96, speed: 0.1 }), true);
});
function pose(scale = 1) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  points[11] = { x: 0.5 - 0.12 * scale, y: 0.3, visibility: 1 };
  points[12] = { x: 0.5 + 0.12 * scale, y: 0.3, visibility: 1 };
  points[23] = { x: 0.4, y: 0.3 + 0.28 * scale, visibility: 1 };
  points[24] = { x: 0.6, y: 0.3 + 0.28 * scale, visibility: 1 };
  return points;
}
test('proximity detects movement toward camera and uses hysteresis', () => {
  const baseline = R.proximity(pose(), 0, false).scale;
  assert.equal(R.proximity(pose(), baseline, false).close, false);
  assert.equal(R.proximity(pose(1.5), baseline, false).close, true);
  assert.equal(R.proximity(pose(1.3), baseline, true).close, true);
  assert.equal(R.proximity(pose(1.1), baseline, true).close, false);
  assert.equal(R.proximity(null, baseline, true).valid, false);
  assert.equal(R.proximity(pose(3), 0, false).close, true);
});
test('selected limb visibility is required', () => {
  const p = pose(); p[27].visibility = p[28].visibility = 0;
  assert.equal(R.tracked(p, 'legs'), false); assert.equal(R.tracked(p, 'both'), false); assert.equal(R.tracked(p, 'hands'), true);
});
test('malformed saved scores cannot break the board', () => {
  assert.deepEqual(R.cleanScores({}), []);
  assert.deepEqual(R.cleanScores([null, { name: 'X', score: -1, mode: 'hands' }]), []);
});
