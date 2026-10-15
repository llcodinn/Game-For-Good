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
test('standard fruit and celebration items spawn', () => {
  const fruit = R.spawn(base, { id: 0 }, () => 0.2);
  assert.ok(R.fruits.includes(fruit.symbol));
  const bonus = R.spawn(base, { id: 0 }, () => 0.75);
  assert.equal(bonus.kind, 'bonus'); assert.equal(bonus.points, 0);
  assert.ok(R.celebrations.includes(bonus.symbol));
});
test('bonus doubles fruit only, refreshes without stacking, and is player-specific', () => {
  const p = { score: 0, bonusLeft: 0 }, other = { score: 0, bonusLeft: 0 };
  const fruit = { kind: 'good', points: 10 };
  assert.equal(R.award(p, fruit), 10);
  R.award(p, { kind: 'bonus' }); assert.equal(p.bonusLeft, 10);
  assert.equal(R.award(p, fruit), 20);
  assert.equal(R.award(other, fruit), 10);
  assert.equal(R.award(p, { kind: 'rotten', points: -10 }), -10);
  p.bonusLeft = 4; R.award(p, { kind: 'bonus' }); assert.equal(p.bonusLeft, 10);
  p.bonusLeft = 0; assert.equal(R.award(p, fruit), 10);
  p.score = 0; R.award(p, { kind: 'bomb', points: -10 }); assert.equal(p.score, 0);
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
test('hands mode calibrates without visible hips but keeps the shoulder distance check', () => {
  const p = pose(); p[23].visibility = p[24].visibility = 0;
  assert.equal(R.proximity(p, 0, false, 'hands').valid, true);
  assert.equal(R.proximity(p, 0, false, 'legs').valid, false);
  assert.equal(R.tracked(p, 'hands'), true);
  const reference = R.proximity(p, 0, false, 'hands').scale;
  assert.equal(R.proximity(pose(1.5), reference, false, 'hands').close, true);
  p[11].visibility = 0;
  assert.equal(R.proximity(p, reference, false, 'hands').valid, false);
});
