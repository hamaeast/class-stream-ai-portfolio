import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { extractVocabWords } from '../../shared/vocabExtract.ts';

// Teacher-triggered bulk seed: pulls the vocabulary WORDS out of every
// lesson-plan Google Doc and adds them to a chosen student's vocabulary list,
// tagged with phase + lesson title. created_by_id is stamped to the service
// role (it can't be overridden), so ownership is anchored on student_id
// instead — the student reads these records via the data.student_id RLS rule.
// No LLM is used, so this never spends integration credits.
//
// Body: {
//   student_user_id: string,
//   docs: [{ phase, title, fileId }, ...]   // passed from the frontend
//          //  LESSON_PLAN_DOCS so that list stays the single source of truth
//   only_missing?: boolean                   // default true: skip words the
//          // student already has for that lesson
// }
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const studentId = body?.student_user_id;
    const docs = Array.isArray(body?.docs) ? body.docs : [];
    const onlyMissing = body?.only_missing !== false;
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    // Admins may seed for any student; a student may seed only their own list
    // (so the student-side auto-seed can run in step with the pacing guide).
    if (user.role !== "admin" && user.id !== studentId)
      return Response.json({ error: "Not allowed" }, { status: 403 });
    if (!studentId) return Response.json({ error: "student_user_id required" }, { status: 400 });
    if (!docs.length) return Response.json({ error: "docs required" }, { status: 400 });

    const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
    const token = conn?.accessToken;
    if (!token) return Response.json({ error: "Drive not connected" }, { status: 502 });

    // Fetch every doc in parallel so the whole seed finishes in a couple of
    // seconds instead of timing out on 100+ sequential Drive reads.
    const fetched = await Promise.all(
      docs.map(async (d: any) => {
        if (!d?.fileId) return { doc: d, words: null as string[] | null };
        try {
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${d.fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!res.ok) return { doc: d, words: null };
          const html = await res.text();
          return { doc: d, words: extractVocabWords(html) };
        } catch {
          return { doc: d, words: null };
        }
      })
    );

    // Existing words the student already has, keyed by lesson_id, to skip
    // duplicates. Reads via student_id (covers both their own + prior seeds).
    const existing = await base44.entities.VocabularyWord.filter({ student_id: studentId });
    const byLesson = new Map<string, Set<string>>();
    for (const w of existing || []) {
      const lid = w.lesson_id || "";
      if (!byLesson.has(lid)) byLesson.set(lid, new Set());
      byLesson.get(lid).add((w.word || "").toLowerCase());
    }

    // Resolve each doc to its Lesson entity (by phase + normalized title) so
    // words group under the right lesson in the student's UI.
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

    let lessonsSeeded = 0;
    let wordsAdded = 0;
    let docsSkipped = 0;

    for (const { doc, words } of fetched) {
      if (!words || !words.length) { docsSkipped++; continue; }
      const lesson = lessonForDoc(Number(doc.phase), String(doc.title || ""));
      const lessonId = lesson?.id || "";
      const have = byLesson.get(lessonId) || new Set<string>();

      const toCreate: any[] = [];
      for (const w of words) {
        const key = w.toLowerCase();
        if (onlyMissing && have.has(key)) continue;
        toCreate.push({
          word: w,
          definition: "",
          example_sentence: "",
          phase: Number(doc.phase),
          lesson_id: lessonId,
          lesson_title: lesson?.title || doc.title || "",
          source: "lesson",
          student_id: studentId,
        });
        have.add(key);
      }
      byLesson.set(lessonId, have);

      if (toCreate.length) {
        try {
          await base44.asServiceRole.entities.VocabularyWord.bulkCreate(toCreate);
          lessonsSeeded++;
          wordsAdded += toCreate.length;
        } catch {
          // a single doc failing shouldn't abort the rest
        }
      } else {
        lessonsSeeded++;
      }
    }

    return Response.json({
      student_user_id: studentId,
      lessons_seeded: lessonsSeeded,
      words_added: wordsAdded,
      docs_skipped: docsSkipped,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}