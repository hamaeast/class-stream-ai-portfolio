import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { extractVocabTerms } from '../../shared/vocabExtract.ts';

// Teacher-only: pulls WORDS + DEFINITIONS from every lesson-plan Drive doc and
// caches them in the admin-only VocabReference entity, one record per lesson.
// This gives teachers a master vocabulary reference grouped by phase/lesson
// (the definitions are never exposed to students). No LLM, no credits.
//
// Body: { docs: [{ phase, title, fileId }, ...] }  // passed from the frontend
//        //  LESSON_PLAN_DOCS so that list stays the single source of truth.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin")
      return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const docs = Array.isArray(body?.docs) ? body.docs : [];
    if (!docs.length) return Response.json({ error: "docs required" }, { status: 400 });

    const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
    const token = conn?.accessToken;
    if (!token) return Response.json({ error: "Drive not connected" }, { status: 502 });

    // Resolve each doc to its Lesson entity (by phase + normalized title) so
    // the reference is tied to the real lesson id.
    const lessons = await base44.entities.Lesson.list();
    const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const lessonForDoc = (phase: number, title: string) => {
      const t = norm(title);
      return (lessons || []).find((l: any) => {
        const m = String(l.title || "").match(
          /^Phase\s*(\d+)\s*·\s*Lesson\s*\d+\s*[—–-]\s*(.+)$/
        );
        if (!m) return false;
        return Number(m[1]) === phase && norm(m[2]) === t;
      });
    };

    // Fetch every doc in parallel.
    const fetched = await Promise.all(
      docs.map(async (d: any) => {
        if (!d?.fileId) return { doc: d, terms: null as any[] | null };
        try {
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${d.fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!res.ok) return { doc: d, terms: null };
          const html = await res.text();
          return { doc: d, terms: extractVocabTerms(html) };
        } catch {
          return { doc: d, terms: null };
        }
      })
    );

    // Upsert one VocabReference record per lesson (keyed by lesson_id).
    const existing = await base44.entities.VocabReference.list();
    const byLesson = new Map<string, any>();
    for (const r of existing || []) byLesson.set(r.lesson_id, r);

    let built = 0;
    let skipped = 0;
    for (const { doc, terms } of fetched) {
      if (!terms) { skipped++; continue; }
      const lesson = lessonForDoc(Number(doc.phase), String(doc.title || ""));
      const lessonId = lesson?.id || "";
      if (!lessonId) { skipped++; continue; }
      const payload = {
        lesson_id: lessonId,
        phase: Number(doc.phase),
        lesson_title: lesson?.title || doc.title || "",
        terms_json: JSON.stringify(terms),
      };
      const ex = byLesson.get(lessonId);
      try {
        if (ex) {
          await base44.entities.VocabReference.update(ex.id, payload);
        } else {
          await base44.entities.VocabReference.create(payload);
        }
        built++;
      } catch {
        skipped++;
      }
    }

    return Response.json({ built, skipped, total_docs: docs.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}