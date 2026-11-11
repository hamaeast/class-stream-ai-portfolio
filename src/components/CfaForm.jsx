import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Lock, CheckCircle2, Trophy } from "lucide-react";
import { usePreview } from "@/lib/PreviewContext";
import { fnData, ownedBy } from "@/lib/ownership";

function parseAnswers(text) {
  try {
    const o = JSON.parse(text);
    if (o && typeof o === "object" && o.selections) return o.selections;
  } catch {}
  return {};
}
function parseQuestions(text) {
  try {
    const o = JSON.parse(text);
    if (Array.isArray(o)) return o;
  } catch {}
  return [];
}

// Student-facing CFA quiz: auto-grades on submit, autosaves selections.
// A teacher previewing a student (or an admin) sees the student's picks
// read-only with correctness against the answer key.
//
// Security: opening, autosaving and grading go through the submitCfa server
// function (CFAResponse is not student-writable), and questions_json carries
// no answers. The correct answers come from getAssessmentKey, which only
// returns them to admins or after the student's attempt is graded.
export default function CfaForm({ cfa }) {
  const { previewStudent } = usePreview();
  const [viewer, setViewer] = useState(null);
  const [record, setRecord] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [picks, setPicks] = useState({});
  const [building, setBuilding] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickSaving, setPickSaving] = useState(false);
  const [pickSavedAt, setPickSavedAt] = useState(null);
  const [answerKey, setAnswerKey] = useState(null);

  const readOnly = !!(previewStudent || viewer?.role === "admin");

  useEffect(() => {
    let active = true;
    (async () => {
      let v = previewStudent;
      if (!v) {
        try {
          v = await base44.auth.me();
        } catch {}
      }
      if (!active) {
        setBuilding(false);
        return;
      }
      setViewer(v);
      const qs = parseQuestions(cfa.questions_json);
      if (active) setQuestions(qs);

      let existing = null;
      if (v) {
        try {
          const res = await base44.entities.CFAResponse.filter({
            cfa_id: cfa.id,
            ...ownedBy(v.id),
          });
          if (active) {
            existing = res[0] || null;
            setRecord(existing);
            if (existing) setPicks(parseAnswers(existing.answers_text));
          }
        } catch {}
      }

      // Create an in_progress record on first open — real students only.
      if (active && qs.length > 0 && !existing && v && !previewStudent && v.role !== "admin") {
        try {
          const res = await base44.functions.invoke("submitCfa", {
            cfa_id: cfa.id,
            action: "start",
          });
          const r = fnData(res).record;
          if (active && r) setRecord(r);
        } catch {}
      }
      if (active) setBuilding(false);
    })();
    return () => {
      active = false;
    };
  }, [cfa.id, previewStudent?.id]);

  const isGraded = record?.status === "graded";
  const canTake = readOnly ? false : !isGraded;

  // Load the answer key for the read-only teacher view, or once the student's
  // attempt is graded (the server refuses it to students before that).
  useEffect(() => {
    if (answerKey || !(readOnly || isGraded)) return;
    let active = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("getAssessmentKey", {
          kind: "cfa",
          ref_id: cfa.id,
        });
        const a = fnData(res).answers;
        if (active && Array.isArray(a)) setAnswerKey(a);
      } catch {
        /* correctness highlighting is best effort */
      }
    })();
    return () => {
      active = false;
    };
  }, [answerKey, readOnly, isGraded, cfa.id]);
  const answerOf = (i) => (answerKey ? answerKey[i] : undefined);

  // Autosave each selection immediately.
  useEffect(() => {
    if (!record || readOnly || !canTake) return;
    let active = true;
    setPickSaving(true);
    (async () => {
      try {
        await base44.functions.invoke("submitCfa", {
          cfa_id: cfa.id,
          action: "save",
          selections: picks,
        });
        if (active) setPickSavedAt(new Date());
      } catch {}
      if (active) setPickSaving(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, record?.id, canTake, readOnly]);

  const allAnswered =
    questions.length > 0 &&
    questions.every((_, i) => picks[i] !== undefined && picks[i] !== null);

  const correctCount = questions.reduce(
    (n, q, i) => n + (answerKey && picks[i] === answerOf(i) ? 1 : 0),
    0
  );

  const submit = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Security: the server grades (1 pt per correct answer) and writes the
      // score; the client only sends its picks.
      const res = await base44.functions.invoke("submitCfa", {
        cfa_id: cfa.id,
        action: "submit",
        selections: picks,
      });
      const d = fnData(res);
      if (Array.isArray(d.answers)) setAnswerKey(d.answers);
      if (d.record) setRecord(d.record);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const setPick = (i, v) => canTake && setPicks((p) => ({ ...p, [i]: Number(v) }));

  if (building)
    return (
      <div className="flex items-center gap-2 text-sm text-stone-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading CFA…
      </div>
    );
  if (!questions.length)
    return <p className="text-sm text-stone-400">No questions on this CFA yet.</p>;

  return (
    <Card className="mb-4">
      <CardContent className="p-6">
        <h3 className="font-mono text-xs text-stone-500 mb-4 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" /> // cfa_response
        </h3>

        <div className="flex items-center gap-2 flex-wrap mb-5">
          {isGraded && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1">
              <Trophy className="w-3 h-3" /> Graded: {record.score}/{record.total}
            </Badge>
          )}
          {readOnly && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 gap-1">
              <Lock className="w-3 h-3" /> Read-only
            </Badge>
          )}
          {!readOnly && (
            <span className="ml-auto text-xs font-mono text-stone-500 inline-flex items-center gap-1">
              {pickSaving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                  <span className="text-stone-400">Auto-saving…</span>
                </>
              ) : pickSavedAt ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
                  <span className="text-[#39FF14]">Auto-saved</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
                  Auto-save on
                </>
              )}
            </span>
          )}
        </div>

        <div className="space-y-5">
          {questions.map((q, i) => {
            const picked = picks[i];
            const showResult = readOnly || isGraded;
            return (
              <div
                key={i}
                className="rounded-lg border border-stone-200/20 bg-stone-200/5 p-4"
              >
                <p className="text-sm text-foreground mb-3 leading-relaxed">
                  <span className="text-stone-500 font-mono mr-1.5">{i + 1}.</span>
                  {q.question}
                </p>
                <RadioGroup
                  value={picked === undefined ? "" : String(picked)}
                  onValueChange={(v) => setPick(i, v)}
                  disabled={!canTake}
                  className="grid sm:grid-cols-2 gap-2"
                >
                  {q.choices.map((c, j) => {
                    const isPicked = picked === j;
                    const isCorrect = answerOf(i) === j;
                    let tone = "border-stone-200/10 bg-stone-100/5 text-foreground";
                    if (showResult && isCorrect)
                      tone = "border-[#39FF14]/40 bg-[#39FF14]/10 text-[#bff9bf]";
                    else if (showResult && isPicked && !isCorrect)
                      tone = "border-destructive/40 bg-destructive/10 text-destructive-foreground";
                    return (
                      <label
                        key={j}
                        className={`flex items-start gap-2 text-sm rounded border px-2.5 py-1.5 ${
                          canTake ? "cursor-pointer" : "cursor-default"
                        } ${tone}`}
                      >
                        <span className="font-mono text-[#FDE047] font-semibold shrink-0">
                          {["a", "b", "c", "d"][j]})
                        </span>
                        <span className="flex-1">{c}</span>
                        <RadioGroupItem value={String(j)} id={`cfa${i}-${j}`} className="mt-0.5" />
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            );
          })}
        </div>

        {!readOnly && (
          <>
            {isGraded ? (
              <div className="mt-5 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/5 p-4 text-sm">
                <p className="flex items-center gap-2 text-[#bff9bf] font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  You scored {record.score} / {record.total}
                  {record.attempted_at && (
                    <span className="text-stone-400 font-normal ml-2">
                      {new Date(record.attempted_at).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <Button onClick={submit} disabled={saving || !allAnswered}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : saved ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {saved ? "Graded" : "Submit answers"}
                </Button>
                {!allAnswered && (
                  <span className="text-xs text-stone-500">
                    Answer all {questions.length} questions to submit.
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {readOnly && (
          <p className="mt-4 text-xs font-mono text-stone-500">
            {correctCount}/{questions.length} correct
          </p>
        )}
      </CardContent>
    </Card>
  );
}