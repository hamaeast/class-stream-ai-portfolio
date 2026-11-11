import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ClipboardList, PenLine, RotateCcw } from "lucide-react";
import GoogleDocPreview from "@/components/GoogleDocPreview";
import { ownerOf } from "@/lib/ownership";

const PART_LABEL = { lesson: "Lesson", notes: "Notes", practice: "Practice", quiz: "Quiz" };

const fmt = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

// Teacher's view of a single student's progress: every lesson part they
// opened (with datestamped checkmarks) plus every submission they turned in.
export default function StudentWorkDialog({
  student,
  lessons,
  assignments,
  checkins,
  submissions,
  quizResponses,
  onReturnQuiz,
  onClose,
}) {
  const open = !!student;
  const myCheckins = (checkins || []).filter((c) => student && c.created_by_id === student.id);
  const mySubs = (submissions || []).filter((s) => student && ownerOf(s) === student.id);
  const myQuizzes = (quizResponses || []).filter((r) => student && ownerOf(r) === student.id);

  const lessonTitle = (id) =>
    (lessons || []).find((l) => l.id === id)?.title || "Unknown lesson";
  const assignTitle = (id) =>
    (assignments || []).find((a) => a.id === id)?.title || "Assignment";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">
            {student?.full_name || "Student"}
            <span className="text-stone-400 font-normal"> — progress & work</span>
          </DialogTitle>
        </DialogHeader>

        <section className="mb-6">
          <h3 className="font-mono text-xs text-stone-500 mb-2">
            // check_ins ({myCheckins.length})
          </h3>
          {myCheckins.length === 0 ? (
            <p className="text-sm text-stone-400">No lessons opened yet.</p>
          ) : (
            <div className="space-y-1.5">
              {myCheckins.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-[#39FF14] shrink-0" />
                  <span className="text-foreground truncate flex-1">
                    {lessonTitle(c.lesson_id)}
                  </span>
                  <Badge variant="outline" className="text-stone-600">
                    {PART_LABEL[c.part] || c.part}
                  </Badge>
                  <span className="text-xs text-stone-400 tabular-nums w-28 text-right">
                    {fmt(c.created_date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-6">
          <h3 className="font-mono text-xs text-stone-500 mb-2 flex items-center gap-1.5">
            <PenLine className="w-3.5 h-3.5" /> quiz_responses ({myQuizzes.length})
          </h3>
          {myQuizzes.length === 0 ? (
            <p className="text-sm text-stone-400">No quiz answers submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {myQuizzes.map((r) => {
                const total = r.total || 0;
                const score = r.score || 0;
                let sel = {};
                try {
                  sel = JSON.parse(r.answers_text || "{}").selections || {};
                } catch {}
                const answered = Object.keys(sel).length;
                return (
                  <Card key={r.id} className="border-stone-200/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <h4 className="font-semibold text-sm text-foreground">
                          {lessonTitle(r.lesson_id)}
                        </h4>
                        {r.status === "graded" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            Graded {score}/{total}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{r.status}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-stone-500 mb-2 flex-wrap">
                        <span className="tabular-nums">{answered} answered</span>
                        {r.attempted_at && (
                          <span className="tabular-nums">
                            attempted {fmt(r.attempted_at)}
                          </span>
                        )}
                      </div>
                      {r.status === "graded" && onReturnQuiz && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => onReturnQuiz(r)}
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                          Return for another attempt
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h3 className="font-mono text-xs text-stone-500 mb-2 flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" /> submissions ({mySubs.length})
          </h3>
          {mySubs.length === 0 ? (
            <p className="text-sm text-stone-400">No submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {mySubs.map((s) => (
                <Card key={s.id} className="border-stone-200/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className="font-semibold text-sm text-foreground">
                        {assignTitle(s.assignment_id)}
                      </h4>
                      {s.status === "graded" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Graded {s.grade || ""}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Submitted</Badge>
                      )}
                    </div>
                    {s.submission_text && (
                      <p className="text-sm text-stone-700 whitespace-pre-wrap mb-2 p-2 bg-stone-50 rounded">
                        {s.submission_text}
                      </p>
                    )}
                    {s.file_url && (
                      <div className="mb-2">
                        <GoogleDocPreview
                          url={s.file_url}
                          title="Submission"
                          height="40vh"
                          showOriginal
                        />
                      </div>
                    )}
                    {s.feedback && (
                      <p className="text-xs text-stone-500 mt-2">
                        <span className="font-semibold">Feedback:</span> {s.feedback}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}