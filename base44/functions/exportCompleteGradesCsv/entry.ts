import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ── Lesson title parsing (mirrors src/lib/lessonPhases.js) ──
function parseLesson(l) {
  const overview = l.title.match(/^Phase\s*(\d+)\s*[—–-]\s*(.+)$/);
  if (overview) return { phase: Number(overview[1]), isOverview: true };
  const lesson = l.title.match(
    /^Phase\s*(\d+)\s*·\s*Lesson\s*(\d+)\s*[—–-]\s*(.+)$/
  );
  if (lesson)
    return { phase: Number(lesson[1]), isOverview: false, num: Number(lesson[2]) };
  return null;
}

// ── Pacing due-date matching (mirrors src/lib/pacing.js suggestedDueForLessons) ──
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
  return String(focus).split(/\s+[–—-]\s+/)[0].trim().toLowerCase();
}
const norm = (s) => String(s || "").toLowerCase().trim();
function nameOf(title) {
  const parts = String(title || "").split(/\s+[–—-]\s+/);
  return parts.length > 1 ? norm(parts.slice(1).join(" — ")) : "";
}
// Returns Map: lessonId -> { date } | null
function suggestedDueForLessons(lessons, pacingDays) {
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
    const name = nameOf(l.title);
    if (name) {
      const topicMatch = (r) => {
        const t = r.topic;
        const f = norm(r.focus);
        return (t && (t.includes(name) || name.includes(t))) || f.includes(name);
      };
      // Prefer in-phase matches before global so a recurring topic in a later
      // phase can't hijack this lesson's due date.
      let matches = rows.filter((r) => r.phase === p?.phase && topicMatch(r));
      if (!matches.length) matches = rows.filter(topicMatch);
      if (matches.length) {
        matches.sort((a, b) => (a.when || 0) - (b.when || 0));
        row = matches[matches.length - 1];
      }
    }
    if (!row && p && !p.isOverview) {
      const arr = byPhase.get(p.phase) || [];
      row = arr.find((r) => r.day === p.num) || arr[p.num - 1] || null;
    }
    if (!row && p && p.isOverview) {
      const arr = byPhase.get(p.phase) || [];
      row = arr[0] || null;
    }
    map.set(l.id, row ? { date: row.date } : null);
  });
  return map;
}

// ── Nine-weeks periods (mirrors src/lib/gradePeriods.js) ──
const NINE_WEEKS = [
  { number: 1, startDate: "2026-08-04", endDate: "2026-10-08" },
  { number: 2, startDate: "2026-10-09", endDate: "2027-01-08" },
  { number: 3, startDate: "2027-01-09", endDate: "2027-03-18" },
  { number: 4, startDate: "2027-03-19", endDate: "2027-05-28" },
];
function assignmentPeriod(dueDate, override) {
  if (override === "omitted") return "omitted";
  if (override && String(override).match(/^[1-4]$/)) return Number(override);
  if (!dueDate) return null;
  const d = String(dueDate).slice(0, 10);
  for (const nw of NINE_WEEKS) if (d >= nw.startDate && d <= nw.endDate) return nw.number;
  return null;
}
function responsePeriod(attemptedAt) {
  if (!attemptedAt) return null;
  const d = String(attemptedAt).slice(0, 10);
  for (const nw of NINE_WEEKS) if (d >= nw.startDate && d <= nw.endDate) return nw.number;
  return null;
}

// ── Gradebook gates (mirror src/pages/Grades.jsx) ──
const GRACE_PERIOD_DAYS = 7;
function graceWindowEnd(dueDate) {
  if (!dueDate) return null;
  const end = new Date(`${dueDate}T23:59:59`);
  end.setDate(end.getDate() + GRACE_PERIOD_DAYS);
  return end;
}
function startOfWeek(date, weekStartsOn = 0) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
function quizRevealed(dueDate) {
  if (!dueDate) return true;
  const ws = startOfWeek(new Date(`${dueDate}T00:00:00`), 1);
  return new Date() >= ws;
}
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const round = (n) => Math.round(Number(n) || 0);
function letterToP(grade) {
  if (grade == null || grade === "") return null;
  const g = String(grade).trim().toUpperCase();
  const map = { "A+": 98, A: 95, "A-": 92, "B+": 88, B: 85, "B-": 82, "C+": 78, C: 75, "C-": 72, "D+": 68, D: 65, "D-": 62, F: 55 };
  if (map[g] !== undefined) return map[g];
  const num = parseFloat(g);
  if (!isNaN(num)) {
    if (g.includes("/")) {
      const [a, b] = g.split("/").map((x) => parseFloat(x));
      return b ? Math.round((a / b) * 100) : a;
    }
    return num > 1 ? Math.round(num) : Math.round(num * 100);
  }
  return null;
}

