import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, BookOpen, FileText, ClipboardList, Loader2, Pencil, Trash2, Inbox, Users, Eye, ChevronRight, FolderOpen, CalendarDays, HelpCircle, Download } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import LessonForm from "@/components/LessonForm";
import AssignmentForm from "@/components/AssignmentForm";
import LessonTree from "@/components/LessonTree";
import StudentWorkDialog from "@/components/StudentWorkDialog";
import StudentEditDialog from "@/components/StudentEditDialog";
import { groupByPhase, phaseLabel } from "@/lib/lessonPhases";
import GoogleDocPreview from "@/components/GoogleDocPreview";
import PacingGuide from "@/components/PacingGuide";

const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const NEON_CARD =
  "border-stone-200/60 hover:border-primary/60 hover:shadow-[0_0_24px_-6px_hsl(187_100%_50%/0.45)] transition-all duration-200";

export default function TeacherDashboard() {
  const [tab, setTab] = useState("lessons");
  const [lessons, setLessons] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lessonDialog, setLessonDialog] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [editLesson, setEditLesson] = useState(null);
  const [editAssign, setEditAssign] = useState(null);
  const [studentView, setStudentView] = useState("all");
  const [phaseOpen, setPhaseOpen] = useState({ 1: true });
  const [checkins, setCheckins] = useState([]);
  const [quizResponses, setQuizResponses] = useState([]);
  const [workStudent, setWorkStudent] = useState(null);
  const [editStudent, setEditStudent] = useState(null);
  const [me, setMe] = useState(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    try {
      let meUser = null;
      try { meUser = await base44.auth.me(); } catch {}
      setMe(meUser);
      const [ls, as, subs, us, cis, qrs] = await Promise.all([
        base44.entities.Lesson.list("order"),
        base44.entities.Assignment.list("-created_date"),
        base44.entities.Submission.list("-created_date"),
        base44.entities.User.list(),
        base44.entities.CheckIn.list("-created_date"),
        base44.entities.QuizResponse.list("-created_date"),
      ]);
      setLessons(ls || []);
      setAssignments(as || []);
      setSubmissions(subs || []);
      setUsers(us || []);
      setCheckins(cis || []);
      setQuizResponses(qrs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Live refresh when any relevant entity changes — including from other
  // clients (e.g. a student submitting work updates the teacher's views).
  useEffect(() => {
    const handler = () => load();
    const events = ["rt:lesson", "rt:assignment", "rt:submission", "rt:quizresponse", "rt:checkin", "rt:pacingday"];
    events.forEach((e) => window.addEventListener(e, handler));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, []);

  const deleteLesson = async (id) => {
    if (!confirm("Delete this lesson?")) return;
    await base44.entities.Lesson.delete(id);
    load();
  };
  const deleteAssign = async (id) => {
    if (!confirm("Delete this assignment?")) return;
    await base44.entities.Assignment.delete(id);
    load();
  };

  const gradeSubmission = async (sub, grade, feedback) => {
    await base44.entities.Submission.update(sub.id, { grade, feedback, status: "graded" });
    load();
  };

  const returnQuiz = async (r) => {
    await base44.entities.QuizResponse.update(r.id, { status: "returned" });
    load();
  };

  const changePeriod = async (student, period) => {
    await base44.entities.User.update(student.id, { class_period: period });
    setUsers((prev) => prev.map((u) => (u.id === student.id ? { ...u, class_period: period } : u)));
  };

  const downloadCompleteCsv = async () => {
    setExporting(true);
    try {
      const res = await base44.functions.invoke("exportCompleteGradesCsv", {});
      const { csv, filename } = res.data || {};
      if (!csv) throw new Error("No CSV returned");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "classstream_complete_grades.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not generate CSV.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const students = users
    .filter((u) => u.role !== "admin")
    .sort((a, b) => (a.class_period || "99").localeCompare(b.class_period || "99") || (a.full_name || "").localeCompare(b.full_name || ""));

  const studentCount = (s) => submissions.filter((sub) => sub.created_by_id === s.id).length;

  const StudentCard = (s) => (
    <Card key={s.id} className={NEON_CARD}>
      <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{s.full_name || "Unnamed student"}</h3>
          <p className="text-xs text-stone-400 truncate">{s.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-stone-600">
            {s.grade ? `Grade ${s.grade}` : "No grade"}
          </Badge>
          <Badge variant="secondary" className="text-stone-600">
            {studentCount(s)} {studentCount(s) === 1 ? "submission" : "submissions"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setWorkStudent(s)} className="text-xs">
            <ClipboardList className="w-3.5 h-3.5 mr-1" /> View work
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditStudent(s)}
            className="text-xs"
            title="Edit student info"
          >
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-stone-500 hidden sm:block">Period</Label>
            <Select value={s.class_period || ""} onValueChange={(p) => changePeriod(s, p)}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Assign" /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p} value={p}>Period {p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const periodGroups = [...new Set(students.map((s) => s.class_period).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const unassignedStudents = students.filter((s) => !s.class_period);

  const tabs = [
    { id: "lessons", label: "Lessons", icon: BookOpen, count: lessons.length },
    { id: "quizzes", label: "Quizzes", icon: HelpCircle, count: lessons.length },
    { id: "assignments", label: "Assignments", icon: FileText, count: assignments.length },
    { id: "students", label: "Students", icon: Users, count: students.length },
    { id: "submissions", label: "Submissions", icon: ClipboardList, count: submissions.length },
    { id: "studentview", label: "Student view", icon: Eye, count: lessons.length },
    { id: "pacing", label: "Pacing Guide", icon: CalendarDays },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="relative mb-8 overflow-hidden rounded-2xl border border-stone-200/60 bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-20 -left-10 w-60 h-60 rounded-full blur-3xl opacity-30 bg-primary" />
        <div className="pointer-events-none absolute -bottom-24 right-0 w-60 h-60 rounded-full blur-3xl opacity-25 bg-[#FF2BD6]" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {["</>", "{ }", "[ ]", "0x", "=>", ";", "++", "fn"].map((g, i) => (
            <motion.span
              key={i}
              className="absolute font-mono text-sm font-semibold text-[#22D3EE]/50"
              style={{ left: `${(i * 42) % 90}%`, top: `${(i * 61) % 70}%` }}
              animate={{ y: [0, -10, 0], opacity: [0.2, 0.6, 0.2] }}
              transition={{ duration: 4 + (i % 3), repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
            >{g}</motion.span>
          ))}
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 mb-4 text-xs font-mono text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
            classroom.ready()
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#22D3EE] via-[#FF2BD6] to-[#39FF14] bg-clip-text text-transparent">
              {"<"} Teacher Dashboard {"/>"}
            </span>
          </h1>
          <p className="text-stone-400 mt-2 font-mono text-sm">
            <span className="text-[#39FF14]">$/</span> manage lessons, assignments, students & review work
          </p>
        </div>
      </header>

      {me?.role === "admin" && (
        <div className="flex justify-end mb-4">
          <Button onClick={downloadCompleteCsv} disabled={exporting} className="bg-primary hover:bg-primary/90">
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Download Complete CSV
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-stone-200 mb-6 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-mono font-medium border-b-2 -mb-px whitespace-nowrap transition-all ${
                active
                  ? "border-primary text-primary drop-shadow-[0_0_8px_hsl(187_100%_50%/0.6)]"
                  : "border-transparent text-stone-500 hover:text-[#22D3EE]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${active ? "bg-primary/20 text-primary" : "bg-stone-100 text-stone-500"}`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
      ) : tab === "lessons" ? (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={() => { setEditLesson(null); setLessonDialog(true); }} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-1" /> New lesson
            </Button>
          </div>
          {lessons.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-stone-400">No lessons yet. Create your first one.</CardContent></Card>
          ) : (() => {
            const { phases, intro } = groupByPhase(lessons);
            const sorted = [...phases.keys()].sort((a, b) => a - b);
            const renderRow = (l) => (
              <Card key={l.id} className={NEON_CARD}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{l.title}</h3>
                    <p className="text-sm text-stone-500 line-clamp-1">{l.description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button asChild variant="ghost" size="icon" title="View"><Link to={`/lessons/${l.id}?from=teacher`}><Eye className="w-4 h-4" /></Link></Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditLesson(l); setLessonDialog(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteLesson(l.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
            return (
              <div>
                {intro.length > 0 && (
                  <div className="mb-5">
                    <h3 className="font-mono text-xs text-stone-500 mb-2">// getting_started</h3>
                    <div className="space-y-2">{intro.map(renderRow)}</div>
                  </div>
                )}
                <div className="space-y-2">
                  {sorted.map((n) => {
                    const grp = phases.get(n);
                    const isOpen = !!phaseOpen[n];
                    const count = grp.lessons.length + (grp.overview ? 1 : 0);
                    return (
                      <div key={n} className="rounded-xl border border-stone-200/15 bg-card overflow-hidden">
                        <button
                          onClick={() => setPhaseOpen((p) => ({ ...p, [n]: !p[n] }))}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
                        >
                          <ChevronRight className={`w-4 h-4 text-stone-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          <FolderOpen className="w-4 h-4 text-[#22D3EE]" />
                          <span className="font-mono text-sm font-semibold text-foreground">
                            Phase {n}
                            {grp.overview && <span className="text-stone-400 font-normal"> — {phaseLabel(grp.overview)}</span>}
                          </span>
                          <Badge variant="secondary" className="ml-auto font-mono text-xs">{count} {count === 1 ? "lesson" : "lessons"}</Badge>
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 pt-2 space-y-2 border-t border-stone-200/10">
                                {grp.overview && renderRow(grp.overview)}
                                {grp.lessons.map(renderRow)}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      ) : tab === "assignments" ? (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={() => { setEditAssign(null); setAssignDialog(true); }} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-1" /> New assignment
            </Button>
          </div>
          {assignments.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-stone-400">No assignments yet.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => {
                const lesson = lessons.find((l) => l.id === a.lesson_id);
                return (
                  <Card key={a.id} className={NEON_CARD}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">{a.title}</h3>
                        <p className="text-sm text-stone-500 line-clamp-1">
                          {lesson ? lesson.title : "No lesson"}{a.due_date ? ` · Due ${a.due_date}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => { setEditAssign(a); setAssignDialog(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteAssign(a.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : tab === "students" ? (
        <div>
          {students.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-stone-400">No students have joined yet.</CardContent></Card>
          ) : (
            <div>
              <div className="flex justify-end mb-4 gap-1">
                <Button size="sm" variant={studentView === "all" ? "default" : "outline"} onClick={() => setStudentView("all")}>All</Button>
                <Button size="sm" variant={studentView === "byClass" ? "default" : "outline"} onClick={() => setStudentView("byClass")}>By class</Button>
              </div>
              {studentView === "all" ? (
                <div className="grid gap-3">{students.map(StudentCard)}</div>
              ) : (
                <div className="space-y-6">
                  {periodGroups.map((p) => {
                    const group = students.filter((s) => s.class_period === p);
                    return (
                      <div key={p}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-sm font-semibold text-foreground">Period {p}</h3>
                          <Badge variant="secondary" className="text-stone-600">{group.length}</Badge>
                        </div>
                        <div className="grid gap-3">{group.map(StudentCard)}</div>
                      </div>
                    );
                  })}
                  {unassignedStudents.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-stone-500">Unassigned</h3>
                        <Badge variant="secondary" className="text-stone-600">{unassignedStudents.length}</Badge>
                      </div>
                      <div className="grid gap-3">{unassignedStudents.map(StudentCard)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : tab === "studentview" ? (
        <LessonTree lessons={lessons} defaultOpen={[1]} />
      ) : tab === "pacing" ? (
        <PacingGuide />
      ) : tab === "quizzes" ? (
        <div>
          {lessons.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-stone-400">No lessons yet.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {lessons.map((l) => {
                const resp = quizResponses.filter((r) => r.lesson_id === l.id);
                const graded = resp.filter((r) => r.status === "graded").length;
                return (
                  <Card key={l.id} className={NEON_CARD}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <HelpCircle className="w-4 h-4 text-[#22D3EE] shrink-0" />
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground truncate">{l.title}</h3>
                          <p className="text-xs text-stone-500">
                            {graded} graded · {resp.length} attempt{resp.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/quiz?lesson_id=${l.id}&from=teacher`}>
                          <Eye className="w-3.5 h-3.5 mr-1" /> View quiz
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          {submissions.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-stone-400 flex flex-col items-center gap-2">
              <Inbox className="w-8 h-8 text-stone-300" /> No submissions yet.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {submissions.map((s) => {
                const assignment = assignments.find((a) => a.id === s.assignment_id);
                const student = users.find((u) => u.id === s.created_by_id);
                return (
                  <SubmissionRow
                    key={s.id}
                    submission={s}
                    assignment={assignment}
                    studentName={student?.full_name}
                    onGrade={gradeSubmission}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={lessonDialog} onOpenChange={setLessonDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editLesson ? "Edit lesson" : "New lesson"}</DialogTitle></DialogHeader>
          <LessonForm
            lesson={editLesson}
            onSaved={() => { setLessonDialog(false); load(); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editAssign ? "Edit assignment" : "New assignment"}</DialogTitle></DialogHeader>
          <AssignmentForm
            assignment={editAssign}
            lessons={lessons}
            onSaved={() => { setAssignDialog(false); load(); }}
          />
        </DialogContent>
      </Dialog>

      <StudentWorkDialog
        student={workStudent}
        lessons={lessons}
        assignments={assignments}
        checkins={checkins}
        submissions={submissions}
        quizResponses={quizResponses}
        onReturnQuiz={returnQuiz}
        onClose={() => setWorkStudent(null)}
      />

      <StudentEditDialog
        student={editStudent}
        open={!!editStudent}
        onOpenChange={(o) => !o && setEditStudent(null)}
        onSaved={load}
      />
    </div>
  );
}

function SubmissionRow({ submission, assignment, studentName, onGrade }) {
  const [grade, setGrade] = useState(submission.grade || "");
  const [feedback, setFeedback] = useState(submission.feedback || "");

  return (
    <Card className={NEON_CARD}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold text-foreground">{assignment?.title || "Assignment"}</h3>
            {studentName && <p className="text-xs font-medium text-stone-600">{studentName}</p>}
            <p className="text-xs text-stone-400">{submission.created_date ? new Date(submission.created_date).toLocaleString() : ""}</p>
          </div>
          {submission.status === "graded" && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Graded</Badge>}
        </div>
        {submission.submission_text && (
          <p className="text-sm text-stone-700 whitespace-pre-wrap mb-3 p-3 bg-stone-50 rounded-lg">{submission.submission_text}</p>
        )}
        {submission.file_url && (
          <div className="mb-3">
            <GoogleDocPreview
              url={submission.file_url}
              title="Submission"
              height="60vh"
              showOriginal
            />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <div>
            <Label className="text-xs">Grade</Label>
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. A, 95%" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Feedback</Label>
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Optional notes..." rows={1} className="mt-1" />
          </div>
        </div>
        <Button size="sm" className="mt-3 bg-primary hover:bg-primary/90" onClick={() => onGrade(submission, grade, feedback)}>
          Save grade
        </Button>
      </CardContent>
    </Card>
  );
}