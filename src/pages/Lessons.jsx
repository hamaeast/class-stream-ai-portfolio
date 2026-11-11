import React from "react";
import { Loader2 } from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import LessonTree from "@/components/LessonTree";
import { useLessons, useCheckins } from "@/lib/entityQueries";

export default function Lessons() {
  const { data: lessons = [], isLoading: loading } = useLessons();
  const { data: checkins = [] } = useCheckins();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <CodeHeader
        chip="lessons.tree()"
        title="Lessons"
        subtitle="Browse by phase — click a phase to expand its lessons."
      />
      <LessonTree lessons={lessons} defaultOpen={[1]} checkins={checkins} />
    </div>
  );
}