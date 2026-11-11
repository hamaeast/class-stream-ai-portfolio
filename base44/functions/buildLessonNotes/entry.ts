import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import mammoth from "npm:mammoth@1.8.0";

// The topic portion of a lesson title: text after the em dash, else the whole
// title. "Phase 1 · Lesson 1 — What is Computer Science" -> "What is Computer Science".
const topicOf = (title) =>
  (String(title || "").split("—")[1] || title || "").trim();

const escQuotes = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// Accept either a raw file id or a Google Drive / Docs URL the admin pasted
// when the same-name search fails (file stored elsewhere or named differently).
function parseDriveFileId(url) {
  if (!url) return null;
  const s = String(url).trim();
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  const m =
    s.match(/\/d\/([A-Za-z0-9_-]{20,})/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

// Native Google Docs need the export endpoint (not alt=media) to get docx;
// uploaded .docx files download directly with alt=media.
async function fileDownloadUrl(token, fileId) {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).catch(() => null);
  const meta = r ? await r.json().catch(() => ({})) : {};
  if (meta.mimeType === "application/vnd.google-apps.document") {
    return `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )}`;
  }
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
}

async function findNotesFile(token, topic) {
  const name = `Notes - ${topic}.docx`;
  const q = `name = '${escQuotes(name)}' and trashed = false`;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await r.json();
  return { found: j.files && j.files[0], searchedName: name, err: j.error };
}

// Suggest Drive files whose names look like the lesson's notes doc when the
// exact "Notes - <topic>.docx" search misses — keyed off the topic's longest
// distinctive word. Ranks files whose name starts with "Notes - " first.
async function suggestNotesFiles(token, topic) {
  const stop = new Set([
    "the", "a", "an", "is", "of", "to", "in", "and", "this", "that", "it",
    "for", "on", "your", "what", "why", "how", "be", "you", "do", "with",
    "by", "at", "or", "as", "not", "can", "wouldnt",
  ]);
  const words = String(topic || "")
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length >= 3 && !stop.has(w.toLowerCase()));
  words.sort((a, b) => b.length - a.length);
  const best = words[0];
  if (!best) return [];
  const q = `name contains 'Notes' and name contains '${escQuotes(best)}' and trashed = false`;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=12`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await r.json().catch(() => ({}));
  if (!j.files) return [];
  const topicWords = String(topic).toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const ranked = j.files
    .map((f) => {
      const fl = f.name.toLowerCase();
      const score =
        (/^notes\s*-/i.test(f.name) ? 100 : 0) +
        topicWords.filter((w) => fl.includes(w)).length;
      return { name: f.name, url: `https://drive.google.com/file/d/${f.id}/view`, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, 6).map(({ name, url }) => ({ name, url }));
}

// Replace every run of 4+ underscores (the natural fill-in marks in these notes
// docs) with an inline <input> tagged with its blank index, so the page keeps
// the original wording and presents a box exactly where students fill in.
function blanksToInputs(html) {
  let count = 0;
  const withInputs = html.replace(/_{4,}/g, () => {
    const i = count;
    count += 1;
    return `<input type="text" data-blank="${i}" class="nb-blank" size="18" maxlength="80" autocomplete="off" />`;
  });
  return { html: withInputs, blankCount: count };
}

// Remove the "Name: ___ Date: ___" header pulled from the notes doc — it isn't
// a real fill-in and shouldn't block a student's submission.
function stripNameDate(html) {
  return String(html || "").replace(/<p>([\s\S]*?)<\/p>/gi, (m, inner) =>
    /Name:/i.test(inner) && /Date:/i.test(inner) && /<input/i.test(inner) ? "" : m
  );
}