function csvField(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
// Small pause between heavy service-role reads so the app API doesn't rate-limit
// a long run of back-to-back list calls.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Best-of practice selection (matches the gradebook practiceBestOf).
function practiceBestOf(a, b) {
  const ag = a?.status === "submitted";
  const bg = b?.status === "submitted";
  if (ag && !bg) return a;
  if (!ag && bg) return b;
  if (ag && bg) {
    if ((a.score ?? 0) > (b.score ?? 0)) return a;
    if ((b.score ?? 0) > (a.score ?? 0)) return b;
  }
  const ad = new Date(a?.submitted_at || a?.updated_date || 0).getTime();
  const bd = new Date(b?.submitted_at || b?.updated_date || 0).getTime();
  return ad >= bd ? a : b;
}

// A GradeOverride applied to a gradeable's percent for the overall average.
// "EX" → null (exempt/excluded); a number → that percent; a letter → converted.
// Uninterpretable values leave the base percent untouched (matches applyOverride).
function applyOverridePercent(basePercent, ovr) {
  if (!ovr) return basePercent;
  const raw = String(ovr.value ?? "").trim();
  if (raw.toUpperCase() === "EX") return null;
  if (/^\d+(\.\d+)?$/.test(raw))
    return Math.max(0, Math.min(100, Math.round(parseFloat(raw))));
  const lp = letterToP(raw);
  return lp != null ? lp : basePercent;
}
// A GradeOverride expressed as points on a column's fixed max-point scale.
// "EX" → "EX"; a number → that percent of max; a letter → converted to points.
function overrideToPoints(ovr, maxPoints) {
  if (!ovr) return undefined;
  const raw = String(ovr.value ?? "").trim();
  if (raw.toUpperCase() === "EX") return "EX";
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const p = Math.max(0, Math.min(100, Math.round(parseFloat(raw))));
    return Math.round((p / 100) * maxPoints);
  }
  const lp = letterToP(raw);
  if (lp != null) return Math.round((lp / 100) * maxPoints);
  return undefined;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    // Server-side role gate: only teachers/admins may generate this file.
    if (user.role !== "admin")
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const svc = base44.asServiceRole;
    // Fetch sequentially with a small stagger — the app API rate-limits rapid
    // back-to-back service-role reads (especially the 10k-record lists).
    const users = await svc.entities.User.list("-created_date", 10000);
    const lessons = await svc.entities.Lesson.list("order", 10000);
    await sleep(150);
    const notesResp = await svc.entities.NotesResponse.list("-created_date", 10000);
    const practiceResp = await svc.entities.PracticeResponse.list("-created_date", 10000);
    await sleep(150);
    const quizResp = await svc.entities.QuizResponse.list("-created_date", 10000);
    const cfaList = await svc.entities.CFA.list("phase_start", 1000);
    await sleep(150);
    const cfaRespList = await svc.entities.CFAResponse.list("-created_date", 10000);
    const pacing = await svc.entities.PacingDay.list("order", 10000);
    await sleep(150);
    const asg = await svc.entities.Assignment.list("-created_date", 10000);
    const subs = await svc.entities.Submission.list("-created_date", 10000);
    await sleep(150);
    const overrides = await svc.entities.GradeOverride.list("-created_date", 10000);

    // Numbered lessons only, sorted by phase then lesson number.
    const numbered = [];
    for (const l of lessons || []) {
      const p = parseLesson(l);
      if (p && !p.isOverview) numbered.push({ ...l, _phase: p.phase, _num: p.num });
    }
    numbered.sort((a, b) => a._phase - b._phase || a._num - b._num);

    // Latest submitted notes per (student, lesson).
    const notesIdx = new Map();
    for (const r of notesResp || []) {
      if (r.status !== "submitted") continue;
      const k = r.created_by_id + "|" + r.lesson_id;
      const prev = notesIdx.get(k);
      const d = r.submitted_at || r.updated_date;
      if (!prev || new Date(d) > new Date(prev.submitted_at || prev.updated_date))
        notesIdx.set(k, r);
    }
    // Best-of practice per (student, lesson) — highest graded attempt wins.
    const practiceIdx = new Map();
    for (const r of practiceResp || []) {
      const k = r.created_by_id + "|" + r.lesson_id;
      practiceIdx.set(k, practiceBestOf(practiceIdx.get(k), r));
    }
    // Latest graded quiz per (student, lesson).
    const quizIdx = new Map();
    for (const r of quizResp || []) {
      if (r.status !== "graded") continue;
      const k = r.created_by_id + "|" + r.lesson_id;
      const prev = quizIdx.get(k);
      if (!prev || new Date(r.attempted_at) > new Date(prev.attempted_at))
        quizIdx.set(k, r);
    }
    // Latest graded CFA per (student, cfa).
    const cfaIdx = new Map();
    for (const r of cfaRespList || []) {
      if (r.status !== "graded") continue;
      const k = r.created_by_id + "|" + r.cfa_id;
      const prev = cfaIdx.get(k);
      if (!prev || new Date(r.attempted_at) > new Date(prev.attempted_at)) cfaIdx.set(k, r);
    }
    // Latest submission per (student, assignment).
    const subIdx = new Map();
    for (const s of subs || [])
      subIdx.set(s.created_by_id + "|" + s.assignment_id, s);

    // Per-lesson possible-point anchors.
    const practiceGoal = new Map(); // lesson id -> point_goal (default 10)
    for (const l of numbered) {
      let max = 10;
      try { const o = JSON.parse(l.practice_json || "{}"); if (o?.point_goal) max = o.point_goal; } catch {}
      practiceGoal.set(l.id, max);
    }
    const quizCount = new Map(); // lesson id -> question count
    for (const l of numbered) {
      let total = null;
      try { const o = JSON.parse(l.quiz_json || "{}"); if (o?.questions?.length) total = o.questions.length; } catch {}
      quizCount.set(l.id, total);
    }
    const cfaQuestionCount = new Map(); // cfa id -> question count
    for (const c of cfaList || []) {
      let n = null;
      try { const o = JSON.parse(c.questions_json || "[]"); if (Array.isArray(o)) n = o.length; } catch {}
      cfaQuestionCount.set(c.id, n);
    }

    // Pacing due dates + teacher overrides.
    const dueByLesson = suggestedDueForLessons(numbered, pacing);
    const overrideMap = new Map();
    for (const o of overrides || []) overrideMap.set(o.student_id + "|" + o.column_key, o);
    const ovrFor = (sid, key) => overrideMap.get(sid + "|" + key);

    const publishedCfas = (cfaList || [])
      .filter((c) => c.published)
      .sort((a, b) => (a.phase_start || 0) - (b.phase_start || 0));

    const now = new Date();
    const pastGrace = (due) => !!due && graceWindowEnd(due) < now;
    const pastGraceAsg = (a) => !!a.due_date && graceWindowEnd(a.due_date) < now;

    // Students, sorted period-then-last-name (matches the gradebook periodSort).
    const students = (users || []).filter((u) => u.role !== "admin");
    const lastNameOf = (u) => {
      const parts = String(u?.full_name || "").trim().split(/\s+/);
      return parts.length ? parts[parts.length - 1].toLowerCase() : "";
    };
    students.sort((a, b) => {
      const pa = String(a.class_period ?? "");
      const pb = String(b.class_period ?? "");
      if (pa !== pb) {
        if (!pa) return 1;
        if (!pb) return -1;
        return pa.localeCompare(pb, undefined, { numeric: true });
      }
      const la = lastNameOf(a), lb = lastNameOf(b);
      if (la !== lb) return la.localeCompare(lb);
      return (a.full_name || "").localeCompare(b.full_name || "");
    });

    // Lessons that actually have each part built (mirrors the gradebook's
    // notesLessons / practiceLessons / quizLessons filters).
    const notesLessons = numbered.filter((l) => l.notes_blanks_json);
    const practiceLessons = numbered.filter((l) => l.practice_json);
    const quizLessons = numbered.filter((l) => l.quiz_file_url);

    // ── Per-part points on the CSV's fixed scale, mirroring the gradebook's
    //    grace / reveal / best-of / override logic.
    //    ""  = not yet due / in grace / under review (excluded, like the panel)
    //    0   = past the grace window with no submission
    //    "EX"= teacher-exempted ──────────────────────────────────────────────
    const notesValue = (s, l) => {
      const ovr = overrideToPoints(ovrFor(s.id, `notes|${l.id}`), 5);
      if (ovr !== undefined) return ovr;
      const r = notesIdx.get(s.id + "|" + l.id);
      if (r) return Math.min(5, round(r.score));
      return pastGrace(dueByLesson.get(l.id)?.date || null) ? 0 : "";
    };
    const practiceValue = (s, l) => {
      const ovr = overrideToPoints(ovrFor(s.id, `practice|${l.id}`), 10);
      if (ovr !== undefined) return ovr;
      const r = practiceIdx.get(s.id + "|" + l.id);
      const goal = practiceGoal.get(l.id) || 10;
      if (r && r.status === "submitted") {
        const capped = Math.min(r.score ?? 0, goal); // bonus stays out of the cell
        return Math.min(10, round((capped / goal) * 10));
      }
      if (r && r.status === "under_review") return ""; // not posted to gradebook yet
      const due = l.practice_due_date || dueByLesson.get(l.id)?.date || null;
      return pastGrace(due) ? 0 : "";
    };
    const quizValue = (s, l) => {
      const ovr = overrideToPoints(ovrFor(s.id, `quiz|${l.id}`), 20);
      if (ovr !== undefined) return ovr;
      const due = dueByLesson.get(l.id)?.date || null;
      if (!quizRevealed(due)) return ""; // upcoming quiz — not gradeable yet
      const r = quizIdx.get(s.id + "|" + l.id);
      if (r) {
        const tot = r.total || quizCount.get(l.id) || 0;
        return tot > 0 ? Math.min(20, round((r.score / tot) * 20)) : 0;
      }
      return pastGrace(due) ? 0 : "";
    };
    const cfaValue = (s, c) => {
      const ovr = overrideToPoints(ovrFor(s.id, `cfa|${c.id}`), 10);
      if (ovr !== undefined) return ovr;
      const r = cfaIdx.get(s.id + "|" + c.id);
      if (r) {
        const tot = cfaQuestionCount.get(c.id) || r.total || 0;
        return tot > 0 ? Math.min(10, round((r.score / tot) * 10)) : 0;
      }
      return pastGrace(c.due_date || null) ? 0 : "";
    };

    // ── Overall % per student: average of per-item percents over ALL nine weeks
    //    (mirrors the gradebook's overallFor with nineWeeks="all"). EX / in-grace
    //    / not-yet-due items are excluded; a past-grace 0 counts as 0%. Includes
    //    standalone Assignments so the number matches the panel exactly. ──
    const overallPercent = (s) => {
      const items = [];
      for (const l of quizLessons) {
        const due = dueByLesson.get(l.id)?.date || null;
        if (!quizRevealed(due)) continue;
        const r = quizIdx.get(s.id + "|" + l.id);
        let percent, period;
        if (r) { percent = pct(r.score, r.total); period = responsePeriod(r.attempted_at); }
        else if (pastGrace(due)) { percent = 0; period = due ? responsePeriod(due) : null; }
        else continue;
        percent = applyOverridePercent(percent, ovrFor(s.id, `quiz|${l.id}`));
        if (percent !== null && period != null && period !== "omitted") items.push(percent);
      }
      for (const a of asg || []) {
        if (!a.published) continue;
        const ap = assignmentPeriod(a.due_date, a.grade_period_override);
        const sub = subIdx.get(s.id + "|" + a.id);
        let percent, period;
        if (sub && sub.grade) { percent = letterToP(sub.grade); period = ap === "omitted" ? null : ap; }
        else if (pastGraceAsg(a)) { percent = 0; period = ap === "omitted" ? null : ap; }
        else continue;
        percent = applyOverridePercent(percent, ovrFor(s.id, `asg|${a.id}`));
        if (percent !== null && period != null && period !== "omitted") items.push(percent);
      }
      for (const l of notesLessons) {
        const r = notesIdx.get(s.id + "|" + l.id);
        const due = dueByLesson.get(l.id)?.date || null;
        let percent, period;
        if (r) { percent = pct(r.score, r.total); period = responsePeriod(r.submitted_at); }
        else if (pastGrace(due)) { percent = 0; period = due ? responsePeriod(due) : null; }
        else continue;
        percent = applyOverridePercent(percent, ovrFor(s.id, `notes|${l.id}`));
        if (percent !== null && period != null && period !== "omitted") items.push(percent);
      }
      for (const l of practiceLessons) {
        const r = practiceIdx.get(s.id + "|" + l.id);
        const due = l.practice_due_date || dueByLesson.get(l.id)?.date || null;
        const goal = practiceGoal.get(l.id) || 10;
        let percent, period;
        if (r && r.status === "submitted") {
          percent = Math.min(100, round((Math.min(r.score ?? 0, goal) / goal) * 100));
          period = responsePeriod(r.submitted_at);
        } else if (r && r.status === "under_review") continue;
        else if (pastGrace(due)) { percent = 0; period = due ? responsePeriod(due) : null; }
        else continue;
        percent = applyOverridePercent(percent, ovrFor(s.id, `practice|${l.id}`));
        if (percent !== null && period != null && period !== "omitted") items.push(percent);
      }
      for (const c of publishedCfas) {
        const r = cfaIdx.get(s.id + "|" + c.id);
        const due = c.due_date || null;
        let percent, period;
        if (r) { percent = pct(r.score, r.total); period = responsePeriod(r.attempted_at) || (due ? assignmentPeriod(due, null) : null); }
        else if (pastGrace(due)) { percent = 0; period = due ? assignmentPeriod(due, null) : null; }
        else continue;
        percent = applyOverridePercent(percent, ovrFor(s.id, `cfa|${c.id}`));
        if (percent !== null && period != null && period !== "omitted") items.push(percent);
      }
      if (!items.length) return "";
      return Math.round(items.reduce((a, b) => a + b, 0) / items.length);
    };

    // ── Build the flat column list: only parts that actually exist per lesson,
    //    a per-lesson total, then published CFAs, then the overall %. ──
    const columns = []; // {kind, lesson?, cfa?, max?}
    for (const l of numbered) {
      const hasN = !!l.notes_blanks_json;
      const hasP = !!l.practice_json;
      const hasQ = !!l.quiz_file_url;
      if (hasN) columns.push({ kind: "notes", lesson: l });
      if (hasP) columns.push({ kind: "practice", lesson: l });
      if (hasQ) columns.push({ kind: "quiz", lesson: l });
      if (hasN || hasP || hasQ)
        columns.push({ kind: "total", lesson: l, max: 5 * hasN + 10 * hasP + 20 * (hasQ ? 1 : 0) });
    }
    for (const c of publishedCfas) columns.push({ kind: "cfa", cfa: c });
    columns.push({ kind: "overall" });

    const headers = [
      "Student First Name",
      "Student Last Name",
      "Student ID Number",
      "Class Period",
    ];
    for (const col of columns) {
      if (col.kind === "notes")
        headers.push(`Phase ${col.lesson._phase} – Lesson ${col.lesson._num} – Notes (5 Points)`);
      else if (col.kind === "practice")
        headers.push(`Phase ${col.lesson._phase} – Lesson ${col.lesson._num} – Practice (10 Points)`);
      else if (col.kind === "quiz")
        headers.push(`Phase ${col.lesson._phase} – Lesson ${col.lesson._num} – Quiz (20 Points)`);
      else if (col.kind === "total")
        headers.push(`Phase ${col.lesson._phase} – Lesson ${col.lesson._num} – Total Points (${col.max} Points)`);
      else if (col.kind === "cfa")
        headers.push(`${col.cfa.title} – CFA (10 Points)`);
      else if (col.kind === "overall")
        headers.push("Overall %");
    }

    const numOrZero = (v) => (typeof v === "number" ? v : 0);
    const rows = [];
    for (const s of students) {
      const parts = (s.full_name || "").trim().split(/\s+/);
      const row = [parts[0] || "", parts.slice(1).join(" "), s.eschool_id || "", s.class_period || ""];
      // Cache this student's per-lesson part values so the total column can sum them.
      const lv = new Map(); // lessonId -> {n,p,q}
      for (const l of numbered) {
        lv.set(l.id, {
          n: l.notes_blanks_json ? notesValue(s, l) : "",
          p: l.practice_json ? practiceValue(s, l) : "",
          q: l.quiz_file_url ? quizValue(s, l) : "",
        });
      }
      for (const col of columns) {
        if (col.kind === "notes") row.push(lv.get(col.lesson.id).n);
        else if (col.kind === "practice") row.push(lv.get(col.lesson.id).p);
        else if (col.kind === "quiz") row.push(lv.get(col.lesson.id).q);
        else if (col.kind === "total") {
          const v = lv.get(col.lesson.id);
          row.push(numOrZero(v.n) + numOrZero(v.p) + numOrZero(v.q));
        } else if (col.kind === "cfa") row.push(cfaValue(s, col.cfa));
        else if (col.kind === "overall") row.push(overallPercent(s));
      }
      rows.push(row);
    }

    const crlf = "\r\n";
    const csv =
      "\uFEFF" +
      [headers, ...rows].map((r) => r.map(csvField).join(",")).join(crlf) +
      crlf;

    return Response.json({
      csv,
      filename: "classstream_complete_grades.csv",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}