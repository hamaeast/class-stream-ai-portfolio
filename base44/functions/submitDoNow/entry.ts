import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { findOwnRecord, writeOwnRecord } from "../../shared/studentRecords.ts";

// Grades and locks a student's Do Now attempt. The correct answer lives on
// the admin-only DoNow entity, so we read it with the service role.
//
// Security: the response (score, is_correct) used to be written user-scoped,
// which required DoNowResponse create/update RLS to allow the student, so a
// student could also write their own score directly. Create/update is now
// admin-only and the response is written here with the service role;
// ownership is stamped in student_id (see shared/studentRecords.ts).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const do_now_id = body?.do_now_id;
    const choice = body?.choice; // "A".."D", or "" for a timed-out no-answer
    if (!do_now_id) return Response.json({ error: "do_now_id required" }, { status: 400 });
    if (choice !== "" && !["A", "B", "C", "D"].includes(choice)) {
      return Response.json({ error: "invalid choice" }, { status: 400 });
    }

    const dn = await base44.asServiceRole.entities.DoNow.filter({ do_now_id });
    if (!dn.length) return Response.json({ error: "Do Now not found" }, { status: 404 });
    const d = dn[0];

    const r = await findOwnRecord(base44, "DoNowResponse", { do_now_id }, user.id);

    // One attempt unless the teacher reopened it.
    if (r && r.completed_at && !r.reopened) {
      return Response.json(
        { error: "already_submitted", message: "Today's Do Now has already been completed." },
        { status: 409 }
      );
    }

    const is_correct = choice !== "" && choice === d.correct_answer;
    const points = d.points_possible || 1;
    const score = is_correct ? points : 0;
    const now = new Date().toISOString();

    const rec = await writeOwnRecord(base44, "DoNowResponse", r, user.id, {
      do_now_id,
      answer: choice,
      is_correct,
      score,
      points_possible: points,
      completed_at: now,
      attempts: (r?.attempts || 0) + 1,
      reopened: false,
    });

    return Response.json({
      ok: true,
      is_correct,
      score,
      points_possible: points,
      completed_at: rec.completed_at || now,
      correct_answer: d.correct_answer,
      correct_answer_text: d.correct_answer_text,
      answer_explanation:
        d.show_explanation_after_submit === false ? "" : d.answer_explanation,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}