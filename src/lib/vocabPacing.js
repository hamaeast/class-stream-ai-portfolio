import { parseLesson } from "@/lib/lessonPhases";

// Vocabulary ↔ pacing alignment helpers. Students should only see (and be
// auto-seeded with) the words for lessons the class has reached so far,
// per the pacing guide — e.g. "up to Phase 2 Lesson 1" early in the year.

const norm = (s) => String(s || "").toLowerCase().trim();
// Punctuation/whitespace-stripping key for matching lesson names to doc titles.
const keyNorm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function topicOf(focus) {
  if (!focus) return "";
  // text before the first " — " / " – " / " - " separator
  return String(focus).split(/\s+[–—-]\s+/)[0].trim().toLowerCase();
}
function nameOf(title) {
  // lesson title text after the first " — " separator
  const parts = String(title || "").split(/\s+[–—-]\s+/);
  return parts.length > 1 ? norm(parts.slice(1).join(" — ")) : "";
}
function phaseNum(phase) {
  const m = String(phase || "").match(/Phase\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}
function dayNum(d) {
  if (!d) return null;
  const m = String(d).match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
function toIso(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Set of lesson ids whose pacing block has STARTED (first matched pacing day <=
// today). Includes the in-progress lesson and all past lessons; excludes
// future ones. Overviews are skipped (they carry no vocab-list). Matches each
// lesson to its pacing rows by name, the same way pacing.js does for due dates.
export function reachedLessonIds(lessons, pacingDays, today) {
  const t = today || todayISO();
  const rows = (pacingDays || [])
    .map((r) => ({
      date: toIso(r.date),
      topic: topicOf(r.lesson_focus),
      focus: norm(r.lesson_focus),
      phase: phaseNum(r.phase),
      day: dayNum(r.day_in_phase),
    }))
    .filter((r) => r.date && r.phase != null);

  // Per-phase pacing rows sorted by day, for the phase+day fallback.
  const byPhase = new Map();
  rows.forEach((r) => {
    if (!byPhase.has(r.phase)) byPhase.set(r.phase, []);
    byPhase.get(r.phase).push(r);
  });
  byPhase.forEach((arr) =>
    arr.sort((a, b) => (a.day == null ? 99 : a.day) - (b.day == null ? 99 : b.day))
  );

  const out = new Set();
  for (const l of lessons || []) {
    const p = parseLesson(l);
    if (!p || p.isOverview) continue;
    const name = nameOf(l.title);

    // 1) Match the lesson name to a pacing topic/focus (preferred — gives real
    //    first-day dates even when lessons span multiple pacing days).
    let firstDay = null;
    if (name) {
      const matches = rows.filter(
        (r) =>
          (r.topic && (r.topic.includes(name) || name.includes(r.topic))) ||
          r.focus.includes(name)
      );
      if (matches.length)
        firstDay = matches.reduce((min, r) => (!min || r.date < min ? r.date : min), null);
    }

    // 2) Fallback to phase + lesson day (e.g. Phase 2 Lesson 1 → day 1 of the
    //    phase) for lessons whose pacing title doesn't echo the lesson name.
    if (!firstDay) {
      const arr = byPhase.get(p.phase) || [];
      const row = arr.find((r) => r.day === p.num) || arr[p.num - 1] || null;
      if (row) firstDay = row.date;
    }

    if (firstDay && firstDay <= t) out.add(l.id);
  }
  return out;
}

// Build the seedable doc list ({ phase, title, fileId }) for only the reached
// lessons, picked from LESSON_PLAN_DOCS by phase + normalized lesson name.
export function reachedDocList(lessons, pacingDays, docs, today) {
  const ids = reachedLessonIds(lessons, pacingDays, today);
  const byKey = new Map();
  for (const d of docs || []) byKey.set(`${d.phase}|${keyNorm(d.title)}`, d);
  const out = [];
  for (const l of lessons || []) {
    if (!ids.has(l.id)) continue;
    const p = parseLesson(l);
    if (!p || p.isOverview) continue;
    const d = byKey.get(`${p.phase}|${keyNorm(p.name)}`);
    if (d) out.push({ phase: d.phase, title: d.title, fileId: d.fileId });
  }
  return out;
}