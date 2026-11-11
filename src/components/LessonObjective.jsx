import React, { useMemo } from "react";
import { Target, Loader2 } from "lucide-react";
import { usePhaseBookHtml } from "@/lib/entityQueries";
import { LESSON_PLAN_DOCS } from "@/lib/lessonPlans";
import { parseLesson } from "@/lib/lessonPhases";
import { NEON_ACCENT } from "@/lib/neon-styles";

// Match this lesson to its interactive lesson-plan doc (same phase + name).
// Overview lessons ("Phase N — Output") match the doc titled "Output".
function planDocForLesson(lesson) {
  const p = parseLesson(lesson);
  if (!p) return null;
  const name = p.isOverview
    ? lesson.title.replace(/^Phase\s*\d+\s*[—–-]\s*/, "").trim()
    : p.name;
  return (
    LESSON_PLAN_DOCS.find(
      (d) => d.phase === p.phase && d.title.trim() === name
    ) || null
  );
}

// Pull the "I Can" statements out of the lesson plan HTML — the learning
// objective that lives below the overview in the plan doc.
function extractCanStatements(html) {
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const items = doc.querySelectorAll(".can-statements ul li");
    if (!items.length) return [];
    return Array.from(items)
      .map((li) => li.textContent.trim())
      .filter(Boolean)
      .map((t) => t.replace(/^["']|["']$/g, ""));
  } catch {
    return [];
  }
}

export default function LessonObjective({ lesson }) {
  const doc = useMemo(
    () => (lesson ? planDocForLesson(lesson) : null),
    [lesson?.id, lesson?.title]
  );
  const { data: html, isLoading } = usePhaseBookHtml(doc?.fileId);
  const statements = useMemo(() => extractCanStatements(html), [html]);

  if (!doc) return null;
  if (isLoading) {
    return (
      <div className="mb-6 flex items-center gap-2 text-xs font-mono text-stone-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> loading_objective()…
      </div>
    );
  }
  if (statements.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Target className={`w-4 h-4 ${NEON_ACCENT}`} />
        <h2 className="font-display font-semibold text-sm text-foreground">
          Learning Objective
        </h2>
      </div>
      <ul className="space-y-1.5 text-sm text-foreground font-body">
        {statements.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-[#39FF14] font-mono mt-0.5 shrink-0">›</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}