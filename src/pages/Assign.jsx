import React, { useEffect, useMemo, useState } from "react";
import { PACING_GUIDE_URL, DISTRICT_SHORT_NAME, SCHOOL_YEAR_LABEL } from "@/lib/schoolConfig";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw } from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import TeacherAssignConsole from "@/components/TeacherAssignConsole";
import { suggestedDueForLessons, resequenceFutureAssignments } from "@/lib/pacing";
import { parseLesson } from "@/lib/lessonPhases";

// Admin-only "Assign" tab: suggested due dates from the imported district pacing
// calendar, with a per-assignment "Assign" toggle controlling student release.
export default function Assign() {
  const [user, setUser] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [pacing, setPacing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [practicesBusy, setPracticesBusy] = useState(false);
  const { toast } = useToast();

  const reload = async () => {
    const [asg, pd, ls] = await Promise.all([
      base44.entities.Assignment.list(),
      base44.entities.PacingDay.list(),
      base44.entities.Lesson.list("order"),
    ]);
    setAssignments(asg || []);
    setPacing(pd || []);
    setLessons(ls || []);
  };

  const refreshPacing = async () => {
    setRefreshing(true);
    try {
      const res = await base44.functions.invoke("refreshPacingGuide", {});
      // Re-pull lessons/assignments/pacing and re-sequence every
      // already-scheduled future assignment to its lesson's new pacing date.
      const [ls, asg, pd] = await Promise.all([
        base44.entities.Lesson.list("order"),
        base44.entities.Assignment.list(),
        base44.entities.PacingDay.list(),
      ]);
      const real = (ls || []).filter((l) => { const p = parseLesson(l); return p && !p.isOverview; });
      const changes = resequenceFutureAssignments(asg || [], real, pd || []);
      if (changes.length) await base44.entities.Assignment.bulkUpdate(changes);
      setLessons(ls || []);
      setAssignments(asg || []);
      setPacing(pd || []);
      const n = changes.length;
      toast({ title: `Pacing refreshed — ${res.data?.updated ?? 0} days synced${n ? ` · ${n} due date${n > 1 ? "s" : ""} re-sequenced` : ""}` });
    } catch (e) {
      toast({
        title: "Refresh failed",
        description: e?.message || "Could not fetch pacing dates",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Build + auto-connect every lesson's practice from Google Drive in one pass
  // (no per-lesson pasting): the function scans the Drive folder, matches docs
  // to lessons by name, and caches practice_json + the answer key.
  const buildAllPractices = async () => {
    setPracticesBusy(true);
    try {
      const res = await base44.functions.invoke("buildAllPractices", {});
      const d = res?.data || res || {};
      const ls = await base44.entities.Lesson.list("order");
      setLessons(ls || []);
      toast({
        title: `Practices built: ${d.built ?? 0}` +
          ` · skipped ${d.skipped ?? 0}` +
          (d.failed ? ` · ${d.failed} failed` : ""),
      });
    } catch (e) {
      const msg =
        e?.data?.error || e?.error || e?.response?.data?.error ||
        e?.message || "Build failed";
      toast({ title: msg, variant: "destructive" });
      console.error("[buildAllPractices]", e);
    } finally {
      setPracticesBusy(false);
    }
  };

  // Keep the console live: when assignments/pacing change elsewhere, re-sync.
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener("rt:assignment", handler);
    window.addEventListener("rt:pacingday", handler);
    return () => {
      window.removeEventListener("rt:assignment", handler);
      window.removeEventListener("rt:pacingday", handler);
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!active) return;
        setUser(me);
        if (me?.role === "admin") {
          const [ls, asg, pd] = await Promise.all([
            base44.entities.Lesson.list("order"),
            base44.entities.Assignment.list(),
            base44.entities.PacingDay.list(),
          ]);
          if (!active) return;
          setLessons(ls || []);
          setAssignments(asg || []);
          setPacing(pd || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Exclude course-intro and phase-overview lessons from pacing/assignment
  // management — no quizzes or assignments should be tied to those.
  const realLessons = useMemo(
    () => lessons.filter((l) => { const p = parseLesson(l); return p && !p.isOverview; }),
    [lessons]
  );
  const pacingByLesson = useMemo(
    () => suggestedDueForLessons(realLessons, pacing),
    [realLessons, pacing]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center text-stone-400">
        Teachers only.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <CodeHeader
        chip="assign.schedule()"
        title="Assign"
        subtitle="Suggested due dates from the district pacing calendar. Flip Assign to release an assignment to students (due time is midnight)."
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-xs font-mono text-stone-500 truncate">
          source:{" "}
          <a
            className="text-[#22D3EE] hover:underline"
            href={PACING_GUIDE_URL || undefined}
            target="_blank"
            rel="noreferrer"
          >
            Pacing Guide (Intro to CS) — {DISTRICT_SHORT_NAME} {SCHOOL_YEAR_LABEL}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshPacing} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh pacing dates"}
          </Button>
          <Button variant="outline" size="sm" onClick={buildAllPractices} disabled={practicesBusy}>
            <Loader2 className={`w-4 h-4 mr-1 ${practicesBusy ? "animate-spin" : ""}`} />
            {practicesBusy ? "Building…" : "Build all practices"}
          </Button>
        </div>
      </div>
      {pacing.length === 0 && (
        <p className="text-sm text-amber-400 font-mono mb-4">
          // pacing calendar not imported yet — suggested dates unavailable
        </p>
      )}
      <TeacherAssignConsole
        assignments={assignments}
        lessons={realLessons}
        pacingByLesson={pacingByLesson}
        onChanged={reload}
      />
    </div>
  );
}