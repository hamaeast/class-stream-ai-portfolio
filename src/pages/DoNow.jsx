import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, CheckCircle2, XCircle, Lock, CalendarOff, Loader2, ArrowLeft,
  Lightbulb, Timer,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import CodeHeader from "@/components/CodeHeader";

const LETTERS = ["A", "B", "C", "D"];

function fmtMMSS(total) {
  const m = Math.floor(total / 60);
  const s = Math.max(0, total % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function DoNow() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const autoFired = useRef(false);
  const prevTimeLeft = useRef(0);

  const load = () => {
    setLoading(true);
    base44.functions
      .invoke("getTodaysDoNow", {})
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message || "Failed to load Do Now."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const isOpen = data?.scheduled && data.status === "open" && !data.completed;
  const totalSeconds = (data?.time_limit_minutes || 5) * 60;

  useEffect(() => {
    if (!isOpen) return;
    setTimeLeft(totalSeconds);
    setChoice("");
    setResult(null);
    autoFired.current = false;
    prevTimeLeft.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, totalSeconds]);

  // Countdown + auto-submit when time runs out. The prevTimeLeft guard makes the
  // "time expired" branch fire ONLY after the timer has actually counted down —
  // NOT on the first render after open, where timeLeft is still 0 before the
  // reset effect sets it to totalSeconds. Without it, the page would instantly
  // complete the Do Now with an empty answer the moment a student opened it.
  useEffect(() => {
    if (!isOpen || result) return;
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
  }, [isOpen, result, timeLeft]);

  async function submit(sel) {
    if (submitting) return;
    setSubmitting(true);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-stone-400">{error}</p>
            <Button variant="outline" className="mt-4" onClick={load}>Try again</Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // No Do Now scheduled for today.
  if (!data?.scheduled) {
    return (
      <Shell>
        <EmptyState
          icon={<CalendarOff className="w-10 h-10" />}
          title="No Do Now today."
          body="Check back during your next scheduled class."
        />
      </Shell>
    );
  }

  // Completed and not reopened — show result.
  if (data.completed) {
    return (
      <Shell>
        <ResultCard data={data} result={resultFromData(data)} />
        <p className="mt-6 text-center text-sm text-stone-400">
          Today's Do Now has already been completed.
        </p>
        <BackLink />
      </Shell>
    );
  }

  // Closed before the student opened it.
  if (data.status === "upcoming") {
    return (
      <Shell>
        <EmptyState
          icon={<Timer className="w-10 h-10 text-[#22D3EE]" />}
          title={`Today's Do Now opens at ${data.scheduled_start_time}.`}
          body="It will appear here as soon as class starts."
        />
      </Shell>
    );
  }
  if (data.status === "locked") {
    return (
      <Shell>
        <EmptyState
          icon={<Lock className="w-10 h-10" />}
          title="This Do Now is locked."
          body="The class period ended before you submitted. See your teacher to reopen it."
        />
      </Shell>
    );
  }

  // Active quiz — possibly a reopen after a prior completion.
  const banner = data.reopened && !result ? (
    <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
      Your teacher reopened this Do Now — you may attempt it again.
    </div>
  ) : null;

  if (result) {
    return (
      <Shell>
        {banner}
        <ResultCard data={data} result={result} />
        <BackLink />
      </Shell>
    );
  }

  return (
    <Shell>
      {banner}
      <QuizCard data={data} choice={choice} setChoice={setChoice}
        timeLeft={timeLeft} submitting={submitting} onSubmit={() => submit(choice)} error={error} />
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <CodeHeader chip="do_now.run()" title="Daily Do Now" subtitle="Warm-up question · auto-graded" />
      <div className="mt-8">{children}</div>
    </div>
  );
}

function BackLink() {
  return (
    <div className="mt-8 text-center">
      <Button asChild variant="ghost" size="sm">
        <Link to="/"><ArrowLeft className="w-4 h-4 mr-1" /> cd ../dashboard</Link>
      </Button>
    </div>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <Card>
      <CardContent className="py-20 text-center">
        <div className="flex justify-center mb-4 text-stone-500">{icon}</div>
        <p className="text-lg font-medium text-foreground">{title}</p>
        <p className="text-sm text-stone-400 mt-1">{body}</p>
      </CardContent>
    </Card>
  );
}

function QuizCard({ data, choice, setChoice, timeLeft, submitting, onSubmit, error }) {
  const choices = [data.choice_a, data.choice_b, data.choice_c, data.choice_d];
  const low = timeLeft <= 30;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-stone-400 font-mono">
          {data.phase ? `// ${data.phase}` : "// do_now"}
          {data.lesson_topic ? ` · ${data.lesson_topic}` : ""}
        </div>
        <div className={`flex items-center gap-1.5 font-mono text-sm px-3 py-1 rounded-lg border ${
          low ? "border-destructive/50 text-destructive bg-destructive/10" : "border-primary/40 text-primary bg-primary/10"
        }`}>
          <Clock className="w-4 h-4" /> {fmtMMSS(timeLeft)}
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
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
            <Button disabled={!choice || submitting} onClick={onSubmit}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit answer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <p className="mt-4 text-center text-xs text-stone-500">
        You have {data.time_limit_minutes} minutes and one attempt. Your answer locks when you submit.
      </p>
    </div>
  );
}

function resultFromData(d) {
  return {
    is_correct: d.is_correct,
    score: d.score,
    points_possible: d.response_points_possible ?? d.points_possible,
    answer: d.answer,
    correct_answer: d.correct_answer,
    correct_answer_text: d.correct_answer_text,
    answer_explanation: d.answer_explanation,
  };
}

function ResultCard({ data, result }) {
  if (!result) return null;
  const correct = result.is_correct;
  const choiceText = (L) =>
    L ? ({ A: data?.choice_a, B: data?.choice_b, C: data?.choice_c, D: data?.choice_d }[L] || "") : "";
  return (
    <Card className={correct ? "border-accent/50" : "border-destructive/50"}>
      <CardContent className="p-6">
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
      </CardContent>
    </Card>
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