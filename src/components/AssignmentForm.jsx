import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, Paperclip } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function AssignmentForm({ assignment, lessons, onSaved }) {
  const [title, setTitle] = useState(assignment?.title || "");
  const [description, setDescription] = useState(assignment?.description || "");
  const [lessonId, setLessonId] = useState(assignment?.lesson_id || "");
  const [dueDate, setDueDate] = useState(assignment?.due_date || "");
  const [fileUrl, setFileUrl] = useState(assignment?.file_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setFileUrl(res.file_url);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description,
        lesson_id: lessonId || null,
        due_date: dueDate || null,
        file_url: fileUrl || null,
      };
      if (assignment) {
        await base44.entities.Assignment.update(assignment.id, payload);
      } else {
        await base44.entities.Assignment.create(payload);
      }
      toast({ title: assignment ? "Assignment updated" : "Assignment created" });
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
        <Label htmlFor="a-title">Title</Label>
        <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assignment title" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="a-desc">Instructions</Label>
        <Textarea id="a-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What should students do?" className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Lesson</Label>
          <Select value={lessonId || "none"} onValueChange={(v) => setLessonId(v === "none" ? "" : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="No lesson" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No lesson</SelectItem>
              {(lessons || []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="a-due" className="text-xs">Due date</Label>
          <Input id="a-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Attachment</Label>
        <div className="mt-1 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-300 text-sm font-medium text-stone-700 hover:bg-stone-50 cursor-pointer">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Uploading..." : "Upload file"}
            <Input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
          </label>
          {fileUrl && (
            <span className="inline-flex items-center gap-1.5 text-sm text-stone-600">
              <Paperclip className="w-3.5 h-3.5" /> Attached
            </span>
          )}
        </div>
      </div>
      <Button onClick={save} disabled={saving || uploading} className="w-full bg-primary hover:bg-primary/90">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {assignment ? "Save changes" : "Create assignment"}
      </Button>
    </div>
  );
}