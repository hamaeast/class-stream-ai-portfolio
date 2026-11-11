import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { NEON_ACCENT } from "@/lib/neon-styles";
import { plansForPhase } from "@/lib/lessonPlans";
import LessonPlanDoc from "@/components/LessonPlanDoc";

// Separate "Lesson Plan" area — NOT the lesson material. Each entry is a standalone
// interactive plan doc, split by lesson title and shown here under its phase.
export default function LessonPlans() {
  const [params] = useSearchParams();
  const phase = params.get("phase");
  const docs = phase ? plansForPhase(phase) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-[#22D3EE] font-mono"
        >
          <ArrowLeft className="w-4 h-4" /> dashboard
        </Link>
        <span className="text-stone-600">/</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-mono text-foreground">
          <ClipboardList className={NEON_ACCENT} />
          {phase ? `Phase ${phase} Lesson Plans` : "Lesson Plans"}
        </span>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-stone-200/15 bg-card p-10 text-center text-stone-400 text-sm">
          No lesson plans available for this phase yet.
        </div>
      ) : (
        <div className="space-y-6">
          {docs.map((d, i) => (
            <div
              key={`${d.phase}-${d.title}`}
              className="rounded-xl overflow-hidden border border-stone-200/15 bg-white shadow-lg"
            >
              <header className="flex items-center gap-2 px-4 py-3 border-b border-stone-200/20 bg-stone-50">
                <span className="font-mono text-xs text-stone-400 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <ClipboardList className={`w-4 h-4 ${NEON_ACCENT}`} />
                <h2 className="font-semibold text-sm text-foreground">{d.title}</h2>
              </header>
              <LessonPlanDoc fileId={d.fileId} title={d.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}