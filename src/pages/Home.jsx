import { useQueryClient } from "@tanstack/react-query";
import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar, Loader2, CheckCircle2, Clock, AlertCircle, History, Compass } from "lucide-react";
import { format, parseISO, isPast } from "date-fns";
import StudentOnboarding from "@/components/StudentOnboarding";
import OverdueAssignmentsDialog from "@/components/OverdueAssignmentsDialog";
import PacingGuide from "@/components/PacingGuide";
import WhereWeAre from "@/components/WhereWeAre";
import DoNowBanner from "@/components/DoNowBanner";
import TeacherDoNowCard from "@/components/TeacherDoNowCard";
import LessonTree from "@/components/LessonTree";
import CodeHeader from "@/components/CodeHeader";
import { NEON_CARD, SECTION_HEADING, NEON_ACCENT, PROMPT_LINK } from "@/lib/neon-styles";
import { useLessons, useAssignments, useCheckins, useMe, useSubmissions } from "@/lib/entityQueries";
import { usePreview } from "@/lib/PreviewContext";

const PART_LABEL = { lesson: "Lesson", notes: "Notes", practice: "Practice", quiz: "Quiz" };
const fmt = (d) =>
  d ? new Date(d).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export default function Home() {
  const queryClient = useQueryClient();
  const { previewStudent } = usePreview();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: lessons = [], isLoading: loadingLessons } = useLessons();
  const { data: assignments = [], isLoading: loadingAssignments } = useAssignments();
  const { data: checkins = [], isLoading: loadingCheckins } = useCheckins();
  const target = previewStudent || me;
  const { data: submissions = [], isLoading: loadingSubs } = useSubmissions(target?.id);
  const [profile, setProfile] = useState(null);
  const user = target ? { ...target, ...(profile || {}) } : target;

  // Refresh submissions live when work changes (either side).
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
    };
    ["rt:submission", "rt:quizresponse", "rt:assignment"].forEach((e) =>
      window.addEventListener(e, handler)
    );
    return () =>
      ["rt:submission", "rt:quizresponse", "rt:assignment"].forEach((e) =>
        window.removeEventListener(e, handler)
      );
  }, [queryClient]);

  const lessonTitle = (id) =>
    lessons.find((l) => l.id === id)?.title || "Lesson";

  const recentActivity = useMemo(
    () =>
      [...(checkins || [])]
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
        .slice(0, 6),
    [checkins]
  );

  // Coming up: unsubmitted assignments, soonest due first.
  const comingUp = useMemo(() => {
    const subFor = (id) => submissions.find((s) => s.assignment_id === id);
    return [...assignments]
      .filter((a) => a.published && a.due_date)
      .filter((a) => !subFor(a.id)?.status || subFor(a.id)?.status !== "graded")
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
      .slice(0, 5);
  }, [assignments, submissions]);

  const subFor = (assignmentId) =>
    submissions.find((s) => s.assignment_id === assignmentId);

  const statusBadge = (assignment) => {
    const sub = subFor(assignment.id);
    if (sub?.status === "graded") {
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3 mr-1" />Graded</Badge>;
    }
    if (sub) {
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><Clock className="w-3 h-3 mr-1" />Submitted</Badge>;
    }
    if (assignment.due_date && isPast(parseISO(assignment.due_date))) {
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Overdue</Badge>;
    }
    return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />To do</Badge>;
  };

  const loading = loadingLessons || loadingAssignments || meLoading || loadingCheckins || loadingSubs;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  const needsOnboarding = !previewStudent && user && user.role !== "admin" && !user.onboarded;
  const profileChip = user?.grade && user?.class_period
    ? `Grade ${user.grade} · Period ${user.class_period}`
    : null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <CodeHeader
        chip={previewStudent ? "preview.mode()" : "welcome.back()"}
        title={`Hello, ${user?.full_name?.split(" ")[0] || "Student"}`}
        subtitle={
          previewStudent
            ? "Viewing this student's classroom exactly as they see it."
            : "Here's what's happening in your classroom today."
        }
        tags={profileChip ? [{ label: profileChip, color: "text-[#39FF14] border-[#39FF14]/30 bg-[#39FF14]/10" }] : []}
      />

      {!previewStudent && me?.role === "admin" ? <TeacherDoNowCard /> : <DoNowBanner />}

      <div className="grid lg:grid-cols-3 gap-6 max-w-full">
        {/* Modules — the phase/lesson tree, Canvas-style collapsible modules. */}
        <section className="lg:col-span-2 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className={SECTION_HEADING}>
              <BookOpen className={`w-4 h-4 ${NEON_ACCENT}`} /> <span className="text-[#39FF14]">{"$ "}</span>modules
            </h2>
            <Link to="/lessons" className={PROMPT_LINK}>{"view_all() →"}</Link>
          </div>
          <LessonTree lessons={lessons} defaultOpen={[1]} checkins={checkins} />
        </section>

        {/* Right rail: where we are + coming up + recent activity. */}
        <aside className="lg:col-span-1 space-y-6 min-w-0">
          <section>
            <h2 className={`${SECTION_HEADING} mb-4`}>
              <Compass className={`w-4 h-4 ${NEON_ACCENT}`} /> <span className="text-[#39FF14]">{"$ "}</span>where_we_are
            </h2>
            <WhereWeAre />
          </section>

          <section>
            <h2 className={`${SECTION_HEADING} mb-4`}>
              <Calendar className={`w-4 h-4 ${NEON_ACCENT}`} /> <span className="text-[#39FF14]">{"$ "}</span>coming_up
            </h2>
            {comingUp.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-stone-400 text-sm">All caught up.</CardContent></Card>
            ) : (
              <div className="space-y-2.5">
                {comingUp.map((a) => (
                  <Link key={a.id} to={`/assignments/${a.id}`}>
                    <Card className={`${NEON_CARD} hover:scale-[1.01] transition-transform`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-sm text-foreground truncate">{a.title}</h3>
                          {statusBadge(a)}
                        </div>
                        {a.due_date && (
                          <div className="flex items-center gap-1.5 text-xs text-stone-500">
                            <Calendar className="w-3 h-3" /> Due {format(parseISO(a.due_date), "MMM d, yyyy")}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className={`${SECTION_HEADING} mb-4`}>
              <History className={`w-4 h-4 ${NEON_ACCENT}`} /> <span className="text-[#39FF14]">{"$ "}</span>recent_activity
            </h2>
            {recentActivity.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-stone-400 text-sm">No activity yet.</CardContent></Card>
            ) : (
              <Card><CardContent className="p-0 divide-y divide-stone-100">
                {recentActivity.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-foreground truncate flex-1">{lessonTitle(c.lesson_id)}</span>
                    <Badge variant="outline" className="text-[10px]">{PART_LABEL[c.part] || c.part}</Badge>
                    <span className="text-[10px] text-stone-400 tabular-nums w-20 text-right">{fmt(c.created_date)}</span>
                  </div>
                ))}
              </CardContent></Card>
            )}
          </section>
        </aside>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className={SECTION_HEADING}>
            <Calendar className={`w-4 h-4 ${NEON_ACCENT}`} /> <span className="text-[#39FF14]">{"$ "}</span>pacing_guide
          </h2>
        </div>
        <PacingGuide />
      </section>

      {needsOnboarding && (
        <StudentOnboarding onDone={(data) => setProfile({ ...profile, ...data })} />
      )}

      {(previewStudent || (user && user.role !== "admin")) && (
        <OverdueAssignmentsDialog
          student={previewStudent || user}
          assignments={assignments}
          submissions={submissions}
        />
      )}
    </div>
  );
}