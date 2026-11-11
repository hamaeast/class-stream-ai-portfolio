import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  topicOf,
  parseDoc,
  docIdFromUrl,
  fetchHtmlForDocId,
  buildPayloads,
} from "../../shared/practiceParser.ts";

// Builds ONE lesson's "practice" worksheet + answer key from two Google Docs
// the admin pastes (practice doc + "practice (KEY)" doc). Used by the per-lesson
// "Rebuild" button. Bulk auto-connecting lives in buildAllPractices.
//
// Payload: { lesson_id, practice_file_url?, key_file_url? }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    if (!lessonId)
      return Response.json({ error: "lesson_id required" }, { status: 400 });

    const lesson = await base44.asServiceRole.entities.Lesson
      .get(lessonId)
      .catch(() => null);
    if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });

    const practiceUrl = body?.practice_file_url || lesson.practice_file_url;
    const keyUrl = body?.key_file_url || lesson.practice_key_file_url;
    const practiceId = docIdFromUrl(practiceUrl);
    const keyId = docIdFromUrl(keyUrl);
    if (!practiceId)
      return Response.json({ error: "Paste the practice doc URL first." }, { status: 400 });
    if (!keyId)
      return Response.json({ error: "Paste the answer-key doc URL first." }, { status: 400 });

    let token = null;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
      token = conn?.accessToken || null;
    } catch {}

    const [pracHtml, keyHtml] = await Promise.all([
      fetchHtmlForDocId(token, practiceId),
      fetchHtmlForDocId(token, keyId),
    ]);
    if (!pracHtml)
      return Response.json(
        { error: "Could not download the practice doc (share it 'anyone with the link')." },
        { status: 502 }
      );
    if (!keyHtml)
      return Response.json({ error: "Could not download the answer-key doc." }, { status: 502 });

    const prac = parseDoc(pracHtml, false);
    const key = parseDoc(keyHtml, true);
    if (!prac.questions.length)
      return Response.json({ error: "No questions found in the practice doc." }, { status: 422 });

    const { practicePayload, keyItems } = buildPayloads(prac, key, lesson);

    await base44.asServiceRole.entities.Lesson.update(lessonId, {
      practice_json: JSON.stringify(practicePayload),
      practice_file_url: `https://docs.google.com/document/d/${practiceId}/edit`,
      practice_key_file_url: `https://docs.google.com/document/d/${keyId}/edit`,
    });

    const existing = await base44.asServiceRole.entities.PracticeAnswerKey.filter({
      lesson_id: lessonId,
    });
    const keyPayload = {
      lesson_id: lessonId,
      keys_text: JSON.stringify(keyItems),
    };
    if (existing && existing.length)
      await base44.asServiceRole.entities.PracticeAnswerKey.update(existing[0].id, keyPayload);
    else
      await base44.asServiceRole.entities.PracticeAnswerKey.create(keyPayload);

    return Response.json({
      practice: practicePayload,
      key_questions: keyItems.length,
      cached: false,
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}