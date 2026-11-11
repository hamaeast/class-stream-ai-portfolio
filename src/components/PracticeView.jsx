import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  RotateCcw,
  Lock,
  BookOpen,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
  ClipboardCheck,
  Pencil,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePreview } from "@/lib/PreviewContext";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import GoogleDocPreview from "@/components/GoogleDocPreview";
import PracticeWorksheet from "@/components/PracticeWorksheet";
import PracticeEditor from "@/components/PracticeEditor";
import { parseLesson } from "@/lib/lessonPhases";
import { fnData, ownedBy } from "@/lib/ownership";

const parsePractice = (v) => {
  try {
    const o = JSON.parse(v);
    return o && Array.isArray(o.questions) ? o : null;
  } catch {
    return null;
  }
};
const parseJson = (v, fallback) => {
  try {
    return JSON.parse(v) ?? fallback;
  } catch {
    return fallback;
  }
};

function lessonSectionId(lesson) {
  const p = parseLesson(lesson);
  if (!p) return null;
  return p.isOverview ? "overview" : `lesson${p.num}`;
}

const MAX_ATTEMPTS = 3; // 1 first attempt + 2 reattempts
const REVIEW_MS = 5 * 60 * 1000;

export default function PracticeView({ lesson, me, isAdmin }) {
  const { previewStudent } = usePreview();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const target = previewStudent || me;
  const readOnly = !!previewStudent;

  const [practice, setPractice] = useState(() => parsePractice(lesson.practice_json));
  const [resp, setResp] = useState(null);
  const [editing, setEditing] = useState(false);
  // Draft answers persist to localStorage so a student won't lose their work
  // if they navigate away before submitting for grading.
  const draftKey = `practice_draft:${lesson.id}`;
  const [answers, setAnswers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(draftKey) || "{}") || {};
    } catch {
      return {};
    }
  });
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [grading, setGrading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err] = useState("");
  const [buildBusy, setBuildBusy] = useState(false);
  const [pracUrl, setPracUrl] = useState(lesson.practice_file_url || "");
  const [keyUrl, setKeyUrl] = useState(lesson.practice_key_file_url || "");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStart, setReviewStart] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [alertOpen, setAlertOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyItems, setKeyItems] = useState(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [notesSubmitted, setNotesSubmitted] = useState(false);
  const [notesLoading, setNotesLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [regrading, setRegrading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!target?.id) {
        setLoading(false);
        return;
      }
      try {
        const mine = await base44.entities.PracticeResponse.filter({
          lesson_id: lesson.id,
          ...ownedBy(target.id),
        });
        if (!active) return;
        setResp((mine || [])[0]);
        if (!(mine || [])[0]) setEditing(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, target?.id]);

  // Countdown once a review session has started.
  useEffect(() => {
    if (!reviewStart) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [reviewStart]);

  // Persist draft answers to localStorage synchronously on every keystroke
  // so a student's work survives a refresh or tab close even mid-type.
  useEffect(() => {
    if (readOnly || !editing) return;
    try {
      const next = JSON.stringify(answers);
      const prev = localStorage.getItem(draftKey);
      if (prev === next) return;
      localStorage.setItem(draftKey, next);
      setDraftSavedAt(Date.now());
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, editing, readOnly, draftKey]);

  // Practice unlocks only after the student finishes (submits) the notes for
  // this lesson — the lesson → notes → practice → quiz order. Admins always
  // preview the worksheet regardless.
  useEffect(() => {
    let active = true;
    (async () => {
      if (isAdmin) {
        setNotesLoading(false);
        return;
      }
      const ownerId = target?.id;
      if (!ownerId) {
        setNotesLoading(false);
        return;
      }
      try {
        const mine = await base44.entities.NotesResponse.filter({
          lesson_id: lesson.id,
          ...ownedBy(ownerId),
        });
        if (!active) return;
        setNotesSubmitted((mine || []).some((r) => r.status === "submitted"));
      } catch {
        /* ignore */
      } finally {
        if (active) setNotesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, target?.id, isAdmin]);

  const elapsed = reviewStart ? now - reviewStart : 0;
  const reviewReady = elapsed >= REVIEW_MS;
  const attempts = resp?.attempts || 0;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attempts);
  const fullyLocked = attempts >= MAX_ATTEMPTS;

  const onChange = (qid, val) => setAnswers((p) => ({ ...p, [qid]: val }));

  const save = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(answers));
      const ts = Date.now();
      setDraftSavedAt(ts);
      toast({ title: "Draft saved" });
    } catch {
      toast({ title: "Could not save draft", variant: "destructive" });
    }
  };

  const submit = async () => {
    if (readOnly) return;
    const answered = {};
    Object.keys(answers).forEach((k) => {
      if ((answers[k] || "").trim()) answered[k] = answers[k].trim();
    });
    if (!Object.keys(answered).length) {
      toast({ title: "Answer some questions first", variant: "destructive" });
      return;
    }
    const selectedPts = (practice.questions || []).reduce(
      (s, q) => s + (answered[q.id] ? q.points : 0),
      0
    );
    const goal = Math.max(10, practice.point_goal || 10);
    if (selectedPts < goal) {
      toast({
        title: `Answer at least ${goal} points worth before turning in`,
        variant: "destructive",
      });
      return;
    }
    setGrading(true);
    // Security: gradePractice grades AND saves the attempt server-side
    // (PracticeResponse is not student-writable). It applies the same rules
    // this view used to: point goal, attempt limit, under_review below 90%
    // confidence, and, if AI grading is unavailable (e.g. the app's monthly
    // integration credits are exhausted), a manual-review save so the
    // student isn't blocked and the teacher grades it instead.
    try {
      const res = await base44.functions.invoke("gradePractice", {
        lesson_id: lesson.id,
        answers: answered,
      });
      const data = fnData(res);
      const saved = data.record;
      if (!saved) throw new Error(data.error || "Could not save submission");
      const manualReview = !!data.manual_review;
      const review_needed = !!data.review_needed;
      const score = saved.score;
      const total = saved.total;
      const nextAttempt = saved.attempts;
      setResp(saved);
      setEditing(false);
      setReviewOpen(false);
      setReviewStart(null);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      setDraftSavedAt(null);
      toast({
        title: manualReview
          ? "Submitted — pending teacher grading"
          : review_needed
            ? "Graded — pending teacher review"
            : `Graded: ${score}/${total} pts`,
      });
      // Log every reattempt as a message so it shows in the student's message
      // record (and the teacher sees resubmit activity).
      if (nextAttempt > 1) {
        try {
          await base44.entities.Message.create({
            body: `Resubmitted "${practice.title || lesson.title}": attempt ${nextAttempt} — ${
              manualReview ? "pending teacher grading" : review_needed ? "pending teacher review" : `scored ${score}/${total}`
            }.`,
            target_type: "individual",
            target_user_id: target.id,
          });
        } catch {
          /* best effort */
        }
      }
    } catch (e) {
      toast({ title: e.message || "Could not save submission", variant: "destructive" });
    } finally {
      setGrading(false);
    }
  };

  const recordSkip = async () => {
    try {
      await base44.entities.Message.create({
        body: `${target?.full_name || "Student"} tried to retake "${
          practice?.title || lesson.title
        }" without completing the required 5-minute lesson review.`,
        target_type: "individual",
        target_user_id: target?.id,
      });
    } catch {
      /* best effort */
    }
  };

  const onReattack = () => {
    if (readOnly || fullyLocked) return;
    if (attempts >= 1 && !reviewReady) {
      setAlertOpen(true);
      recordSkip();
      return;
    }
    setAnswers(resp ? parseJson(resp.answers_text, {}) : {});
    setEditing(true);
  };

  const beginReview = () => {
    setReviewOpen(true);
    setReviewStart(Date.now());
    setNow(Date.now());
  };

  const toggleKey = async () => {
    if (showKey) {
      setShowKey(false);
      return;
    }
    setShowKey(true);
    if (keyItems) return;
    setKeyLoading(true);
    try {
      const keys = await base44.entities.PracticeAnswerKey.filter({
        lesson_id: lesson.id,
      });
      const items = parseJson(keys?.[0]?.keys_text, []);
      setKeyItems(Array.isArray(items) ? items : []);
    } catch {
      toast({ title: "Could not load answer key", variant: "destructive" });
      setShowKey(false);
    } finally {
      setKeyLoading(false);
    }
  };

  const build = async () => {
    setBuildBusy(true);
    try {
      const res = await base44.functions.invoke("buildLessonPractice", {
        lesson_id: lesson.id,
        practice_file_url: pracUrl,
        key_file_url: keyUrl,
      });
      const data = res.data || res;
      await queryClient.invalidateQueries({ queryKey: ["lesson", lesson.id] });
      await queryClient.invalidateQueries({ queryKey: ["lessons", "ordered"] });
      if (data?.practice) setPractice(data.practice);
      toast({ title: "Practice built" });
    } catch (e) {
      const msg =
        e?.data?.error || e?.error || e?.response?.data?.error ||
        e?.message || "Build failed";
      toast({ title: msg, variant: "destructive" });
      console.error("[buildLessonPractice]", e);
    } finally {
      setBuildBusy(false);
    }
  };

  // Load the answer key for the editor (teacher only). Reuses the same keyItems
  // state the "Show answers" toggle fills, so both views stay consistent.
  const openEditor = async () => {
    if (!keyItems) {
      setKeyLoading(true);
      try {
        const keys = await base44.entities.PracticeAnswerKey.filter({
          lesson_id: lesson.id,
        });
        setKeyItems(parseJson(keys?.[0]?.keys_text, []));
      } catch {
        setKeyItems([]);
      } finally {
        setKeyLoading(false);
      }
    }
    setEditorOpen(true);
  };

  // Teacher "source of truth" override: save BOTH the student-facing worksheet
  // (practice_json) and the server-side answer key (PracticeAnswerKey), then
  // re-grade every already-submitted attempt so posted grades reflect the new
  // questions/answers immediately — no doc re-build, no per-student manual fix.
  const savePractice = async ({ practice, keyItems: newKeyItems }) => {
    setEditorBusy(true);
    try {
      await base44.entities.Lesson.update(lesson.id, {
        practice_json: JSON.stringify(practice),
      });
      const existing = await base44.entities.PracticeAnswerKey.filter({
        lesson_id: lesson.id,
      });
      const keyPayload = {
        lesson_id: lesson.id,
        keys_text: JSON.stringify(newKeyItems),
      };
      if (existing && existing.length)
        await base44.entities.PracticeAnswerKey.update(existing[0].id, keyPayload);
      else
        await base44.entities.PracticeAnswerKey.create(keyPayload);
      setPractice(practice);
      setKeyItems(newKeyItems);

      await queryClient.invalidateQueries({ queryKey: ["lesson", lesson.id] });
      await queryClient.invalidateQueries({ queryKey: ["lessons", "ordered"] });

      // Re-grade ONLY when the answer key actually changed — an identical key
      // would re-grade every student (one LLM call each) and produce the same
      // scores, so skip the credit spend when only the worksheet text changed.
      const keyUnchanged =
        Array.isArray(keyItems) &&
        Array.isArray(newKeyItems) &&
        JSON.stringify(keyItems) === JSON.stringify(newKeyItems);
      setRegrading(true);
      let regarded = 0;
      let skipped = 0;
      try {
        if (!keyUnchanged) {
          const res = await base44.functions.invoke("regradePractice", {
            lesson_id: lesson.id,
          });
          const d = res.data || res || {};
          regarded = d.regarded ?? 0;
          skipped = d.skipped ?? 0;
        }
        // Refresh the student's own response so the page reflects the new score.
        const mine = await base44.entities.PracticeResponse.filter({
          lesson_id: lesson.id,
          ...ownedBy(target.id),
        });
        setResp((mine || [])[0] || null);
      } catch (e) {
        toast({ title: e?.message || "Re-grade failed", variant: "destructive" });
        throw e;
      } finally {
        setRegrading(false);
      }
      const msg =
        regarded > 0
          ? `Saved & re-graded ${regarded} submission${regarded === 1 ? "" : "s"}`
          : `Saved${skipped ? ` (${skipped} skipped)` : ""}`;
      toast({ title: msg });
    } catch (e) {
      toast({ title: e?.message || "Save failed", variant: "destructive" });
      throw e;
    } finally {
      setEditorBusy(false);
    }
  };

  if (loading)
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center gap-2 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading practice…
        </CardContent>
      </Card>
    );

  if (!practice) {
    if (isAdmin && !readOnly) {
      return (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-display text-lg font-bold">Build this practice</h2>
            <p className="text-sm text-stone-400">
              Paste the two Google Doc links: the student practice doc and its answer key
              (titled “practice (KEY) - …”).
            </p>
            <Input
              placeholder="Practice doc URL (practice-…)"
              value={pracUrl}
              onChange={(e) => setPracUrl(e.target.value)}
            />
            <Input
              placeholder="Answer key URL (practice (KEY)-…)"
              value={keyUrl}
              onChange={(e) => setKeyUrl(e.target.value)}
            />
            <Button onClick={build} disabled={buildBusy}>
              {buildBusy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Build practice
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="py-10 text-center text-stone-400">
          Practice not available yet.
        </CardContent>
      </Card>
    );
  }

  // Practice unlocks only after the student submits the notes for this lesson
  // (the lesson → notes → practice → quiz order). Admins always preview.
  if (!isAdmin && !notesSubmitted) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-stone-400">
          {notesLoading
            ? "Checking your notes…"
            : "Finish and submit the notes for this lesson to unlock the practice."}
        </CardContent>
      </Card>
    );
  }

  const feedback = resp ? parseJson(resp.feedback_text, {}) : {};
  const lastAnswers = resp ? parseJson(resp.answers_text, {}) : {};

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-display text-xl font-bold">{practice.title}</h2>
        <Badge variant="outline" className="text-stone-400">
          Goal {practice.point_goal || 10} pts
        </Badge>
        {resp && resp.status === "under_review" && (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
            Under review · attempt {resp.attempts}
          </Badge>
        )}
        {resp && resp.status !== "under_review" && (
          <Badge className="bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-100">
            {resp.score}/{resp.total} · attempt {resp.attempts}
          </Badge>
        )}
        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleKey}
              disabled={keyLoading}
              title="Reveal the answer key (teacher only)"
            >
              {keyLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : showKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {showKey ? "Hide answers" : "Show answers"}
            </Button>
            {!readOnly && (
              <Button
                size="sm"
                variant="ghost"
                onClick={openEditor}
                title="Edit questions & answers, then re-grade everyone"
              >
                <Pencil className="w-4 h-4" /> Edit
              </Button>
            )}
            {!readOnly && (
              <Button
                size="sm"
                variant="ghost"
                onClick={build}
                disabled={buildBusy}
                title="Re-build from doc"
              >
                {buildBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rebuild"}
              </Button>
            )}
          </div>
        )}
      </div>

      {showKey && <AnswerKeyCard items={keyItems} loading={keyLoading} />}

      {!editing && resp && resp.status !== "under_review" && (
        <ResultsBlock
          attempts={attempts}
          attemptsLeft={attemptsLeft}
          fullyLocked={fullyLocked}
          feedback={feedback}
          practice={practice}
          lastAnswers={lastAnswers}
          readOnly={readOnly}
          reviewOpen={reviewOpen}
          elapsed={elapsed}
          reviewReady={reviewReady}
          beginReview={beginReview}
          onReattack={onReattack}
          lesson={lesson}
          alertOpen={alertOpen}
          setAlertOpen={setAlertOpen}
        />
      )}

      {!editing && resp && resp.status === "under_review" && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-300">
              <ClipboardCheck className="w-5 h-5" />
              <h3 className="font-display font-bold">Under teacher review</h3>
            </div>
            <p className="text-sm text-stone-400">
              Your answers were submitted and graded, but the AI wasn't fully
              confident on some of them. Your teacher will review and post your
              final score here. No action needed — your attempt is locked in.
            </p>
            <Badge variant="secondary" className="text-amber-400">
              attempt {resp.attempts} · pending review
            </Badge>
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardContent className="p-6">
            <PracticeWorksheet
              practice={practice}
              answers={answers}
              onChange={onChange}
              onSubmit={submit}
              submitting={grading}
              submitLabel={resp ? `Submit reattempt ${attempts + 1}` : "Submit for grading"}
              onSave={save}
              draftSavedAt={draftSavedAt}
            />
          </CardContent>
        </Card>
      )}

      {err && <p className="text-xs font-mono text-destructive-foreground">{err}</p>}

      {!readOnly && isAdmin && (
        <PracticeEditor
          open={editorOpen}
          practice={practice}
          keyItems={keyItems || []}
          onClose={() => setEditorOpen(false)}
          onSave={savePractice}
          busy={editorBusy}
          regrading={regrading}
        />
      )}
    </div>
  );
}

