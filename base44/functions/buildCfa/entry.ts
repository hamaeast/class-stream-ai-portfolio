import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { saveAnswerKey, splitAnswerKey } from "../../shared/assessmentKey.ts";

// Teacher-only: AI-generates a CFA (Common Formative Assessment) covering a
// 3-phase range. Produces BOTH a short markdown study guide and ~10
// multiple-choice questions (4 choices each, with the correct answer marked),
// then saves them onto the CFA entity. The teacher can edit the study guide
// and questions in the app before releasing the CFA to students.
//
// Payload: { cfa_id }  -> regenerate an existing CFA (uses its phase range)
//           { phase_start, phase_end } -> generate into a new CFA
// Returns: { cfa: <saved CFA entity>, questions: <editor copy with answer_index> }
//
// Security: answer_index values are stored in the admin-only
// AssessmentAnswerKey (kind 'cfa'); CFA.questions_json (student-readable)
// holds only { question, choices }.

function parseLesson(l: any) {
  const overview = String(l.title || "").match(/^Phase\s*(\d+)\s*[—–-]\s*(.+)$/);
  if (overview) return { phase: Number(overview[1]), isOverview: true };
  const lesson = String(l.title || "").match(
    /^Phase\s*(\d+)\s*·\s*Lesson\s*(\d+)\s*[—–-]\s*(.+)$/
  );
  if (lesson)
    return { phase: Number(lesson[1]), isOverview: false, num: Number(lesson[2]), title: lesson[3] };
  return null;
}

const tryParse = (s: any) => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin")
      return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    let cfaId = body?.cfa_id || "";
    let phaseStart = body?.phase_start;
    let phaseEnd = body?.phase_end;

    let existing: any = null;
    if (cfaId) {
      existing = await base44.asServiceRole.entities.CFA.get(cfaId).catch(() => null);
      if (existing) {
        phaseStart = existing.phase_start;
        phaseEnd = existing.phase_end;
      }
    }
    if (phaseStart == null || phaseEnd == null)
      return Response.json({ error: "phase_start and phase_end required" }, { status: 400 });

    const lessons = await base44.asServiceRole.entities.Lesson.list("order", 1000);
    const inRange = (lessons || [])
      .map((l: any) => ({ l, p: parseLesson(l) }))
      .filter(
        (x: any) =>
          x.p && !x.p.isOverview && x.p.phase >= phaseStart && x.p.phase <= phaseEnd
      )
      .sort((a: any, b: any) => a.p.phase - b.p.phase || a.p.num - b.p.num);

    if (!inRange.length)
      return Response.json({ error: "No lessons found in that phase range" }, { status: 400 });

    const lessonContext = inRange
      .map((x: any) => {
        const ctx = [x.l.description, x.l.content]
          .filter(Boolean)
          .join(" ")
          .slice(0, 300);
        return `Phase ${x.p.phase} Lesson ${x.p.num} — ${x.p.title}${ctx ? ": " + ctx : ""}`;
      })
      .join("\n");

    const prompt =
      "You are writing a Common Formative Assessment (CFA) for a middle-school computer science class. " +
      `This CFA covers Phases ${phaseStart}-${phaseEnd}. ` +
      "First write a CONCISE study guide in markdown (under 400 words) summarizing the key concepts and vocabulary students should know across these phases. " +
      "Then write 10 multiple-choice questions (exactly 4 choices each) that assess understanding spread evenly across ALL the phases. " +
      "Questions must be clear, fair, and aligned to the lesson topics. Mark the single correct answer with answer_index (0-3). " +
      "Return JSON with 'study_guide' (string, markdown) and 'questions' (array of {question: string, choices: [4 strings], answer_index: 0-3}).\n\n" +
      `Lessons in this phase range:\n${lessonContext}`;

    const res: any = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          study_guide: { type: "string" },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                choices: { type: "array", items: { type: "string" } },
                answer_index: { type: "number" },
              },
              required: ["question", "choices", "answer_index"],
            },
          },
        },
        required: ["study_guide", "questions"],
      },
    });

    const data: any = typeof res === "string" ? tryParse(res) || {} : res;
    const studyGuide = String(data.study_guide || "").trim();
    const questions = Array.isArray(data.questions)
      ? data.questions
          .map((q: any) => ({
            question: String(q.question || "").trim(),
            choices: Array.isArray(q.choices)
              ? q.choices.slice(0, 4).map((c: any) => String(c || ""))
              : [],
            answer_index: Math.max(0, Math.min(3, Number(q.answer_index) || 0)),
          }))
          .filter((q: any) => q.question && q.choices.length === 4)
      : [];

    const payload = {
      title: `CFA: Phase ${phaseStart}-${phaseEnd}`,
      phase_start: phaseStart,
      phase_end: phaseEnd,
      study_guide: studyGuide,
      questions_json: JSON.stringify(splitAnswerKey(questions).questions),
    };

    let saved: any;
    if (existing) {
      saved = await base44.asServiceRole.entities.CFA.update(cfaId, payload);
    } else {
      saved = await base44.asServiceRole.entities.CFA.create({
        ...payload,
        published: false,
      });
    }

    await saveAnswerKey(base44, "cfa", saved.id, splitAnswerKey(questions).answers);

    return Response.json({ cfa: saved, questions });
  } catch (error) {
    return Response.json({ error: (error as any).message || String(error) }, { status: 500 });
  }
}