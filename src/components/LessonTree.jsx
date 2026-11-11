import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  ClipboardList,
  BookOpen,
  FolderOpen,
  FileText,
  PenLine,
  HelpCircle,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NEON_ACCENT, NEON_PILL } from "@/lib/neon-styles";
import { groupByPhase, phaseLabel } from "@/lib/lessonPhases";
import StandaloneAssignmentRow from "@/components/StandaloneAssignmentRow";
import { phasesWithPlans } from "@/lib/lessonPlans";
import { useMe, useNotesResponses, useQuizResponses, usePracticeResponses, usePacingDays, useAssignments } from "@/lib/entityQueries";
import { usePreview } from "@/lib/PreviewContext";
import { suggestedDueForLessons } from "@/lib/pacing";
import { startOfWeek } from "date-fns";

const PARTS = [
  { key: "lesson", label: "Lesson", icon: BookOpen },
  { key: "notes", label: "Notes", icon: FileText },
  { key: "practice", label: "Practice", icon: PenLine },
  { key: "quiz", label: "Quiz", icon: HelpCircle },
];

const fmt = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

// Red bubble shown for a part whose assignment exists, is past its due date,
// and hasn't been submitted — so a student who did the lesson but skipped the
// practice (or notes/quiz) sees at a glance that they missed it.
const MISSED_PILL =
  "inline-flex items-center gap-1.5 text-xs font-mono font-medium rounded-md px-2.5 py-1.5 text-destructive border border-destructive/50 bg-destructive/10";

// Quizzes are only "due"/missed once the week of their pacing date arrives —
// before that the quiz isn't expected of the student yet.
const quizRevealed = (dueDate) => {
  if (!dueDate) return true;
  const ws = startOfWeek(new Date(`${dueDate}T00:00:00`), { weekStartsOn: 1 });
  return new Date() >= ws;
};

function CheckMark({ date, label = "Viewed" }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[#39FF14] text-[10px] font-mono"
      title={date ? `${label} ${fmt(date)}` : label}
    >
      <CheckCircle2 className="w-3 h-3" />
      {date && <span className="tabular-nums">{fmt(date)}</span>}
    </span>
  );
}

