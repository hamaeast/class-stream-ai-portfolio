import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { gradeAnswers } from "../../shared/gradePractice.ts";

// AI-grades a single student's practice answers against the lesson's
// server-side answer key. Student answer key is NEVER read by the client
// (PracticeAnswerKey is admin-only); this function reads it via the service
// role, sends each answer + its model answer to the LLM, and returns
// per-question scores + a short feedback line.
//
// The grading core itself is shared with regradePractice.ts (the bulk re-grade
// used after a teacher edits the answer key), so both stay in sync.
//
// Payload: { lesson_id, answers: { qid: "student text" } }
// Returns: { results: [{ id, score, max, feedback }], total_score, total_max,
//           confidence, review_needed }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    const answers = body?.answers || {};
    if (!lessonId) return Response.json({ error: "lesson_id required" }, { status: 400 });

    const g = await gradeAnswers(base44, lessonId, answers);
    if (g.error) {
      const status = /No answers/.test(g.error) ? 400 : 404;
      return Response.json({ error: g.error }, { status });
    }
    return Response.json(g);
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}