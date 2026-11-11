import React, { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, MessageSquareText, Check, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// One vocabulary word. Owner (student) can edit the definition/example or
// remove the word; an admin can leave/update a teacher comment shown inline to
// the student. "lesson" source words are auto-pulled and flagged as such.
// One vocabulary word. Owner (student) can edit the definition/example or
// remove the word; an admin can leave/update a teacher comment shown inline to
// the student. "lesson" source words are auto-pulled and flagged as such.
// `referenceDef` (teacher-only) is the official definition from the master
// reference — shown only to admins so they can compare it against the
// student's own definition; never rendered for students.
export default function VocabWordCard({ word, canEdit, canComment, referenceDef, onChanged, onRemoved }) {
  const [editing, setEditing] = useState(false);
  const [definition, setDefinition] = useState(word.definition || "");
  const [example, setExample] = useState(word.example_sentence || "");
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState(word.teacher_comment || "");
  const [commentSaving, setCommentSaving] = useState(false);

  // Autosave the student's definition + example as they type (debounced). No
  // Save button needed — it persists shortly after the student stops typing.
  const [saveState, setSaveState] = useState("idle");
  useEffect(() => {
    if (!editing || !canEdit) return;
    if (definition === (word.definition || "") && example === (word.example_sentence || "")) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const updated = await base44.entities.VocabularyWord.update(word.id, {
          definition,
          example_sentence: example,
        });
        onChanged && onChanged(updated);
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition, example, editing, canEdit, word.id, word.definition, word.example_sentence]);

  const remove = async () => {
    await base44.entities.VocabularyWord.delete(word.id);
    onRemoved && onRemoved(word.id);
  };

  const saveComment = async () => {
    setCommentSaving(true);
    try {
      const now = new Date().toISOString();
      const updated = await base44.entities.VocabularyWord.update(word.id, {
        teacher_comment: comment.trim(),
        commented_at: comment.trim() ? now : "",
      });
      onChanged && onChanged(updated);
      setCommenting(false);
    } finally {
      setCommentSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-stone-200/60 bg-card p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display font-semibold text-foreground leading-tight">{word.word}</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          {word.source === "lesson" && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-primary/40 text-primary bg-primary/10"
            >
              from lesson
            </Badge>
          )}
          {canEdit && (
            <button
              onClick={() => setEditing((s) => !s)}
              className="text-stone-400 hover:text-[#22D3EE] transition-colors"
              title={editing ? "Cancel edit" : "Edit"}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {canEdit && (
            <button
              onClick={remove}
              className="text-stone-400 hover:text-destructive transition-colors"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Definition"
            rows={2}
            autoFocus
          />
          <Textarea
            value={example}
            onChange={(e) => setExample(e.target.value)}
            placeholder="Example sentence (optional)"
            rows={2}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-stone-400 h-4">
              {saveState === "saving" ? "Saving\u2026" : saveState === "saved" ? "Saved" : ""}
            </span>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="ml-auto">
              <Check className="w-3.5 h-3.5 mr-1" /> Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5">
          {word.definition ? (
            <p className="text-sm text-stone-300 leading-relaxed">
              <span className="text-[#39FF14] font-mono text-xs mr-1">def:</span>
              {word.definition}
            </p>
          ) : (
            <p className="text-sm text-stone-500 italic font-mono">No definition yet — add one.</p>
          )}
          {word.example_sentence && (
            <p className="text-sm text-stone-400 leading-relaxed mt-1.5">
              <span className="text-[#22D3EE] font-mono text-xs mr-1">ex:</span>
              {word.example_sentence}
            </p>
          )}
          {canComment && referenceDef && (
            <p className="text-xs text-[#22D3EE]/90 leading-relaxed mt-2 pt-2 border-t border-stone-200/30">
              <span className="font-mono text-[10px] text-[#22D3EE]/70 mr-1">ref def:</span>
              {referenceDef}
            </p>
          )}
        </div>
      )}

      {/* Teacher comment: shown inline to the student, editable by the teacher */}
      {(word.teacher_comment || canComment) && (
        <div className="mt-3 pt-3 border-t border-stone-200/40">
          {!commenting && word.teacher_comment && (
            <p className="text-sm text-amber-300/90 leading-relaxed">
              <MessageSquareText className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5 text-amber-400" />
              <span className="font-mono text-xs text-amber-400/80">Teacher: </span>
              {word.teacher_comment}
            </p>
          )}
          {canComment && !commenting && !word.teacher_comment && (
            <button
              onClick={() => setCommenting(true)}
              className="text-xs font-mono text-stone-400 hover:text-[#22D3EE] transition-colors"
            >
              + add teacher comment
            </button>
          )}
          {canComment && commenting && (
            <div className="space-y-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Leave a comment for this word…"
                rows={2}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveComment} disabled={commentSaving}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Save comment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCommenting(false)}
                  disabled={commentSaving}
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          )}
          {canComment && !commenting && word.teacher_comment && (
            <button
              onClick={() => {
                setComment(word.teacher_comment || "");
                setCommenting(true);
              }}
              className="text-xs font-mono text-stone-500 hover:text-[#22D3EE] transition-colors mt-1.5"
            >
              edit comment
            </button>
          )}
        </div>
      )}
    </div>
  );
}