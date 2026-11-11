import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { isPast, parseISO } from "date-fns";
import { ownerOf } from "@/lib/ownership";

// One-per-session reminder shown on login: any released assignment past its
// due date that the student hasn't turned in. Dismissing stashes the ids in
// sessionStorage so the prompt reappears at the next fresh login.
export default function OverdueAssignmentsDialog({ student, assignments, submissions }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem("overdue_dismissed") || "[]"));
    } catch {
      return new Set();
    }
  });

  const overdue = useMemo(() => {
    const subFor = (id) =>
      (submissions || []).find((s) => s.assignment_id === id && ownerOf(s) === student?.id);
    return (assignments || [])
      .filter((a) => a.published)
      .filter((a) => a.due_date)
      .filter((a) => !subFor(a.id)) // not turned in
      .filter((a) => isPast(parseISO(a.due_date)))
      .filter((a) => !dismissed.has(a.id));
  }, [assignments, submissions, student, dismissed]);

  const dismissAll = () => {
    const next = new Set(dismissed);
    overdue.forEach((a) => next.add(a.id));
    setDismissed(next);
    sessionStorage.setItem("overdue_dismissed", JSON.stringify([...next]));
  };

  const open = overdue.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismissAll(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Missed assignments
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-stone-500 mb-3">
          These assignments are past due and haven't been turned in:
        </p>
        <ul className="space-y-2 max-h-60 overflow-auto">
          {overdue.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
            >
              <p className="text-foreground font-medium">{a.title}</p>
              <p className="text-xs text-stone-500">Due {a.due_date}</p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={dismissAll} className="bg-primary hover:bg-primary/90">
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}