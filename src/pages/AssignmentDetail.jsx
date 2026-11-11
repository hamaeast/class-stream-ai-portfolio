import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { fnData, ownedBy } from "@/lib/ownership";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Upload, CheckCircle2, Paperclip, Link2 as LinkIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import CodeHeader from "@/components/CodeHeader";
import QuizViewer from "@/components/QuizViewer";
import GoogleDocPreview from "@/components/GoogleDocPreview";
import { NEON_CARD } from "@/lib/neon-styles";
import { useAssignment, useLesson } from "@/lib/entityQueries";
import AssignmentGradingPanel from "@/components/AssignmentGradingPanel";
import { usePreview } from "@/lib/PreviewContext";

export default function AssignmentDetail() {
  const id = window.location.pathname.split("/").pop();
  const { data: assignment, isLoading: loadingAssignment } = useAssignment(id);
  const { data: lesson } = useLesson(assignment?.lesson_id);
  const { previewStudent } = usePreview();
  const [submission, setSubmission] = useState(null);
  const [user, setUser] = useState(null);
  const [text, setText] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meLoading, setMeLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const subs = await base44.entities.Submission.filter({ assignment_id: id, ...ownedBy(me.id) });
        if (subs && subs.length) {
          setSubmission(subs[0]);
          setText(subs[0].submission_text || "");
          setFileUrl(subs[0].file_url || "");
        }
      } catch (e) {
        console.error(e);
      } finally {
        setMeLoading(false);
      }
    })();
  }, [id]);

  const loading = loadingAssignment || meLoading;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setFileUrl(res.file_url);
      toast({ title: "File attached" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!text.trim() && !fileUrl) {
      toast({ title: "Add text or a file before submitting", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Security: Submission is not student-writable; saveSubmission writes
      // the student's own row and never accepts grade/feedback/status.
      const res = await base44.functions.invoke("saveSubmission", {
        assignment_id: id,
        submission_text: text.trim(),
        file_url: fileUrl,
      });
      const saved = fnData(res).record;
      if (!saved) throw new Error("save failed");
      setSubmission(saved);
      toast({ title: "Assignment submitted!" });
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  }

  if (!assignment) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-stone-500">Assignment not found.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/">Back to dashboard</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2 font-mono text-xs text-stone-400 hover:text-[#22D3EE]">
        <Link to="/"><ArrowLeft className="w-4 h-4 mr-1" /> cd ~/dashboard</Link>
      </Button>

      {user?.role === "admin" && !previewStudent && (
        <AssignmentGradingPanel assignment={assignment} />
      )}

      <CodeHeader
        chip="assignment.run()"
        title={assignment.title}
        subtitle={assignment.due_date ? `Due ${format(parseISO(assignment.due_date), "MMMM d, yyyy")}` : "Read the instructions and submit your work."}
        tags={[
          ...(lesson ? [{ label: lesson.title, color: "text-[#FDE047] border-[#FDE047]/30 bg-[#FDE047]/10" }] : []),
          ...(assignment.points ? [{ label: `${assignment.points} pts`, color: "text-[#FF2BD6] border-[#FF2BD6]/30 bg-[#FF2BD6]/10" }] : []),
        ]}
      />
      {lesson && (
        <Link to={`/lessons/${lesson.id}`} className="text-sm text-stone-400 hover:text-[#22D3EE] -mt-4 inline-block mb-6 font-mono">{"//"} open lesson</Link>
      )}

      {assignment.description && (
        <QuizViewer description={assignment.description} />
      )}

      {assignment.file_url && (
        <div className="mb-8">
          <GoogleDocPreview
            url={assignment.file_url}
            title={assignment.title}
            height="60vh"
            showOriginal
          />
        </div>
      )}

      {submission?.status === "graded" && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-5 h-5" /> Graded
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {submission.grade && <p className="text-sm"><span className="font-medium text-emerald-900">Grade:</span> <span className="text-emerald-800">{submission.grade}</span></p>}
            {submission.feedback && <p className="text-sm text-emerald-800"><span className="font-medium">Feedback:</span> {submission.feedback}</p>}
          </CardContent>
        </Card>
      )}

      <Card className={NEON_CARD}>
        <CardHeader>
          <CardTitle className="text-lg font-mono">
            {submission ? "your_submission" : "submit_work()"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignment.submission_type === "link_embed" ? (
            <>
              <div>
                <Label htmlFor="link">Program link</Label>
                <Input
                  id="link"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="Paste your CodeHS program link here"
                  className="mt-1.5"
                  disabled={submission?.status === "graded"}
                />
              </div>
              <div>
                <Label htmlFor="embed">Or embed your program</Label>
                <Textarea
                  id="embed"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your CodeHS embed link here"
                  rows={5}
                  className="mt-1.5 font-mono text-xs"
                  disabled={submission?.status === "graded"}
                />
                {text && /</.test(text) && (
                  <div className="mt-3 rounded-lg border border-stone-200/20 overflow-hidden bg-background">
                    <p className="px-3 py-1.5 text-[10px] font-mono text-stone-500 border-b border-stone-200/10">
                      {"// live preview"}
                    </p>
                    <div className="p-3" dangerouslySetInnerHTML={{ __html: text }} />
                  </div>
                )}
                <p className="mt-2 text-[11px] font-mono text-[#FDE047]/90 leading-relaxed">
                  {"// heads up:"} in CodeHS, open your program's Share menu and set it to{" "}
                  <span className="font-semibold">Public</span> — otherwise the embed shows
                  “Oops! you don't have permission to view this program.”
                </p>
              </div>
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[#22D3EE] hover:underline break-all"
                >
                  <LinkIcon className="w-3.5 h-3.5 shrink-0" /> {fileUrl}
                </a>
              )}
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="text">Your answer</Label>
                <Textarea
                  id="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type your response here..."
                  rows={6}
                  className="mt-1.5"
                  disabled={submission?.status === "graded"}
                />
              </div>
              <div>
                <Label>Attach a file</Label>
                <div className="mt-1.5 flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-700 hover:bg-stone-50 cursor-pointer">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? "Uploading..." : "Choose file"}
                    <Input type="file" className="hidden" onChange={handleFile} disabled={uploading || submission?.status === "graded"} />
                  </label>
                  {fileUrl && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-stone-600">
                      <Paperclip className="w-3.5 h-3.5" />
                      <a href={fileUrl} target="_blank" rel="noreferrer" className="hover:underline">Attached file</a>
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
          {submission?.status !== "graded" && (
            <Button onClick={submit} disabled={saving || uploading} className="bg-primary hover:bg-primary/90">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {submission ? "Update submission" : "Submit assignment"}
            </Button>
          )}
          {submission?.status === "submitted" && (
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Submitted — awaiting review</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}