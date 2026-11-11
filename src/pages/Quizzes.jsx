import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, HelpCircle } from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLessons, useCheckins } from "@/lib/entityQueries";
import { groupByPhase, phaseLabel } from "@/lib/lessonPhases";
import { NEON_CARD, NEON_ACCENT } from "@/lib/neon-styles";
import { base44 } from "@/api/base44Client";
import { ownedBy } from "@/lib/ownership";
import { usePreview } from "@/lib/PreviewContext";

// One quiz per lesson, grouped by phase. Each row names the lesson the quiz
// comes from and links straight to the fillable form.
export default function Quizzes() {
  const { data: lessons = [], isLoading } = useLessons();
  const { data: checkins = [] } = useCheckins();
  const { previewStudent } = usePreview();
  const [responses, setResponses] = useState([]);
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      let v = previewStudent;
      try {
        v = v || (await base44.auth.me());
      } catch {}
      if (!v) return;
      if (active) setViewer(v);
      try {
        const r = await base44.entities.QuizResponse.filter(ownedBy(v.id));
        if (active) setResponses(r || []);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [previewStudent?.id]);

  const turnedIn = (lessonId) => responses.some((r) => r.lesson_id === lessonId);
  // Admins just get an overview of every quiz — no "not turned in" badges.
  const isAdmin = !previewStudent && viewer?.role === "admin";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  const { phases } = groupByPhase(lessons);
  const sorted = [...phases.keys()].sort((a, b) => a - b);

  const doneQuiz = (lessonId) =>
    checkins.some((c) => c.lesson_id === lessonId && (c.part || "lesson") === "quiz");

  const renderQuizRow = (lesson) => (
    <Link
      key={lesson.id}
      to={`/quiz?lesson_id=${lesson.id}`}
      className={`${NEON_CARD} flex items-center justify-between gap-4 p-4 hover:border-primary/50 transition-colors`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <HelpCircle className={`w-4 h-4 shrink-0 ${NEON_ACCENT}`} />
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {lesson._name ? `${lesson._name}` : lesson.title}
          </h3>
          <p className="text-xs font-mono text-stone-500 truncate">
            from <span className="text-[#22D3EE]">{lesson.title}</span>
            {lesson._phase ? ` · Phase ${lesson._phase}` : ""}
          </p>
        </div>
      </div>
      {!isAdmin ? (
        turnedIn(lesson.id) ? (
          <span className="shrink-0 text-[10px] font-mono text-[#39FF14]">turned in</span>
        ) : (
          <span className="shrink-0 inline-flex items-center rounded-full bg-red-500 text-white text-[10px] px-2 py-0.5">
            Not turned in
          </span>
        )
      ) : (
        <span className="shrink-0 text-[10px] font-mono text-stone-500">quiz</span>
      )}
    </Link>
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <CodeHeader
        chip="quizzes.list()"
        title="Quizzes"
        subtitle="Every lesson's quiz in one place — click to open the form."
      />

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-stone-400">
            No quizzes yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((n) => {
            const grp = phases.get(n);
            return (
              <div
                key={n}
                className="rounded-xl border border-stone-200/15 bg-card overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200/10">
                  <HelpCircle className={`w-4 h-4 ${NEON_ACCENT}`} />
                  <span className="font-mono text-sm font-semibold text-foreground">
                    Phase {n}
                    {grp.overview && (
                      <span className="text-stone-400 font-normal">
                        {" — "}
                        {phaseLabel(grp.overview)}
                      </span>
                    )}
                  </span>
                  <Badge variant="secondary" className="ml-auto font-mono text-xs">
                    {grp.lessons.length} quiz{grp.lessons.length === 1 ? "" : "zes"}
                  </Badge>
                </div>
                <div className="p-3 space-y-2">
                  {grp.lessons.map((l) => renderQuizRow({ ...l, _phase: n }))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}