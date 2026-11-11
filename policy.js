/*
 * Demo copies of Class Stream's deterministic logic, so the demo runs the same
 * rules as production. Sources:
 *   parseLines/buildPayloads -> base44/shared/practiceParser.ts (parseDoc, buildPayloads)
 *   finalizeGrades           -> base44/shared/gradePractice.ts (after the model call)
 *   cleanCfa                 -> base44/functions/buildCfa/entry.ts (after the model call)
 * Tests: demo/policy.test.mjs
 */
(function (root) {
  const HEADER_RE = /^\s*(PRACTICE|APPLY|CHALLENGE)\s*[·•]\s*(\d+)\s*(PT|PTS)\s+(\d+)\s*\.?\s*$/i;
  const SECTION_RE = /^\s*(PRACTICE|APPLY|CHALLENGE)\s*[·•]\s*\d+\s*points?\s*each\s*$/i;
  const GOAL_RE = /point\s*goal[:\s-]*?(\d+)\s*points?/i;

  // Same loop as parseDoc, starting from text lines instead of exported HTML.
  function parseLines(lines, isKey) {
    const questions = []; let cur = null; let pointGoal = 10; let title = '';
    for (const raw of lines) {
      const line = String(raw).trim();
      if (!line) continue;
      const tg = line.match(GOAL_RE);
      if (tg) { pointGoal = Number(tg[1]) || 10; continue; }
      if (!title) { const tm = line.match(/^Practice\s*[-—]\s*(.+)$/i); if (tm) { title = tm[1].trim(); continue; } }
      if (SECTION_RE.test(line)) continue;
      const h = line.match(HEADER_RE);
      if (h) {
        if (cur) questions.push(cur);
        cur = { id: `${h[1].toLowerCase()}${h[4]}`, tier: h[1].toLowerCase(), points: Number(h[2]), num: Number(h[4]), label: line, _p: [], _a: [], _answer: false };
        continue;
      }
      if (!cur) continue;
      if (isKey) {
        if (/^answer\s*[:]/i.test(line)) { cur._answer = true; cur._a.push(line.replace(/^answer\s*[:]/i, '').trim()); }
        else if (cur._answer) cur._a.push(line);
        else cur._p.push(line);
      } else cur._p.push(line);
    }
    if (cur) questions.push(cur);
    questions.forEach(q => { q.prompt = q._p.join(' ').replace(/\s+/g, ' ').trim(); q.model_answer = q._a.join(' ').replace(/\s+/g, ' ').trim(); delete q._p; delete q._a; delete q._answer; });
    return { title, pointGoal, questions };
  }

  // Student copy gets no answers; the key stays server-side (admin-only entity).
  function buildPayloads(prac, key) {
    const keyMap = new Map((key.questions || []).map(q => [q.id, q]));
    return {
      practicePayload: { title: prac.title, point_goal: prac.pointGoal || 10, questions: prac.questions.map(q => ({ id: q.id, tier: q.tier, points: q.points, label: q.label, prompt: q.prompt })) },
      keyItems: prac.questions.map(q => ({ id: q.id, tier: q.tier, points: q.points, prompt: q.prompt, model_answer: (keyMap.get(q.id) || {}).model_answer || '' })),
    };
  }

  // Clamp each score to the item's points, clamp confidence to 0..1, compute a
  // points-weighted average confidence, and flag for teacher review below 0.90.
  // Results are built from the SUBMITTED item ids (default: every key item):
  // model results for ids that weren't submitted are ignored, and a submitted
  // item the model skipped scores 0 of its points with confidence 0, so it
  // can't silently drop out of the max and it forces teacher review.
  // NOTE: confidence is the model's own estimate, not a measured accuracy rate.
  function finalizeGrades(keyItems, modelResults, submittedIds) {
    const keyMap = new Map(keyItems.map(k => [k.id, k]));
    const ids = submittedIds || keyItems.map(k => k.id);
    const byId = new Map();
    (modelResults || []).forEach(r => { if (r && !byId.has(String(r.id))) byId.set(String(r.id), r); });
    const results = ids.map(id => {
      const max = (keyMap.get(id) || {}).points || 0;
      const r = byId.get(id);
      if (!r) return { id, score: 0, max, feedback: 'Not graded automatically', confidence: 0 };
      return { id, score: Math.max(0, Math.min(max, Number(r.score) || 0)), max, feedback: String(r.feedback || ''), confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)) };
    });
    const total_score = results.reduce((a, r) => a + r.score, 0);
    const total_max = results.reduce((a, r) => a + r.max, 0);
    const weighted = results.reduce((a, r) => a + r.confidence * r.max, 0);
    const confidence = total_max > 0 ? weighted / total_max : 0;
    return { results, total_score, total_max, confidence, review_needed: confidence < 0.9 };
  }

  // Keep only well-formed questions: trimmed text, first 4 choices, answer index 0..3.
  function cleanCfa(data) {
    const questions = Array.isArray(data && data.questions) ? data.questions.map(q => ({
      question: String(q.question || '').trim(),
      choices: Array.isArray(q.choices) ? q.choices.slice(0, 4).map(c => String(c || '')) : [],
      answer_index: Math.max(0, Math.min(3, Number(q.answer_index) || 0)),
    })).filter(q => q.question && q.choices.length === 4) : [];
    return { study_guide: String((data && data.study_guide) || '').trim(), questions, published: false };
  }

  const api = { parseLines, buildPayloads, finalizeGrades, cleanCfa };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DemoPolicy = api;
})(typeof window !== 'undefined' ? window : globalThis);
