import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { blankIds } from "../../shared/notesBlanks.ts";
import { findOwnRecord, writeOwnRecord } from "../../shared/studentRecords.ts";

// Security: guided-notes autosave and turn-in. The client used to write
// NotesResponse directly and set score = 5 itself on submit. NotesResponse
// create/update is now admin-only; this function writes it with the service
// role and only accepts the typed blanks. On submit it checks every answer box
// on the worksheet is filled (same rule as the UI) before awarding 5 points.
//
// Payload: { lesson_id, blanks: { "0": "text", "qc1": "text" }, submit?: boolean }
// Returns: { record } or { error: "incomplete" } when a box is empty on submit.

const NOTES_POINTS = 5;
const topicOf = (t) => (String(t || "").split("—")[1] || t || "").trim();

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    const submit = body?.submit === true;
    if (!lessonId) return Response.json({ error: "lesson_id required" }, { status: 400 });

    const lesson = await base44.asServiceRole.entities.Lesson.get(lessonId).catch(() => null);
    if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });
    let cached: any = null;
    try {
      cached = JSON.parse(lesson.notes_blanks_json || "null");
    } catch {}

    const record = await findOwnRecord(base44, "NotesResponse", { lesson_id: lessonId }, user.id);
    if (record?.status === "submitted")
      return Response.json({ error: "already_submitted" }, { status: 409 });

    // Keep only string answers (capped like the input maxlength allows).
    const blanks: Record<string, string> = {};
    const raw = body?.blanks && typeof body.blanks === "object" ? body.blanks : {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") blanks[String(k).slice(0, 20)] = v.slice(0, 500);
    }

    const patch: Record<string, unknown> = {
      lesson_id: lessonId,
      title: cached?.title || `Notes - ${topicOf(lesson.title)}`,
      answers_text: JSON.stringify({ blanks }),
      status: "in_progress",
      total: NOTES_POINTS,
    };
    if (submit) {
      const ids = blankIds(cached?.html);
      const allFilled = ids.length > 0 && ids.every((id) => (blanks[id] || "").trim() !== "");
      if (!allFilled) return Response.json({ error: "incomplete" }, { status: 400 });
      patch.status = "submitted";
      patch.score = NOTES_POINTS;
      patch.submitted_at = new Date().toISOString();
    }

    const saved = await writeOwnRecord(base44, "NotesResponse", record, user.id, patch);
    return Response.json({ record: saved });
  } catch (error) {
    return Response.json({ error: (error as any).message || String(error) }, { status: 500 });
  }
}
