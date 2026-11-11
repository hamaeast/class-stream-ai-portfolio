// Core AI grading for practice answers. Shared by gradePractice (a single
// student submission) and regradePractice (bulk re-grade of every already-
// submitted attempt after a teacher edits the answer key).
//
// Reads the lesson's server-side PracticeAnswerKey (admin-only entity; read
// here via the service role), builds a per-item grading payload, sends it to
// the LLM, and returns per-question scores + an overall confidence so the
// caller can decide whether the attempt needs manual teacher review.
//
// `base44` is the client from createClientFromRequest — we use its
// asServiceRole handle so reads/writes bypass the per-user RLS that would
// otherwise hide other students' answer keys.

export function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// Returns:
//   { results: [{id, score, max, feedback, confidence}], total_score, total_max,
//     confidence, review_needed }
// or { error: string } when the practice key isn't built yet / nothing to grade.
export async function gradeAnswers(base44, lessonId, answers) {
  const keys = await base44.asServiceRole.entities.PracticeAnswerKey.filter({
    lesson_id: lessonId,
  });
  if (!keys || !keys.length)
    return { error: "Practice is not ready yet." };

  const keyItems = safeParse(keys[0].keys_text) || [];
  const keyMap = new Map(keyItems.map((k) => [k.id, k]));

  const items = Object.entries(answers || {})
    .map(([id, text]) => {
      const k = keyMap.get(id) || { points: 1, prompt: "", model_answer: "" };
      return {
        id,
        points: k.points || 1,
        prompt: k.prompt || "",
        model_answer: k.model_answer || "",
        student_answer: String(text).trim(),
      };
    })
    .filter((it) => it.student_answer);

  if (!items.length)
    return { error: "No answers to grade." };

  const promptText =
    "You are grading 6th-grade student answers in a computer science practice worksheet. " +
    "For EACH item, compare ONLY the CONTENT of the student_answer against the model_answer (which may include grading notes). " +
    "Assess writing at a 6th-grade level: do NOT penalize simple wording, casual phrasing, or mild spelling/grammar as long as the core idea is present. " +
    "Award partial credit when the idea is partly correct or incomplete. " +
    "Score each item from 0 to its maxPoints. " +
    "ALSO for each item include a 'confidence' value from 0.0 to 1.0 expressing how sure you are the awarded score is correct — use low confidence when the student's answer is ambiguous, off-topic, or hard to compare to the model_answer. " +
    'Return ONLY JSON shaped as: { "results": [{ "id": string, "score": number, "feedback": string, "confidence": number }], "total_score": number }. ' +
    "feedback should be one short sentence telling the student what was right or what was missing.\n\n" +
    "Items to grade:\n" + JSON.stringify(items);

  const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: promptText,
    response_json_schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              score: { type: "number" },
              feedback: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["id", "score", "feedback", "confidence"],
          },
        },
        total_score: { type: "number" },
      },
      required: ["results", "total_score"],
    },
  });

  const data = typeof res === "string" ? safeParse(res) || {} : res;
  const raw = data?.results || [];
  // Build results from the SUBMITTED items, not from what the model returned:
  // a result whose id wasn't submitted is ignored, and an item the model
  // skipped scores 0 of its key points with confidence 0, so it still counts
  // toward the max and forces teacher review instead of silently dropping out.
  const byId = new Map();
  for (const r of raw) if (r && !byId.has(String(r.id))) byId.set(String(r.id), r);
  const results = items.map((it) => {
    const k = keyMap.get(it.id) || {};
    const max = k.points || 0;
    const r = byId.get(it.id);
    if (!r) {
      return { id: it.id, score: 0, max, feedback: "Not graded automatically", confidence: 0 };
    }
    const score = Math.max(0, Math.min(max, Number(r.score) || 0));
    const conf = Math.max(0, Math.min(1, Number(r.confidence) || 0));
    return { id: it.id, score, max, feedback: String(r.feedback || ""), confidence: conf };
  });
  const total_score = results.reduce((a, r) => a + r.score, 0);
  const total_max = results.reduce((a, r) => a + r.max, 0);
  // Overall confidence = points-weighted average of per-item confidence.
  // Below 0.90 the attempt is flagged for manual teacher review.
  const weighted = results.reduce((a, r) => a + r.confidence * (r.max || 0), 0);
  const maxPts = results.reduce((a, r) => a + (r.max || 0), 0);
  const confidence = maxPts > 0 ? weighted / maxPts : 0;
  const review_needed = confidence < 0.9;

  return { results, total_score, total_max, confidence, review_needed };
}