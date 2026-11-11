import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { gradeAnswers, safeParse } from "../../shared/gradePractice.ts";
import { findOwnRecord, writeOwnRecord } from "../../shared/studentRecords.ts";

// AI-grades a single student's practice answers against the lesson's
// server-side answer key. Student answer key is NEVER read by the client
// (PracticeAnswerKey is admin-only); this function reads it via the service
// role, sends each answer + its model answer to the LLM, and returns
// per-question scores + a short feedback line.
//
// Security: this function also persists the attempt. It used to return scores
// for the client to write into PracticeResponse itself, which let a student
// write any score. Now PracticeResponse create/update is admin-only and the
// record (score, total, status, attempt history) is written here with the
// service role, using the same rules PracticeView applied: point-goal check,
// 3-attempt limit, under_review when confidence < 90%, and a manual-review
// fallback (score 0, status under_review) when AI grading fails.
//
// The grading core itself is shared with regradePractice.ts (the bulk re-grade
// used after a teacher edits the answer key), so both stay in sync.
//
// Payload: { lesson_id, answers: { qid: "student text" } }
// Returns: { record, results: [{ id, score, max, feedback }], total_score,
//           total_max, confidence, review_needed, manual_review }

const MAX_ATTEMPTS = 3; // 1 first attempt + 2 reattempts (same as PracticeView)

const topicOf = (t) => (String(t || "").split("—")[1] || t || "").trim();

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    const rawAnswers = body?.answers || {};
    if (!lessonId) return Response.json({ error: "lesson_id required" }, { status: 400 });

    const lesson = await base44.asServiceRole.entities.Lesson.get(lessonId).catch(() => null);
    if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });
    const practice = safeParse(lesson.practice_json) || {};
    const questions = Array.isArray(practice.questions) ? practice.questions : [];

    // Only non-empty answers to questions on this worksheet are graded.
    const answered = {};
    for (const q of questions) {
      const v = rawAnswers[q.id];
      if (typeof v === "string" && v.trim()) answered[q.id] = v.trim();
    }
    if (!Object.keys(answered).length)
      return Response.json({ error: "No answers to grade." }, { status: 400 });
    const selectedPts = questions.reduce((s, q) => s + (answered[q.id] ? q.points : 0), 0);
    const goal = Math.max(10, practice.point_goal || 10);
    if (selectedPts < goal)
      return Response.json(
        { error: `Answer at least ${goal} points worth before turning in` },
        { status: 400 }
      );

    const resp = await findOwnRecord(base44, "PracticeResponse", { lesson_id: lessonId }, user.id);
    if ((resp?.attempts || 0) >= MAX_ATTEMPTS)
      return Response.json({ error: "No attempts left" }, { status: 409 });

    // Grade. If AI grading is unavailable (e.g. integration credits are
    // exhausted) don't block the student: save the attempt as under_review so
    // the teacher grades it manually.
    let g = null;
    let manualReview = false;
    try {
      g = await gradeAnswers(base44, lessonId, answered);
      if (g.error) manualReview = true;
    } catch {
      manualReview = true;
    }

    const results = manualReview ? [] : g.results || [];
    const fb = {};
    results.forEach((r) => {
      fb[r.id] = { score: r.score, max: r.max, feedback: r.feedback };
    });
    const score = manualReview ? 0 : g.total_score;
    const total = manualReview ? selectedPts : g.total_max;
    const confidence = manualReview ? null : typeof g.confidence === "number" ? g.confidence : null;
    const review_needed = manualReview ? true : !!g.review_needed;
    const history = resp ? safeParse(resp.attempt_history_text) || [] : [];
    const nextAttempt = (resp?.attempts || 0) + 1;
    const now = new Date().toISOString();
    history.push({ answers: answered, feedback: fb, score, total, attempt: nextAttempt, at: now });

    const record = await writeOwnRecord(base44, "PracticeResponse", resp, user.id, {
      lesson_id: lessonId,
      title: practice.title || `Practice — ${topicOf(lesson.title)}`,
      point_goal: practice.point_goal || 10,
      answers_text: JSON.stringify(answered),
      feedback_text: JSON.stringify(fb),
      score,
      total,
      attempts: nextAttempt,
      attempt_history_text: JSON.stringify(history),
      submitted_at: now,
      status: review_needed ? "under_review" : "submitted",
      confidence,
      review_needed,
    });

    return Response.json({
      record,
      results,
      total_score: score,
      total_max: total,
      confidence,
      review_needed,
      manual_review: manualReview,
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
