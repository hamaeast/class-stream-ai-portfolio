import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Loader2, CalendarDays } from "lucide-react";

// Native rendering of the uploaded district pacing calendar, straight from the
// PacingDay records (imported spreadsheet). Shown on the student and teacher
// dashboards only.
export default function PacingGuide() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    base44.entities.PacingDay
      .list()
      .then((r) => setRows(r || []))
      .catch(() => setRows([]));
  }, []);

  const ordered = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [rows]);

  if (rows === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <div className="py-6 text-center text-stone-400 text-sm">
          Pacing guide not available.
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-stone-200/40 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-200/30">
        <CalendarDays className="w-4 h-4 text-[#22D3EE]" />
        <h3 className="font-semibold text-foreground">District Pacing Calendar</h3>
        <span className="ml-auto text-xs text-stone-500 font-mono">
          {rows.length} instructional days
        </span>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="text-left text-stone-400 font-mono text-xs">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Day</th>
              <th className="px-2 py-2 font-medium">Phase</th>
              <th className="px-2 py-2 font-medium">Lesson / Focus</th>
              <th className="px-2 py-2 font-medium hidden sm:table-cell">Standards</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, i) => {
              const phase = r.phase || "";
              const m = String(phase).match(/^Phase\s*(\d+)/i);
              const isOri = /orientation/i.test(phase);
              return (
                <tr
                  key={r.id || i}
                  className={`border-t border-stone-200/10 ${
                    isOri ? "bg-amber-500/5" : m && Number(m[1]) % 2 === 0 ? "bg-stone-200/5" : ""
                  }`}
                >
                  <td className="px-4 py-1.5 font-mono text-stone-300 whitespace-nowrap">
                    {r.date}
                  </td>
                  <td className="px-2 py-1.5 text-stone-400">{r.day || "—"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {m ? (
                      <span className="text-[#22D3EE] font-mono">P{m[1]}</span>
                    ) : isOri ? (
                      <span className="text-amber-400 font-mono text-[10px]">ORI</span>
                    ) : (
                      <span className="text-stone-500">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-stone-300">{r.lesson_focus || "—"}</td>
                  <td className="px-2 py-1.5 text-stone-500 text-xs hidden sm:table-cell">
                    {r.standards || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}