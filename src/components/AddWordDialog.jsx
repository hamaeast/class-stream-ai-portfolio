import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { groupByPhase, parseLesson } from "@/lib/lessonPhases";
import { useMe } from "@/lib/entityQueries";

// Modal form so a student can add a word to their vocabulary list, tagged to a
// specific lesson. Lessons are grouped by phase in the dropdown for easy
// picking; default selection is the lesson they came from (when provided).
export default function AddWordDialog({
  open,
  onOpenChange,
  lessons,
  defaultLessonId,
  defaultPhase,
  onAdded,
}) {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [example, setExample] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { data: me } = useMe();

  const grouped = useMemo(() => groupByPhase(lessons || []), [lessons]);

  useEffect(() => {
    if (open) {
      setWord("");
      setDefinition("");
      setExample("");
      setLessonId(defaultLessonId || "");
      setError("");
    }
  }, [open, defaultLessonId]);

  const submit = async () => {
    if (!word.trim()) {
      setError("Enter a word.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const lesson = (lessons || []).find((l) => l.id === lessonId);
      const p = lesson ? parseLesson(lesson) : null;
      const phase = p?.phase ?? defaultPhase ?? null;
      const rec = await base44.entities.VocabularyWord.create({
        word: word.trim(),
        definition: definition.trim(),
        example_sentence: example.trim(),
        phase,
        lesson_id: lessonId || "",
        lesson_title: lesson?.title || "",
        source: "student",
        student_id: me?.id || "",
      });
      onAdded && onAdded(rec);
      onOpenChange(false);
    } catch (e) {
      setError(e.message || "Could not save the word.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">Add a vocabulary word</DialogTitle>
          <DialogDescription className="font-mono">
            Save a term to your personal list. Tag it to a lesson so it sorts into the right phase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="vw-word">Word</Label>
            <Input
              id="vw-word"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="e.g. algorithm"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vw-def">Definition</Label>
            <Textarea
              id="vw-def"
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder="What does it mean?"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vw-ex">Example sentence (optional)</Label>
            <Textarea
              id="vw-ex"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder="Use it in a sentence."
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vw-lesson">Tag to lesson</Label>
            <select
              id="vw-lesson"
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className="w-full bg-card border border-stone-200/60 rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="">Unsorted</option>
              {[...grouped.phases.entries()].map(([phase, g]) => (
                <optgroup key={phase} label={`Phase ${phase}`} className="text-stone-400">
                  {g.overview && (
                    <option value={g.overview.id} className="bg-card text-foreground">
                      {g.overview.title}
                    </option>
                  )}
                  {g.lessons.map((l) => (
                    <option key={l.id} value={l.id} className="bg-card text-foreground">
                      {l.title}
                    </option>
                  ))}
                </optgroup>
              ))}
              {grouped.intro.map((l) => (
                <option key={l.id} value={l.id} className="bg-card text-foreground">
                  {l.title}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive-foreground font-mono">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !word.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Save word
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}