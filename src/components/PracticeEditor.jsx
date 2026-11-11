import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2, RefreshCw } from "lucide-react";

// Tiers used by the worksheet (matches PracticeWorksheet.jsx). Each tier has
// a default per-question point value the teacher can still override per row.
const TIERS = [
  { key: "practice", label: "Practice", sub: "1 pt each", defaultPoints: 1 },
  { key: "apply", label: "Apply", sub: "3 pts each", defaultPoints: 3 },
  { key: "challenge", label: "Challenge", sub: "5 pts each", defaultPoints: 5 },
];

const DEFAULT_POINTS = { practice: 1, apply: 3, challenge: 5 };

function makeId() {
  return "q_" + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3);
}

// Teacher-side editor for a lesson's cached practice. Unlike a plain doc
// rebuild, this edits BOTH the student-facing questions (practice_json) AND
// the server-side answer key (PracticeAnswerKey.model_answer) in one place,
// then onSave re-grades every already-submitted attempt so posted grades stay
// correct after the edit.
//
// Props:
//   practice  — {title, point_goal, questions:[{id,tier,points,label,prompt}]}
//   keyItems  — [{id, model_answer, ...}] from PracticeAnswerKey (admin read)
//   onSave    — async ({ practice, keyItems }) => void
export default function PracticeEditor({ open, practice, keyItems, onClose, onSave, busy, regrading }) {
  const [draft, setDraft] = useState(null);

  // Seed the editor when it opens: student questions merged with the matching
  // model answer from the key (by question id). New questions start blank.
  useEffect(() => {
    if (open) {
      const keyById = new Map((keyItems || []).map((k) => [k.id, k]));
      setDraft({
        title: practice?.title || "",
        point_goal: practice?.point_goal || 10,
        questions: (practice?.questions || []).map((q) => ({
          ...q,
          model_answer: keyById.get(q.id)?.model_answer || "",
        })),
      });
    }
  }, [open, practice, keyItems]);

  if (!open || !draft) return null;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setQ = (i, patch) =>
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
    }));
  const addQ = (tier) =>
    setDraft((d) => ({
      ...d,
      questions: [
        ...d.questions,
        {
          id: makeId(),
          tier,
          points: DEFAULT_POINTS[tier] ?? 1,
          label: `${tier[0].toUpperCase()}${d.questions.length + 1}`,
          prompt: "",
          model_answer: "",
        },
      ],
    }));
  const delQ = (i) =>
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, idx) => idx !== i) }));

  const clean = {
    ...draft,
    title: (draft.title || "").trim(),
    point_goal: Number(draft.point_goal) || 10,
    questions: draft.questions
      .map((q) => ({
        id: q.id || makeId(),
        tier: q.tier,
        points: Number(q.points) || 0,
        label: (q.label || "").trim(),
        prompt: (q.prompt || "").trim(),
        model_answer: (q.model_answer || "").trim(),
      }))
      // drop empty rows when saving so the worksheet never renders blanks
      .filter((q) => q.prompt),
  };
  const totalPossible = clean.questions.reduce((s, q) => s + (q.points || 0), 0);
  const shortOfGoal = totalPossible < clean.point_goal;

  // Split the single edited set into the two payloads the caller persists:
  // the student-facing worksheet (no answers) and the server-side answer key.
  const practicePayload = {
    title: clean.title,
    point_goal: clean.point_goal,
    questions: clean.questions.map(({ model_answer, ...rest }) => rest),
  };
  const keyPayload = clean.questions.map((q) => ({
    id: q.id,
    tier: q.tier,
    points: q.points,
    prompt: q.prompt,
    model_answer: q.model_answer,
  }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && !regrading && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit practice questions & answers</DialogTitle>
          <DialogDescription>
            Editing here updates the questions every student sees AND the answer
            key used for grading. On save, every already-submitted attempt is
            automatically re-graded against your changes so posted grades stay
            correct.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Title</label>
              <Input
                value={draft.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Practice — <topic>"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Point goal</label>
              <Input
                type="number"
                min={1}
                value={draft.point_goal}
                onChange={(e) => set({ point_goal: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="text-xs font-mono text-stone-500">
            {draft.questions.length} questions · {totalPossible} pts possible · goal {clean.point_goal}
            {shortOfGoal && (
              <span className="text-amber-400"> · below goal</span>
            )}
          </div>

          <div className="space-y-4">
            {TIERS.map((t) => {
              const rows = draft.questions
                .map((q, idx) => ({ q, idx }))
                .filter(({ q }) => q.tier === t.key);
              return (
                <div
                  key={t.key}
                  className="rounded-xl border border-stone-200/15 bg-card overflow-hidden"
                >
                  <div className="px-4 py-2 bg-stone-200/10 flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {t.label}
                    </span>
                    <span className="text-xs text-stone-500 font-mono">{t.sub}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7 text-xs"
                      onClick={() => addQ(t.key)}
                      disabled={busy || regrading}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="divide-y divide-stone-200/10">
                    {rows.map(({ q, idx }) => (
                      <div key={q.id || idx} className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            className="w-32 h-8 text-xs font-mono"
                            value={q.label || ""}
                            onChange={(e) => setQ(idx, { label: e.target.value })}
                            placeholder="Label"
                          />
                          <Input
                            type="number"
                            min={0}
                            className="w-20 h-8 text-xs"
                            value={q.points ?? 0}
                            onChange={(e) => setQ(idx, { points: Number(e.target.value) || 0 })}
                          />
                          <span className="text-[10px] text-stone-500">pts</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="ml-auto h-7 w-7 text-destructive hover:bg-destructive/20"
                            onClick={() => delQ(idx)}
                            disabled={busy || regrading}
                            title="Delete question"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <Textarea
                          value={q.prompt || ""}
                          onChange={(e) => setQ(idx, { prompt: e.target.value })}
                          rows={2}
                          placeholder="Question prompt…"
                          disabled={busy || regrading}
                        />
                        <Textarea
                          value={q.model_answer || ""}
                          onChange={(e) => setQ(idx, { model_answer: e.target.value })}
                          rows={2}
                          placeholder="Model answer / answer key…"
                          disabled={busy || regrading}
                          className="text-[#39FF14] placeholder:text-emerald-900/60"
                        />
                      </div>
                    ))}
                    {!rows.length && (
                      <p className="px-4 py-3 text-xs text-stone-500">
                        No {t.label.toLowerCase()} questions yet.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {shortOfGoal && (
            <p className="text-xs text-amber-400">
              Heads up: total points ({totalPossible}) are below the goal ({clean.point_goal}).
              Students won't be able to reach the goal — add more points or lower the goal.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy || regrading}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (busy || regrading) return;
              try {
                await onSave({ practice: practicePayload, keyItems: keyPayload });
                onClose();
              } catch {
                /* error toast handled by caller */
              }
            }}
            disabled={busy || regrading || !clean.questions.length}
          >
            {regrading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Re-grading…
              </>
            ) : busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving & re-grading…
              </>
            ) : (
              "Save & re-grade all"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}