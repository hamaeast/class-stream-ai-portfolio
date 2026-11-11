import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { hasInlineAnswers, migrateInlineAnswers, parseQuestions } from "../../shared/assessmentKey.ts";

// Security: one-off, teacher-only migration. Lessons and CFAs built before the
// answer-key split still carry answer_index inside the student-readable
// quiz_json / questions_json. This moves every such key into the admin-only
// AssessmentAnswerKey and rewrites the readable JSON without answers. Safe to
// re-run (already-migrated records are skipped). submitQuiz / submitCfa /
// buildLessonQuiz also migrate lazily, but run this once after deploying so no
// legacy record stays readable.
//
// Payload: {}   Returns: { lessons: number, cfas: number }

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin")
      return Response.json({ error: "Admin only" }, { status: 403 });

    let lessons = 0;
    let cfas = 0;
    const lessonList = await base44.asServiceRole.entities.Lesson.list("order", 1000);
    for (const l of lessonList || []) {
      const qs = parseQuestions(l.quiz_json);
      if (!hasInlineAnswers(qs)) continue;
      await migrateInlineAnswers(base44, "quiz", l.id, qs);
      lessons += 1;
    }
    const cfaList = await base44.asServiceRole.entities.CFA.list("phase_start", 1000);
    for (const c of cfaList || []) {
      const qs = parseQuestions(c.questions_json);
      if (!hasInlineAnswers(qs)) continue;
      await migrateInlineAnswers(base44, "cfa", c.id, qs);
      cfas += 1;
    }
    return Response.json({ lessons, cfas });
  } catch (error) {
    return Response.json({ error: (error as any).message || String(error) }, { status: 500 });
  }
}
