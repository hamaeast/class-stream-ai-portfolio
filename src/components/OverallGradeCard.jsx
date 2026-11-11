import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { percentToLetter } from "@/lib/gradePeriods";

// Shows the live overall grade for a student (or class average) for the selected scope.
export default function OverallGradeCard({ label, percent, subtitle }) {
  const letter = percent == null ? "—" : percentToLetter(percent);
  return (
    <Card className="mb-6">
      <CardContent className="p-5 flex items-center gap-5">
        <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-primary/15 border border-primary/40 shrink-0">
          <GraduationCap className="w-8 h-8 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs text-stone-400">{label}</p>
          <div className="flex items-baseline gap-4 mt-1">
            <span className="font-display text-4xl font-bold text-foreground tabular-nums">
              {percent == null ? "—" : `${percent}%`}
            </span>
            <span className="font-display text-2xl font-bold text-primary">{letter}</span>
          </div>
          {subtitle && <p className="text-xs text-stone-500 font-mono mt-1">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}