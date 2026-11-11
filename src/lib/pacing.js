import { parseLesson } from "@/lib/lessonPhases";

// Match app lessons (and their quizzes/assignments) to PacingDay rows by the
// lesson NAME — the quiz is named after its lesson, so the same lookup gives
// due dates for both. We match the lesson name against the pacing "Lesson /
// Focus" topic (the text before the dash) and use the LAST matching day as the
// due date (end of that lesson block). Phase+day is a fallback only.

function toIso(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

function phaseNum(phase) {
  if (!phase) return null;
  const m = String(phase).match(/Phase\s*(\d+)/i);
  if (m) return Number(m[1]);
  if (/orientation/i.test(String(phase))) return 0;
  return null;
}

function dayNum(d) {
  if (!d) return null;
  const m = String(d).match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function topicOf(focus) {
  if (!focus) return "";
  // text before the first " — " / " – " / " - " separator
  const t = String(focus).split(/\s+[–—-]\s+/)[0].trim().toLowerCase();
  return t;
}

const norm = (s) => String(s || "").toLowerCase().trim();

function nameOf(title) {
  // everything after the first " — " separator
  const parts = String(title || "").split(/\s+[–—-]\s+/);
  return parts.length > 1 ? norm(parts.slice(1).join(" — ")) : "";
}

// Returns a Map: lessonId -> { date, focus, phase, day } | null
export function suggestedDueForLessons(lessons, pacingDays) {
  const rows = (pacingDays || [])
    .map((r) => ({
      phase: phaseNum(r.phase),
      day: dayNum(r.day_in_phase),
      date: toIso(r.date),
      focus: r.lesson_focus || "",
      topic: topicOf(r.lesson_focus),
      when: r.date ? new Date(r.date) : null,
    }))
    .filter((r) => r.date);

  const byPhase = new Map();
  rows.forEach((r) => {
    if (r.phase != null) {
      if (!byPhase.has(r.phase)) byPhase.set(r.phase, []);
      byPhase.get(r.phase).push(r);
    }
  });
  byPhase.forEach((arr) => arr.sort((a, b) => a.day - b.day));

  const map = new Map();
  (lessons || []).forEach((l) => {
    const p = parseLesson(l);
    let row = null;

    // 1) Name-based match against the pacing topic/focus.
    const name = nameOf(l.title);
    if (name) {
      const topicMatch = (r) => {
        const t = r.topic;
        const f = norm(r.focus);
        return (t && (t.includes(name) || name.includes(t))) || f.includes(name);
      };
      // Prefer matches inside the lesson's OWN phase first, falling back to a
      // global match only when nothing in-phase matches. Without this, a topic
      // that recurs in a later phase hijacks the due date — e.g. Phase 1
      // "Binary" matches a Phase 6 "Binary Search" row and jumps the due date
      // (and thus the gradebook column) weeks into the future, hiding the quiz
      // and every graded response on it.
      let matches = rows.filter((r) => r.phase === p?.phase && topicMatch(r));
      if (!matches.length) matches = rows.filter(topicMatch);
      if (matches.length) {
        matches.sort((a, b) => (a.when || 0) - (b.when || 0));
        row = matches[matches.length - 1]; // due = last day of the block
      }
    }

    // 2) Fallback to phase + lesson day.
    if (!row && p && !p.isOverview) {
      const arr = byPhase.get(p.phase) || [];
      row = arr.find((r) => r.day === p.num) || arr[p.num - 1] || null;
    }
    if (!row && p && p.isOverview) {
      const arr = byPhase.get(p.phase) || [];
      row = arr[0] || null;
    }

    map.set(
      l.id,
      row ? { date: row.date, focus: row.focus, phase: row.phase, day: row.day } : null
    );
  });
  return map;
}

// After a pacing refresh, re-sequence every already-scheduled FUTURE assignment
// to its lesson's new suggested date. Drafts with no due date and past-due
// assignments are left untouched. Returns [{id, due_date}] for changes only.
export function resequenceFutureAssignments(assignments, lessons, pacingDays) {
  const due = suggestedDueForLessons(lessons, pacingDays);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isFuture = (d) => !!d && new Date(d + "T00:00:00") >= today;
  const out = [];
  (assignments || []).forEach((a) => {
    if (!a.lesson_id) return;
    if (!isFuture(a.due_date)) return;
    const s = due.get(a.lesson_id);
    if (!s || !s.date || a.due_date === s.date) return;
    out.push({ id: a.id, due_date: s.date });
  });
  return out;
}