import React, { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function DoNowForm({ open, record, onClose, onSave }) {
  const editing = !!record?.id;
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(record ? toForm(record) : emptyForm());
  }, [record, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ ...form, _id: record?.id });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-stone-200/20">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editing ? "Edit Do Now" : "New Do Now"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Do Now ID">
              <Input value={form.do_now_id} onChange={(e) => set("do_now_id", e.target.value)} required placeholder="CS9-D001" />
            </Field>
            <Field label="Day #">
              <Input type="number" value={form.day_number} onChange={(e) => set("day_number", num(e))} />
            </Field>
            <Field label="Points">
              <Input type="number" value={form.points_possible} onChange={(e) => set("points_possible", num(e))} />
            </Field>
            <Field label="Unit (Phase)">
              <Input value={form.phase} onChange={(e) => set("phase", e.target.value)} />
            </Field>
            <Field label="Lesson Topic">
              <Input value={form.lesson_topic} onChange={(e) => set("lesson_topic", e.target.value)} />
            </Field>
            <Field label="Time limit (min)">
              <Input type="number" value={form.time_limit_minutes} onChange={(e) => set("time_limit_minutes", num(e))} />
            </Field>
          </div>

          <Field label="Arkansas Standard">
            <Input value={form.arkansas_standard} onChange={(e) => set("arkansas_standard", e.target.value)} />
          </Field>

          <Field label="Question">
            <Textarea rows={3} value={form.question} onChange={(e) => set("question", e.target.value)} required />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Choice A"><Input value={form.choice_a} onChange={(e) => set("choice_a", e.target.value)} /></Field>
            <Field label="Choice B"><Input value={form.choice_b} onChange={(e) => set("choice_b", e.target.value)} /></Field>
            <Field label="Choice C"><Input value={form.choice_c} onChange={(e) => set("choice_c", e.target.value)} /></Field>
            <Field label="Choice D"><Input value={form.choice_d} onChange={(e) => set("choice_d", e.target.value)} /></Field>
          </div>

          <Field label="Correct answer">
            <SelectRow
              value={form.correct_answer}
              onChange={(v) => set("correct_answer", v)}
              options={["A", "B", "C", "D"]}
            />
          </Field>

          <Field label="Correct answer text">
            <Input value={form.correct_answer_text} onChange={(e) => set("correct_answer_text", e.target.value)} />
          </Field>

          <Field label="Answer explanation">
            <Textarea rows={2} value={form.answer_explanation} onChange={(e) => set("answer_explanation", e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Gradebook">
              <SelectRow
                value={form.gradebook_setting}
                onChange={(v) => set("gradebook_setting", v)}
                options={["Yes", "No", "Teacher Decides"]}
              />
            </Field>
            <Field label="Scheduled date">
              <Input type="date" value={form.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} />
            </Field>
            <div className="hidden" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Window start (HH:MM)">
              <Input type="time" value={form.scheduled_start_time} onChange={(e) => set("scheduled_start_time", e.target.value)} />
            </Field>
            <Field label="Window end / lock (HH:MM)">
              <Input type="time" value={form.scheduled_end_time} onChange={(e) => set("scheduled_end_time", e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2">
            <Toggle label="Active" checked={form.active} onChange={(v) => set("active", v)} />
            <Toggle label="Show explanation after submit" checked={form.show_explanation_after_submit} onChange={(v) => set("show_explanation_after_submit", v)} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">{editing ? "Save changes" : "Create Do Now"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-stone-400">{label}</Label>
      {children}
    </div>
  );
}

function SelectRow({ value, onChange, options }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground ring-offset-background"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o} className="bg-card text-foreground">{o}</option>
      ))}
    </select>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}

function num(e) {
  const n = parseInt(e.target.value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function emptyForm() {
  return {
    do_now_id: "",
    day_number: 0,
    phase: "",
    lesson_topic: "",
    arkansas_standard: "",
    question: "",
    choice_a: "",
    choice_b: "",
    choice_c: "",
    choice_d: "",
    correct_answer: "A",
    correct_answer_text: "",
    answer_explanation: "",
    time_limit_minutes: 5,
    points_possible: 1,
    gradebook_setting: "Teacher Decides",
    active: true,
    scheduled_date: "",
    scheduled_start_time: "",
    scheduled_end_time: "",
    show_explanation_after_submit: true,
  };
}

function toForm(r) {
  return {
    do_now_id: r.do_now_id || "",
    day_number: r.day_number || 0,
    phase: r.phase || "",
    lesson_topic: r.lesson_topic || "",
    arkansas_standard: r.arkansas_standard || "",
    question: r.question || "",
    choice_a: r.choice_a || "",
    choice_b: r.choice_b || "",
    choice_c: r.choice_c || "",
    choice_d: r.choice_d || "",
    correct_answer: r.correct_answer || "A",
    correct_answer_text: r.correct_answer_text || "",
    answer_explanation: r.answer_explanation || "",
    time_limit_minutes: r.time_limit_minutes ?? 5,
    points_possible: r.points_possible ?? 1,
    gradebook_setting: r.gradebook_setting || "Teacher Decides",
    active: !!r.active,
    scheduled_date: r.scheduled_date || "",
    scheduled_start_time: r.scheduled_start_time || "",
    scheduled_end_time: r.scheduled_end_time || "",
    show_explanation_after_submit: r.show_explanation_after_submit !== false,
  };
}