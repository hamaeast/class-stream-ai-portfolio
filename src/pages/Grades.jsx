import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ownedBy, ownerOf } from "@/lib/ownership";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Download,
  GraduationCap,
  Printer,
  CalendarClock,
} from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import { usePreview } from "@/lib/PreviewContext";
import StudentPrintReport from "@/components/StudentPrintReport";
import OverallGradeCard from "@/components/OverallGradeCard";
import NineWeeksAssignmentManager from "@/components/NineWeeksAssignmentManager";
import StudentGradesDialog from "@/components/StudentGradesDialog";
import AssignmentSubmissionsDialog from "@/components/AssignmentSubmissionsDialog";
import TacExport from "@/components/TacExport";
import {
  NINE_WEEKS_OPTIONS,
  assignmentPeriod,
  responsePeriod,
  periodName,
  currentNineWeeks,
} from "@/lib/gradePeriods";
import { suggestedDueForLessons } from "@/lib/pacing";
import { parseLesson } from "@/lib/lessonPhases";
import { startOfWeek } from "date-fns";

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const fmt = (d) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
const lessonName = (l) => (l.title?.split("—")[1] || l.title || "").trim();
const letterToP = (grade) => {
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
};

// Apply a teacher GradeOverride to a gradeable item. "EX" exempts the item
// (excluded from the overall average); a number is treated as a percent; a
// letter grade is converted via letterToP. Returns the item unchanged when the
// override value can't be interpreted.
const applyOverride = (item, override) => {
  if (!override) return item;
  const raw = String(override.value ?? "").trim();
  const up = raw.toUpperCase();
  if (up === "EX") {
    return { ...item, value: "EX", percent: null, status: "exempt", exempt: true, overridden: true };
  }
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const p = Math.max(0, Math.min(100, Math.round(parseFloat(raw))));
    return { ...item, value: `${p}%`, percent: p, status: "overridden", overridden: true };
  }
  const lp = letterToP(raw);
  if (lp != null) {
    return { ...item, value: raw, percent: lp, status: "overridden", overridden: true };
  }
  return item;
};

// Phase-overview lessons ("Phase N — Topic") are ungraded phase intros. They
// share their topic name with the phase's Lesson 1 (e.g. both "Phase 2 — Output"
// and "Phase 2 · Lesson 1 — Output" display as "Output"), so including them as
// graded columns creates duplicate "Output" columns and false "Missing" entries
// (students only complete the real Lesson 1, not the overview).
const isOverviewLesson = (l) => {
  const p = parseLesson(l);
  return !!(p && p.isOverview);
};

// Quizzes are hidden from the grade table and reports until the week of their
// due date (so a not-yet-current quiz can't be seen/graded early).
const quizRevealed = (dueDate) => {
  if (!dueDate) return true;
  const ws = startOfWeek(new Date(`${dueDate}T00:00:00`), { weekStartsOn: 1 });
  return new Date() >= ws;
};

// Grace window: a due-date-derived assignment past its due date keeps showing
// "Missing" without dropping a 0 into the overall grade until GRACE_PERIOD_DAYS
// have passed after the due date.
const GRACE_PERIOD_DAYS = 7;
const graceWindowEnd = (dueDate) => {
  if (!dueDate) return null;
  const end = new Date(`${dueDate}T23:59:59`);
  end.setDate(end.getDate() + GRACE_PERIOD_DAYS);
  return end;
};

function downloadCsv(rows, filename) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Last name (final whitespace-separated token of full_name), lowercased for a
// stable A–Z compare. Falls back to the full name when there's no last token.
const lastNameOf = (u) => {
  const name = String(u?.full_name || "").trim();
  if (!name) return "";
  const parts = name.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
};

// Period first (numeric: 1..8, with 10/11 ordered correctly), then A–Z by LAST
// name (ties broken by full name). Students with no assigned period sink to the
// bottom instead of clustering on top.
const periodSort = (a, b) => {
  const pa = String(a.class_period ?? "");
  const pb = String(b.class_period ?? "");
  if (pa !== pb) {
    if (!pa) return 1;
    if (!pb) return -1;
    return pa.localeCompare(pb, undefined, { numeric: true });
  }
  const la = lastNameOf(a);
  const lb = lastNameOf(b);
  if (la !== lb) return la.localeCompare(lb);
  return (a.full_name || "").localeCompare(b.full_name || "");
};

const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];

// Color-coded type bubble shown under each gradeable column (not in the CSV).
const KIND_BUBBLE = {
  quiz: "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/40",
  assignment:
    "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#FF2BD6]/15 text-[#FF2BD6] border-[#FF2BD6]/40",
  notes:
    "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#39FF14]/15 text-[#bff9bf] border-[#39FF14]/40",
  practice:
    "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#A855F7]/15 text-[#C4B5FD] border-[#A855F7]/40",
  cfa:
    "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#F59E0B]/15 text-[#FCD34D] border-[#F59E0B]/40",
};
// Σ "lesson total" bubble — informational per-lesson sum (admin only).
const TOTAL_BUBBLE =
  "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#F59E0B]/15 text-[#FCD34D] border-[#F59E0B]/40";

