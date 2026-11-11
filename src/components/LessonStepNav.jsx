import React from "react";
import { BookOpen, NotebookPen, Pencil, ListChecks, Lock, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Ordered lesson parts a student works through. Order matters: each step
// unlocks only after the previous one has been viewed.
export const STEPS = ["lesson", "notes", "practice", "quiz"];

export const STEP_META = {
  lesson: { label: "Lesson", icon: BookOpen },
  notes: { label: "Notes", icon: NotebookPen },
  practice: { label: "Practice", icon: Pencil },
  quiz: { label: "Quiz", icon: ListChecks },
};

export default function LessonStepNav({ currentKey, unlockedKeys, doneKeys, onNavigate }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2">
      {STEPS.map((key, i) => {
        const meta = STEP_META[key];
        const Icon = meta.icon;
        const active = key === currentKey;
        const unlocked = unlockedKeys.includes(key);
        const done = doneKeys.includes(key);
        return (
          <div key={key} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!unlocked}
              onClick={() => unlocked && onNavigate(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-mono transition",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : unlocked
                  ? "border-border bg-card text-foreground hover:border-primary/50"
                  : "border-border/50 bg-muted/30 text-muted-foreground cursor-not-allowed"
              )}
            >
              {done && !active ? (
                <Check className="w-4 h-4 text-[#39FF14]" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
              <span>{meta.label}</span>
              {!unlocked && <Lock className="w-3.5 h-3.5 opacity-60" />}
            </button>
            {i < STEPS.length - 1 && (
              <span className="text-muted-foreground/40 text-xs">→</span>
            )}
          </div>
        );
      })}
    </nav>
  );
}