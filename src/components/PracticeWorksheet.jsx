import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

const TIERS = [
  { key: "practice", label: "Practice", sub: "1 pt each" },
  { key: "apply", label: "Apply", sub: "3 pts each" },
  { key: "challenge", label: "Challenge", sub: "5 pts each" },
];

// The fillable practice: questions grouped by tier, a textarea per question,
// and a running tally of the points worth of questions the student has answered.
// Submit unlocks once that tally reaches the doc's point goal.
export default function PracticeWorksheet({
  practice,
  answers,
  onChange,
  onSubmit,
  submitting,
  submitLabel = "Submit for grading",
  onSave,
  draftSavedAt,
}) {
  const goal = Math.max(10, practice.point_goal || 10);
  const byTier = (tier) => (practice.questions || []).filter((q) => q.tier === tier);
  const selectedPoints = (practice.questions || []).reduce(
    (sum, q) => sum + ((answers[q.id] || "").trim() ? q.points : 0),
    0
  );
  const canSubmit = selectedPoints >= goal && !submitting;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-stone-400">
        <span>
          Point goal: <span className="text-foreground">{goal}</span>
        </span>
        <span>·</span>
        <span className={selectedPoints >= goal ? "text-[#39FF14]" : "text-[#FF2BD6]"}>
          {selectedPoints} pts selected
        </span>
        <span className="text-stone-500">
          (answer extra questions so a miss won't cost you)
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          {draftSavedAt ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
              <span className="text-[#39FF14]">
                Auto-saved{" "}
                {new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
              Auto-save on
            </>
          )}
        </span>
      </div>

      {TIERS.map((t) => {
        const qs = byTier(t.key);
        if (!qs.length) return null;
        return (
          <div
            key={t.key}
            className="rounded-xl border border-stone-200/15 bg-card overflow-hidden"
          >
            <div className="px-4 py-2 bg-stone-200/10 flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">{t.label}</span>
              <span className="text-xs text-stone-500 font-mono">{t.sub}</span>
            </div>
            <div className="divide-y divide-stone-200/10">
              {qs.map((q) => (
                <div key={q.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className="text-[10px] font-mono text-stone-400">
                      {q.label}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {q.points} pts
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground mb-2 whitespace-pre-wrap">{q.prompt}</p>
                  <Textarea
                    value={answers[q.id] || ""}
                    onChange={(e) => onChange(q.id, e.target.value)}
                    placeholder="Write your answer…"
                    rows={3}
                    disabled={submitting}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={onSubmit} disabled={!canSubmit} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          {submitting ? "Grading…" : submitLabel}
        </Button>
        {onSave && (
          <Button
            onClick={onSave}
            variant="outline"
            disabled={!!submitting}
            className="w-full sm:w-auto"
          >
            Save
          </Button>
        )}
        <span className="text-xs font-mono text-stone-500 inline-flex items-center gap-1">
          {draftSavedAt ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
              <span className="text-[#39FF14]">
                Auto-saved{" "}
                {new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
              Auto-save on
            </>
          )}
        </span>
      </div>
      {!canSubmit && !submitting && (
        <p className="text-xs font-mono text-stone-500">
          Answer at least {goal} points worth to submit.
        </p>
      )}
    </div>
  );
}