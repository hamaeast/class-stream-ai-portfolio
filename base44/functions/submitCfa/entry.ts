import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import {
  cleanSelections,
  loadAnswerKey,
  migrateInlineAnswers,
  parseQuestions,
  scoreSelections,
} from "../../shared/assessmentKey.ts";
import { findOwnRecord, writeOwnRecord } from "../../shared/studentRecords.ts";

// Security: a student's CFA is now opened, autosaved and graded here instead
// of by the client. Students can't write CFAResponse directly (RLS is
// admin-only for create/update), the answer key is read from the admin-only
// AssessmentAnswerKey, and the client never sends score/total/status.
//
// Payload: { cfa_id, action, selections? }
//   action "start"  -> create the in_progress record on first open
//   action "save"   -> autosave picks (answers_text only)
//   action "submit" -> grade and lock (1 pt per correct answer)
// Returns: { record } (+ { answers } on submit)

const PER_QUESTION = 1;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const cfaId = body?.cfa_id;
    const action = body?.action;
    if (!cfaId) return Response.json({ error: "cfa_id required" }, { status: 400 });

    const cfa = await base44.asServiceRole.entities.CFA.get(cfaId).catch(() => null);
    if (!cfa) return Response.json({ error: "CFA not found" }, { status: 404 });
    // Students only ever see released CFAs (same gate as the UI).
    if (!cfa.published && user.role !== "admin")
      return Response.json({ error: "CFA not released" }, { status: 403 });
    let questions = parseQuestions(cfa.questions_json);
    questions = await migrateInlineAnswers(base44, "cfa", cfaId, questions);

    const record = await findOwnRecord(base44, "CFAResponse", { cfa_id: cfaId }, user.id);
    const now = new Date().toISOString();

    if (action === "start") {
      if (record || !questions.length || user.role === "admin")
        return Response.json({ record });
      const created = await writeOwnRecord(base44, "CFAResponse", null, user.id, {
        cfa_id: cfaId,
        answers_text: JSON.stringify({ selections: {} }),
        started_at: now,
        attempted_at: "",
        score: 0,
        total: questions.length,
        status: "in_progress",
      });
      return Response.json({ record: created });
    }

    if (!record) return Response.json({ error: "CFA not started" }, { status: 404 });
    if (record.status === "graded")
      return Response.json({ error: "already_graded" }, { status: 409 });

    if (action === "save") {
      const updated = await writeOwnRecord(base44, "CFAResponse", record, user.id, {
        answers_text: JSON.stringify({
          selections: cleanSelections(body?.selections, questions.length),
        }),
      });
      return Response.json({ record: updated });
    }

    if (action === "submit") {
      if (!questions.length) return Response.json({ error: "No questions" }, { status: 400 });
      const selections = cleanSelections(body?.selections, questions.length);
      const answers = await loadAnswerKey(base44, "cfa", cfaId, questions);
      const { score, total } = scoreSelections(answers, selections, questions.length, PER_QUESTION);
      const updated = await writeOwnRecord(base44, "CFAResponse", record, user.id, {
        answers_text: JSON.stringify({ selections }),
        score,
        total,
        attempted_at: now,
        status: "graded",
      });
      // The CFA UI highlights correct answers after grading; return them here.
      return Response.json({ record: updated, answers });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as any).message || String(error) }, { status: 500 });
  }
}
