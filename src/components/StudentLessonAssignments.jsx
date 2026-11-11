import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Lock, FileText, Loader2, Send, Clock, PenLine } from "lucide-react";
import { isPast, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// Student view: one 5-point short-answer form per lesson. Each stays locked
// until the student has opened that lesson's document (a "lesson" check-in).
export default function StudentLessonAssignments({ lessons, assignments, student }) {
  const { toast } = useToast();
  const [checkins, setCheckins] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [practiceResponses, setPracticeResponses] = useState([]);
  const [answers, setAnswers] = useState({});
  const [savingId, setSavingId] = useState(null);

  const loadStudentData = async () => {
    if (!student) return;
    try {
      const [ci, subs, pr] = await Promise.all([
        base44.entities.CheckIn.filter({ created_by_id: student.id }),
        base44.entities.Submission.filter({ created_by_id: student.id }),
        base44.entities.PracticeResponse.filter({ created_by_id: student.id }),
      ]);
      setCheckins(ci || []);
      setSubmissions(subs || []);
      setPracticeResponses(pr || []);
    } catch (e) {
      /* ignore */
    }
  };

  useEffect(() => {
    let active = true;
    loadStudentData().then(() => { active = false; });
    return () => { active = false; };
  }, [student?.id]);

  // Refresh live when a submission is made/graded or an assignment is toggled.
  useEffect(() => {
    const handler = () => loadStudentData();
    window.addEventListener("rt:submission", handler);
    window.addEventListener("rt:assignment", handler);
    return () => {
      window.removeEventListener("rt:submission", handler);
      window.removeEventListener("rt:assignment", handler);
    };
  }, [student?.id]);

  const viewedLesson = (lessonId) =>
    (checkins || []).some((c) => c.lesson_id === lessonId && c.part === "lesson");

  const subFor = (assignmentId) =>
    (submissions || []).find((s) => s.assignment_id === assignmentId);

  const rows = useMemo(
    () =>
      (lessons || [])
        .map((l) => ({
          lesson: l,
          assignment: (assignments || []).find(
            (a) => a.lesson_id === l.id && a.title === "Assignment"
          ),
        }))
        // Unpublished ("Assign" off) assignments are hidden from students
        // entirely — only the teacher sees them on their side.
        .filter((r) => r.assignment?.published),
    [lessons, assignments]
  );

  const submit = async (a) => {
    const text = (answers[a.id] || "").trim();
    if (!text) {
      toast({ title: "Write your answer first", variant: "destructive" });
      return;
    }
    setSavingId(a.id);
    try {
      const existing = subFor(a.id);
      const payload = {
        assignment_id: a.id,
        submission_text: text,
        status: "submitted",
      };
      const res = existing
        ? await base44.entities.Submission.update(existing.id, payload)
        : await base44.entities.Submission.create(payload);
      setSubmissions((p) => [res, ...p.filter((s) => s.id !== res.id)]);
      toast({ title: "Assignment submitted!" });
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {rows.map(({ lesson, assignment }) => {
        const viewed = viewedLesson(lesson.id);
        const sub = assignment ? subFor(assignment.id) : null;
        const released = !!assignment?.published;
        const missing =
          released && !!assignment?.due_date && !sub && isPast(parseISO(assignment.due_date));
        return (
          <Card key={lesson.id}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-[#22D3EE]" />
                <h3 className="font-semibold text-foreground">{lesson.title}</h3>
                <Badge className="ml-auto bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  5 pts
                </Badge>
                {missing && (
                  <span className="inline-flex items-center rounded-full bg-red-500 text-white text-[10px] px-2 py-0.5">
                    Not turned in
                  </span>
                )}
              </div>

              {!assignment ? (
                <p className="text-sm text-stone-400">No assignment for this lesson.</p>
              ) : !released ? (
                <p className="text-sm text-stone-500 flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  Not available yet — your teacher will assign this.
                </p>
              ) : !viewed ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3">
                  <p className="text-sm text-amber-200/90 flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    Open the lesson first to unlock this assignment.
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/lessons/${lesson.id}?part=lesson`}>Open lesson</Link>
                  </Button>
                </div>
              ) : sub?.status === "graded" ? (
                <div className="space-y-2">
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Graded {sub.grade || ""}
                  </Badge>
                  {sub.feedback && (
                    <p className="text-sm text-stone-400">
                      <span className="font-medium">Feedback:</span> {sub.feedback}
                    </p>
                  )}
                  {sub.submission_text && (
                    <p className="text-sm text-stone-300 whitespace-pre-wrap bg-stone-200/5 rounded p-3 border border-stone-200/10">
                      {sub.submission_text}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {sub?.status === "submitted" && (
                    <Badge variant="secondary">Submitted — awaiting review (editable)</Badge>
                  )}
                  <Textarea
                    value={answers[assignment.id] ?? sub?.submission_text ?? ""}
                    onChange={(e) =>
                      setAnswers((p) => ({ ...p, [assignment.id]: e.target.value }))
                    }
                    placeholder="Type your answer…"
                    rows={4}
                  />
                  <Button
                    onClick={() => submit(assignment)}
                    disabled={savingId === assignment.id}
                  >
                    {savingId === assignment.id ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-1" />
                    )}
                    {sub ? "Update submission" : "Submit answer"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Practice (AI-graded) per lesson — only released practices link for students */}
      {(lessons || [])
        .filter((l) => l.practice_json && l.practice_published)
        .map((l) => {
          const pr = (practiceResponses || []).find((r) => r.lesson_id === l.id);
          return (
            <Card key={"prac-" + l.id}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <PenLine className="w-4 h-4 text-[#FF2BD6]" />
                  <h3 className="font-semibold text-foreground flex-1 truncate">{l.title}</h3>
                  {pr ? (
                    <Badge className="bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-100">
                      Practice {pr.score}/{pr.total} · attempt {pr.attempts}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-stone-400">
                      Practice
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-stone-400 mb-3">
                  {pr
                    ? "AI-graded. You can reattempt twice — re-read the lesson 5 minutes first."
                    : "Pick problems to reach the point goal; AI grades your answers."}
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/lessons/${l.id}?part=practice`}>
                    {pr ? "Open practice" : "Start practice"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}