import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, GraduationCap } from "lucide-react";

const GRADES = ["9", "10", "11", "12", "Other"];
const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];

export default function StudentOnboarding({ onDone }) {
  const [grade, setGrade] = useState("");
  const [period, setPeriod] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!grade || !period) return;
    setSaving(true);
    try {
      await base44.auth.updateMe({ grade, class_period: period, onboarded: true });
      onDone({ grade, class_period: period, onboarded: true });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-md [&>button]:hidden">
        <DialogHeader>
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-2">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <DialogTitle>Welcome! Let's set up your profile</DialogTitle>
          <DialogDescription>
            Tell us your grade and class period so your teacher can place you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Grade</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select your grade" /></SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={g}>{g === "Other" ? "Other" : `Grade ${g}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Class period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select your class period" /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p} value={p}>Period {p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={!grade || !period || saving} className="bg-primary hover:bg-primary/90 w-full">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}