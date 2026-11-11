import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Timer, CheckCircle2, BarChart3 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const LETTERS = ["A", "B", "C", "D"];

// Teacher-facing peek at today's Do Now, pinned to the top of the dashboard.
// Unlike the student banner, this shows the question, the answer key, and the
// explanation so the teacher can see exactly what students are working on today.
export default function TeacherDoNowCard() {
  const [data, setData] = useState(null);
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("getTodaysDoNow", {});
        const d = res.data;
        if (!d?.scheduled) {
          if (alive) setData(d || {});
          return;
        }
        if (alive) setData(d);
        // Pull the full Do Now record (admin RLS) to reveal the answer key.
        const list = await base44.entities.DoNow.filter({ do_now_id: d.do_now_id });
        if (alive) setFull(list[0] || null);
      } catch {
        // ignore — no card shown on failure
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return null;

  if (!data?.scheduled) {
    return (
      <Card className="mb-6 border-stone-200/20">
        <CardContent className="py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#FF2BD6]/15 flex items-center justify-center shrink-0">
            <Timer className="w-5 h-5 text-[#FF2BD6]" />
          </div>
          <div>
            <p className="font-display font-semibold text-[#FF2BD6]">Today's Do Now</p>
            <p className="text-xs text-stone-400">No Do Now scheduled for today.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const choices = [
    full?.choice_a ?? data.choice_a,
    full?.choice_b ?? data.choice_b,
    full?.choice_c ?? data.choice_c,
    full?.choice_d ?? data.choice_d,
  ];
  const correct = full?.correct_answer;
  const explanation = full?.answer_explanation;
  const status = data.status || "open";

  return (
    <Card className="mb-6 border-[#FF2BD6]/40 bg-[#FF2BD6]/5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#FF2BD6]/15 flex items-center justify-center shrink-0">
              <Timer className="w-5 h-5 text-[#FF2BD6]" />
            </div>
            <div className="min-w-0">
              <p className="font-display font-semibold text-[#FF2BD6]">
                Today's Do Now{status === "upcoming" ? " (upcoming)" : ""}
              </p>
              <p className="text-xs text-stone-400 truncate">
                {data.day_number ? `Day ${data.day_number}` : ""}
                {data.phase ? ` · ${data.phase}` : ""}
                {data.lesson_topic ? ` · ${data.lesson_topic}` : ""}
                {data.scheduled_start_time ? ` · ${data.scheduled_start_time}` : ""}
                {data.scheduled_end_time ? `–${data.scheduled_end_time}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="font-mono">
              {data.points_possible} {data.points_possible === 1 ? "pt" : "pts"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">{data.gradebook_setting}</Badge>
            <Button asChild variant="ghost" size="sm" className="text-[#FF2BD6] hover:bg-[#FF2BD6]/10">
              <Link to="/teacher/do-nows"><BarChart3 className="w-4 h-4 mr-1" /> Reports</Link>
            </Button>
          </div>
        </div>

        <h2 className="font-display text-lg font-semibold text-foreground mb-4 whitespace-pre-wrap">
          {data.question}
        </h2>
        <div className="space-y-2">
          {LETTERS.map((L, i) => {
            const isCorrect = correct === L;
            return (
              <div
                key={L}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                  isCorrect
                    ? "border-accent/50 bg-accent/10 text-foreground"
                    : "border-stone-200/20 bg-card text-stone-300"
                }`}
              >
                <span
                  className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCorrect ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {L}
                </span>
                <span className="flex-1">{choices[i]}</span>
                {isCorrect && <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />}
              </div>
            );
          })}
        </div>

        {explanation && (
          <div className="mt-3 rounded-lg border border-[#FF2BD6]/30 bg-[#FF2BD6]/5 p-3 text-sm text-foreground">
            <span className="font-semibold text-[#FF2BD6]">Explanation: </span>
            {explanation}
          </div>
        )}
      </CardContent>
    </Card>
  );
}