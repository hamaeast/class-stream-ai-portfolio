import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CodeHeader from "@/components/CodeHeader";
import { useLesson } from "@/lib/entityQueries";
import { base44 } from "@/api/base44Client";
import QuizForm from "@/components/QuizForm";

// Opens a lesson's quiz in isolation — just the fillable form, not the lesson
// body. Records a "quiz" check-in so the student/teacher can see it was started.
export default function QuizDetail() {
  const lessonId =
    new URLSearchParams(window.location.search).get("lesson_id") ||
    window.location.pathname.split("/").pop();
  const { data: lesson, isLoading } = useLesson(lessonId);
  const navigate = useNavigate();
  const from = new URLSearchParams(window.location.search).get("from");

  // Record the quiz check-in (admins skipped; preview is read-only anyway).
  useEffect(() => {
    if (!lessonId) return;
    let active = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!active || !me || me.role === "admin") return;
        const existing = await base44.entities.CheckIn.filter({
          lesson_id: lessonId,
          part: "quiz",
          created_by_id: me.id,
        });
        if (active && existing.length === 0)
          await base44.entities.CheckIn.create({ lesson_id: lessonId, part: "quiz" });
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [lessonId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-stone-500">Quiz not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/quizzes">Back to quizzes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => (from === "lessons" ? navigate("/lessons") : navigate("/quizzes"))}
        className="mb-6 -ml-2 font-mono text-xs text-stone-400 hover:text-[#22D3EE]"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />{" "}
        {from === "lessons" ? "cd ../lessons" : "cd ../quizzes"}
      </Button>

      <CodeHeader
        chip="quiz.take()"
        title="Quiz"
        subtitle={lesson.title}
        tags={[{ label: "fillable form", color: "text-[#39FF14] border-[#39FF14]/30 bg-[#39FF14]/10" }]}
      />

      <div className="flex items-center gap-2 mb-4 font-mono text-xs text-stone-500">
        <HelpCircle className="w-3.5 h-3.5" /> source_lesson:{" "}
        <Link
          to={`/lessons/${lesson.id}`}
          className="text-[#22D3EE] hover:underline"
        >
          {lesson.title}
        </Link>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6 text-sm text-stone-400">
          Answer the quiz questions for this lesson below and submit your
          responses. Your teacher will see your answers.
        </CardContent>
      </Card>

      <QuizForm lesson={lesson} />
    </div>
  );
}