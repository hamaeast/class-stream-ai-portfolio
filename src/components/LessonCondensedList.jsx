import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, FileText, PenLine, HelpCircle } from "lucide-react";
import { NEON_CARD, NEON_PILL, NEON_ACCENT } from "@/lib/neon-styles";

const LINKS = [
  { key: "lesson", label: "Lesson", icon: BookOpen },
  { key: "notes", label: "Notes", icon: FileText },
  { key: "practice", label: "Practice", icon: PenLine },
  { key: "quiz", label: "Quiz", icon: HelpCircle },
];

export default function LessonCondensedList({ lessons }) {
  if (!lessons || lessons.length === 0) {
    return <Card><CardContent className="py-12 text-center text-stone-400">No lessons published yet.</CardContent></Card>;
  }
  return (
    <div className="space-y-3">
      {lessons.map((lesson) => (
        <Card key={lesson.id} className={NEON_CARD}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground truncate flex items-center gap-2 font-mono">
                  <BookOpen className={`w-4 h-4 ${NEON_ACCENT} shrink-0`} />
                  {lesson.title}
                </h3>
                <p className="text-sm text-stone-500 line-clamp-1 mt-0.5 font-mono text-xs">{lesson.description || "No description"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {LINKS.map(({ key, label, icon: Icon }) => (
                  <Link
                    key={key}
                    to={`/lessons/${lesson.id}?part=${key}`}
                    className={NEON_PILL}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </Link>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}