// The notes docs end with a "Quick Check" section whose prompts are plain
// paragraphs (no underscores), so they never became blanks. Walk every
// <p> after that section and turn each numbered prompt / question into a
// required answer box so submission blocks until they're filled in.
// Idempotent: paragraphs that already contain an <input> are skipped.
function addQuickCheckInputs(html) {
  const h = String(html || "");
  const marker = h.search(/quick[\s_-]?check/i);
  if (marker < 0) return h;
  const before = h.slice(0, marker);
  let n = 0;
  const after = h.slice(marker).replace(/<p>([\s\S]*?)<\/p>/gi, (m, inner) => {
    if (/<input/i.test(inner)) return m;
    const text = inner.replace(/<[^>]*>/g, "").trim();
    if (!text) return m;
    const numbered = /^\s*\d+[.)]/.test(text);
    const question = /[?？]\s*$/.test(text);
    if (!(numbered || question)) return m;
    n += 1;
    return `<p>${inner} <input type="text" data-blank="qc${n}" class="nb-blank" size="22" maxlength="120" autocomplete="off" /></p>`;
  });
  return before + after;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    if (!lessonId)
      return Response.json({ error: "lesson_id required" }, { status: 400 });

    const lesson = await base44.asServiceRole.entities.Lesson
      .get(lessonId)
      .catch(() => null);
    if (!lesson)
      return Response.json({ error: "Lesson not found" }, { status: 404 });

    const topic = topicOf(lesson.title);
    if (!topic)
      return Response.json(
        { error: "Could not determine topic from lesson title" },
        { status: 400 }
      );

    const title = `Notes - ${topic}`;

    const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
    const token = conn?.accessToken;
    if (!token)
      return Response.json({ error: "Drive not connected" }, { status: 502 });

    // Admin "suggest a matching link" action: list Drive files that look like
    // this lesson's notes doc, without building anything.
    if (body?.suggest)
      return Response.json({ topic, candidates: await suggestNotesFiles(token, topic) });

    // Serve from cache when already generated for this lesson, unless the
    // caller forces a fresh rebuild (admin "Update notes" action).
    if (lesson.notes_blanks_json && !body?.force) {
      try {
        const cached = JSON.parse(lesson.notes_blanks_json);
        if (cached && cached.html) return Response.json({ ...cached, cached: true });
      } catch {}
    }

    // Prefer the Drive link previously linked to this lesson (so "update notes"
    // re-pulls the exact same doc even if it was renamed); fall back to the
    // same-name search, and on a miss return Drive suggestions to pick from.
    const manualId =
      parseDriveFileId(body?.notes_file_url) ||
      parseDriveFileId(lesson.notes_file_url);
    let fileId;
    if (manualId) {
      fileId = manualId;
    } else {
      const { found, searchedName, err } = await findNotesFile(token, topic);
      if (err) return Response.json({ error: err.message || err }, { status: 502 });
      if (!found) {
        const candidates = await suggestNotesFiles(token, topic);
        return Response.json(
          { error: `Notes file not found`, searchedName, topic, candidates },
          { status: 404 }
        );
      }
      fileId = found.id;
    }

    const dl = await fetch(await fileDownloadUrl(token, fileId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!dl.ok)
      return Response.json({ error: `Download failed: ${dl.status}` }, { status: 502 });
    const ab = await dl.arrayBuffer();
    const u8 = new Uint8Array(ab);

    let rawHtml = "";
    try {
      const c = await mammoth.convertToHtml({ arrayBuffer: ab });
      rawHtml = c.value || "";
    } catch {
      const c = await mammoth.convertToHtml({ buffer: u8 });
      rawHtml = c.value || "";
    }

    const { html, blankCount } = blanksToInputs(rawHtml);
    const payload = { title, html: addQuickCheckInputs(stripNameDate(html)), blankCount };

    await base44.asServiceRole.entities.Lesson.update(lessonId, {
      notes_blanks_json: JSON.stringify(payload),
      notes_file_url: `https://drive.google.com/file/d/${fileId}/view`,
      // Clear any cached teacher answer key so it regenerates against the new
      // blank structure on the next teacher open.
      notes_answer_key: "",
    });

    return Response.json({ ...payload, cached: false });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});