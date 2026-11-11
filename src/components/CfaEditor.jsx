import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Save, Eye, EyeOff, Trash2, Plus } from "lucide-react";

function parseQuestions(text) {
  try {
    const o = JSON.parse(text);
    if (Array.isArray(o)) return o;
  } catch {}
  return [];
}

// Teacher-only editor for one CFA: AI-generate, edit the study guide, edit
// questions, set a due date, and toggle the student release (published).
export default function CfaEditor({ cfa, onChanged }) {
  const [studyGuide, setStudyGuide] = useState(cfa.study_guide || "");
  const [questions, setQuestions] = useState(parseQuestions(cfa.questions_json));
  const [dueDate, setDueDate] = useState(cfa.due_date || "");
  const [published, setPublished] = useState(!!cfa.published);
  const [generating, setGenerating] = useState(false);
  const [savingGuide, setSavingGuide] = useState(false);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await base44.functions.invoke("buildCfa", { cfa_id: cfa.id });
      const saved = res?.data?.cfa || res?.cfa;
      if (saved) {
        setStudyGuide(saved.study_guide || "");
        setQuestions(parseQuestions(saved.questions_json));
        onChanged();
      }
    } catch (e) {
      setError(e?.message || "Failed to generate CFA");
    } finally {
      setGenerating(false);
    }
  };

  const saveGuide = async () => {
    setSavingGuide(true);
    try {
      await base44.entities.CFA.update(cfa.id, { study_guide: studyGuide });
      onChanged();
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setSavingGuide(false);
    }
  };

  const saveQuestions = async () => {
    setSavingQuestions(true);
    try {
      await base44.entities.CFA.update(cfa.id, {
        questions_json: JSON.stringify(questions),
      });
      onChanged();
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setSavingQuestions(false);
    }
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      await base44.entities.CFA.update(cfa.id, {
        published,
        due_date: dueDate || "",
      });
      onChanged();
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setSavingMeta(false);
    }
  };

  const togglePublish = async () => {
    const next = !published;
    setPublished(next);
    setSavingMeta(true);
    try {
      await base44.entities.CFA.update(cfa.id, { published: next });
      onChanged();
    } catch (e) {
      setPublished(!next);
      setError(e?.message || "Toggle failed");
    } finally {
      setSavingMeta(false);
    }
  };

  const updateQ = (i, key, val) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, [key]: val } : q)));
  const updateChoice = (i, j, val) =>
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === i
          ? { ...q, choices: q.choices.map((c, cj) => (cj === j ? val : c)) }
          : q
      )
    );
  const setCorrect = (i, j) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, answer_index: j } : q)));
  const addQuestion = () =>
    setQuestions((qs) => [
      ...qs,
      { question: "", choices: ["", "", "", ""], answer_index: 0 },
    ]);
  const removeQuestion = (i) =>
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-destructive-foreground bg-destructive/10 border border-destructive/40 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={generate} disabled={generating} variant="default">
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {generating ? "Generating…" : "AI generate study guide + CFA"}
        </Button>
        <Button
          onClick={togglePublish}
          disabled={savingMeta}
          variant={published ? "default" : "outline"}
        >
          {published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {published ? "Released to students" : "Hidden from students"}
        </Button>
        <Badge variant={published ? "default" : "secondary"} className="ml-1">
          {published ? "published" : "draft"}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-semibold">Study guide (markdown)</Label>
          <textarea
            value={studyGuide}
            onChange={(e) => setStudyGuide(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-stone-200/50 bg-input px-3 py-2 text-sm font-mono text-foreground"
            placeholder="The AI-generated study guide will appear here. Edit it as needed."
          />
          <Button onClick={saveGuide} disabled={savingGuide} size="sm" variant="outline">
            {savingGuide ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save study guide
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">
              Questions ({questions.length})
            </Label>
            <Button onClick={addQuestion} size="sm" variant="ghost">
              <Plus className="w-3.5 h-3.5" /> Add question
            </Button>
          </div>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div
                key={i}
                className="rounded-md border border-stone-200/20 bg-stone-200/5 p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono text-stone-500 mt-1.5">{i + 1}.</span>
                  <textarea
                    value={q.question}
                    onChange={(e) => updateQ(i, "question", e.target.value)}
                    rows={2}
                    className="flex-1 rounded-md border border-stone-200/40 bg-input px-2.5 py-1.5 text-sm text-foreground"
                    placeholder="Question text"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeQuestion(i)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2 pl-5">
                  {q.choices.map((c, j) => (
                    <label
                      key={j}
                      className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${
                        q.answer_index === j
                          ? "border-[#39FF14]/50 bg-[#39FF14]/10"
                          : "border-stone-200/30"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={q.answer_index === j}
                        onChange={() => setCorrect(i, j)}
                        className="accent-[#39FF14]"
                      />
                      <span className="font-mono text-[#FDE047] text-xs">
                        {["a", "b", "c", "d"][j]})
                      </span>
                      <input
                        value={c}
                        onChange={(e) => updateChoice(i, j, e.target.value)}
                        className="flex-1 bg-transparent outline-none text-foreground"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!questions.length && (
              <p className="text-sm text-stone-500">
                No questions yet. Click "AI generate" above, or "Add question" to write your own.
              </p>
            )}
          </div>
          {questions.length > 0 && (
            <Button onClick={saveQuestions} disabled={savingQuestions} size="sm" variant="outline">
              {savingQuestions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save questions
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-semibold">Due date (gradebook placement)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-input border-stone-200/50 max-w-[200px]"
            />
            <Button onClick={saveMeta} disabled={savingMeta} size="sm" variant="outline">
              {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save date
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}