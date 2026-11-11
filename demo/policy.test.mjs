import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { parseLines, buildPayloads, finalizeGrades, cleanCfa } = createRequire(import.meta.url)('./policy.js');

const prac = ['Practice — Variables', 'Point goal: 6 points', 'PRACTICE · 1 point each', 'PRACTICE · 1 PT 1.', 'What is a variable?', 'APPLY · 3 PTS 2.', 'Write a line that stores your age.'];
const key = ['PRACTICE · 1 PT 1.', 'What is a variable?', 'Answer: A named place to store a value.', 'APPLY · 3 PTS 2.', 'Write a line that stores your age.', 'Answer: age = 12', 'Any valid name is fine.'];

test('parses tiers, points, goal and title without AI', () => {
  const p = parseLines(prac, false);
  assert.equal(p.title, 'Variables'); assert.equal(p.pointGoal, 6);
  assert.deepEqual(p.questions.map(q => [q.id, q.points]), [['practice1', 1], ['apply2', 3]]);
});

test('answer key lines become model answers; student copy has none', () => {
  const { practicePayload, keyItems } = buildPayloads(parseLines(prac, false), parseLines(key, true));
  assert.equal(keyItems[1].model_answer, 'age = 12 Any valid name is fine.');
  assert.ok(!('model_answer' in practicePayload.questions[0]));
});

const items = [{ id: 'practice1', points: 1 }, { id: 'apply2', points: 3 }];
test('scores clamp to item points and high confidence posts directly', () => {
  const r = finalizeGrades(items, [{ id: 'practice1', score: 5, confidence: 0.95 }, { id: 'apply2', score: 3, confidence: 0.95 }]);
  assert.equal(r.total_score, 4); assert.equal(r.review_needed, false);
});

test('low self-reported confidence on a high-point item sends the attempt to the teacher', () => {
  const r = finalizeGrades(items, [{ id: 'practice1', score: 1, confidence: 1 }, { id: 'apply2', score: 2, confidence: 0.6 }]);
  assert.equal(r.confidence, 0.7); assert.equal(r.review_needed, true);
});

test('an item the model skipped still counts: 0 points of its max, confidence 0, review forced', () => {
  const r = finalizeGrades(items, [{ id: 'practice1', score: 1, confidence: 1 }, { id: 'extra9', score: 5, confidence: 1 }], ['practice1', 'apply2']);
  assert.deepEqual(r.results.map(x => [x.id, x.score, x.max, x.confidence]), [['practice1', 1, 1, 1], ['apply2', 0, 3, 0]]);
  assert.equal(r.results[1].feedback, 'Not graded automatically');
  assert.equal(r.total_score, 1); assert.equal(r.total_max, 4); assert.equal(r.review_needed, true);
});

test('CFA cleanup drops malformed questions, clamps answer index, saves hidden', () => {
  const c = cleanCfa({ study_guide: ' g ', questions: [{ question: 'Q', choices: ['a', 'b', 'c', 'd', 'e'], answer_index: 7 }, { question: '', choices: ['a', 'b', 'c', 'd'] }, { question: 'Q2', choices: ['a', 'b'] }] });
  assert.equal(c.questions.length, 1); assert.equal(c.questions[0].answer_index, 3); assert.equal(c.questions[0].choices.length, 4); assert.equal(c.published, false);
});
