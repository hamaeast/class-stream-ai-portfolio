import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { saveAnswerKey, splitAnswerKey } from "../../shared/assessmentKey.ts";

// Security: teacher-only save for the CFA editor. The editor works with
// {question, choices, answer_index}; this splits the correct indexes into the
// admin-only AssessmentAnswerKey and writes only {question, choices} to the
// student-readable CFA.questions_json.
//
// Payload: { cfa_id, questions: [{ question, choices, answer_index }] }
// Returns: { cfa: <saved CFA>, questions: <editor copy with answer_index> }

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin")
      return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const cfaId = body?.cfa_id;
    if (!cfaId) return Response.json({ error: "cfa_id required" }, { status: 400 });
    const input = Array.isArray(body?.questions) ? body.questions : [];
    const editorQuestions = input.map((q: any) => ({
      question: String(q?.question || ""),
      choices: Array.isArray(q?.choices) ? q.choices.map((c: any) => String(c ?? "")) : [],
      answer_index: Math.max(0, Math.min(3, Number(q?.answer_index) || 0)),
    }));

    const { questions, answers } = splitAnswerKey(editorQuestions);
    await saveAnswerKey(base44, "cfa", cfaId, answers);
    const cfa = await base44.asServiceRole.entities.CFA.update(cfaId, {
      questions_json: JSON.stringify(questions),
    });
    return Response.json({ cfa, questions: editorQuestions });
  } catch (error) {
    return Response.json({ error: (error as any).message || String(error) }, { status: 500 });
  }
}
