import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText } from "lucide-react";
import { assignmentPeriod, periodName } from "@/lib/gradePeriods";

// Teacher view: assignments grouped by the lesson they belong to.
export default function TeacherAssignments({ lessons, assignments }) {
  const byLesson = useMemo(() => {
    const map = new Map();
    (lessons || []).forEach((l) => map.set(l.id, { lesson: l, items: [] }));
    (assignments || []).forEach((a) => {
      if (map.has(a.lesson_id)) map.get(a.lesson_id).items.push(a);
      else {
        const entry = { lesson: { id: a.lesson_id, title: "Unassigned" }, items: [a] };
        map.set(a.lesson_id, entry);
      }
    });
    return [...map.values()];
  }, [lessons, assignments]);

  return (
    <div className="space-y-6">
      {byLesson.map(({ lesson, items }) => (
        <Card key={lesson.id}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-[#22D3EE]" />
              <h3 className="font-semibold text-foreground">{lesson.title}</h3>
              <Badge variant="outline" className="ml-auto text-stone-400">
                {items.length}
              </Badge>
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-stone-400">No assignments.</p>
            ) : (
              <ul className="divide-y divide-stone-200/10">
                {items.map((a) => {
                  const p = assignmentPeriod(a.due_date, a.grade_period_override);
                  return (
                    <li key={a.id}>
                      <Link
                        to={`/assignments/${a.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 -mx-2 px-2 rounded hover:bg-stone-100/40"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">{a.title}</p>
                          {a.description && (
                            <p className="text-xs text-stone-500 truncate">{a.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs text-stone-400">
                          {a.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {a.due_date}
                            </span>
                          )}
                          {a.title === "Assignment" && (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              5 pts
                            </Badge>
                          )}
                          <span>{p === "omitted" ? "Omitted" : p ? periodName(p) : "—"}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {lesson.practice_json && (
              <div className="mt-3 pt-3 border-t border-stone-200/10">
                <Link
                  to={`/lessons/${lesson.id}?part=practice&from=teacher`}
                  className="flex items-center justify-between gap-3 -mx-2 px-2 py-2 rounded hover:bg-stone-100/40"
                >
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <Badge className="bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-100 text-[10px]">
                      Practice
                    </Badge>
                    AI-graded worksheet
                  </span>
                  <span className="text-xs text-stone-400">open / build →</span>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}