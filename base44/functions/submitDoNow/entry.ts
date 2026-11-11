import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

// Grades and locks a student's Do Now attempt. The correct answer lives on
// the admin-only DoNow entity, so we read it with the service role; the
// response is written user-scoped so ownership RLS is honoured.
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

    const existing = await base44.entities.DoNowResponse.filter({
      do_now_id,
      created_by_id: user.id,
    });
    const r = existing[0] || null;

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

    let rec;
    if (r) {
      rec = await base44.entities.DoNowResponse.update(r.id, {
        answer: choice,
        is_correct,
        score,
        points_possible: points,
        completed_at: now,
        attempts: (r.attempts || 0) + 1,
        reopened: false,
      });
    } else {
      rec = await base44.entities.DoNowResponse.create({
        do_now_id,
        answer: choice,
        is_correct,
        score,
        points_possible: points,
        completed_at: now,
        attempts: 1,
        reopened: false,
      });
    }

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