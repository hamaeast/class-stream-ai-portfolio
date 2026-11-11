// Shared practice-worksheet parser used by buildLessonPractice (single) and
// buildAllPractices (bulk). Pure helpers + a Drive/Docs HTML fetcher and a
// payload builder so the two functions stay in sync.

export const topicOf = (title) =>
  (String(title || "").split("—")[1] || title || "").trim();

// Google Docs export tweaks: it rounds characters and accents to named
// HTML entities ("PRACTICE &middot; 1 PT 1.", "Pr&mdash;", curly quotes).
export function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&#39;/g, "'")
    .replace(/"/g, '"')
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&/g, "&");
}

// Convert exported doc HTML into clean text lines so the marker regex can split it.
export function htmlToLines(html) {
  let h = String(html || "");
  h = h.replace(/<head[\s\S]*?<\/head>/gi, " ");
  h = h.replace(/<style[\s\S]*?<\/style>/gi, " ");
  h = h.replace(/<script[\s\S]*?<\/script>/gi, " ");
  h = h.replace(/<(p|br|div|li|h[1-6]|td|tr|hr)[^>]*>/gi, "\n");
  h = h.replace(/<\/(p|div|li|h[1-6]|td|tr)>/gi, "\n");
  h = h.replace(/<[^>]+>/g, " ");
  h = decodeEntities(h);
  return h.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
}

export const HEADER_RE =
  /^\s*(PRACTICE|APPLY|CHALLENGE)\s*[·•]\s*(\d+)\s*(PT|PTS)\s+(\d+)\s*\.?\s*$/i;
export const SECTION_RE =
  /^\s*(PRACTICE|APPLY|CHALLENGE)\s*[·•]\s*\d+\s*points?\s*each\s*$/i;
export const GOAL_RE = /point\s*goal[:\s-]*?(\d+)\s*points?/i;

// Split a practice/answer-key doc into tiered questions. Question headers look
// like "PRACTICE · 1 PT 1." / "APPLY · 3 PTS 4.". For the key doc, lines after
// an "Answer:" line collect into model_answer.
export function parseDoc(html, isKey) {
  const lines = htmlToLines(html);
  const questions = [];
  let cur = null;
  let pointGoal = 10;
  let title = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const tg = line.match(GOAL_RE);
    if (tg) { pointGoal = Number(tg[1]) || 10; continue; }
    if (!title) {
      const tm = line.match(/^Practice\s*[-—]\s*(.+)$/i);
      if (tm) { title = tm[1].trim(); continue; }
    }
    if (SECTION_RE.test(line)) continue; // tier section banner ("Practice · 1 point each")
    const h = line.match(HEADER_RE);
    if (h) {
      if (cur) questions.push(cur);
      cur = {
        id: `${h[1].toLowerCase()}${h[4]}`,
        tier: h[1].toLowerCase(),
        points: Number(h[2]),
        num: Number(h[4]),
        label: line,
        _p: [],
        _a: [],
        _answer: false,
      };
      continue;
    }
    if (!cur) continue;
    if (isKey) {
      if (/^answer\s*[:]/i.test(line)) {
        cur._answer = true;
        cur._a.push(line.replace(/^answer\s*[:]/i, "").trim());
      } else if (cur._answer) {
        cur._a.push(line);
      } else {
        cur._p.push(line);
      }
    } else {
      cur._p.push(line);
    }
  }
  if (cur) questions.push(cur);
  questions.forEach((q) => {
    q.prompt = (q._p || []).join(" ").replace(/\s+/g, " ").trim();
    q.model_answer = (q._a || []).join(" ").replace(/\s+/g, " ").trim();
    delete q._p;
    delete q._a;
    delete q._answer;
  });
  return { title, pointGoal, questions };
}

// Accept either a raw file id or a Google Drive / Docs URL.
export function docIdFromUrl(url) {
  if (!url) return null;
  const s = String(url).trim();
  const m =
    s.match(/document\/d\/([a-zA-Z0-9_-]{20,})/) ||
    s.match(/file\/d\/([a-zA-Z0-9_-]{20,})/) ||
    s.match(/[-/]d\/([a-zA-Z0-9_-]{20,})/) ||
    s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
    s.match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

// Fetch a Google Doc as HTML: first the public "anyone with the link" export,
// then the authenticated Drive export (for docs shared with the connected
// account). accessToken may be null to only try the public path.
export async function fetchHtmlForDocId(accessToken, docId) {
  if (!docId) return null;
  try {
    const pub = await fetch(
      `https://docs.google.com/document/d/${docId}/export?format=html`
    );
    if (pub.ok) {
      const html = await pub.text();
      if (/<html/i.test(html)) return html;
    }
  } catch {}
  if (accessToken) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/html`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (r.ok) return await r.text();
    } catch {}
  }
  return null;
}

// Build the student-facing payload + server-only key items from two parsed
// docs (the practice and its answer key). Questions come from the student
// doc; model_answer is pulled from the key by matching question ids.
export function buildPayloads(prac, key, lesson) {
  const keyMap = new Map();
  (key.questions || []).forEach((q) => keyMap.set(q.id, q));
  const studentQuestions = prac.questions.map((q) => ({
    id: q.id,
    tier: q.tier,
    points: q.points,
    label: q.label,
    prompt: q.prompt,
  }));
  const keyItems = prac.questions.map((q) => {
    const k = keyMap.get(q.id) || {};
    return {
      id: q.id,
      tier: q.tier,
      points: q.points,
      prompt: q.prompt,
      model_answer: k.model_answer || "",
    };
  });
  const practicePayload = {
    title: prac.title || `Practice — ${topicOf(lesson.title)}`,
    point_goal: prac.pointGoal || 10,
    questions: studentQuestions,
  };
  return { practicePayload, keyItems };
}

// Normalize a topic/file-name fragment for fuzzy matching between Drive file
// names ("practice-What is Computer Science", "practice (KEY) - What is Computer
// Science") and lesson titles ("Phase 1 · Lesson 1 — What is Computer Science").
export const normTopic = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const isKeyName = (name) => /key/i.test(String(name || ""));

// Strip "practice" / "(key)" from a Drive file name to recover its topic.
export function practiceTopicOfName(name) {
  let n = String(name || "").toLowerCase();
  n = n.replace(/practice/g, " ").replace(/\(key\)/g, " ").replace(/\bkey\b/gi, " ");
  return normTopic(n);
}