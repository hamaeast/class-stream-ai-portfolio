import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];

// Edit the fields a teacher can legitimately change for a student profile:
// assigned class period and grade level. The student's name and email come
// from their sign-in account and are read-only here.
export default function StudentEditDialog({ student, open, onOpenChange, onSaved }) {
  const name = student?.full_name || "";
  const email = student?.email || "";
  const [classPeriod, setClassPeriod] = useState(student?.class_period || "");
  const [grade, setGrade] = useState(student?.grade || "");
  const [eschoolId, setEschoolId] = useState(student?.eschool_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setClassPeriod(student?.class_period || "");
    setGrade(student?.grade || "");
    setEschoolId(student?.eschool_id || "");
    setError("");
  }, [student]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await base44.entities.User.update(student.id, {
        class_period: classPeriod,
        grade,
        eschool_id: eschoolId.trim(),
      });
      onSaved?.();
      onOpenChange?.(false);
    } catch (e) {
      setError(e?.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit student info</DialogTitle>
          <DialogDescription>
            Update this student's class period or grade level.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-stone-400">Name (read-only)</Label>
            <Input value={name} disabled className="bg-secondary/40" />
            <p className="text-xs text-stone-500">
              Names are set from the student's sign-in account and can't be
              edited here.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-stone-400">Email (read-only)</Label>
            <Input value={email} disabled className="bg-secondary/40" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Class period</Label>
              <Select value={classPeriod} onValueChange={setClassPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign" />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p} value={p}>
                      Period {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Grade level</Label>
              <Input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. 9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">eSchoolPLUS Student ID</Label>
            <Input
              value={eschoolId}
              onChange={(e) => setEschoolId(e.target.value)}
              placeholder="e.g. 123456"
            />
            <p className="text-xs text-stone-500">
              Required for the TAC gradebook CSV export.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange?.(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}