export default function Grades() {
  const { previewStudent } = usePreview();
  const [me, setMe] = useState(null);
  const [responses, setResponses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [notesResp, setNotesResp] = useState([]);
  const [practiceResp, setPracticeResp] = useState([]);
  const [cfas, setCfas] = useState([]);
  const [cfaResp, setCfaResp] = useState([]);
  const [pacing, setPacing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all");
  const [nineWeeks, setNineWeeks] = useState(
    () => (currentNineWeeks() ? String(currentNineWeeks()) : "all")
  );
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [assignmentReview, setAssignmentReview] = useState(null);
  const [overrides, setOverrides] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      let viewer = previewStudent;
      try {
        viewer = viewer || (await base44.auth.me());
      } catch {}
      if (!active) return;
      setMe(viewer);
      const isAdmin = !previewStudent && viewer?.role === "admin";

      const respFilter = previewStudent
        ? ownedBy(previewStudent.id)
        : isAdmin
        ? {}
        : ownedBy(viewer.id);
      const subFilter = previewStudent
        ? ownedBy(previewStudent.id)
        : isAdmin
        ? {}
        : ownedBy(viewer.id);
      // Each fetch is isolated so one failing/forbidden call can't black out the
      // whole page — a rejected fetch just yields [] and the table renders with
      // whatever data did load (the teacher always sees at least the structure).
      const safe = (p) => p.then((r) => r || []).catch(() => []);
      const ovFilter = (previewStudent || viewer?.role === "admin") ? {} : { student_id: viewer.id };
      const [ls, qrs, us, asg, subs, nr, prr, pd, ovs, cfaList, cfaR] = await Promise.all([
        safe(base44.entities.Lesson.list("order")),
        safe(base44.entities.QuizResponse.filter(respFilter)),
        safe(isAdmin ? base44.entities.User.list() : Promise.resolve([])),
        safe(base44.entities.Assignment.list()),
        safe(base44.entities.Submission.filter(subFilter)),
        safe(base44.entities.NotesResponse.filter(respFilter)),
        safe(base44.entities.PracticeResponse.filter(respFilter)),
        safe(base44.entities.PacingDay.list()),
        safe(base44.entities.GradeOverride.filter(ovFilter)),
        safe(base44.entities.CFA.list("phase_start")),
        safe(base44.entities.CFAResponse.filter(respFilter)),
      ]);
      if (!active) return;
      setLessons(ls || []);
      setResponses(qrs || []);
      setStudents(us || []);
      setAssignments(asg || []);
      setSubmissions(subs || []);
      setNotesResp(nr || []);
      setPracticeResp(prr || []);
      setPacing(pd || []);
      setOverrides(ovs || []);
      setCfas(cfaList || []);
      setCfaResp(cfaR || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [previewStudent?.id]);

  const refreshAssignments = async () => {
    const asg = await base44.entities.Assignment.list();
    setAssignments(asg || []);
  };

  const refreshOverrides = async () => {
    try {
      const filter = (previewStudent || me?.role === "admin") ? {} : { student_id: me?.id };
      const ov = await base44.entities.GradeOverride.filter(filter);
      setOverrides(ov || []);
    } catch {
      /* ignore */
    }
  };

  const overrideMap = useMemo(() => {
    const m = new Map();
    (overrides || []).forEach((o) => m.set(`${o.student_id}|${o.column_key}`, o));
    return m;
  }, [overrides]);
  const overrideFor = (studentId, columnKey) => overrideMap.get(`${studentId}|${columnKey}`);
  const overrideDisplay = (ovr) => {
    const up = String(ovr.value || "").trim().toUpperCase();
    if (up === "EX") return "EX";
    if (/^\d+(\.\d+)?$/.test(ovr.value)) return `${ovr.value}%`;
    return ovr.value;
  };

  // After a profile edit, re-pull the roster and keep the open student
  // dialog reflecting the latest class period / grade level.
  const onStudentSaved = async () => {
    try {
      const us = await base44.entities.User.list();
      setStudents(us || []);
      setSelectedStudent((prev) =>
        prev ? (us || []).find((u) => u.id === prev.id) || prev : prev
      );
    } catch {
      /* ignore */
    }
  };

  const isAdminView = !previewStudent && me?.role === "admin";
  const previewName = previewStudent?.full_name;

  const quizLessons = useMemo(
    () => (lessons || []).filter((l) => l.quiz_file_url && !isOverviewLesson(l)),
    [lessons]
  );
  const quizDueByLesson = useMemo(
    () => suggestedDueForLessons(quizLessons, pacing),
    [quizLessons, pacing]
  );
  // Only quizzes whose due-date week has arrived are shown in the table / report
  // (and count toward the overall grade) — upcoming quizzes stay hidden.
  const revealedQuizLessons = useMemo(
    () => quizLessons.filter((l) => quizRevealed(quizDueByLesson.get(l.id)?.date)),
    [quizLessons, quizDueByLesson]
  );

  const respIndex = useMemo(() => {
    const map = new Map();
    (responses || []).forEach((r) => {
      if (r.status !== "graded") return;
      const k = `${ownerOf(r)}|${r.lesson_id}`;
      const prev = map.get(k);
      if (!prev || new Date(r.attempted_at) > new Date(prev.attempted_at)) map.set(k, r);
    });
    return map;
  }, [responses]);

  const subIndex = useMemo(() => {
    const map = new Map();
    (submissions || []).forEach((s) => map.set(`${ownerOf(s)}|${s.assignment_id}`, s));
    return map;
  }, [submissions]);

  // Lessons that have cached guided notes, plus the student's submitted notes
  // (the 5-point notes worksheet).
  const notesLessons = useMemo(
    () => (lessons || []).filter((l) => l.notes_blanks_json && !isOverviewLesson(l)),
    [lessons]
  );
  // Each notes lesson's quiz date (pacing due date), used to zero out notes
  // that are still unsubmitted once the quiz day has passed.
  const notesDueByLesson = useMemo(
    () => suggestedDueForLessons(notesLessons, pacing),
    [notesLessons, pacing]
  );
  const notesLessonOverdue = (l) => {
    const due = notesDueByLesson.get(l.id)?.date || null;
    if (!due) return false;
    return graceWindowEnd(due) < new Date();
  };
  // A notes lesson is "in grace" once its due date has passed but the grace
  // window is still open — show "Missing" without applying a 0 yet.
  const notesLessonInGrace = (l) => {
    const due = notesDueByLesson.get(l.id)?.date || null;
    if (!due) return false;
    const now = new Date();
    if (new Date(`${due}T23:59:59`) >= now) return false;
    return graceWindowEnd(due) >= now;
  };
  const notesIndex = useMemo(() => {
    const map = new Map();
    (notesResp || []).forEach((r) => {
      if (r.status !== "submitted") return;
      const k = `${ownerOf(r)}|${r.lesson_id}`;
      const prev = map.get(k);
      const d = r.submitted_at || r.updated_date;
      if (!prev || new Date(d) > new Date(prev.submitted_at || prev.updated_date)) map.set(k, r);
    });
    return map;
  }, [notesResp]);
  const notesLessonsInScope = useMemo(() => {
    if (nineWeeks === "all") return notesLessons;
    const set = new Set();
    (notesResp || []).forEach((r) => {
      if (r.status === "submitted" && responsePeriod(r.submitted_at) === Number(nineWeeks))
        set.add(r.lesson_id);
    });
    // A lesson's quiz date is the same for every student, so a missed (0)
    // notes column still belongs to the nine weeks of that quiz date.
    notesLessons.forEach((l) => {
      const due = notesDueByLesson.get(l.id)?.date;
      if (due && responsePeriod(due) === Number(nineWeeks)) set.add(l.id);
    });
    return notesLessons.filter((l) => set.has(l.id));
  }, [notesLessons, notesResp, nineWeeks, notesDueByLesson]);

  // Practices (AI-graded). A practice is gradeable once its worksheet is
  // built (practice_json) — it auto-unlocks for students after they submit the
  // lesson notes, so there's no separate "published" gate to honor here. Due
  // date is the teacher-set practice_due_date, falling back to the pacing date.
  const practiceLessons = useMemo(
    () => (lessons || []).filter((l) => l.practice_json && !isOverviewLesson(l)),
    [lessons]
  );
  const practiceDueByLesson = useMemo(() => {
    const m = new Map();
    const sug = suggestedDueForLessons(practiceLessons, pacing);
    practiceLessons.forEach((l) =>
      m.set(l.id, { date: l.practice_due_date || sug.get(l.id)?.date || null })
    );
    return m;
  }, [practiceLessons, pacing]);
  // Gradebook keeps the HIGHEST-scoring graded attempt for a practice, not the
  // latest. A reattempt only updates the gradebook grade if it beats the
  // previous best; an under-review attempt never displaces an already-graded
  // one. If no attempt is graded yet, the latest attempt is kept so "Under
  // review" still shows.
  const practiceBestOf = (a, b) => {
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
  };
  const practiceIndex = useMemo(() => {
    const map = new Map();
    (practiceResp || []).forEach((r) => {
      const k = `${ownerOf(r)}|${r.lesson_id}`;
      map.set(k, practiceBestOf(map.get(k), r));
    });
    return map;
  }, [practiceResp]);
  const practiceLessonOverdue = (l) => {
    const due = practiceDueByLesson.get(l.id)?.date;
    if (!due) return false;
    return graceWindowEnd(due) < new Date();
  };
  const practiceLessonInGrace = (l) => {
    const due = practiceDueByLesson.get(l.id)?.date;
    if (!due) return false;
    const now = new Date();
    if (new Date(`${due}T23:59:59`) >= now) return false;
    return graceWindowEnd(due) >= now;
  };
  const practiceTitleOf = (l) => {
    try {
      const t = JSON.parse(l.practice_json || "{}").title;
      if (t) return t;
    } catch {}
    return "Practice — " + lessonName(l);
  };
  const practiceMaxByLesson = useMemo(() => {
    const m = new Map();
    practiceLessons.forEach((l) => {
      let max = 10;
      try {
        const o = JSON.parse(l.practice_json || "{}");
        if (o?.point_goal) max = o.point_goal;
      } catch {}
      m.set(l.id, max);
    });
    return m;
  }, [practiceLessons]);
  const practiceTitleByLesson = useMemo(() => {
    const m = new Map();
    practiceLessons.forEach((l) => m.set(l.id, practiceTitleOf(l)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceLessons]);
  const practiceOverdueSet = useMemo(() => {
    const set = new Set();
    practiceLessons.forEach((l) => {
      if (practiceLessonOverdue(l)) set.add(l.id);
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceLessons, practiceDueByLesson]);
  const practiceGraceSet = useMemo(() => {
    const set = new Set();
    practiceLessons.forEach((l) => {
      if (practiceLessonInGrace(l)) set.add(l.id);
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceLessons, practiceDueByLesson]);
  const practiceLessonsInScope = useMemo(() => {
    if (nineWeeks === "all") return practiceLessons;
    const set = new Set();
    (practiceResp || []).forEach((r) => {
      if (responsePeriod(r.submitted_at) === Number(nineWeeks)) set.add(r.lesson_id);
    });
    practiceLessons.forEach((l) => {
      const due = practiceDueByLesson.get(l.id)?.date;
      if (due && responsePeriod(due) === Number(nineWeeks)) set.add(l.id);
    });
    return practiceLessons.filter((l) => set.has(l.id));
  }, [practiceLessons, practiceResp, nineWeeks, practiceDueByLesson]);

  // Quizzes get the same 7-day grace window as notes/practice — a not-taken
  // quiz stays "Missing" with no zero impact until the grace window ends,
  // then drops to 0%.
  const quizLessonOverdue = (l) => {
    const due = quizDueByLesson.get(l.id)?.date || null;
    if (!due) return false;
    return graceWindowEnd(due) < new Date();
  };
  const quizLessonInGrace = (l) => {
    const due = quizDueByLesson.get(l.id)?.date || null;
    if (!due) return false;
    const now = new Date();
    if (new Date(`${due}T23:59:59`) >= now) return false;
    return graceWindowEnd(due) >= now;
  };
  const quizMaxByLesson = useMemo(() => {
    const m = new Map();
    quizLessons.forEach((l) => {
      let total = null;
      try {
        const o = JSON.parse(l.quiz_json || "{}");
        if (o?.questions?.length) total = o.questions.length * 0.5;
      } catch {}
      m.set(l.id, total);
    });
    return m;
  }, [quizLessons]);
  const quizOverdueSet = useMemo(() => {
    const set = new Set();
    revealedQuizLessons.forEach((l) => { if (quizLessonOverdue(l)) set.add(l.id); });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedQuizLessons, quizDueByLesson]);
  const quizGraceSet = useMemo(() => {
    const set = new Set();
    revealedQuizLessons.forEach((l) => { if (quizLessonInGrace(l)) set.add(l.id); });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedQuizLessons, quizDueByLesson]);

  // Assignments get the same 7-day grace window — a missing assignment only
  // starts counting as 0 toward an overall grade 7 days past its due date.
  const assignmentOverdue = (a) => {
    if (!a.due_date) return false;
    return graceWindowEnd(a.due_date) < new Date();
  };
  const assignmentInGrace = (a) => {
    if (!a.due_date) return false;
    const now = new Date();
    if (new Date(`${a.due_date}T23:59:59`) >= now) return false;
    return graceWindowEnd(a.due_date) >= now;
  };
  const assignmentOverdueSet = useMemo(() => {
    const set = new Set();
    (assignments || []).forEach((a) => {
      if (!a.published) return;
      if (assignmentOverdue(a)) set.add(a.id);
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);
  const assignmentGraceSet = useMemo(() => {
    const set = new Set();
    (assignments || []).forEach((a) => {
      if (!a.published) return;
      if (assignmentInGrace(a)) set.add(a.id);
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);

  // CFAs (Common Formative Assessments). Each CFA covers a 3-phase block, has
  // its own due_date, and is gated by a teacher "published" flag (no pacing
  // reveal). Only published CFAs show in the gradebook and count toward the
  // overall grade. A graded CFAResponse is score/total (1 pt per question).
  const cfaIndex = useMemo(() => {
    const map = new Map();
    (cfaResp || []).forEach((r) => {
      if (r.status !== "graded") return;
      const k = `${ownerOf(r)}|${r.cfa_id}`;
      const prev = map.get(k);
      if (!prev || new Date(r.attempted_at) > new Date(prev.attempted_at)) map.set(k, r);
    });
    return map;
  }, [cfaResp]);
  const cfaOverdue = (c) => {
    if (!c.due_date) return false;
    return graceWindowEnd(c.due_date) < new Date();
  };
  const cfaInGrace = (c) => {
    if (!c.due_date) return false;
    const now = new Date();
    if (new Date(`${c.due_date}T23:59:59`) >= now) return false;
    return graceWindowEnd(c.due_date) >= now;
  };
  const cfaQuestionCount = useMemo(() => {
    const m = new Map();
    (cfas || []).forEach((c) => {
      let n = null;
      try {
        const o = JSON.parse(c.questions_json || "[]");
        if (Array.isArray(o)) n = o.length;
      } catch {}
      m.set(c.id, n);
    });
    return m;
  }, [cfas]);
  const cfaOverdueSet = useMemo(() => {
    const set = new Set();
    (cfas || []).forEach((c) => { if (c.published && cfaOverdue(c)) set.add(c.id); });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfas]);
  const cfaGraceSet = useMemo(() => {
    const set = new Set();
    (cfas || []).forEach((c) => { if (c.published && cfaInGrace(c)) set.add(c.id); });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfas]);
  const cfasInScope = useMemo(() => {
    const published = (cfas || []).filter((c) => c.published);
    if (nineWeeks === "all") return published;
    return published.filter((c) => assignmentPeriod(c.due_date, null) === Number(nineWeeks));
  }, [cfas, nineWeeks]);

  const filteredStudents = useMemo(() => {
    const list =
      period === "all"
        ? [...(students || [])]
        : (students || []).filter((s) => s.class_period === period);
    return list.sort(periodSort);
  }, [students, period]);

  const lessonTitle = (id) =>
    (lessons || []).find((l) => l.id === id)?.title || "Unknown lesson";
  const notesTitleOf = (l) => {
    try {
      const t = JSON.parse(l.notes_blanks_json || "{}").title;
      if (t) return t;
    } catch {}
    return "Notes - " + lessonName(l);
  };
  const studentName = (id) =>
    (students || []).find((u) => u.id === id)?.full_name || previewName || "Student";

  const gradedOnly = (responses || []).filter((r) => r.status === "graded");

  // Build the per-student gradeable list with nine-weeks placement + percentage.
  const gradeablesFor = (s) => {
    const items = [];
    revealedQuizLessons.forEach((l) => {
      const r = respIndex.get(`${s.id}|${l.id}`);
      const due = quizDueByLesson.get(l.id)?.date || null;
      const pastGrace = quizLessonOverdue(l);
      const inGrace = quizLessonInGrace(l);
      let value, percent, date, status, period;
      if (r) {
        value = `${r.score}/${r.total}`;
        percent = pct(r.score, r.total);
        date = r.attempted_at;
        status = "graded";
        period = responsePeriod(r.attempted_at);
      } else if (pastGrace) {
        const tot = quizMaxByLesson.get(l.id);
        value = tot ? `0/${tot}` : "Missing";
        percent = 0;
        date = due;
        status = "missed";
        period = due ? responsePeriod(due) : null;
      } else if (inGrace) {
        value = "Missing";
        percent = null;
        date = due;
        status = "missing";
        period = due ? responsePeriod(due) : null;
      } else {
        value = "Not taken";
        percent = null;
        date = null;
        status = "missing";
        period = null;
      }
      items.push({
        name: lessonName(l),
        kind: "quiz",
        columnKey: `quiz|${l.id}`,
        value,
        percent,
        date,
        status,
        period,
      });
    });
    (assignments || []).forEach((a) => {
      if (!a.published) return;
      const ap = assignmentPeriod(a.due_date, a.grade_period_override);
      const sub = subIndex.get(`${s.id}|${a.id}`);
      const pastGrace = assignmentOverdue(a);
      const inGrace = assignmentInGrace(a);
      let value, percent, date, status;
      if (sub) {
        value = sub.grade || "Submitted";
        percent = sub?.grade ? letterToP(sub.grade) : null;
        date = sub.created_date;
        status = sub.status || "submitted";
      } else if (pastGrace) {
        value = "Missing";
        percent = 0;
        date = a.due_date;
        status = "missed";
      } else if (inGrace) {
        value = "Missing";
        percent = null;
        date = a.due_date;
        status = "missing";
      } else {
        value = "Not turned in";
        percent = null;
        date = null;
        status = "missing";
      }
      items.push({
        name: a.title,
        kind: "assignment",
        columnKey: `asg|${a.id}`,
        value,
        percent,
        date,
        status,
        period: ap === "omitted" ? null : ap,
        omitted: ap === "omitted",
      });
    });
    (notesLessons || []).forEach((l) => {
      const r = notesIndex.get(`${s.id}|${l.id}`);
      const submitted = r && r.status === "submitted";
      const due = notesDueByLesson.get(l.id)?.date;
      const pastGrace = notesLessonOverdue(l);
      const inGrace = notesLessonInGrace(l);
      let value, percent, date, status, period;
      if (submitted) {
        value = `${r.score}/${r.total}`;
        percent = pct(r.score, r.total);
        date = r.submitted_at || r.updated_date;
        status = "submitted";
        period = responsePeriod(r.submitted_at);
      } else if (pastGrace) {
        // Past the grace window with no submission → a zero for the notes.
        value = `0/${r?.total || 5}`;
        percent = 0;
        date = due;
        status = "missed";
        period = responsePeriod(due);
      } else if (inGrace) {
        // Past due but still inside the grace window → missing, no 0 yet.
        value = r ? "In progress" : "Missing";
        percent = null;
        date = r?.submitted_at || r?.updated_date || due;
        status = r ? "in_progress" : "missing";
        period = due ? responsePeriod(due) : null;
      } else {
        value = r ? "In progress" : "Not turned in";
        percent = null;
        date = r?.submitted_at || r?.updated_date;
        status = r ? "in_progress" : "missing";
        period = null;
      }
      items.push({
        name: notesTitleOf(l),
        kind: "notes",
        columnKey: `notes|${l.id}`,
        value,
        percent,
        date,
        status,
        period: period === "omitted" ? null : period,
      });
    });
    (practiceLessons || []).forEach((l) => {
      const r = practiceIndex.get(`${s.id}|${l.id}`);
      const due = practiceDueByLesson.get(l.id)?.date;
      const pastGrace = practiceLessonOverdue(l);
      const inGrace = practiceLessonInGrace(l);
      let value, percent, date, status, period;
      if (r) {
        if (r.status === "under_review") {
          value = "Under review";
          percent = null;
          date = r.submitted_at || r.updated_date;
          status = "review";
          period = responsePeriod(r.submitted_at);
        } else {
          // Gradebook counts the practice on the 10-point goal scale: a score
          // at/over the goal is full credit, with surplus above the goal shown
          // as bonus. Below the goal the student keeps their raw score.
          const goal = practiceMaxByLesson.get(l.id) ?? 10;
          const raw = r.score ?? 0;
          const capped = Math.min(raw, goal);
          const bonus = Math.max(0, raw - goal);
          value = bonus > 0 ? `${goal}/${goal} (+${bonus} bonus)` : `${capped}/${goal}`;
          percent = Math.min(100, Math.round((capped / goal) * 100));
          date = r.submitted_at || r.updated_date;
          status = "graded";
          period = responsePeriod(r.submitted_at);
        }
      } else if (pastGrace) {
        value = `0/${practiceMaxByLesson.get(l.id) ?? 10}`;
        percent = 0;
        date = due;
        status = "missed";
        period = responsePeriod(due);
      } else if (inGrace) {
        value = "Missing";
        percent = null;
        date = due;
        status = "missing";
        period = due ? responsePeriod(due) : null;
      } else {
        value = "Not done";
        percent = null;
        date = due;
        status = "missing";
        period = due ? responsePeriod(due) : null;
      }
      items.push({
        name: practiceTitleOf(l),
        kind: "practice",
        columnKey: `practice|${l.id}`,
        value,
        percent,
        date,
        status,
        period: period === "omitted" ? null : period,
      });
    });
    (cfas || []).forEach((c) => {
      if (!c.published) return;
      const r = cfaIndex.get(`${s.id}|${c.id}`);
      const due = c.due_date || null;
      const pastGrace = cfaOverdue(c);
      const inGrace = cfaInGrace(c);
      const total = cfaQuestionCount.get(c.id) || r?.total || 0;
      let value, percent, date, status, period;
      if (r) {
        value = `${r.score}/${r.total}`;
        percent = pct(r.score, r.total);
        date = r.attempted_at;
        status = "graded";
        period = responsePeriod(r.attempted_at) || (due ? assignmentPeriod(due, null) : null);
      } else if (pastGrace) {
        value = total ? `0/${total}` : "Missing";
        percent = 0;
        date = due;
        status = "missed";
        period = due ? assignmentPeriod(due, null) : null;
      } else if (inGrace) {
        value = "Missing";
        percent = null;
        date = due;
        status = "missing";
        period = due ? assignmentPeriod(due, null) : null;
      } else {
        value = "Not taken";
        percent = null;
        date = due;
        status = "missing";
        period = due ? assignmentPeriod(due, null) : null;
      }
      items.push({
        name: c.title,
        kind: "cfa",
        columnKey: `cfa|${c.id}`,
        value,
        percent,
        date,
        status,
        period,
      });
    });
    return items.map((it) => applyOverride(it, overrideFor(s.id, it.columnKey)));
  };

  const isInScope = (g) => {
    if (g.period === "omitted" || g.period == null) return false;
    return nineWeeks === "all" || g.period === Number(nineWeeks);
  };

  const overallFor = (s) => {
    const items = gradeablesFor(s).filter(
      (g) => g.percent !== null && g.percent !== undefined && isInScope(g)
    );
    if (!items.length) return null;
    return {
      percent: Math.round(items.reduce((a, g) => a + g.percent, 0) / items.length),
      count: items.length,
    };
  };

  // Precompute the overdue-notes set + note-column titles once so the per-cell
  // render loop stays a cheap lookup instead of a date check / JSON.parse.
  const notesOverdueSet = useMemo(() => {
    const set = new Set();
    notesLessons.forEach((l) => {
      if (notesLessonOverdue(l)) set.add(l.id);
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesLessons, notesDueByLesson]);
  const notesGraceSet = useMemo(() => {
    const set = new Set();
    notesLessons.forEach((l) => {
      if (notesLessonInGrace(l)) set.add(l.id);
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesLessons, notesDueByLesson]);
  const notesTitleByLesson = useMemo(() => {
    const m = new Map();
    notesLessons.forEach((l) => m.set(l.id, notesTitleOf(l)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesLessons]);

  // Compute every student's overall once; reused by the class average and each
  // table row so we never rebuild the per-student gradeables list on re-render.
  const overallByStudent = useMemo(() => {
    const m = new Map();
    filteredStudents.forEach((s) => m.set(s.id, overallFor(s)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filteredStudents, responses, assignments, nineWeeks,
    revealedQuizLessons, notesLessons, notesResp, pacing,
    practiceLessons, practiceResp, practiceIndex, practiceDueByLesson, practiceMaxByLesson,
    subIndex, respIndex, overrideMap,
    cfas, cfaResp, cfaIndex,
  ]);

  // Columns scoped to the selected nine weeks.
  const quizLessonsInScope = useMemo(() => {
    if (nineWeeks === "all") return revealedQuizLessons;
    const set = new Set();
    (responses || []).forEach((r) => {
      if (r.status === "graded" && responsePeriod(r.attempted_at) === Number(nineWeeks))
        set.add(r.lesson_id);
    });
    return revealedQuizLessons.filter((l) => set.has(l.id));
  }, [revealedQuizLessons, responses, nineWeeks]);

  const assignmentsInScope = useMemo(
    () =>
      (assignments || [])
        .filter((a) => a.published)
        .filter((a) =>
          nineWeeks === "all"
            ? true
            : assignmentPeriod(a.due_date, a.grade_period_override) === Number(nineWeeks)
        ),
    [assignments, nineWeeks]
  );

  // Gradeable columns shown in the teacher table for the current scope — one
  // CSV per export. Used by the TAC/eSchoolPLUS export below.
  const exportColumns = useMemo(() => {
    const cols = [];
    quizLessonsInScope.forEach((l) =>
      cols.push({ key: `quiz|${l.id}`, kind: "quiz", name: lessonName(l), lessonId: l.id })
    );
    assignmentsInScope.forEach((a) =>
      cols.push({ key: `asg|${a.id}`, kind: "assignment", name: a.title, assignmentId: a.id })
    );
    notesLessonsInScope.forEach((l) =>
      cols.push({ key: `notes|${l.id}`, kind: "notes", name: notesTitleByLesson.get(l.id), lessonId: l.id })
    );
    practiceLessonsInScope.forEach((l) =>
      cols.push({ key: `practice|${l.id}`, kind: "practice", name: practiceTitleByLesson.get(l.id), lessonId: l.id })
    );
    cfasInScope.forEach((c) =>
      cols.push({ key: `cfa|${c.id}`, kind: "cfa", name: c.title, cfaId: c.id })
    );
    return cols;
  }, [quizLessonsInScope, assignmentsInScope, notesLessonsInScope, practiceLessonsInScope, cfasInScope, notesTitleByLesson, practiceTitleByLesson]);

  // Per-student numeric score (percentage) for a single export column, or null
  // when the grade is missing / zero / excused / under-review (those are skipped
  // — only rows with a positive numeric score make it into the CSV).
  const exportScoreFor = (s, col) => {
    if (!s || !col) return null;
    const ovr = overrideFor(s.id, col.key);
    if (ovr) {
      const up = String(ovr.value || "").trim().toUpperCase();
      if (up === "EX") return null;
      if (/^\d+(\.\d+)?$/.test(ovr.value))
        return Math.max(0, Math.min(100, Math.round(parseFloat(ovr.value))));
      return letterToP(ovr.value);
    }
    if (col.kind === "quiz") {
      const r = respIndex.get(`${s.id}|${col.lessonId}`);
      return r && r.status === "graded" ? pct(r.score, r.total) : null;
    }
    if (col.kind === "assignment") {
      const sub = subIndex.get(`${s.id}|${col.assignmentId}`);
      return sub && sub.grade ? letterToP(sub.grade) : null;
    }
    if (col.kind === "notes") {
      const r = notesIndex.get(`${s.id}|${col.lessonId}`);
      return r && r.status === "submitted" ? pct(r.score, r.total) : null;
    }
    if (col.kind === "practice") {
      const r = practiceIndex.get(`${s.id}|${col.lessonId}`);
      const goal = practiceMaxByLesson.get(col.lessonId) ?? 10;
      if (!r || r.status !== "submitted") return null;
      const capped = Math.min(r.score ?? 0, goal);
      return Math.min(100, Math.round((capped / goal) * 100));
    }
    if (col.kind === "cfa") {
      const r = cfaIndex.get(`${s.id}|${col.cfaId}`);
      return r && r.status === "graded" ? pct(r.score, r.total) : null;
    }
    if (col.kind === "total") {
      // Per-lesson Σ total as a percentage, so it exports like the other
      // columns (StudentID,score). lessonTotalFor needs the lesson object.
      const l = lessonById.get(col.lessonId);
      const t = l ? lessonTotalFor(s, l) : null;
      return t && t.possible ? pct(t.earned, t.possible) : null;
    }
    return null;
  };

  // Total-per-lesson columns (admin only): sum the points a student earned
  // across that lesson's notes + practice + quiz into one "Σ total" grade.
  // Informational only — never averaged into the overall gradebook grade, and
  // students never see these columns.
  const totalLessons = useMemo(
    () =>
      (lessons || []).filter(
        (l) =>
          (l.quiz_file_url || l.notes_blanks_json || l.practice_json) &&
          !isOverviewLesson(l)
      ),
    [lessons]
  );
  const quizCountByLesson = useMemo(() => {
    const m = new Map();
    quizLessons.forEach((l) => {
      let n = null;
      try {
        n = JSON.parse(l.quiz_json || "{}").questions?.length || null;
      } catch {}
      m.set(l.id, n);
    });
    return m;
  }, [quizLessons]);
  const lessonTotalLabel = (l) => {
    const p = parseLesson(l);
    if (p && !p.isOverview) return `Phase ${p.phase} Lesson ${p.num}`;
    if (p && p.isOverview) return `Phase ${p.phase} (overview)`;
    return lessonName(l);
  };
  // lessonTotalFor reads fields off the lesson OBJECT (quiz_file_url,
  // notes_blanks_json, practice_json), but the export columns only carry a
  // lessonId — resolve the object here so the CSV/TAC total cells aren't blank.
  const lessonById = useMemo(
    () => new Map((lessons || []).map((l) => [l.id, l])),
    [lessons]
  );
  const lessonTotalFor = (s, l) => {
    let earned = 0,
      possible = 0,
      any = false;
    if (l.quiz_file_url && quizRevealed(quizDueByLesson.get(l.id)?.date)) {
      const r = respIndex.get(`${s.id}|${l.id}`);
      if (r && r.status === "graded") {
        earned += r.score;
        possible += r.total;
        any = true;
      } else if (quizOverdueSet.has(l.id)) {
        possible += quizCountByLesson.get(l.id) || 0;
        any = true;
      }
    }
    if (l.notes_blanks_json) {
      const r = notesIndex.get(`${s.id}|${l.id}`);
      if (r && r.status === "submitted") {
        earned += r.score;
        possible += r.total;
        any = true;
      } else if (notesOverdueSet.has(l.id)) {
        possible += r?.total || 5;
        any = true;
      }
    }
    if (l.practice_json) {
      const r = practiceIndex.get(`${s.id}|${l.id}`);
      const goal = practiceMaxByLesson.get(l.id) ?? 10;
      if (r && r.status === "submitted") {
        earned += Math.min(r.score ?? 0, goal);
        possible += goal;
        any = true;
      } else if (practiceOverdueSet.has(l.id)) {
        possible += goal;
        any = true;
      }
    }
    return any ? { earned, possible } : null;
  };

  // Teacher class average over the selected scope.
  const classOverall = useMemo(() => {
    if (!isAdminView) return null;
    const vals = filteredStudents.map((s) => overallByStudent.get(s.id)).filter(Boolean);
    if (!vals.length) return null;
    return {
      percent: Math.round(vals.reduce((a, v) => a + v.percent, 0) / vals.length),
      count: vals.length,
    };
  }, [filteredStudents, overallByStudent, isAdminView]);

  const studentOverall = useMemo(() => {
    const target = previewStudent || me;
    if (!target || isAdminView) return null;
    return overallFor(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, previewStudent, responses, assignments, nineWeeks, revealedQuizLessons, practiceLessons, practiceResp, practiceIndex, practiceDueByLesson, practiceMaxByLesson, subIndex, respIndex, isAdminView, overrideMap, cfas, cfaResp, cfaIndex]);

  const scopedGraded = useMemo(
    () =>
      gradedOnly.filter((r) => {
        const due = quizDueByLesson.get(r.lesson_id);
        if (due && !quizRevealed(due.date)) return false;
        if (nineWeeks !== "all" && responsePeriod(r.attempted_at) !== Number(nineWeeks))
          return false;
        if (period !== "all") {
          const u = (students || []).find((x) => x.id === ownerOf(r));
          return u?.class_period === period;
        }
        return true;
      }),
    [gradedOnly, nineWeeks, period, students, quizDueByLesson]
  );

  // Gradebook export: Student ID, Student Name, Period, then one column per
  // assignment (quizzes, notes, practices, standalone assignments). Each cell
  // is the points earned (numeric), empty when not yet graded, and 0 once a
  // missing item is past its grace window. Under-review practices stay blank
  // (not posted to the gradebook until a teacher approves).
  const gradebookCell = (s, c) => {
    const ovr = overrideFor(s.id, c.key);
    if (ovr) {
      const up = String(ovr.value || "").trim().toUpperCase();
      if (up === "EX") return "EX";
      return ovr.value;
    }
    if (c.kind === "quiz") {
      const r = respIndex.get(`${s.id}|${c.lessonId}`);
      const inScope =
        nineWeeks === "all" || (r && responsePeriod(r.attempted_at) === Number(nineWeeks));
      if (r && inScope) return r.score ?? 0;
      if (!r && quizOverdueSet.has(c.lessonId)) return 0;
      return "";
    }
    if (c.kind === "assignment") {
      const sub = subIndex.get(`${s.id}|${c.assignmentId}`);
      if (sub && sub.grade) return sub.grade;
      if (!sub && assignmentOverdueSet.has(c.assignmentId)) return 0;
      return "";
    }
    if (c.kind === "notes") {
      const r = notesIndex.get(`${s.id}|${c.lessonId}`);
      if (r && r.status === "submitted") return r.score ?? 0;
      if (!r && notesOverdueSet.has(c.lessonId)) return 0;
      return "";
    }
    if (c.kind === "practice") {
      const r = practiceIndex.get(`${s.id}|${c.lessonId}`);
      const goal = practiceMaxByLesson.get(c.lessonId) ?? 10;
      if (r && r.status === "submitted") return Math.min(r.score ?? 0, goal);
      if (!r && practiceOverdueSet.has(c.lessonId)) return 0;
      return "";
    }
    if (c.kind === "cfa") {
      const r = cfaIndex.get(`${s.id}|${c.cfaId}`);
      if (r && r.status === "graded") return r.score ?? 0;
      if (!r && cfaOverdueSet.has(c.cfaId)) return 0;
      return "";
    }
    if (c.kind === "total") {
      // Per-lesson Σ total: just the points earned (e.g. 23), not "23/29".
      const l = lessonById.get(c.lessonId);
      const t = l ? lessonTotalFor(s, l) : null;
      return t ? String(t.earned) : "";
    }
    return "";
  };

  const csv = () => {
    const cols = exportColumns;
    // Append the per-lesson Σ total columns (labeled "Phase N Lesson M") so
    // the CSV matches what the gradebook shows — exportColumns alone omits them.
    const totalCols = totalLessons.map((l) => ({
      key: `total|${l.id}`,
      kind: "total",
      name: lessonTotalLabel(l),
      lessonId: l.id,
    }));
    const allCols = [...cols, ...totalCols];
    const header = ["Student ID", "Student Name", "Period", ...allCols.map((c) => c.name)];
    const body = filteredStudents.map((s) => [
      s.eschool_id || "",
      s.full_name,
      s.class_period || "",
      ...allCols.map((c) => gradebookCell(s, c)),
    ]);
    const suffix =
      (period === "all" ? "all-periods" : `period-${period}`) +
      (nineWeeks === "all" ? "" : `_NW${nineWeeks}`);
    downloadCsv([header, ...body], `grades_${suffix}.csv`);
  };

  const printReport = () => window.print();

  const nineWeeksLabel = nineWeeks === "all" ? "All nine weeks" : periodName(nineWeeks);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
        </div>
      </div>
    );
  }

  const nineWeeksSelectClass =
    "bg-card border border-stone-200/50 rounded-md px-3 py-1.5 text-sm text-foreground font-medium";

  return (
    <>
      <div className="max-w-5xl mx-auto px-6 py-10 print:hidden">
        <CodeHeader
          chip="grades.report()"
          title="Grades"
          subtitle={isAdminView ? `${nineWeeksLabel} · all students` : previewName || "your quizzes"}
          tags={[
            {
              label: nineWeeksLabel,
              color: "text-[#22D3EE] border-[#22D3EE]/30 bg-[#22D3EE]/10",
            },
            {
              label: "auto-graded",
              color: "text-[#39FF14] border-[#39FF14]/30 bg-[#39FF14]/10",
            },
          ]}
        />

        {isAdminView ? (
          <>
            {!previewStudent && (
              <OverallGradeCard
                label="class current grade"
                percent={classOverall?.percent ?? null}
                subtitle={
                  classOverall
                    ? `live average across ${classOverall.count} graded students · ${nineWeeksLabel}`
                    : `no graded items yet · ${nineWeeksLabel}`
                }
              />
            )}

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="flex items-center gap-2 text-sm text-stone-300 font-mono">
                <CalendarClock className="w-4 h-4 text-[#22D3EE]" />
                Nine weeks
                <select
                  value={nineWeeks}
                  onChange={(e) => setNineWeeks(e.target.value)}
                  className={nineWeeksSelectClass}
                >
                  {NINE_WEEKS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-card text-foreground">
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-300 font-mono">
                Period
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className={nineWeeksSelectClass}
                >
                  <option value="all" className="bg-card text-foreground">
                    All periods
                  </option>
                  {PERIODS.map((p) => (
                    <option key={p} value={p} className="bg-card text-foreground">
                      Period {p}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex-1" />
              <Button
                variant="outline"
                onClick={csv}
                disabled={!filteredStudents.length || (!exportColumns.length && !totalLessons.length)}
              >
                <Download className="w-4 h-4 mr-1" />
                Export CSV
              </Button>
              <Button onClick={printReport} disabled={!filteredStudents.length}>
                <Printer className="w-4 h-4 mr-1" />
                {nineWeeks === "all" ? "Print all" : `Print ${periodName(nineWeeks)}`}
              </Button>
            </div>

            {nineWeeks !== "all" && (
              <NineWeeksAssignmentManager
                period={nineWeeks}
                assignments={assignments}
                onUpdated={refreshAssignments}
              />
            )}

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="font-mono text-base flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-[#22D3EE]" />
                  Students × assignments
                  <span className="text-xs text-stone-400 font-normal">
                    ({filteredStudents.length} students · {quizLessonsInScope.length} quizzes ·{" "}
                    {practiceLessonsInScope.length} practices ·{" "}
                    {notesLessonsInScope.length} notes ·{" "}
                    {assignmentsInScope.length} assignments · {cfasInScope.length} CFAs · {totalLessons.length} lesson totals · {nineWeeksLabel})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[70vh]">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-card text-stone-400 font-mono text-xs sticky top-0 z-20">
                      <tr>
                        <th className="sticky left-0 bg-card text-left px-4 py-3 z-30">
                          Student
                        </th>
                        <th className="text-center px-3 py-3">Per</th>
                        <th className="text-center px-3 py-3">Grade</th>
                        {quizLessonsInScope.map((l) => (
                          <th
                            key={l.id}
                            className="text-center px-3 py-3 font-normal whitespace-nowrap"
                            title={lessonName(l)}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span>{lessonName(l)}</span>
                              <span className={KIND_BUBBLE.quiz}>quiz</span>
                            </div>
                          </th>
                        ))}
                        {assignmentsInScope.map((a) => (
                          <th
                            key={a.id}
                            className="text-center px-3 py-3 font-normal whitespace-nowrap"
                            title={a.title}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setAssignmentReview(a)}
                                className="text-foreground hover:text-[#22D3EE] hover:underline cursor-pointer"
                                title="Click to review every student's submission"
                              >
                                {a.title}
                              </button>
                              <span className={KIND_BUBBLE.assignment}>asg</span>
                            </div>
                          </th>
                        ))}
                        {notesLessonsInScope.map((l) => (
                          <th
                            key={"n" + l.id}
                            className="text-center px-3 py-3 font-normal whitespace-nowrap"
                            title={notesTitleByLesson.get(l.id)}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span>{notesTitleByLesson.get(l.id)}</span>
                              <span className={KIND_BUBBLE.notes}>notes</span>
                            </div>
                          </th>
                        ))}
                        {practiceLessonsInScope.map((l) => (
                          <th
                            key={"p" + l.id}
                            className="text-center px-3 py-3 font-normal whitespace-nowrap"
                            title={practiceTitleByLesson.get(l.id)}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span>{practiceTitleByLesson.get(l.id)}</span>
                              <span className={KIND_BUBBLE.practice}>practice</span>
                            </div>
                          </th>
                        ))}
                        {cfasInScope.map((c) => (
                          <th
                            key={"cfa" + c.id}
                            className="text-center px-3 py-3 font-normal whitespace-nowrap"
                            title={c.title}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span>{c.title}</span>
                              <span className={KIND_BUBBLE.cfa}>cfa</span>
                            </div>
                          </th>
                        ))}
                        {totalLessons.map((l) => (
                          <th
                            key={"tot" + l.id}
                            className="text-center px-3 py-3 font-normal whitespace-nowrap"
                            title={"Lesson total (Σ) — " + lessonTotalLabel(l)}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span>{lessonTotalLabel(l)}</span>
                              <span className={TOTAL_BUBBLE}>Σ total</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((s) => {
                        const ov = overallByStudent.get(s.id);
                        return (
                          <tr
                            key={s.id}
                            className="border-t border-stone-200/10 cursor-pointer hover:bg-stone-200/5"
                            onClick={() => setSelectedStudent(s)}
                            title="Click to open this student's grades and overrides"
                          >
                            <td className="sticky left-0 bg-card px-4 py-2 font-medium text-foreground z-10">
                              <button
                                onClick={() => setSelectedStudent(s)}
                                className="text-left hover:text-[#22D3EE] hover:underline"
                                title="View this student's assignments and missing work"
                              >
                                {s.full_name}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-center text-stone-400">
                              {s.class_period || "—"}
                            </td>
                            <td className="px-3 py-2 text-center font-mono tabular-nums font-semibold">
                              {ov ? `${ov.percent}%` : "—"}
                            </td>
                            {quizLessonsInScope.map((l) => {
                              const ovr = overrideFor(s.id, `quiz|${l.id}`);
                              if (ovr) {
                                const isEx = String(ovr.value || "").trim().toUpperCase() === "EX";
                                return (
                                  <td
                                    key={l.id}
                                    className={`px-3 py-2 text-center font-mono tabular-nums ${isEx ? "text-amber-400 italic bg-amber-500/5" : "text-[#22D3EE] bg-[#22D3EE]/5"}`}
                                    title="Manual override"
                                  >
                                    {overrideDisplay(ovr)}
                                  </td>
                                );
                              }
                              const r = respIndex.get(`${s.id}|${l.id}`);
                              const inScope =
                                nineWeeks === "all" ||
                                (r && responsePeriod(r.attempted_at) === Number(nineWeeks));
                              const zc = !r && quizOverdueSet.has(l.id);
                              const grace = !r && !zc && quizGraceSet.has(l.id);
                              if (!r || !inScope) {
                                if (zc || grace) {
                                  const tot = quizMaxByLesson.get(l.id);
                                  return (
                                    <td
                                      key={l.id}
                                      title={grace ? "Missing — grace period" : undefined}
                                      className={`px-3 py-2 text-center font-mono tabular-nums text-destructive`}
                                    >
                                      {zc ? (tot ? `0/${tot}` : "0") : "Missing"}
                                    </td>
                                  );
                                }
                                return (
                                  <td key={l.id} className="px-3 py-2 text-center text-stone-600">
                                    —
                                  </td>
                                );
                              }
                              const p = pct(r.score, r.total);
                              return (
                                <td
                                  key={l.id}
                                  className={`px-3 py-2 text-center font-mono tabular-nums ${
                                    p >= 70 ? "text-[#bff9bf]" : "text-destructive-foreground"
                                  }`}
                                  title={`${r.score}/${r.total} · ${p}%`}
                                >
                                  {p}%
                                </td>
                              );
                            })}
                            {assignmentsInScope.map((a) => {
                              const ovr = overrideFor(s.id, `asg|${a.id}`);
                              if (ovr) {
                                const isEx = String(ovr.value || "").trim().toUpperCase() === "EX";
                                return (
                                  <td
                                    key={a.id}
                                    className={`px-3 py-2 text-center font-mono tabular-nums ${isEx ? "text-amber-400 italic bg-amber-500/5" : "text-[#22D3EE] bg-[#22D3EE]/5"}`}
                                    title="Manual override"
                                  >
                                    {overrideDisplay(ovr)}
                                  </td>
                                );
                              }
                              const sub = subIndex.get(`${s.id}|${a.id}`);
                              const zc = !sub && assignmentOverdueSet.has(a.id);
                              const grace = !sub && !zc && assignmentGraceSet.has(a.id);
                              return (
                                <td
                                  key={a.id}
                                  className={`px-3 py-2 text-center font-mono tabular-nums ${
                                    sub
                                      ? "text-stone-300"
                                      : zc
                                      ? "text-destructive"
                                      : grace
                                      ? "text-amber-400"
                                      : "text-stone-600"
                                  }`}
                                >
                                  {sub
                                    ? sub.grade || "✓"
                                    : zc
                                    ? "0"
                                    : grace
                                    ? "Missing"
                                    : "—"}
                                </td>
                              );
                            })}
                            {notesLessonsInScope.map((l) => {
                              const ovr = overrideFor(s.id, `notes|${l.id}`);
                              if (ovr) {
                                const isEx = String(ovr.value || "").trim().toUpperCase() === "EX";
                                return (
                                  <td
                                    key={"n" + l.id}
                                    className={`px-3 py-2 text-center font-mono tabular-nums ${isEx ? "text-amber-400 italic bg-amber-500/5" : "text-[#22D3EE] bg-[#22D3EE]/5"}`}
                                    title="Manual override"
                                  >
                                    {overrideDisplay(ovr)}
                                  </td>
                                );
                              }
                              const r = notesIndex.get(`${s.id}|${l.id}`);
                              const submitted = r && r.status === "submitted";
                              const zc = !submitted && notesOverdueSet.has(l.id);
                              const grace = !submitted && !zc && notesGraceSet.has(l.id);
                              return (
                                <td
                                  key={"n" + l.id}
                                  className={`px-3 py-2 text-center font-mono tabular-nums ${
                                    submitted ? "text-[#bff9bf]" : zc ? "text-destructive" : grace ? "text-destructive" : "text-stone-600"
                                  }`}
                                >
                                  {submitted ? `${r.score}/${r.total}` : zc ? `0/${r?.total || 5}` : grace ? "Missing" : "—"}
                                </td>
                              );
                            })}
                            {practiceLessonsInScope.map((l) => {
                              const ovr = overrideFor(s.id, `practice|${l.id}`);
                              if (ovr) {
                                const isEx = String(ovr.value || "").trim().toUpperCase() === "EX";
                                return (
                                  <td
                                    key={"p" + l.id}
                                    className={`px-3 py-2 text-center font-mono tabular-nums ${isEx ? "text-amber-400 italic bg-amber-500/5" : "text-[#22D3EE] bg-[#22D3EE]/5"}`}
                                    title="Manual override"
                                  >
                                    {overrideDisplay(ovr)}
                                  </td>
                                );
                              }
                              const r = practiceIndex.get(`${s.id}|${l.id}`);
                              const goal = practiceMaxByLesson.get(l.id) ?? 10;
                              const zc = !r && practiceOverdueSet.has(l.id);
                              const grace = !r && !zc && practiceGraceSet.has(l.id);
                              const underReview = r && r.status === "under_review";
                              const raw = r?.score ?? 0;
                              const capped = Math.min(raw, goal);
                              const gp = Math.min(100, Math.round((capped / goal) * 100));
                              const bonus = Math.max(0, raw - goal);
                              return (
                                <td
                                  key={"p" + l.id}
                                  title={bonus > 0 ? `${raw} raw pts · ${bonus} bonus` : grace ? "Missing — grace period" : undefined}
                                  className={`px-3 py-2 text-center font-mono tabular-nums ${
                                    underReview
                                      ? "text-amber-400 italic"
                                      : r
                                      ? gp >= 70
                                        ? "text-[#bff9bf]"
                                        : "text-destructive-foreground"
                                      : zc
                                      ? "text-destructive"
                                      : grace
                                      ? "text-amber-400"
                                      : "text-stone-600"
                                  }`}
                                >
                                  {underReview
                                    ? "Under review"
                                    : r
                                    ? bonus > 0
                                      ? `${goal}/${goal} (+${bonus})`
                                      : `${capped}/${goal}`
                                    : zc
                                    ? `0/${goal}`
                                    : grace
                                    ? "Missing"
                                    : "—"}
                                </td>
                              );
                            })}
                            {cfasInScope.map((c) => {
                              const ovr = overrideFor(s.id, `cfa|${c.id}`);
                              if (ovr) {
                                const isEx = String(ovr.value || "").trim().toUpperCase() === "EX";
                                return (
                                  <td
                                    key={"cfa" + c.id}
                                    className={`px-3 py-2 text-center font-mono tabular-nums ${isEx ? "text-amber-400 italic bg-amber-500/5" : "text-[#22D3EE] bg-[#22D3EE]/5"}`}
                                    title="Manual override"
                                  >
                                    {overrideDisplay(ovr)}
                                  </td>
                                );
                              }
                              const r = cfaIndex.get(`${s.id}|${c.id}`);
                              const total = cfaQuestionCount.get(c.id) || r?.total || 0;
                              const zc = !r && cfaOverdueSet.has(c.id);
                              const grace = !r && !zc && cfaGraceSet.has(c.id);
                              const p = r ? pct(r.score, r.total) : null;
                              return (
                                <td
                                  key={"cfa" + c.id}
                                  className={`px-3 py-2 text-center font-mono tabular-nums ${
                                    r ? (p >= 70 ? "text-[#bff9bf]" : "text-destructive-foreground")
                                      : zc ? "text-destructive" : grace ? "text-destructive" : "text-stone-600"
                                  }`}
                                  title={r ? `${r.score}/${r.total} · ${p}%` : grace ? "Missing — grace period" : undefined}
                                >
                                  {r ? `${r.score}/${r.total}` : zc ? (total ? `0/${total}` : "0") : grace ? "Missing" : "—"}
                                </td>
                              );
                            })}
                            {totalLessons.map((l) => {
                              const t = lessonTotalFor(s, l);
                              const tp =
                                t && t.possible
                                  ? Math.round((t.earned / t.possible) * 100)
                                  : null;
                              return (
                                <td
                                  key={"tot" + l.id}
                                  title={t ? `${t.earned}/${t.possible} · ${tp}%` : undefined}
                                  className={`px-3 py-2 text-center font-mono tabular-nums ${
                                    !t
                                      ? "text-stone-600"
                                      : tp >= 70
                                      ? "text-[#bff9bf]"
                                      : "text-destructive-foreground"
                                  }`}
                                >
                                  {t ? `${t.earned}/${t.possible}` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <TacExport
              students={students}
              period={period}
              columns={[
                ...exportColumns,
                ...totalLessons.map((l) => ({
                  key: `total|${l.id}`,
                  kind: "total",
                  name: lessonTotalLabel(l),
                  lessonId: l.id,
                })),
              ]}
              scoreFor={exportScoreFor}
            />

            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-base">
                  Quiz attempts · {nineWeeksLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-200/10 text-stone-400 font-mono text-xs">
                      <tr>
                        <th className="text-left px-4 py-3">Student</th>
                        <th className="text-center px-4 py-3">Per</th>
                        <th className="text-left px-4 py-3">Quiz</th>
                        <th className="text-center px-4 py-3">Score</th>
                        <th className="text-center px-4 py-3">%</th>
                        <th className="text-right px-4 py-3">Attempted</th>
                        <th className="text-center px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopedGraded.map((r) => (
                        <tr key={r.id} className="border-t border-stone-200/10">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {studentName(ownerOf(r))}
                          </td>
                          <td className="px-4 py-3 text-center text-stone-400">
                            {(students || []).find((x) => x.id === ownerOf(r))?.class_period ||
                              "—"}
                          </td>
                          <td className="px-4 py-3 text-stone-300">{lessonTitle(r.lesson_id)}</td>
                          <td className="px-4 py-3 text-center font-mono tabular-nums">
                            {r.score}/{r.total}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant="outline"
                              className={
                                pct(r.score, r.total) >= 70
                                  ? "border-[#39FF14]/40 text-[#bff9bf] bg-[#39FF14]/10"
                                  : "border-destructive/40 text-destructive-foreground bg-destructive/10"
                              }
                            >
                              {pct(r.score, r.total)}%
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-stone-400 tabular-nums">
                            {fmt(r.attempted_at)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="secondary">graded</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <OverallGradeCard
              label="my current grade"
              percent={studentOverall?.percent ?? null}
              subtitle={
                studentOverall
                  ? `live average across ${studentOverall.count} graded items · ${nineWeeksLabel}`
                  : `no graded items yet · ${nineWeeksLabel}`
              }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <label className="flex items-center gap-2 text-sm text-stone-300 font-mono">
                <CalendarClock className="w-4 h-4 text-[#22D3EE]" />
                Nine weeks
                <select
                  value={nineWeeks}
                  onChange={(e) => setNineWeeks(e.target.value)}
                  className={nineWeeksSelectClass}
                >
                  {NINE_WEEKS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-card text-foreground">
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> Print my grades
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-base flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-[#22D3EE]" />
                  My assignments · {nineWeeksLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-200/10 text-stone-400 font-mono text-xs">
                      <tr>
                        <th className="text-left px-4 py-3">Item</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-center px-4 py-3">Score / Grade</th>
                        <th className="text-center px-4 py-3">%</th>
                        <th className="text-right px-4 py-3">Date</th>
                        <th className="text-center px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradeablesFor(previewStudent || me)
                        .filter((g) => nineWeeks === "all" || g.period === Number(nineWeeks))
                        .map((g, i) => (
                          <tr key={i} className="border-t border-stone-200/10">
                            <td className="px-4 py-3 text-white">{g.name}</td>
                            <td className="px-4 py-3">
                              <span className={KIND_BUBBLE[g.kind]}>{g.kind}</span>
                            </td>
                            <td className="px-4 py-3 text-center font-mono tabular-nums">
                              {g.value}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {g.percent !== null && g.percent !== undefined ? (
                                <Badge
                                  variant="outline"
                                  className={
                                    g.percent >= 70
                                      ? "border-[#39FF14]/40 text-[#bff9bf] bg-[#39FF14]/10"
                                      : "border-destructive/40 text-destructive-foreground bg-destructive/10"
                                  }
                                >
                                  {g.percent}%
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-stone-400 tabular-nums">
                              {fmt(g.date)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={
                                  g.status === "missing"
                                    ? "text-destructive-foreground"
                                    : "text-stone-400"
                                }
                              >
                                {g.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-stone-400 font-mono">
                              {g.omitted ? "Omitted" : g.period ? periodName(g.period) : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <StudentGradesDialog
        student={selectedStudent}
        gradeables={selectedStudent ? gradeablesFor(selectedStudent) : []}
        open={!!selectedStudent}
        onOpenChange={(o) => !o && setSelectedStudent(null)}
        onSaved={onStudentSaved}
        overrideMap={overrideMap}
        onOverridesChanged={refreshOverrides}
      />

      <AssignmentSubmissionsDialog
        open={!!assignmentReview}
        assignment={assignmentReview}
        students={filteredStudents}
        subIndex={subIndex}
        onOpenChange={(o) => !o && setAssignmentReview(null)}
      />

      {/* Print-only: one page per student, scoped to the selected nine weeks */}
      <div className="hidden print:block">
        {(isAdminView ? filteredStudents : me ? [me] : []).map((s) => {
          const gs = gradeablesFor(s).filter((g) =>
            nineWeeks === "all" ? g.period !== "omitted" && g.period != null : g.period === Number(nineWeeks)
          );
          return (
            <div key={s.id} style={{ pageBreakAfter: "always" }}>
              <StudentPrintReport
                student={s}
                gradeables={gs}
                sectionLabel={nineWeeksLabel}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}