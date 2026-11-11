import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import {
  cleanSelections,
  loadAnswerKey,
  migrateInlineAnswers,
  parseQuestions,
  scoreSelections,
} from "../../shared/assessmentKey.ts";
import { findOwnRecord, writeOwnRecord } from "../../shared/studentRecords.ts";

// Security: a student's lesson quiz is now opened, autosaved and graded here
// instead of by the client. Students can't write QuizResponse directly (RLS is
// admin-only for create/update), the answer key is read from the admin-only
// AssessmentAnswerKey, and the client never sends score/total/status.
//
// Payload: { lesson_id, action, selections? }
//   action "start"       -> create the in_progress record on first open
//   action "save"        -> autosave picks (answers_text only)
//   action "new_attempt" -> reset a teacher-returned quiz
//   action "submit"      -> grade and lock (0.5 pt per correct answer)
// Returns: { record } (+ { answers } on submit, { too_soon: true } if the
//          5-minute minimum hasn't passed)

const MIN_MS = 5 * 60 * 1000; // 5-minute minimum, same as the client
const PER_QUESTION = 0.5;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    const action = body?.action;
    if (!lessonId) return Response.json({ error: "lesson_id required" }, { status: 400 });

    const lesson = await base44.asServiceRole.entities.Lesson.get(lessonId).catch(() => null);
    if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });
    let questions = parseQuestions(lesson.quiz_json);
    // Legacy lessons still carry inline answers: move them to the key entity.
    questions = await migrateInlineAnswers(base44, "quiz", lessonId, questions);

    const record = await findOwnRecord(base44, "QuizResponse", { lesson_id: lessonId }, user.id);
    const now = new Date().toISOString();

    if (action === "start") {
      if (record || !questions.length || user.role === "admin")
        return Response.json({ record });
      const created = await writeOwnRecord(base44, "QuizResponse", null, user.id, {
        lesson_id: lessonId,
        answers_text: JSON.stringify({ selections: {} }),
        started_at: now,
        attempted_at: "",
        score: 0,
        total: 0,
        status: "in_progress",
      });
      return Response.json({ record: created });
    }

    if (!record) return Response.json({ error: "Quiz not started" }, { status: 404 });

    if (action === "save") {
      if (record.status === "graded")
        return Response.json({ error: "already_graded" }, { status: 409 });
      const updated = await writeOwnRecord(base44, "QuizResponse", record, user.id, {
        answers_text: JSON.stringify({
          selections: cleanSelections(body?.selections, questions.length),
        }),
      });
      return Response.json({ record: updated });
    }

    if (action === "new_attempt") {
      if (record.status !== "returned")
        return Response.json({ error: "not_returned" }, { status: 409 });
      const updated = await writeOwnRecord(base44, "QuizResponse", record, user.id, {
        answers_text: JSON.stringify({ selections: {} }),
        started_at: now,
        attempted_at: "",
        score: 0,
        total: 0,
        status: "in_progress",
      });
      return Response.json({ record: updated });
    }

    if (action === "submit") {
      if (record.status === "graded")
        return Response.json({ error: "already_graded" }, { status: 409 });
      if (!questions.length) return Response.json({ error: "No quiz" }, { status: 400 });
      // Same silent 5-minute minimum the client enforces, measured from the
      // server-stamped started_at.
      const startedAt = record.started_at ? new Date(record.started_at).getTime() : Date.now();
      if (Date.now() - startedAt < MIN_MS) return Response.json({ too_soon: true, record });

      const selections = cleanSelections(body?.selections, questions.length);
      const answers = await loadAnswerKey(base44, "quiz", lessonId, questions);
      const { score, total } = scoreSelections(answers, selections, questions.length, PER_QUESTION);
      const updated = await writeOwnRecord(base44, "QuizResponse", record, user.id, {
        answers_text: JSON.stringify({ selections }),
        score,
        total,
        attempted_at: now,
        status: "graded",
      });
      // The quiz UI highlights correct answers after grading, so return them
      // here rather than from a student-readable record.
      return Response.json({ record: updated, answers });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as any).message || String(error) }, { status: 500 });
  }
}
