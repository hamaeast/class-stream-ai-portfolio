import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Send,
  Lock,
  CheckCircle2,
  XCircle,
  ListChecks,
  RotateCcw,
  Trophy,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePreview } from "@/lib/PreviewContext";
import { fnData, ownedBy } from "@/lib/ownership";

const MIN_MS = 5 * 60 * 1000; // 5-minute minimum

function parseAnswers(text) {
  if (!text) return {};
  try {
    const o = JSON.parse(text);
    if (o && typeof o === "object" && o.selections) return o.selections;
  } catch {}
  return {};
}

// Fillable multiple-choice quiz built from the matching Google Doc.
// Auto-grades on submit, enforces a silent 5-minute minimum, and supports
// a teacher "return for another attempt" flow. A teacher previewing a
// student (or an admin viewing) sees the student's picks read-only with
// correctness against the answer key.
//
// Security: opening, autosaving and grading go through the submitQuiz server
// function (QuizResponse is not student-writable), and quiz_json carries no
// answers. The correct answers come from getAssessmentKey, which only returns
// them to admins or after the student's attempt is graded.
export default function QuizForm({ lesson }) {
  const { previewStudent } = usePreview();
  const [viewer, setViewer] = useState(null);
  const [record, setRecord] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [picks, setPicks] = useState({});
  const [building, setBuilding] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showMinWarning, setShowMinWarning] = useState(false);
  const [resetting, setResetting] = useState(false);
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

      // Load existing response for this viewer + lesson.
      let existing = null;
      if (v) {
        try {
          const res = await base44.entities.QuizResponse.filter({
            lesson_id: lesson.id,
            ...ownedBy(v.id),
          });
          if (active) {
            existing = res[0] || null;
            setRecord(existing);
            if (existing) setPicks(parseAnswers(existing.answers_text));
          }
        } catch {}
      }

      // Load the quiz questions: from the lesson's cached quiz_json, or a
      // fresh copy if react-query still holds a record pre-caching, or build
      // it from the linked Google Doc on the fly (caches it for everyone).
      let qs = [];
      try {
        qs = lesson.quiz_json ? JSON.parse(lesson.quiz_json) : [];
        if (!qs.length) {
          const fresh = await base44.entities.Lesson.get(lesson.id);
          qs = fresh?.quiz_json ? JSON.parse(fresh.quiz_json) : [];
        }
        if (!qs.length) {
          const res = await base44.functions.invoke("buildLessonQuiz", {
            lesson_id: lesson.id,
          });
          qs = (res?.data || res)?.questions || [];
        }
        if (active) setQuestions(qs);
      } catch {
        if (active) setQuestions([]);
      }

      // Create a "started" record on first open — real students only, and only
      // when the lesson actually has a quiz, so a quiz-less lesson can't leave a
      // phantom in_progress record (and 0 score) behind.
      if (
        active &&
        qs.length > 0 &&
        !existing &&
        v &&
        !previewStudent &&
        v.role !== "admin"
      ) {
        try {
          const res = await base44.functions.invoke("submitQuiz", {
            lesson_id: lesson.id,
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
  }, [lesson.id, previewStudent?.id]);

  // Live update if a teacher returns this quiz while the student has it open.
  // While the student is actively taking the quiz, local `picks` are
  // authoritative (autosaved on each click) — so we only adopt the server
  // record when a status we don't own changes (e.g. the teacher returned it).
  // We must NOT echo the server copy back into `picks` here, because every
  // autosave write fires this event and would clobber a just-clicked answer
  // (the "answer removes itself / have to click multiple times" bug).
  useEffect(() => {
    const handler = async () => {
      const v = previewStudent || viewer;
      if (!v) return;
      try {
        const res = await base44.entities.QuizResponse.filter({
          lesson_id: lesson.id,
          ...ownedBy(v.id),
        });
        const r = res[0] || null;
        setRecord((prev) => {
          if (!r) return prev;
          if (!prev || prev.status !== r.status) return r;
          return prev;
        });
      } catch {}
    };
    window.addEventListener("rt:quizresponse", handler);
    return () => window.removeEventListener("rt:quizresponse", handler);
  }, [viewer?.id, lesson.id, previewStudent?.id]);

  const isGraded = record?.status === "graded";
  const isReturned = record?.status === "returned";
  const canTake = readOnly ? false : !isGraded;

  // Load the answer key for the read-only teacher view, or once the student's
  // attempt is graded (the server refuses it to students before that).
  useEffect(() => {
    if (answerKey || !(readOnly || isGraded)) return;
    let active = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("getAssessmentKey", {
          kind: "quiz",
          ref_id: lesson.id,
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
  }, [answerKey, readOnly, isGraded, lesson.id]);
  const answerOf = (i) => (answerKey ? answerKey[i] : undefined);

  // Autosave each selection immediately as the student picks it, so a
  // refresh or tab close never loses their answers (no grading — just
  // persisted picks). Radio picks are discrete, so we save at once rather
  // than debounce.
  useEffect(() => {
    if (!record || readOnly || !canTake) return;
    let active = true;
    setPickSaving(true);
    (async () => {
      try {
        await base44.functions.invoke("submitQuiz", {
          lesson_id: lesson.id,
          action: "save",
          selections: picks,
        });
        if (active) setPickSavedAt(new Date());
      } catch {
        /* best effort */
      }
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

  const score = questions.reduce(
    (n, q, i) => n + (answerKey && picks[i] === answerOf(i) ? 1 : 0),
    0
  );

  const startNewAttempt = async () => {
    if (!record) return;
    setResetting(true);
    try {
      const res = await base44.functions.invoke("submitQuiz", {
        lesson_id: lesson.id,
        action: "new_attempt",
      });
      const updated = fnData(res).record;
      if (updated) setRecord(updated);
      setAnswerKey(null);
      setPicks({});
    } finally {
      setResetting(false);
    }
  };

  const submit = async () => {
    // Silent 5-minute minimum enforced from when the quiz was opened.
    const startedAt = record?.started_at ? new Date(record.started_at).getTime() : Date.now();
    if (Date.now() - startedAt < MIN_MS) {
      setShowMinWarning(true);
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      // Security: the server grades (0.5 pt per correct answer) and writes
      // the score; the client only sends its picks.
      const res = await base44.functions.invoke("submitQuiz", {
        lesson_id: lesson.id,
        action: "submit",
        selections: picks,
      });
      const d = fnData(res);
      if (d.too_soon) {
        setShowMinWarning(true);
        return;
      }
      if (Array.isArray(d.answers)) setAnswerKey(d.answers);
      if (d.record) setRecord(d.record);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const setPick = (i, v) =>
    canTake && setPicks((p) => ({ ...p, [i]: Number(v) }));

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <h3 className="font-mono text-xs text-stone-500 mb-4 flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5" /> // quiz_response
        </h3>

        {building ? (
          <div className="flex items-center gap-2 text-sm text-stone-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading quiz…
          </div>
        ) : questions.length === 0 ? (
          <p className="text-sm text-stone-400">
            No quiz is linked to this lesson yet.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-5">
              {isGraded && (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1">
                  <Trophy className="w-3 h-3" /> Graded: {record.score}/{record.total}
                </Badge>
              )}
              {isReturned && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  Returned — try again
                </Badge>
              )}
              {readOnly && (
                <Badge variant="outline" className="text-amber-700 border-amber-300 gap-1">
                  <Lock className="w-3 h-3" /> Read-only
                </Badge>
              )}
              <span className="ml-auto text-xs font-mono text-stone-500 inline-flex items-center gap-1">
                {pickSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                    <span className="text-stone-400">Auto-saving…</span>
                  </>
                ) : pickSavedAt ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
                    <span className="text-[#39FF14]">
                      Auto-saved {new Date(pickSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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

            {isReturned && !readOnly && (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900">
                  Your teacher returned this quiz so you can take it again.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={startNewAttempt}
                  disabled={resetting}
                  className="border-amber-500 text-amber-800 hover:bg-amber-100"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  {resetting ? "Starting…" : "Start new attempt"}
                </Button>
              </div>
            )}

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
                      <span className="text-stone-500 font-mono mr-1.5">
                        {i + 1}.
                      </span>
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
                        let tone =
                          "border-stone-200/10 bg-stone-100/5 text-foreground";
                        if (showResult && isCorrect)
                          tone =
                            "border-[#39FF14]/40 bg-[#39FF14]/10 text-[#bff9bf]";
                        else if (showResult && isPicked && !isCorrect)
                          tone =
                            "border-destructive/40 bg-destructive/10 text-destructive-foreground";
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
                            <RadioGroupItem
                              value={String(j)}
                              id={`q${i}-${j}`}
                              className="mt-0.5"
                            />
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
                    {answerKey && score * 0.5 !== record.score && (
                      <p className="text-stone-500 mt-1">
                        ({score * 0.5}/{questions.length * 0.5} as currently shown)
                      </p>
                    )}
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
                    <span className="text-xs font-mono text-stone-500 inline-flex items-center gap-1">
                      {pickSaving ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                          <span className="text-stone-400">Auto-saving…</span>
                        </>
                      ) : pickSavedAt ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
                          <span className="text-[#39FF14]">
                            Auto-saved {new Date(pickSavedAt).toLocaleTimeString()}
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
                )}
              </>
            )}

            {readOnly && (
              <p className="mt-4 text-xs font-mono text-stone-500 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-destructive" />
                {questions.length > 0
                  ? `${score}/${questions.length} correct${
                      Object.keys(picks).length < questions.length
                        ? ` · ${questions.length - Object.keys(picks).length} unanswered`
                        : ""
                    }`
                  : ""}
              </p>
            )}
          </>
        )}
      </CardContent>

      {/* 5-minute minimum warning: agree to dismiss (does not submit) */}
      <Dialog open={showMinWarning} onOpenChange={setShowMinWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" /> Slow down
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-stone-600 leading-relaxed py-2">
            You have not spent enough time on this quiz yet. Please carefully
            read each question and do your best before submitting your answers.
          </p>
          <DialogFooter>
            <Button onClick={() => setShowMinWarning(false)}>
              I agree — keep working
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}