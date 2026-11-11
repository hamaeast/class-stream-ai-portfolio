import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  topicOf,
  parseDoc,
  fetchHtmlForDocId,
  buildPayloads,
  normTopic,
  isKeyName,
  practiceTopicOfName,
} from "../../shared/practiceParser.ts";

// Auto-connects every lesson's practice in one pass: scans the connected
// Google Drive for docs whose names contain "practice", matches them to
// lessons by the topic portion of their titles (the practice doc is named
// "practice-<topic>", the key "practice (KEY) - <topic>"), then fetches +
// parses each pair and caches practice_json + the server-only PracticeAnswerKey.
//
// Idempotent: lessons already built are skipped unless force=true, so a
// timeout mid-run is harmless — re-run to continue.
// Payload: { force? }

async function listPracticeFiles(token) {
  const out = [];
  let pageToken = null;
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", "name contains 'practice' and trashed = false");
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType)");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    (j.files || []).forEach((f) => out.push(f));
    pageToken = j.nextPageToken || null;
  } while (pageToken);
  return out;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const force = !!body?.force;

    const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
    const token = conn?.accessToken;
    if (!token)
      return Response.json({ error: "Drive not connected" }, { status: 502 });

    const allLessons = await base44.asServiceRole.entities.Lesson.list("order", 500);
    // Only real "Phase X · Lesson N — Topic" lessons get practices — overview
    // lessons ("Phase X — Topic") and intro lessons (Course Overview, Chapter
    // intros, etc.) intentionally have none and shouldn't show as failures.
    const REAL_LESSON_RE = /^Phase\s*\d+\s*·\s*Lesson\s*\d+\s*[—–-]\s*.+$/;
    const lessons = (allLessons || []).filter((l) =>
      REAL_LESSON_RE.test(String(l.title || ""))
    );

    const files = await listPracticeFiles(token);
    const fileTopic = (f) => practiceTopicOfName(f.name);

    const built = [];
    const failed = [];
    let skipped = 0;

    for (const lesson of lessons) {
      if (!force && lesson.practice_json) {
        skipped += 1;
        continue;
      }
      const lt = normTopic(topicOf(lesson.title));
      if (!lt) continue;

      let pracFile = null;
      let keyFile = null;
      for (const f of files) {
        const ft = fileTopic(f);
        if (!ft) continue;
        const match = ft === lt || ft.includes(lt) || lt.includes(ft);
        if (!match) continue;
        if (isKeyName(f.name)) {
          if (!keyFile) keyFile = f;
        } else {
          if (!pracFile) pracFile = f;
        }
      }
      if (!pracFile) {
        failed.push({ id: lesson.id, title: lesson.title, reason: "no practice doc found" });
        continue;
      }

      const [ph, kh] = await Promise.all([
        fetchHtmlForDocId(token, pracFile.id),
        keyFile ? fetchHtmlForDocId(token, keyFile.id) : Promise.resolve(null),
      ]);
      if (!ph) {
        failed.push({ id: lesson.id, title: lesson.title, reason: "export failed" });
        continue;
      }

      const prac = parseDoc(ph, false);
      const key = kh ? parseDoc(kh, true) : { questions: [] };
      if (!prac.questions.length) {
        failed.push({ id: lesson.id, title: lesson.title, reason: "no questions parsed" });
        continue;
      }

      const { practicePayload, keyItems } = buildPayloads(prac, key, lesson);

      await base44.asServiceRole.entities.Lesson.update(lesson.id, {
        practice_json: JSON.stringify(practicePayload),
        practice_file_url: `https://docs.google.com/document/d/${pracFile.id}/edit`,
        practice_key_file_url: keyFile
          ? `https://docs.google.com/document/d/${keyFile.id}/edit`
          : lesson.practice_key_file_url || "",
      });

      const existing = await base44.asServiceRole.entities.PracticeAnswerKey.filter({
        lesson_id: lesson.id,
      });
      const keyPayload = { lesson_id: lesson.id, keys_text: JSON.stringify(keyItems) };
      if (existing && existing.length)
        await base44.asServiceRole.entities.PracticeAnswerKey.update(existing[0].id, keyPayload);
      else
        await base44.asServiceRole.entities.PracticeAnswerKey.create(keyPayload);

      built.push({ id: lesson.id, title: lesson.title, hadKey: !!keyFile });
    }

    return Response.json({
      built: built.length,
      skipped,
      failed: failed.length,
      failedDetails: failed.slice(0, 20),
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}