function ResultsBlock({
  attempts,
  attemptsLeft,
  fullyLocked,
  feedback,
  practice,
  lastAnswers,
  readOnly,
  reviewOpen,
  elapsed,
  reviewReady,
  beginReview,
  onReattack,
  lesson,
  alertOpen,
  setAlertOpen,
}) {
  const answeredIds = Object.keys(lastAnswers || {});
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          {fullyLocked ? (
            <div className="flex items-center gap-2 text-stone-400">
              <Lock className="w-4 h-4" /> You've used both reattempts on this practice.
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-stone-400">
              <RotateCcw className="w-4 h-4" /> {attemptsLeft} reattempt
              {attemptsLeft > 1 ? "s" : ""} left — review the lesson again for 5 min, then
              reattempt.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {answeredIds.map((id) => {
          const q = (practice.questions || []).find((x) => x.id === id);
          const f = feedback[id];
          if (!q) return null;
          return (
            <Card key={id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] font-mono text-stone-400">
                    {q.label}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {f ? `${f.score}/${f.max}` : `${q.points}`}
                  </Badge>
                </div>
                <p className="text-sm text-foreground mb-1">{q.prompt}</p>
                <p className="text-xs text-stone-400 whitespace-pre-wrap mb-2">
                  Your answer: {lastAnswers[id]}
                </p>
                {f?.feedback && (
                  <p className="text-xs text-[#22D3EE]">AI: {f.feedback}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!readOnly && !fullyLocked && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <BookOpen className="w-4 h-4 text-[#22D3EE]" /> Reattempt requires re-reading the
              lesson for 5 minutes.
            </div>
            {!reviewOpen ? (
              <Button size="sm" variant="outline" onClick={beginReview}>
                <Clock className="w-4 h-4 mr-1" /> Begin 5-minute lesson review
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg border border-stone-200/20 overflow-hidden min-h-[60vh]">
                  <GoogleDocPreview
                    url={lesson.file_url}
                    title={lesson.title}
                    sectionId={lessonSectionId(lesson)}
                    height="60vh"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      reviewReady
                        ? "bg-[#39FF14]/20 text-[#39FF14]"
                        : "bg-amber-500/20 text-amber-300"
                    }
                  >
                    {reviewReady
                      ? "Review complete ✓"
                      : `Time on lesson: ${mins}:${String(secs).padStart(2, "0")} / 5:00`}
                  </Badge>
                  <Button size="sm" disabled={!reviewReady} onClick={onReattack}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Start reattempt
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {alertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="max-w-md w-full rounded-xl border border-stone-200 bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-[#FF2BD6] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold">Re-read the lesson first</h3>
                <p className="text-sm text-stone-400 mt-1">
                  You must open the lesson and spend at least 5 minutes on it before
                  reattempting this practice. Your attempt was recorded in messages.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setAlertOpen(false)}>Dismiss</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnswerKeyCard({ items, loading }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#FF2BD6]" />
          <h3 className="font-display font-bold">Answer key (teacher only)</h3>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-stone-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading answer key…
          </div>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-stone-400">
            No answer key cached for this practice. Rebuild it from the key doc.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((k, i) => (
              <div key={k.id || i} className="rounded-lg border border-stone-200/15 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] font-mono text-stone-400">
                    {k.label || k.tier || "Q"}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">{k.points} pts</Badge>
                </div>
                <p className="text-sm text-foreground mb-1">{k.prompt}</p>
                <p className="text-xs text-[#39FF14] whitespace-pre-wrap">
                  Answer: {k.model_answer || "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}