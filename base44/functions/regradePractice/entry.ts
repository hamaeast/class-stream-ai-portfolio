import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { gradeAnswers, safeParse } from "../../shared/gradePractice.ts";

// Re-grades EVERY already-submitted practice attempt for a lesson against the
// lesson's CURRENT answer key. Called by the teacher practice editor right
// after a teacher edits questions/answers — so editing a wrong answer or point
// value fixes every student's posted grade at once instead of only affecting
// future attempts.
//
// Reads all PracticeResponse rows for the lesson via the service role (bypasses
// per-user RLS so we see every student), re-runs the same AI grading logic used
// on a normal submission, and patches each record's score / feedback /
// confidence / status. Teachers' manual review-queue approvals are re-evaluated
// too: if the new grading pushes an attempt below 90% confidence it goes back
// to under_review; if it clears 90% it posts to the gradebook.
//
// Payload: { lesson_id }
// Returns: { regarded: number, skipped: number, total: number, errors: string[] }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    if (!lessonId)
      return Response.json({ error: "lesson_id required" }, { status: 400 });

    const all = await base44.asServiceRole.entities.PracticeResponse.filter({
      lesson_id: lessonId,
    });
    // Only re-grade attempts that were actually turned in (attempts > 0); leave
    // empty in-progress drafts untouched.
    const submitted = (all || []).filter((r) => (r.attempts || 0) > 0);

    let regarded = 0;
    let skipped = 0;
    const errors = [];

    // Grade concurrently in small batches so a full class doesn't run one LLM
    // call at a time. Service-role InvokeLLM is stateless per call.
    const CONC = 5;
    for (let i = 0; i < submitted.length; i += CONC) {
      const batch = submitted.slice(i, i + CONC);
      await Promise.all(
        batch.map(async (r) => {
          const answers = safeParse(r.answers_text) || {};
          const g = await gradeAnswers(base44, lessonId, answers);
          if (g.error) {
            skipped += 1;
            errors.push(`${r.id}: ${g.error}`);
            return;
          }
          const fb = {};
          (g.results || []).forEach((res) => {
            fb[res.id] = { score: res.score, max: res.max, feedback: res.feedback };
          });
          // Append a regrade marker to the attempt history so there's an audit
          // trail of when/how the score changed (the attempt number itself is
          // NOT incremented — a re-grade is not a new student attempt).
          const history = safeParse(r.attempt_history_text) || [];
          history.push({
            regrade: true,
            score: g.total_score,
            total: g.total_max,
            at: new Date().toISOString(),
          });
          const patch = {
            score: g.total_score,
            total: g.total_max,
            feedback_text: JSON.stringify(fb),
            confidence: g.confidence,
            review_needed: g.review_needed,
            status: g.review_needed ? "under_review" : "submitted",
            attempt_history_text: JSON.stringify(history),
          };
          await base44.asServiceRole.entities.PracticeResponse.update(r.id, patch);
          regarded += 1;
        })
      );
    }

    return Response.json({
      regarded,
      skipped,
      total: submitted.length,
      errors,
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}