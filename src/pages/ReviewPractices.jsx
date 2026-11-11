import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ownerOf } from "@/lib/ownership";
import { Loader2, ClipboardCheck, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import CodeHeader from "@/components/CodeHeader";

// Teacher-only "manual review pane": lists every practice attempt the AI
// graded below 90% confidence (status='under_review'). The teacher checks the
// student answers against the model answer, adjusts per-question scores, and
// Approves — which finalizes the score and flips status to 'submitted' so it
// posts to the gradebook normally.

const parseJson = (v, fb) => {
  try {
    return JSON.parse(v) ?? fb;
  } catch {
    return fb;
  }
};
const practiceOf = (l) => parseJson(l?.practice_json, null);

export default function ReviewPractices() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [responses, setResponses] = useState([]);
  const [users, setUsers] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [keys, setKeys] = useState([]);
  const [editScores, setEditScores] = useState({});

  const load = async () => {
    const [resp, us, ls, ks] = await Promise.all([
      base44.entities.PracticeResponse.list(),
      base44.entities.User.list(),
      base44.entities.Lesson.list("order"),
      base44.entities.PracticeAnswerKey.list(),
    ]);
    setResponses(resp || []);
    setUsers(us || []);
    setLessons(ls || []);
    setKeys(ks || []);
    const pending = (resp || []).filter((r) => r.status === "under_review");
    const init = {};
    pending.forEach((r) => {
      const fb = parseJson(r.feedback_text, {});
      const m = {};
      Object.entries(fb).forEach(([qid, f]) => { m[qid] = f?.score ?? 0; });
      init[r.id] = m;
    });
    setEditScores(init);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (me?.role !== "admin") {
          setLoading(false);
          return;
        }
        await load();
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userMap = useMemo(() => new Map((users || []).map((u) => [u.id, u])), [users]);
  const lessonMap = useMemo(() => new Map((lessons || []).map((l) => [l.id, l])), [lessons]);
  const keyMap = useMemo(
    () => new Map((keys || []).map((k) => [k.lesson_id, parseJson(k.keys_text, [])])),
    [keys]
  );

  const pending = (responses || []).filter((r) => r.status === "under_review");

  const approve = async (r) => {
    setBusy(r.id);
    try {
      const fb = parseJson(r.feedback_text, {});
      const edits = editScores[r.id] || {};
      Object.entries(edits).forEach(([qid, sc]) => {
        if (fb[qid])
          fb[qid].score = Math.max(0, Math.min(fb[qid].max || 0, Number(sc) || 0));
      });
      const score = Object.values(fb).reduce((a, f) => a + (f?.score || 0), 0);
      const total = Object.values(fb).reduce((a, f) => a + (f?.max || 0), 0);
      await base44.entities.PracticeResponse.update(r.id, {
        status: "submitted",
        score,
        total,
        feedback_text: JSON.stringify(fb),
        review_needed: false,
      });
      toast({ title: `Approved — ${score}/${total} pts` });
      await load();
    } catch (e) {
      toast({ title: e.message || "Approve failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

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
        chip="review.queue()"
        title="Review Practices"
        subtitle="Attempts the AI graded below 90% confidence. Verify each answer, adjust scores, then Approve to post them to the gradebook."
      />
      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-stone-400">
            No practices pending review.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((r) => {
            const u = userMap.get(ownerOf(r));
            const l = lessonMap.get(r.lesson_id);
            const practice = practiceOf(l) || {};
            const keyItems = keyMap.get(r.lesson_id) || [];
            const keyById = new Map(keyItems.map((k) => [k.id, k]));
            const fb = parseJson(r.feedback_text, {});
            const answers = parseJson(r.answers_text, {});
            const conf = r.confidence != null ? Math.round(r.confidence * 100) : null;
            const qids = Object.keys(answers);
            return (
              <Card key={r.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ClipboardCheck className="w-4 h-4 text-amber-400" />
                    <h3 className="font-semibold text-foreground">
                      {u?.full_name || "Student"}
                    </h3>
                    {u?.class_period && (
                      <span className="text-xs text-stone-500 font-mono">
                        Period {u.class_period}
                      </span>
                    )}
                    <Badge variant="outline" className="text-stone-400">
                      {l?.title || "—"}
                    </Badge>
                    {conf != null && (
                      <Badge
                        className={
                          conf < 90
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        }
                      >
                        AI {conf}%
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-amber-400">
                      pending · attempt {r.attempts}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {qids.map((qid) => {
                      const q = (practice.questions || []).find((x) => x.id === qid) || {};
                      const k = keyById.get(qid) || {};
                      const f = fb[qid] || {};
                      const max = f.max ?? q.points ?? 0;
                      return (
                        <div
                          key={qid}
                          className="rounded-lg border border-stone-200/15 p-3 space-y-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono text-stone-400">
                              {q.label || q.tier || "Q"}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              {max} pts
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground">{q.prompt || k.prompt}</p>
                          <p className="text-xs text-stone-400 whitespace-pre-wrap">
                            Student: {answers[qid]}
                          </p>
                          <p className="text-xs text-[#39FF14] whitespace-pre-wrap">
                            Model: {k.model_answer || "—"}
                          </p>
                          {f?.feedback && (
                            <p className="text-xs text-[#22D3EE]">AI: {f.feedback}</p>
                          )}
                          <label className="flex items-center gap-2 text-xs font-mono text-stone-400">
                            Score
                            <Input
                              type="number"
                              min={0}
                              max={max}
                              value={editScores[r.id]?.[qid] ?? 0}
                              onChange={(e) =>
                                setEditScores((p) => ({
                                  ...p,
                                  [r.id]: { ...(p[r.id] || {}), [qid]: e.target.value },
                                }))
                              }
                              className="w-20 h-7"
                            />
                            / {max}
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-stone-500 font-mono">
                      AI score {r.score}/{r.total} · adjust above then approve
                    </span>
                    <Button size="sm" onClick={() => approve(r)} disabled={busy === r.id}>
                      {busy === r.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}{" "}
                      Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}