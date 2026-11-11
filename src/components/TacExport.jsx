import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileDown } from "lucide-react";

const KIND_LABEL = {
  quiz: "Quiz",
  assignment: "Assignment",
  notes: "Notes",
  practice: "Practice",
};

const lastNameOf = (full) => {
  const parts = String(full || "").trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : "";
};

// TAC / eSchoolPLUS grade export: one CSV per assignment per class period.
// Header row "StudentID,Score", one row per student with a positive numeric
// score (missing / zero / excused / under-review rows are skipped), Windows
// line endings (\r\n), students sorted alphabetically by last name.
export default function TacExport({ students, period, columns, scoreFor }) {
  const [selectedKey, setSelectedKey] = useState("");
  const [message, setMessage] = useState(null); // { type: "error" | "info", text }

  useEffect(() => {
    if (!columns?.length) {
      setSelectedKey("");
      return;
    }
    if (!columns.some((c) => c.key === selectedKey)) setSelectedKey(columns[0].key);
  }, [columns, selectedKey]);

  const periodStudents = useMemo(
    () =>
      (students || [])
        .filter((s) => String(s.class_period ?? "") === String(period))
        .sort((a, b) => {
          const ln = lastNameOf(a.full_name).localeCompare(lastNameOf(b.full_name));
          if (ln !== 0) return ln;
          return (a.full_name || "").localeCompare(b.full_name || "");
        }),
    [students, period]
  );

  const selectedCol = columns?.find((c) => c.key === selectedKey) || null;

  const exportCsv = () => {
    setMessage(null);
    if (period === "all") {
      setMessage({
        type: "error",
        text: "Select a specific class period above to export.",
      });
      return;
    }
    if (!periodStudents.length) {
      setMessage({ type: "error", text: "No students in the selected period." });
      return;
    }
    if (!selectedCol) {
      setMessage({ type: "error", text: "Pick an assignment to export." });
      return;
    }

    // Validate the whole period roster first — every student needs an ID on
    // file (even ones with no score this time) so the roster is ready for TAC.
    const missing = periodStudents.filter((s) => !String(s.eschool_id ?? "").trim());
    const bad = periodStudents.filter(
      (s) => s.eschool_id && /[, \n \r]/.test(String(s.eschool_id))
    );
    if (missing.length) {
      setMessage({
        type: "error",
        text: `Missing eSchoolPLUS Student ID for: ${missing
          .map((s) => s.full_name)
          .join(", ")}`,
      });
      return;
    }
    if (bad.length) {
      setMessage({
        type: "error",
        text: `Student ID contains a comma or line break for: ${bad
          .map((s) => s.full_name)
          .join(", ")}`,
      });
      return;
    }

    // Only rows with a positive numeric score are written.
    const rows = [];
    periodStudents.forEach((s) => {
      const score = scoreFor ? scoreFor(s, selectedCol) : null;
      if (score != null && score > 0) rows.push(`${String(s.eschool_id).trim()},${score}`);
    });

    const csv = ["StudentID,Score", ...rows].join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (selectedCol.name || "assignment")
      .replace(/\s+/g, "-")
      .replace(/[,:/?*"<>|]/g, "");
    a.href = url;
    a.download = `period-${period}-${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setMessage({
      type: "info",
      text: `Exported ${rows.length} student${rows.length === 1 ? "" : "s"} with positive scores.`,
    });
  };

  const periodIsAll = period === "all";
  const disabled = periodIsAll || !columns?.length || !selectedCol;
  const selectClass =
    "bg-card border border-stone-200/50 rounded-md px-3 py-1.5 text-sm text-foreground font-medium max-w-[320px]";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base flex items-center gap-2">
          <FileDown className="w-4 h-4 text-[#22D3EE]" />
          TAC / eSchoolPLUS export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-stone-300 font-mono">
            Assignment
            <select
              value={selectedKey}
              onChange={(e) => {
                setSelectedKey(e.target.value);
                setMessage(null);
              }}
              className={selectClass}
              disabled={!columns?.length}
            >
              {!columns?.length && <option value="">No assignments in scope</option>}
              {columns?.map((c) => (
                <option key={c.key} value={c.key} className="bg-card text-foreground">
                  {c.name} ({KIND_LABEL[c.kind] || c.kind})
                </option>
              ))}
            </select>
          </label>
          <Button onClick={exportCsv} disabled={disabled}>
            <FileDown className="w-4 h-4 mr-1" />
            {periodIsAll ? "Export for TAC" : `Export Period ${period} for TAC`}
          </Button>
        </div>
        <p className="text-xs text-stone-400 font-mono">
          In TAC, set the Student ID CSV field to 1 and the Score CSV field to 2,
          then check File has Header Row.
        </p>
        {periodIsAll && (
          <p className="text-xs text-amber-400">
            Select a specific class period above to export.
          </p>
        )}
        {message && (
          <p
            className={`text-sm font-mono ${
              message.type === "error" ? "text-destructive" : "text-[#39FF14]"
            }`}
          >
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}