// Security: answer keys for multiple-choice quizzes (Lesson.quiz_json) and
// CFAs (CFA.questions_json) used to sit on those student-readable records as
// answer_index. They now live in the admin-only AssessmentAnswerKey entity
// ({ kind: 'quiz' | 'cfa', ref_id, answers_json }); the readable question JSON
// carries only { question, choices }. Every read/write here uses the service
// role, so callers must do their own auth checks.

export type KeyKind = "quiz" | "cfa";

// Splits [{question, choices, answer_index}] into the student-readable
// questions and the parallel array of correct indexes.
export function splitAnswerKey(questions) {
  const list = Array.isArray(questions) ? questions : [];
  return {
    questions: list.map((q) => ({ question: q.question, choices: q.choices })),
    answers: list.map((q) => (Number.isInteger(q.answer_index) ? q.answer_index : 0)),
  };
}

export function hasInlineAnswers(questions) {
  return Array.isArray(questions) && questions.some((q) => q && "answer_index" in q);
}

async function findKey(base44, kind: KeyKind, refId: string) {
  const rows = await base44.asServiceRole.entities.AssessmentAnswerKey.filter({
    kind,
    ref_id: refId,
  });
  return (rows || [])[0] || null;
}

export async function saveAnswerKey(base44, kind: KeyKind, refId: string, answers: number[]) {
  const existing = await findKey(base44, kind, refId);
  const data = { kind, ref_id: refId, answers_json: JSON.stringify(answers) };
  return existing
    ? await base44.asServiceRole.entities.AssessmentAnswerKey.update(existing.id, data)
    : await base44.asServiceRole.entities.AssessmentAnswerKey.create(data);
}

// Returns the correct indexes for a quiz/CFA. Falls back to legacy inline
// answer_index values (records not yet migrated) so grading never breaks.
export async function loadAnswerKey(base44, kind: KeyKind, refId: string, questions) {
  const row = await findKey(base44, kind, refId);
  if (row?.answers_json) {
    try {
      const arr = JSON.parse(row.answers_json);
      if (Array.isArray(arr)) return arr;
    } catch {}
  }
  if (hasInlineAnswers(questions)) return splitAnswerKey(questions).answers;
  return [];
}

// Moves legacy inline answers off a Lesson/CFA into the key entity and
// rewrites the readable JSON without them. Returns the stripped questions.
export async function migrateInlineAnswers(base44, kind: KeyKind, refId: string, questions) {
  if (!hasInlineAnswers(questions)) return questions;
  const split = splitAnswerKey(questions);
  await saveAnswerKey(base44, kind, refId, split.answers);
  const entity = kind === "quiz" ? "Lesson" : "CFA";
  const field = kind === "quiz" ? "quiz_json" : "questions_json";
  await base44.asServiceRole.entities[entity].update(refId, {
    [field]: JSON.stringify(split.questions),
  });
  return split.questions;
}

// Same rule the client used: a question counts when the picked index equals
// the key's index; each correct answer is worth `perQuestion` points.
export function scoreSelections(answers: number[], selections, questionCount: number, perQuestion: number) {
  let score = 0;
  for (let i = 0; i < questionCount; i++) {
    const pick = selections?.[i] ?? selections?.[String(i)];
    if (pick !== undefined && pick !== null && Number(pick) === answers[i]) score += perQuestion;
  }
  return { score, total: questionCount * perQuestion };
}

export function parseQuestions(text) {
  try {
    const o = JSON.parse(text || "[]");
    if (Array.isArray(o)) return o;
  } catch {}
  return [];
}

// Keeps only integer choice picks keyed by question index; drops anything else.
export function cleanSelections(raw, questionCount: number) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (let i = 0; i < questionCount; i++) {
    const v = raw[i] ?? raw[String(i)];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n < 10) out[i] = n;
  }
  return out;
}
