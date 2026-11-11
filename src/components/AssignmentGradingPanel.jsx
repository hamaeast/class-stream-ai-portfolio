import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NEON_CARD } from "@/lib/neon-styles";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2, CheckCircle2, ClipboardList, Link as LinkIcon, Save } from "lucide-react";

// Sort the class the same way the gradebook does: period, then last name.
const sortStudents = (list) =>
  [...list].sort((a, b) => {
    const pa = String(a.class_period ?? "");
    const pb = String(b.class_period ?? "");
    if (pa !== pb) {
      if (!pa) return 1;
      if (!pb) return -1;
      return pa.localeCompare(pb, undefined, { numeric: true });
    }
    const la = (a.full_name || "").trim().split(/\s+/).pop().toLowerCase();
    const lb = (b.full_name || "").trim().split(/\s+/).pop().toLowerCase();
    return la.localeCompare(lb);
  });

// Teacher-only panel: every student's program for this assignment, ready to grade.
export default function AssignmentGradingPanel({ assignment }) {
  const [students, setStudents] = useState([]);
  const [subIndex, setSubIndex] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [openPanel, setOpenPanel] = useState(true);

  const load = async () => {
    if (!assignment?.id) return;
    try {
      const [users, subs] = await Promise.all([
        base44.entities.User.list(),
        base44.entities.Submission.filter({ assignment_id: assignment.id }),
      ]);
      setStudents(sortStudents((users || []).filter((u) => u.role !== "admin")));
      const map = new Map();
      (subs || []).forEach((s) => map.set(s.created_by_id, s));
      setSubIndex(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [assignment?.id]);

  const submittedCount = students.filter((s) => subIndex.get(s.id)).length;

  return (
    <Card className={`mb-6 ${NEON_CARD}`}>
      <CardHeader className="pb-3">
        <button
          onClick={() => setOpenPanel((v) => !v)}
          className="w-full flex items-center gap-2 text-left"
        >
          <ClipboardList className="w-4 h-4 text-[#FF2BD6] shrink-0" />
          <CardTitle className="font-mono text-base text-[#FF2BD6] flex-1">
            {"// grade submissions"}
          </CardTitle>
          <span className="text-xs font-mono text-stone-400 shrink-0">
            {submittedCount}/{students.length} submitted
          </span>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-stone-400 transition-transform shrink-0",
              openPanel && "rotate-180"
            )}
          />
        </button>
      </CardHeader>
      {openPanel && (
        <CardContent className="space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
          ) : students.length === 0 ? (
            <p className="text-sm text-stone-500 italic">No students yet.</p>
          ) : (
            students.map((s) => (
              <StudentRow
                key={s.id}
                student={s}
                submission={subIndex.get(s.id)}
                onSaved={load}
              />
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
}

function StudentRow({ student, submission, onSaved }) {
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(submission?.grade || "");
  const [feedback, setFeedback] = useState(submission?.feedback || "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Submission.update(submission.id, {
        grade,
        feedback,
        status: "graded",
      });
      toast({ title: `Grade saved for ${student.full_name || "student"}` });
      onSaved();
    } catch {
      toast({ title: "Could not save grade", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-stone-200/15 bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 text-stone-400 transition-transform shrink-0",
            open && "rotate-180"
          )}
        />
        <span className="font-medium text-foreground flex-1 truncate">
          {student.full_name || "Unnamed student"}
        </span>
        <span className="text-xs text-stone-500 font-mono shrink-0">
          Per {student.class_period || "—"}
        </span>
        {submission ? (
          <Badge className="bg-[#39FF14]/15 text-[#bff9bf] border-[#39FF14]/40 font-mono shrink-0">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {submission.status === "graded"
              ? `Graded ${submission.grade || ""}`.trim()
              : "Submitted"}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-stone-500 border-stone-500/40 font-mono shrink-0"
          >
            Not submitted
          </Badge>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-stone-200/10">
          {!submission ? (
            <p className="text-sm text-stone-500 italic">Nothing turned in yet.</p>
          ) : (
            <>
              {submission.file_url && (
                <div>
                  <p className="text-xs font-mono text-stone-400 mb-1 flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" /> Program link
                  </p>
                  <a
                    href={submission.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[#22D3EE] hover:underline break-all"
                  >
                    {submission.file_url}
                  </a>
                </div>
              )}
              {submission.submission_text?.includes("<") && (
                <div>
                  <p className="text-xs font-mono text-stone-400 mb-1">
                    Embed preview
                  </p>
                  <div className="rounded-lg border border-stone-200/20 overflow-hidden bg-background">
                    <div
                      className="p-3"
                      dangerouslySetInnerHTML={{ __html: submission.submission_text }}
                    />
                  </div>
                </div>
              )}
              {submission.submission_text &&
                !submission.submission_text.includes("<") && (
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {submission.submission_text}
                  </p>
                )}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Grade</Label>
                  <Input
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    placeholder="e.g. 23/25 or A"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Feedback</Label>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Optional notes..."
                    rows={1}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={save}
                disabled={saving}
                className="bg-primary hover:bg-primary/90"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1" />
                )}
                Save grade
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}