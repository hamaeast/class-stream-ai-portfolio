import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Ban, RotateCcw } from "lucide-react";
import { assignmentPeriod, assignmentAutoPeriod, periodName } from "@/lib/gradePeriods";

// Teacher controls for a single nine weeks: omit assignments from this period,
// bump an assignment into the next nine weeks, or restore previously omitted ones.
export default function NineWeeksAssignmentManager({ period, assignments, onUpdated }) {
  const [busy, setBusy] = useState(null);
  const p = Number(period);

  const assigned = useMemo(
    () => (assignments || []).filter((a) => assignmentPeriod(a.due_date, a.grade_period_override) === p),
    [assignments, p]
  );
  const omittedHere = useMemo(
    () =>
      (assignments || []).filter((a) => {
        const ap = assignmentPeriod(a.due_date, a.grade_period_override);
        const auto = assignmentAutoPeriod(a.due_date);
        return ap === "omitted" && auto === p;
      }),
    [assignments, p]
  );

  const update = async (id, override) => {
    setBusy(id);
    try {
      await base44.entities.Assignment.update(id, { grade_period_override: override });
      onUpdated?.();
    } finally {
      setBusy(null);
    }
  };

  const canBump = p < 4;

  return (
    <div className="mb-6 space-y-4">
      <div>
        <p className="font-mono text-xs text-stone-400 mb-2">
          // assignments counted in {periodName(p)}
        </p>
        {assigned.length === 0 ? (
          <p className="text-sm text-stone-500">No assignments are assigned to this nine weeks.</p>
        ) : (
          <div className="space-y-2">
            {assigned.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-md border border-stone-200/15 bg-stone-200/5 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{a.title}</p>
                  <p className="text-xs text-stone-500 font-mono">due {a.due_date || "—"}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === a.id}
                    onClick={() => update(a.id, "omitted")}
                  >
                    <Ban className="w-3.5 h-3.5 mr-1" /> Omit
                  </Button>
                  {canBump && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === a.id}
                      onClick={() => update(a.id, String(p + 1))}
                    >
                      <ArrowRight className="w-3.5 h-3.5 mr-1" /> Bump to {periodName(p + 1)}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {omittedHere.length > 0 && (
        <div>
          <p className="font-mono text-xs text-stone-400 mb-2">// omitted from {periodName(p)}</p>
          <div className="space-y-2">
            {omittedHere.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2"
              >
                <p className="text-sm text-stone-300 truncate">{a.title}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === a.id}
                  onClick={() => update(a.id, "")}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}