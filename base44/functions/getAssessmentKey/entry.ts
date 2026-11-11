import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { loadAnswerKey, parseQuestions } from "../../shared/assessmentKey.ts";
import { findOwnRecord } from "../../shared/studentRecords.ts";

// Security: returns the correct choice indexes for a quiz or CFA. Answer keys
// live in the admin-only AssessmentAnswerKey entity, so this is the only way
// the UI gets them:
//   - admins (teacher views, CfaEditor, previewing a student) always;
//   - a student only after their own attempt is graded, which is when the
//     quiz/CFA UI already highlights the correct answers.
//
// Payload: { kind: "quiz" | "cfa", ref_id }   (ref_id = lesson id or CFA id)
// Returns: { answers: number[] } or { answers: null } when not allowed yet.

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind;
    const refId = body?.ref_id;
    if ((kind !== "quiz" && kind !== "cfa") || !refId)
      return Response.json({ error: "kind and ref_id required" }, { status: 400 });

    if (user.role !== "admin") {
      const entity = kind === "quiz" ? "QuizResponse" : "CFAResponse";
      const query = kind === "quiz" ? { lesson_id: refId } : { cfa_id: refId };
      const mine = await findOwnRecord(base44, entity, query, user.id);
      if (mine?.status !== "graded") return Response.json({ answers: null });
    }

    const rec =
      kind === "quiz"
        ? await base44.asServiceRole.entities.Lesson.get(refId).catch(() => null)
        : await base44.asServiceRole.entities.CFA.get(refId).catch(() => null);
    if (!rec) return Response.json({ error: "Not found" }, { status: 404 });
    const questions = parseQuestions(kind === "quiz" ? rec.quiz_json : rec.questions_json);
    const answers = await loadAnswerKey(base44, kind, refId, questions);
    return Response.json({ answers });
  } catch (error) {
    return Response.json({ error: (error as any).message || String(error) }, { status: 500 });
  }
}
