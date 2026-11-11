import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function LessonForm({ lesson, onSaved }) {
  const [title, setTitle] = useState(lesson?.title || "");
  const [description, setDescription] = useState(lesson?.description || "");
  const [content, setContent] = useState(lesson?.content || "");
  const [order, setOrder] = useState(lesson?.order || 0);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { title: title.trim(), description, content, order: Number(order) || 0 };
      if (lesson) {
        await base44.entities.Lesson.update(lesson.id, payload);
      } else {
        await base44.entities.Lesson.create(payload);
      }
      toast({ title: lesson ? "Lesson updated" : "Lesson created" });
      onSaved?.();
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="l-title">Title</Label>
        <Input id="l-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="l-desc">Short description</Label>
        <Input id="l-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief summary" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="l-content">Lesson content (Markdown supported)</Label>
        <Textarea id="l-content" value={content} onChange={(e) => setContent(e.target.value)} rows={8} placeholder="Write the lesson here..." className="mt-1 font-mono text-sm" />
      </div>
      <div>
        <Label htmlFor="l-order">Order</Label>
        <Input id="l-order" type="number" value={order} onChange={(e) => setOrder(e.target.value)} className="mt-1" />
      </div>
      <Button onClick={save} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {lesson ? "Save changes" : "Create lesson"}
      </Button>
    </div>
  );
}