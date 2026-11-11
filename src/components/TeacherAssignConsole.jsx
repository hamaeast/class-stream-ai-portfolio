import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar as DatePicker } from "@/components/ui/calendar";
import { Calendar, Lock, Loader2, FileText, Sparkles, PenLine } from "lucide-react";
import { format, parseISO } from "date-fns";
import { assignmentPeriod, periodName } from "@/lib/gradePeriods";

// A "Change date" button that pops a calendar.
function DateButton({ value, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button" disabled={disabled} className="gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          {value ? format(parseISO(value), "MMM d, yyyy") : "Set date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <DatePicker
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onSelect(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// Teacher console: every assignment seated by its lesson, with a suggested due
// date (matched by lesson name to the district pacing calendar) and an "Assign"
// toggle that releases it to students. Clicking the date opens a calendar.
export default function TeacherAssignConsole({ assignments, lessons, pacingByLesson, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [busyL, setBusyL] = useState(null);

  const update = async (a, patch) => {
    setBusy(a.id);
    try {
      await base44.entities.Assignment.update(a.id, patch);
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  // Practice release lives on the Lesson itself (practice_published / practice_due_date),
  // released from this same pane so it follows pacing like assignments do.
  const updateLesson = async (l, patch) => {
    setBusyL(l.id);
    try {
      await base44.entities.Lesson.update(l.id, patch);
      onChanged?.();
    } finally {
      setBusyL(null);
    }
  };

  const setDue = (a, date) => update(a, { due_date: date || "" });
  const togglePublish = (a) => {
    const next = !a.published;
    const patch = { published: next };
    if (next && !a.due_date) {
      const suggestion = pacingByLesson?.get(a.lesson_id);
      if (suggestion?.date) patch.due_date = suggestion.date;
    }
    update(a, patch);
  };
  const applySuggested = (a) => {
    const suggestion = pacingByLesson?.get(a.lesson_id);
    if (suggestion?.date) update(a, { due_date: suggestion.date });
  };

  const byLesson = new Map();
  (lessons || []).forEach((l) => byLesson.set(l.id, { lesson: l, items: [] }));
  (assignments || []).forEach((a) => {
    if (byLesson.has(a.lesson_id)) byLesson.get(a.lesson_id).items.push(a);
    else byLesson.set(a.lesson_id, { lesson: { id: a.lesson_id, title: "No lesson" }, items: [a] });
  });
  const groups = [...byLesson.values()];

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-400 font-mono">
        // suggested dates come from the district pacing calendar, matched by lesson
        name — students see an assignment only after you flip the Assign toggle on
      </p>
      {groups.map(({ lesson, items }) => {
        const lessonSuggestion = pacingByLesson?.get(lesson.id);
        return (
          <Card key={lesson.id}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <FileText className="w-4 h-4 text-[#22D3EE]" />
                <h3 className="font-semibold text-foreground">{lesson.title}</h3>
                {lessonSuggestion?.date && (
                  <Badge variant="outline" className="ml-auto text-stone-400 border-stone-200/30">
                    pacing&nbsp;{lessonSuggestion.date}
                  </Badge>
                )}
              </div>
              {lessonSuggestion?.focus && (
                <p className="text-xs text-stone-500 font-mono mb-3 line-clamp-2">
                  <Sparkles className="w-3 h-3 inline mr-1 text-amber-400" />
                  {lessonSuggestion.focus}
                </p>
              )}
              {items.length === 0 ? (
                <p className="text-sm text-stone-400">No assignments.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((a) => {
                    const suggestion = pacingByLesson?.get(a.lesson_id);
                    const p = assignmentPeriod(a.due_date, a.grade_period_override);
                    const released = !!a.published;
                    return (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-stone-200/15 bg-stone-200/5 px-3 py-2 flex-wrap"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-foreground flex items-center gap-2">
                            {!released && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                            {a.title}
                            {released ? (
                              <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">
                                Assigned
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-amber-600">
                                Draft · hidden
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-stone-500 font-mono mt-0.5">
                            {released
                              ? a.due_date
                                ? `due ${format(parseISO(a.due_date), "MMM d, yyyy")}`
                                : "no due date"
                              : a.due_date
                              ? `due ${format(parseISO(a.due_date), "MMM d, yyyy")} (not assigned)`
                              : suggestion?.date
                              ? `suggested ${suggestion.date}`
                              : "no suggested date"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {p && p !== "omitted" && a.due_date && (
                            <Badge variant="secondary">{periodName(p)}</Badge>
                          )}
                          {p === "omitted" && (
                            <Badge variant="secondary" className="text-amber-600">
                              Omitted
                            </Badge>
                          )}
                          <DateButton
                            value={a.due_date || ""}
                            disabled={busy === a.id}
                            onSelect={(d) => setDue(a, d)}
                          />
                          {!a.due_date && suggestion?.date && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy === a.id}
                              onClick={() => applySuggested(a)}
                            >
                              Use suggested
                            </Button>
                          )}
                          {a.due_date && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy === a.id}
                              onClick={() => setDue(a, "")}
                              className="text-stone-500"
                            >
                              Clear
                            </Button>
                          )}
                          <label className="flex items-center gap-2 text-xs font-mono">
                            <span className={released ? "text-emerald-400" : "text-stone-400"}>
                              {released ? "Assigned" : "Assign"}
                            </span>
                            <Switch
                              checked={released}
                              disabled={busy === a.id}
                              onCheckedChange={() => togglePublish(a)}
                              className="scale-125 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-stone-600"
                            />
                          </label>
                          {busy === a.id && (
                            <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <PracticeRow
                lesson={lesson}
                pacingDate={lessonSuggestion?.date}
                busy={busyL === lesson.id}
                onUpdate={updateLesson}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Per-lesson practice release: mirrors the assignment rows — pacing-suggested
// date, an Assign switch, and "Not built" until the bulk builder has cached it.
function PracticeRow({ lesson, pacingDate, busy, onUpdate }) {
  const built = !!lesson.practice_json;
  const published = !!lesson.practice_published;
  const due = lesson.practice_due_date || "";
  const toggle = () => {
    const next = !published;
    const patch = { practice_published: next };
    if (next && !due && pacingDate) patch.practice_due_date = pacingDate;
    onUpdate(lesson, patch);
  };
  const setDue = (d) => onUpdate(lesson, { practice_due_date: d || "" });
  const p = assignmentPeriod(due, "");
  return (
    <div className="mt-3 pt-3 border-t border-stone-200/10 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-sm text-foreground flex items-center gap-2">
          <PenLine className="w-3.5 h-3.5 text-[#FF2BD6]" />
          Practice
          {!built ? (
            <Badge variant="secondary" className="text-amber-600">Not built</Badge>
          ) : published ? (
            <Badge className="bg-fuchsia-500 text-white hover:bg-fuchsia-500">Assigned</Badge>
          ) : (
            <Badge variant="secondary" className="text-amber-600">Draft · hidden</Badge>
          )}
        </p>
        <p className="text-xs text-stone-500 font-mono mt-0.5">
          {!built
            ? "Run 'Build all practices' to connect it from Drive"
            : published
            ? due
              ? `due ${format(parseISO(due), "MMM d, yyyy")}`
              : "no due date"
            : due
            ? `due ${format(parseISO(due), "MMM d, yyyy")} (not assigned)`
            : pacingDate
            ? `suggested ${pacingDate}`
            : "no suggested date"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        {p && p !== "omitted" && due && (
          <Badge variant="secondary">{periodName(p)}</Badge>
        )}
        <DateButton value={due} disabled={busy || !built} onSelect={setDue} />
        {!due && pacingDate && built && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setDue(pacingDate)}>
            Use suggested
          </Button>
        )}
        {due && built && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDue("")} className="text-stone-500">
            Clear
          </Button>
        )}
        <label className="flex items-center gap-2 text-xs font-mono">
          <span className={published ? "text-fuchsia-400" : "text-stone-400"}>
            {published ? "Assigned" : "Assign"}
          </span>
          <Switch
            checked={published}
            disabled={busy || !built}
            onCheckedChange={toggle}
            className="scale-125 data-[state=checked]:bg-fuchsia-500 data-[state=unchecked]:bg-stone-600"
          />
        </label>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
      </div>
    </div>
  );
}