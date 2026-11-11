import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PenLine, AlertTriangle } from "lucide-react";
import { periodName } from "@/lib/gradePeriods";
import StudentEditDialog from "@/components/StudentEditDialog";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";

const KIND_BUBBLE = {
  quiz: "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/40",
  assignment:
    "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#FF2BD6]/15 text-[#FF2BD6] border-[#FF2BD6]/40",
  notes:
    "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#39FF14]/15 text-[#bff9bf] border-[#39FF14]/40",
  practice:
    "rounded-full border px-1.5 py-0.5 text-[10px] font-mono leading-none bg-[#A855F7]/15 text-[#C4B5FD] border-[#A855F7]/40",
};

const fmt = (d) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";

// Teacher drill-in for a single student: every gradeable item across all nine
// weeks, a focused "missing" tab, and an inline edit of the student's profile
// (class period / grade level).
export default function StudentGradesDialog({
  student,
  gradeables,
  open,
  onOpenChange,
  onSaved,
  overrideMap,
  onOverridesChanged,
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState("all");
  if (!student) return null;

  const missing = gradeables.filter(
    (g) => g.status === "missing" || g.status === "missed"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="font-mono text-lg">
                {student.full_name}
              </DialogTitle>
              <DialogDescription className="font-mono">
                Period {student.class_period || "—"} · Grade{" "}
                {student.grade || "—"}
              </DialogDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <PenLine className="w-4 h-4 mr-1" /> Edit profile
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">
              All assignments ({gradeables.length})
            </TabsTrigger>
            <TabsTrigger value="missing">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              Missing ({missing.length})
            </TabsTrigger>
            <TabsTrigger value="overrides">
              <PenLine className="w-3.5 h-3.5 mr-1" />
              Overrides
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <GradeablesTable gradeables={gradeables} />
          </TabsContent>

          <TabsContent value="missing">
            {missing.length === 0 ? (
              <p className="text-sm text-stone-400 py-8 text-center">
                No missing work — everything's turned in or graded.
              </p>
            ) : (
              <GradeablesTable gradeables={missing} highlightMissing />
            )}
          </TabsContent>

          <TabsContent value="overrides">
            <OverrideEditor
              key={student.id}
              student={student}
              gradeables={gradeables}
              overrideMap={overrideMap}
              onOverridesChanged={onOverridesChanged}
            />
          </TabsContent>
        </Tabs>

        <StudentEditDialog
          student={student}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

function GradeablesTable({ gradeables, highlightMissing }) {
  return (
    <div className="overflow-x-auto rounded border border-stone-200/10">
      <table className="w-full text-sm">
        <thead className="bg-stone-200/10 text-stone-400 font-mono text-xs">
          <tr>
            <th className="text-left px-3 py-2">Item</th>
            <th className="text-left px-3 py-2">Type</th>
            <th className="text-center px-3 py-2">Score / Grade</th>
            <th className="text-center px-3 py-2">%</th>
            <th className="text-right px-3 py-2">Date</th>
            <th className="text-center px-3 py-2">Status</th>
            <th className="text-left px-3 py-2">Section</th>
          </tr>
        </thead>
        <tbody>
          {gradeables.map((g, i) => (
            <tr key={i} className="border-t border-stone-200/10">
              <td className="px-3 py-2 text-white">{g.name}</td>
              <td className="px-3 py-2">
                <span className={KIND_BUBBLE[g.kind]}>{g.kind}</span>
              </td>
              <td className="px-3 py-2 text-center font-mono tabular-nums">
                {g.value}
              </td>
              <td className="px-3 py-2 text-center">
                {g.percent !== null && g.percent !== undefined ? (
                  <Badge
                    variant="outline"
                    className={
                      g.percent >= 70
                        ? "border-[#39FF14]/40 text-[#bff9bf] bg-[#39FF14]/10"
                        : "border-destructive/40 text-destructive-foreground bg-destructive/10"
                    }
                  >
                    {g.percent}%
                  </Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-right text-xs text-stone-400 tabular-nums">
                {fmt(g.date)}
              </td>
              <td className="px-3 py-2 text-center">
                <span
                  className={
                    g.exempt
                      ? "text-amber-400 italic"
                      : g.overridden
                      ? "text-[#22D3EE]"
                      : g.status === "missing" || g.status === "missed"
                      ? "text-destructive-foreground"
                      : "text-stone-400"
                  }
                >
                  {g.exempt ? "exempt" : g.overridden ? "override" : g.status}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-stone-400 font-mono">
                {g.omitted
                  ? "Omitted"
                  : g.period
                  ? periodName(g.period)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverrideEditor({ student, gradeables, overrideMap, onOverridesChanged }) {
  const map = overrideMap || new Map();
  const [vals, setVals] = useState(() => {
    const m = {};
    gradeables.forEach((g) => {
      const ov = map.get(`${student.id}|${g.columnKey}`);
      m[g.columnKey] = ov ? ov.value : "";
    });
    return m;
  });
  const [saving, setSaving] = useState(null);

  const save = async (g) => {
    const v = (vals[g.columnKey] || "").trim();
    setSaving(g.columnKey);
    try {
      const existing = map.get(`${student.id}|${g.columnKey}`);
      if (!v) {
        if (existing) await base44.entities.GradeOverride.delete(existing.id);
      } else if (existing) {
        await base44.entities.GradeOverride.update(existing.id, { value: v });
      } else {
        await base44.entities.GradeOverride.create({
          student_id: student.id,
          column_key: g.columnKey,
          value: v,
        });
      }
      if (onOverridesChanged) await onOverridesChanged();
    } finally {
      setSaving(null);
    }
  };

  const clearOverride = async (g) => {
    const existing = map.get(`${student.id}|${g.columnKey}`);
    if (!existing) {
      setVals((v) => ({ ...v, [g.columnKey]: "" }));
      return;
    }
    setSaving(g.columnKey);
    try {
      await base44.entities.GradeOverride.delete(existing.id);
      setVals((v) => ({ ...v, [g.columnKey]: "" }));
      if (onOverridesChanged) await onOverridesChanged();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="rounded border border-stone-200/10">
      <p className="px-3 py-2 text-xs text-stone-400 font-mono bg-stone-200/5 border-b border-stone-200/10">
        Enter a percent (0–100), a letter grade (A, B+, …), or{" "}
        <span className="text-amber-400">EX</span> to exempt a student. Clear
        removes the override.
      </p>
      <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-200/10 text-stone-400 font-mono text-xs sticky top-0">
            <tr>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-center px-3 py-2">Current</th>
              <th className="text-left px-3 py-2">Override</th>
            </tr>
          </thead>
          <tbody>
            {gradeables.map((g, i) => {
              const ov = map.get(`${student.id}|${g.columnKey}`);
              return (
                <tr key={i} className="border-t border-stone-200/10">
                  <td className="px-3 py-2 text-white">{g.name}</td>
                  <td className="px-3 py-2">
                    <span className={KIND_BUBBLE[g.kind]}>{g.kind}</span>
                  </td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums text-stone-300">
                    {g.value}
                    {g.percent != null ? ` · ${g.percent}%` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={vals[g.columnKey] || ""}
                        onChange={(e) =>
                          setVals((v) => ({ ...v, [g.columnKey]: e.target.value }))
                        }
                        placeholder="85, B+, or EX"
                        className="w-28 h-8 font-mono text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() =>
                          setVals((v) => ({ ...v, [g.columnKey]: "EX" }))
                        }
                      >
                        EX
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        disabled={saving === g.columnKey}
                        onClick={() => save(g)}
                      >
                        {saving === g.columnKey ? "Saving…" : "Save"}
                      </Button>
                      {ov && (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          disabled={saving === g.columnKey}
                          onClick={() => clearOverride(g)}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}