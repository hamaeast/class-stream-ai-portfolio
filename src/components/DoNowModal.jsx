import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, CheckCircle2, XCircle, Lightbulb, Loader2, ArrowLeft,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

// Forces today's Do Now to the front as soon as it's open and unsubmitted.
// It cannot be dismissed until the student submits (or the timer expires),
// so logging in during class can no longer be avoided.
const LETTERS = ["A", "B", "C", "D"];

function fmtMMSS(total) {
  const m = Math.floor(total / 60);
  const s = Math.max(0, total % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function DoNowModal() {
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const autoFired = useRef(false);
  const prevTimeLeft = useRef(0);

  const load = () => {
    base44.functions
      .invoke("getTodaysDoNow", {})
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Re-check periodically so the modal pops automatically when the
    // class-period window opens while the student is already in the app.
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const open =
    !loading &&
    !!data?.scheduled &&
    !data.completed &&
    data.status === "open" &&
    !dismissed &&
    location.pathname !== "/do-now";

  const totalSeconds = (data?.time_limit_minutes || 5) * 60;

  // Reset + start the countdown whenever the modal becomes active.
  useEffect(() => {
    if (!open || result) return;
    setChoice("");
    setResult(null);
    setTimeLeft(totalSeconds);
    autoFired.current = false;
    prevTimeLeft.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, totalSeconds, result]);

  // Lock body scroll while the forced modal is on screen.
  useEffect(() => {
    if (!open || result) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, result]);

  // Countdown + auto-submit on timeout. The prevTimeLeft guard makes the
  // "time expired" branch fire ONLY after the timer has actually counted down —
  // NOT on the first render after open, where timeLeft is still 0 before the
  // reset effect sets it. Without it the modal would instantly complete the
  // Do Now with an empty answer the moment it popped up.
  useEffect(() => {
    if (!open || result) return;
    if (timeLeft > 0) {
      prevTimeLeft.current = timeLeft;
      const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
      return () => clearTimeout(t);
    }
    if (prevTimeLeft.current > 0 && !autoFired.current) {
      autoFired.current = true;
      submit(choice || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, result, timeLeft]);

  async function submit(sel) {
    if (submitting || !data) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await base44.functions.invoke("submitDoNow", {
        do_now_id: data.do_now_id,
        choice: sel,
      });
      setResult(res.data);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e.message || "Submission failed.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const choices = [data.choice_a, data.choice_b, data.choice_c, data.choice_d];
  const low = timeLeft <= 30;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-lg">
        <Card className="border-primary/40">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-stone-400 font-mono">
                {data.phase ? `// ${data.phase}` : "// do_now"}
                {data.lesson_topic ? ` · ${data.lesson_topic}` : ""}
              </div>
              {!result && (
                <div className={`flex items-center gap-1.5 font-mono text-sm px-3 py-1 rounded-lg border ${
                  low ? "border-destructive/50 text-destructive bg-destructive/10" : "border-primary/40 text-primary bg-primary/10"
                }`}>
                  <Clock className="w-4 h-4" /> {fmtMMSS(timeLeft)}
                </div>
              )}
            </div>

            {!result ? (
              <>
                <h2 className="font-display text-xl font-semibold text-foreground mb-6 whitespace-pre-wrap">
                  {data.question}
                </h2>
                <div className="space-y-3">
                  {LETTERS.map((L, i) => {
                    const sel = choice === L;
                    return (
                      <button
                        key={L}
                        type="button"
                        disabled={submitting}
                        onClick={() => setChoice(L)}
                        className={`w-full text-left flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                          sel
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-stone-200/20 bg-card hover:border-primary/50 text-stone-300"
                        }`}
                      >
                        <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                          sel ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                        }`}>{L}</span>
                        <span className="flex-1">{choices[i]}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <Badge variant="secondary" className="font-mono">
                    {data.points_possible} {data.points_possible === 1 ? "pt" : "pts"}
                  </Badge>
                  <Button disabled={!choice || submitting} onClick={() => submit(choice)}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit answer"}
                  </Button>
                </div>

                {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                <p className="mt-4 text-center text-xs text-stone-500">
                  Answer to continue. You have {data.time_limit_minutes} minutes and one attempt.
                </p>
              </>
            ) : (
              <ResultView data={data} result={result} onDone={() => setDismissed(true)} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResultView({ data, result, onDone }) {
  const correct = result.is_correct;
  const choiceText = (L) =>
    L ? ({ A: data?.choice_a, B: data?.choice_b, C: data?.choice_c, D: data?.choice_d }[L] || "") : "";
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        {correct ? <CheckCircle2 className="w-8 h-8 text-[#39FF14]" /> : <XCircle className="w-8 h-8 text-destructive" />}
        <div>
          <p className="font-display text-lg font-semibold text-foreground">
            {correct ? "Correct!" : "Not quite."}
          </p>
          <p className="text-sm text-stone-400">Score: {result.score} / {result.points_possible}</p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <Row label="Your answer" value={result.answer ? `${result.answer} — ${choiceText(result.answer)}` : "No answer (time expired)"} />
        <Row label="Correct answer" value={result.correct_answer_text ? `${result.correct_answer} — ${result.correct_answer_text}` : result.correct_answer} accent />
      </div>

      {result.answer_explanation && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-1.5 text-sm font-semibold text-foreground">
            <Lightbulb className="w-4 h-4 text-[#22D3EE]" /> Explanation
          </div>
          <p className="text-sm text-foreground">{result.answer_explanation}</p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="outline" asChild size="sm">
          <a href="/do-now">
            <ArrowLeft className="w-4 h-4 mr-1" /> Do Now page
          </a>
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

function Row({ label, value, accent }) {
  return (
    <div className="flex gap-2">
      <span className="text-stone-500 min-w-[110px]">{label}:</span>
      <span className={accent ? "text-[#39FF14]" : "text-foreground"}>{value}</span>
    </div>
  );
}