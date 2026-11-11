import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { todayInTz, nowHHMMInTz, windowStatus } from "../../shared/donow.ts";

// Returns the student's view of today's scheduled Do Now, with answer /
// explanation stripped out until the student has submitted. DoNow is an
// admin-only entity (RLS), so we read it with the service role after
// authenticating the caller, and only ever expose student-safe fields.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const today = todayInTz();
    const nowT = nowHHMMInTz();

    // 1) Explicitly date-scheduled Do Nows.
    let list = await base44.asServiceRole.entities.DoNow.filter({
      scheduled_date: today,
      active: true,
    });

    // 2) Fallback: imported Do Nows keep a day_number (matching the pacing
    //    calendar's instructional_day) but usually have an empty
    //    scheduled_date. Without this fallback students never see the
    //    day's warm-up. PacingDay.date is stored as MM/DD/YYYY; todayInTz
    //    is YYYY-MM-DD so we convert before matching.
    if (!list.length) {
      const [yyyy, mm, dd] = today.split("-");
      const mdy = `${mm}/${dd}/${yyyy}`;
      const pacing = await base44.asServiceRole.entities.PacingDay.filter({
        date: mdy,
      });
      const todayDayNum = pacing?.[0]?.instructional_day;
      if (todayDayNum != null) {
        list = await base44.asServiceRole.entities.DoNow.filter({
          day_number: todayDayNum,
          active: true,
        });
      }
    }

    if (!list.length) return Response.json({ scheduled: false });

    const d = list[0];
    const status = windowStatus(d.scheduled_start_time, d.scheduled_end_time, nowT);

    // The student's own response (user-scoped, honours RLS).
    const resp = await base44.entities.DoNowResponse.filter({
      do_now_id: d.do_now_id,
      created_by_id: user.id,
    });
    const r = resp[0] || null;
    const completed = !!r && !!r.completed_at && !r.reopened;

    const payload: Record<string, unknown> = {
      scheduled: true,
      do_now_id: d.do_now_id,
      day_number: d.day_number,
      phase: d.phase,
      lesson_topic: d.lesson_topic,
      question: d.question,
      choice_a: d.choice_a,
      choice_b: d.choice_b,
      choice_c: d.choice_c,
      choice_d: d.choice_d,
      time_limit_minutes: d.time_limit_minutes || 5,
      points_possible: d.points_possible || 1,
      gradebook_setting: d.gradebook_setting,
      scheduled_start_time: d.scheduled_start_time,
      scheduled_end_time: d.scheduled_end_time,
      status,
      server_time: nowT,
      has_response: !!r,
      completed,
      reopened: !!r?.reopened,
    };

    // Only after submission do we reveal grading + the explanation.
    if (r && r.completed_at) {
      payload.answer = r.answer;
      payload.is_correct = r.is_correct;
      payload.score = r.score;
      payload.response_points_possible = r.points_possible;
      payload.completed_at = r.completed_at;
      payload.attempts = r.attempts;
      payload.correct_answer = d.correct_answer;
      payload.correct_answer_text = d.correct_answer_text;
      payload.answer_explanation =
        d.show_explanation_after_submit === false ? "" : d.answer_explanation;
    }

    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}