function LessonRow({ lesson, checkMap, submittedMap, dueByLesson }) {
  const lessonDone = checkMap[`${lesson.id}:lesson`];
  const now = new Date();
  const pastDue = (due) => !!due && new Date(`${due}T23:59:59`) < now;
  const lessonDue = dueByLesson?.get(lesson.id)?.date || null;
  // Due date per part — only when the assignment actually exists for the
  // lesson (so a lesson with no notes/practice/quiz never shows a false red).
  const dueFor = (key) => {
    if (key === "notes") return lesson.notes_blanks_json ? lessonDue : null;
    if (key === "practice")
      return lesson.practice_json
        ? lesson.practice_due_date || lessonDue
        : null;
    if (key === "quiz")
      return lesson.quiz_file_url || lesson.quiz_json
        ? quizRevealed(lessonDue)
          ? lessonDue
          : null
        : null;
    return null;
  };
  // "lesson" part = checked the moment the student opens the lesson (viewed).
  // notes/practice/quiz = checked only when the student has actually submitted
  // that assignment (not just opened it).
  const doneFor = (key) =>
    key === "lesson"
      ? lessonDone
        ? { date: lessonDone.created_date, label: "Viewed" }
        : null
      : submittedMap[`${lesson.id}:${key}`];
  return (
    <div className="rounded-lg border border-stone-200/10 bg-stone-100/5 px-3 py-2">
      <div className="flex items-center gap-2 font-mono text-sm text-foreground">
        <BookOpen className={cn("w-4 h-4 shrink-0", NEON_ACCENT)} />
        <span className="text-stone-500 text-xs tabular-nums">
          L{String(lesson._num).padStart(2, "0")}
        </span>
        <span className="truncate">{lesson._name}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {PARTS.map(({ key, label, icon: Icon }) => {
          const to =
            key === "quiz"
              ? `/quiz?lesson_id=${lesson.id}&from=lessons`
              : `/lessons/${lesson.id}?part=${key}`;
          const done = doneFor(key);
          const missed = key !== "lesson" && !done && pastDue(dueFor(key));
          return (
            <div key={key} className="flex items-center gap-1">
              <Link
                to={to}
                className={
                  done
                    ? "inline-flex items-center gap-1.5 text-xs font-mono font-medium rounded-md px-2.5 py-1.5 text-[#39FF14] border border-[#39FF14]/50 bg-[#39FF14]/10"
                    : missed
                    ? MISSED_PILL
                    : NEON_PILL
                }
                title={missed ? "Missed — past due" : undefined}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </Link>
              {done && <CheckMark date={done.date} label={done.label} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LessonTree({
  lessons = [],
  defaultOpen = [1],
  showIntro = true,
  emptyText = "No lessons published yet.",
  checkins,
}) {
  const [open, setOpen] = useState(() =>
    Object.fromEntries(defaultOpen.map((n) => [n, true]))
  );
  const { phases, intro } = useMemo(() => groupByPhase(lessons), [lessons]);
  const { data: me } = useMe();
  const { previewStudent } = usePreview();
  // Lesson Plans are a teacher-only resource — hidden from students (and from
  // admins while they're previewing a student).
  const showLessonPlans = !previewStudent && me?.role === "admin";
  const sorted = [...phases.keys()].sort((a, b) => a - b);
  const toggle = (n) => setOpen((p) => ({ ...p, [n]: !p[n] }));

  // lesson_id:part -> checkin record, so each opened part shows a checkmark.
  const checkMap = useMemo(() => {
    const m = {};
    (checkins || []).forEach((c) => {
      m[`${c.lesson_id}:${c.part || "lesson"}`] = c;
    });
    return m;
  }, [checkins]);

  // Pacing-derived due dates per lesson, used to mark a part's bubble red when
  // its assignment is past due but the student hasn't submitted it.
  const { data: pacing = [] } = usePacingDays();
  const dueByLesson = useMemo(
    () => suggestedDueForLessons(lessons, pacing),
    [lessons, pacing]
  );

  // Standalone assignments (no lesson_id) placed between phases via phase_after.
  const { data: assignments = [] } = useAssignments();
  const standaloneAfter = (n) =>
    (assignments || []).filter(
      (a) => a.published && !a.lesson_id && a.phase_after === n
    );

  // Student's submitted work per lesson. Notes / practice / quiz only show a
  // checkmark once the student actually turned the assignment in — viewing
  // alone doesn't count for those parts. Lesson part still uses checkMap above.
  const targetUserId = (previewStudent || me)?.id;
  const { data: notesResponses = [] } = useNotesResponses(targetUserId);
  const { data: quizResponses = [] } = useQuizResponses(targetUserId);
  const { data: practiceResponses = [] } = usePracticeResponses(targetUserId);
  const submittedMap = useMemo(() => {
    const m = {};
    for (const r of notesResponses) {
      if (r.status === "submitted" && r.lesson_id) {
        m[`${r.lesson_id}:notes`] = { date: r.submitted_at, label: "Submitted" };
      }
    }
    for (const r of practiceResponses) {
      if (r.submitted_at && r.lesson_id) {
        const key = `${r.lesson_id}:practice`;
        const prev = m[key];
        if (!prev || new Date(r.submitted_at) > new Date(prev.date)) {
          m[key] = { date: r.submitted_at, label: "Submitted" };
        }
      }
    }
    for (const r of quizResponses) {
      if ((r.status === "graded" || r.status === "returned") && r.lesson_id) {
        m[`${r.lesson_id}:quiz`] = { date: r.attempted_at, label: "Submitted" };
      }
    }
    return m;
  }, [notesResponses, quizResponses, practiceResponses]);

  if (!lessons.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-stone-400">
          {emptyText}
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {showIntro && intro.length > 0 && (
        <div className="mb-6">
          <h2 className="font-mono text-xs text-stone-500 mb-2">
            // getting_started
          </h2>
          <div className="space-y-1.5">
            {intro.map((l) => {
              const done = checkMap[`${l.id}:lesson`];
              return (
                <Link
                  key={l.id}
                  to={`/lessons/${l.id}`}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-secondary/60 hover:text-[#22D3EE] transition-colors"
                >
                  <BookOpen className={cn("w-4 h-4 shrink-0", NEON_ACCENT)} />
                  <span className="truncate group-hover:text-[#22D3EE] flex-1">
                    {l.title}
                  </span>
                  {done && <CheckMark date={done.created_date} />}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((n) => {
          const grp = phases.get(n);
          const isOpen = !!open[n];
          const count = grp.lessons.length + (grp.overview ? 1 : 0);
          return (
            <React.Fragment key={n}>
            <div
              className="rounded-xl border border-stone-200/15 bg-card overflow-hidden"
            >
              <button
                onClick={() => toggle(n)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
              >
                <ChevronRight
                  className={cn(
                    "w-4 h-4 text-stone-500 transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
                <FolderOpen className={cn("w-4 h-4", NEON_ACCENT)} />
                <span className="font-mono text-sm font-semibold text-foreground">
                  Phase {n}
                  {grp.overview && (
                    <span className="text-stone-400 font-normal">
                      {" — "}
                      {phaseLabel(grp.overview)}
                    </span>
                  )}
                </span>
                <Badge variant="secondary" className="ml-auto font-mono text-xs">
                  {count} {count === 1 ? "lesson" : "lessons"}
                </Badge>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pl-4 pr-3 py-3 space-y-2 border-t border-stone-200/10">
                      {showLessonPlans && phasesWithPlans().has(n) && (
                        <Link
                          to={`/lesson-plan?phase=${n}`}
                          className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-secondary/60 hover:text-[#22D3EE] transition-colors"
                        >
                          <ClipboardList className={cn("w-4 h-4 shrink-0", NEON_ACCENT)} />
                          <span className="truncate group-hover:text-[#22D3EE] flex-1">
                            Lesson Plan
                          </span>
                        </Link>
                      )}
                      {grp.overview && (() => {
                        const done = checkMap[`${grp.overview.id}:lesson`];
                        return (
                          <Link
                            to={`/lessons/${grp.overview.id}`}
                            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-secondary/60 hover:text-[#22D3EE] transition-colors"
                          >
                            <FileText
                              className={cn("w-4 h-4 shrink-0", NEON_ACCENT)}
                            />
                            <span className="truncate group-hover:text-[#22D3EE] flex-1">
                              Phase overview
                            </span>
                            {done && <CheckMark date={done.created_date} />}
                          </Link>
                        );
                      })()}
                      {grp.lessons.map((l) => (
                        <LessonRow
                          key={l.id}
                          lesson={l}
                          checkMap={checkMap}
                          submittedMap={submittedMap}
                          dueByLesson={dueByLesson}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {standaloneAfter(n).length > 0 && (
              <div className="space-y-2 mt-1">
                {standaloneAfter(n).map((a) => (
                  <StandaloneAssignmentRow key={a.id} assignment={a} />
                ))}
              </div>
            )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}