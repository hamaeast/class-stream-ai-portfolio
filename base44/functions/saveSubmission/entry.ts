import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { findOwnRecord, writeOwnRecord } from "../../shared/studentRecords.ts";

// Security: students turn in (and re-submit) assignment work through this
// function instead of writing Submission directly. Submission had no RLS, so
// any user could write any row, including grade/feedback/status. Submission
// create/update is now admin-only; this function writes the caller's own row
// with the service role and only accepts the work itself (text + file link).
// status is always reset to "submitted" (as the UI did on every save);
// grade and feedback are never accepted from the client.
//
// Payload: { assignment_id, submission_text?, file_url? }
// Returns: { record }

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const assignmentId = body?.assignment_id;
    if (!assignmentId) return Response.json({ error: "assignment_id required" }, { status: 400 });
    const assignment = await base44.asServiceRole.entities.Assignment.get(assignmentId).catch(() => null);
    if (!assignment) return Response.json({ error: "Assignment not found" }, { status: 404 });

    const text = typeof body?.submission_text === "string" ? body.submission_text.trim() : "";
    const fileUrl = typeof body?.file_url === "string" ? body.file_url : "";
    if (!text && !fileUrl)
      return Response.json({ error: "Add text or a file before submitting" }, { status: 400 });

    const existing = await findOwnRecord(base44, "Submission", { assignment_id: assignmentId }, user.id);
    const patch: Record<string, unknown> = {
      assignment_id: assignmentId,
      submission_text: text,
      status: "submitted",
    };
    // Only touch file_url when the caller's form has one (the lesson-page
    // quick answer box never sent it, so it must not clear an uploaded file).
    if ("file_url" in (body || {})) patch.file_url = fileUrl;
    const record = await writeOwnRecord(base44, "Submission", existing, user.id, patch);
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: (error as any).message || String(error) }, { status: 500 });
  }
}
