import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// Generates a teacher-only answer key for a lesson's guided notes by sending
// the notes worksheet's blanks (with surrounding context) to the LLM. There is
// no human-written answer key for notes, so the LLM fills each blank from the
// sentence + lesson content. The result is cached on Lesson.notes_answer_key
// so reopens are instant, and cleared whenever notes are rebuilt (see
// buildLessonNotes). Admin-only — a 403 keeps students from invoking it, and
// the frontend only renders the key for admins viewing directly (not previewing
// a student).
//
// Payload: { lesson_id }
// Returns: { blanks: { "0": "answer", "qc1": "answer" }, cached: bool }

const topicOf = (title) =>
  (String(title || "").split("—")[1] || title || "").trim();

const stripTags = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// Pull every <input data-blank="X"> with the text immediately around it so the
// LLM knows what word/phrase belongs in each gap.
function extractBlanks(html) {
  const out = [];
  const re = /<input[^>]*data-blank="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const start = m.index;
    const beforeRaw = html.slice(Math.max(0, start - 500), start);
    const afterRaw = html.slice(
      start + m[0].length,
      start + m[0].length + 350
    );
    out.push({
      id,
      before: stripTags(beforeRaw).slice(-220),
      after: stripTags(afterRaw).slice(0, 180),
    });
  }
  return out;
}

const tryParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    if (!lessonId)
      return Response.json({ error: "lesson_id required" }, { status: 400 });

    const lesson = await base44.asServiceRole.entities.Lesson
      .get(lessonId)
      .catch(() => null);
    if (!lesson)
      return Response.json({ error: "Lesson not found" }, { status: 404 });

    // Serve the cached key when present (instant reopens).
    if (lesson.notes_answer_key) {
      const cached = tryParse(lesson.notes_answer_key);
      if (cached && cached.blanks)
        return Response.json({ blanks: cached.blanks, cached: true });
    }

    // Need the notes worksheet to know the blanks. It's usually already cached;
    // build it on the fly if not.
    let notes = tryParse(lesson.notes_blanks_json);
    if (!notes || !notes.html) {
      const built = await base44.functions.invoke("buildLessonNotes", {
        lesson_id: lessonId,
      });
      const d = built?.data || built;
      if (d && d.html) notes = { html: d.html };
    }
    if (!notes || !notes.html)
      return Response.json({ error: "Notes not built yet" }, { status: 400 });

    const blanks = extractBlanks(notes.html);
    if (!blanks.length)
      return Response.json({ error: "No fill-in blanks found" }, { status: 400 });

    const topic = topicOf(lesson.title);
    const ctx = [lesson.description, lesson.content].filter(Boolean).join("\n\n");

    const prompt =
      "You are filling in a teacher answer key for a middle-school computer science guided-notes worksheet. " +
      "For EACH blank listed below, write the concise correct answer that belongs in that blank, based on the surrounding sentence and the lesson context. " +
      "Answers must be SHORT (1 to 6 words), factually correct, and fit grammatically into the blank's sentence. " +
      "Use the 'before' and 'after' text to infer exactly what word/phrase is missing. " +
      'Return ONLY JSON shaped as: { "results": [{ "id": "0", "answer": "the answer" }] } — one entry per blank, using the exact id. ' +
      "If a blank is ambiguous, give your best single guess.\n\n" +
      `Lesson topic: ${topic}\n` +
      (ctx ? `Lesson context:\n${ctx.slice(0, 3000)}\n\n` : "") +
      `Blanks to fill (id, text_before, text_after):\n${JSON.stringify(blanks)}`;

    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                answer: { type: "string" },
              },
              required: ["id", "answer"],
            },
          },
        },
        required: ["results"],
      },
    });

    const data = typeof res === "string" ? tryParse(res) || {} : res;
    const arr = (data && data.results) || [];
    const clean = {};
    arr.forEach((r) => {
      if (r && r.id) clean[String(r.id)] = String(r.answer || "").trim();
    });

    await base44.asServiceRole.entities.Lesson.update(lessonId, {
      notes_answer_key: JSON.stringify({ blanks: clean }),
    });

    return Response.json({ blanks: clean, cached: false });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}