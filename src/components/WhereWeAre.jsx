import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MapPin } from "lucide-react";
import { NEON_CARD } from "@/lib/neon-styles";

// PacingDay.date is stored as "MM/DD/YYYY" (the spreadsheet format).
const parseDate = (s) => {
  if (!s) return null;
  const [m, d, y] = String(s).split("/");
  if (!m || !d || !y) {
    const p = new Date(s);
    return isNaN(p) ? null : p;
  }
  return new Date(Number(y), Number(m) - 1, Number(d));
};

// Shows where the class should currently be in the pacing calendar — the
// most recent instructional day on or before today. Lives in the Home right
// rail so students/teachers can see "what we're supposed to be on right now".
export default function WhereWeAre() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    base44.entities.PacingDay
      .list()
      .then((r) => setRows(r || []))
      .catch(() => setRows([]));
  }, []);

  const current = useMemo(() => {
    if (!rows || !rows.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sorted = [...rows].sort(
      (a, b) => parseDate(a.date) - parseDate(b.date)
    );
    const onOrBefore = sorted.filter((r) => {
      const d = parseDate(r.date);
      return d && d <= today;
    });
    return onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : null;
  }, [rows]);

  if (rows === null) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
      </div>
    );
  }
  if (!current) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-stone-400 text-sm">
          Pacing not available.
        </CardContent>
      </Card>
    );
  }

  const m = String(current.phase || "").match(/^Phase\s*(\d+)/i);
  const phaseNum = m ? `Phase ${m[1]}` : current.phase || "";

  return (
    <Card className={NEON_CARD}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-stone-500 font-mono">
          <MapPin className="w-3 h-3 text-[#22D3EE]" />
          {current.date} {current.day ? `· ${current.day}` : ""}
          {current.day_in_phase ? ` · Day ${current.day_in_phase}` : ""}
        </div>
        <div>
          <p className="font-mono text-xs text-stone-400">You should be on</p>
          <h3 className="font-semibold text-foreground text-sm leading-snug">
            {phaseNum}
          </h3>
          {current.lesson_focus && (
            <p className="text-sm text-stone-300 mt-0.5">{current.lesson_focus}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}