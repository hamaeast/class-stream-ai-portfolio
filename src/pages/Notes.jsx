import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, NotebookPen, AlertTriangle, CheckCircle2, Clock, CalendarClock } from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import { Card, CardContent } from "@/components/ui/card";
import { useLessons } from "@/lib/entityQueries";
import { base44 } from "@/api/base44Client";
import { ownedBy } from "@/lib/ownership";
import { usePreview } from "@/lib/PreviewContext";
import { parseLesson } from "@/lib/lessonPhases";
import BuildAllNotes from "@/components/BuildAllNotes";
import UpdateAllNotes from "@/components/UpdateAllNotes";
import { suggestedDueForLessons } from "@/lib/pacing";
import { NEON_CARD, NEON_ACCENT } from "@/lib/neon-styles";
import { cn } from "@/lib/utils";

// End of the quiz's due day, in local time — once "now" passes this, the
// notes are past due and unsubmitted ones are a zero until turned in.
const endOfDay = (iso) => new Date(`${iso}T23:59:59`);
const fmtDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

const topicOf = (l) => {
  const p = parseLesson(l);
  return p && !p.isOverview ? p.name : l.title;
};

// Student-facing list of every lesson's guided notes worksheet. Notes past
// their lesson's quiz date that haven't been turned in are highlighted red
// with a warning — turn them in for the 5-point grade, or they stay a zero.
export default function Notes() {
  const { data: lessons = [], isLoading } = useLessons();
  const { previewStudent } = usePreview();
  const [pacing, setPacing] = useState([]);
  const [responses, setResponses] = useState([]);
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const pd = await base44.entities.PacingDay.list();
        if (active) setPacing(pd || []);
      } catch {}
      let v = previewStudent;
      try {
        v = v || (await base44.auth.me());
      } catch {}
      if (!active || !v) {
        if (active) setViewer(v || null);
        return;
      }
      setViewer(v);
      try {
        const r = await base44.entities.NotesResponse.filter(ownedBy(v.id));
        if (active) setResponses(r || []);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [previewStudent?.id]);

  const isAdmin = !previewStudent && viewer?.role === "admin";

  // Every real phase lesson gets a notes worksheet — show them all (in
  // curriculum order) even before the worksheet has been cached; opening one
  // triggers an on-demand build.
  const notesLessons = useMemo(
    () =>
      (lessons || []).filter((l) => {
        const p = parseLesson(l);
        return p && !p.isOverview;
      }),
    [lessons]
  );
  const dueByLesson = useMemo(
    () => suggestedDueForLessons(notesLessons, pacing),
    [notesLessons, pacing]
  );
  const respMap = useMemo(() => {
    const m = new Map();
    (responses || []).forEach((r) => m.set(r.lesson_id, r));
    return m;
  }, [responses]);

  // status for a notes lesson: submitted | in_progress | overdue | open
  const stateOf = (l) => {
    const r = respMap.get(l.id);
    if (r && r.status === "submitted") return { key: "submitted", r };
    const due = dueByLesson.get(l.id)?.date || null;
    const overdue = due ? endOfDay(due) < new Date() : false;
    if (overdue) return { key: "overdue", due, r };
    return { key: r ? "in_progress" : "open", due, r };
  };

  const overdueCount = useMemo(
    () => notesLessons.filter((l) => stateOf(l).key === "overdue").length,
    [notesLessons, dueByLesson, respMap]
  );

  // Show notes in curriculum order (phase → lesson number; intro/orientation
  // lessons last). Overdue items are still flagged with a badge + the banner.
  const sortedNotes = useMemo(() => {
    const orderNo = (l) => {
      const p = parseLesson(l);
      if (!p) return 99999 + (l.order || 0);
      return p.phase * 1000 + (p.num || 0);
    };
    return [...notesLessons].sort((a, b) => orderNo(a) - orderNo(b));
  }, [notesLessons]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  const RowInner = ({ l }) => {
    const st = stateOf(l);
    const due = st.due || dueByLesson.get(l.id)?.date;
    const to = `/lessons/${l.id}?part=notes`;
    const cardClass = cn(
      NEON_CARD,
      "flex items-center justify-between gap-4 p-4 transition-colors",
      st.key === "overdue" && "border-destructive/60 bg-destructive/5 hover:border-destructive"
    );

    let badge = null;
    if (st.key === "submitted")
      badge = (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[#39FF14]/40 bg-[#39FF14]/10 px-2 py-0.5 text-[10px] font-mono text-[#39FF14]">
          <CheckCircle2 className="w-3 h-3" /> 5/5
        </span>
      );
    else if (st.key === "overdue")
      badge = (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-0.5 text-[10px] font-mono text-destructive-foreground">
          0/5 · past due
        </span>
      );
    else if (st.key === "in_progress")
      badge = (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-mono text-amber-300">
          <Clock className="w-3 h-3" /> In progress
        </span>
      );

    return (
      <Link key={l.id} to={to} className={cardClass}>
        <div className="flex items-center gap-3 min-w-0">
          <NotebookPen className={cn("w-4 h-4 shrink-0", st.key === "overdue" ? "text-destructive" : NEON_ACCENT)} />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">{topicOf(l)}</h3>
            <p className="text-xs font-mono text-stone-500 truncate">
              from <span className="text-[#22D3EE]">{l.title}</span>
              {due && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <CalendarClock className="w-3 h-3" /> due {fmtDate(due)}
                </span>
              )}
            </p>
            {st.key === "overdue" && (
              <p className="mt-1 text-xs font-mono text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Turn this in for grading or you will not receive points.
              </p>
            )}
          </div>
        </div>
        {badge}
      </Link>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <CodeHeader
        chip="notes.list()"
        title="Notes"
        subtitle="Every lesson's guided notes worksheet — submit for the 5-point grade."
      />

      {!isAdmin && overdueCount > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive-foreground">
              {overdueCount} note{overdueCount === 1 ? "" : "s"} past the quiz date — not turned in
            </p>
            <p className="text-xs text-destructive-foreground/80 font-mono mt-0.5">
              Turn them in for grading or you'll receive 0 points. Tap a highlighted row to open it.
            </p>
          </div>
          <span className="ml-auto shrink-0 inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-destructive text-destructive-foreground text-sm font-bold">
            {overdueCount}
          </span>
        </div>
      )}

      {isAdmin && <BuildAllNotes lessons={lessons} />}
      {isAdmin && <UpdateAllNotes lessons={lessons} />}

      {sortedNotes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-stone-400">
            No guided notes yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedNotes.map((l) => (
            <RowInner key={l.id} l={l} />
          ))}
        </div>
      )}
    </div>
  );
}