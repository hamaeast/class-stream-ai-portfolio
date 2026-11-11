import React, { useMemo, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Admin tool: re-pull every already-cached guided-notes worksheet from Google
// Drive so edits made to the source docs appear here. Rebuilds use the link
// stored on each lesson (or the same-name search that originally found it), so
// the exact same document is refreshed. Student notes answers live in separate
// NotesResponse records and are never touched or deleted by this action.
export default function UpdateAllNotes({ lessons }) {
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const [done, setDone] = useState(0);
  const [summary, setSummary] = useState(null);

  const cached = useMemo(
    () => (lessons || []).filter((l) => l.notes_blanks_json),
    [lessons]
  );

  const run = async () => {
    if (updating || cached.length === 0) return;
    setUpdating(true);
    setDone(0);
    setSummary(null);

    const queue = [...cached];
    let completed = 0;
    let fails = 0;
    const total = cached.length;

    const worker = async () => {
      while (queue.length) {
        const l = queue.shift();
        try {
          const res = await base44.functions.invoke("buildLessonNotes", {
            lesson_id: l.id,
            force: true,
          });
          const d = res?.data || res;
          if (!d || !d.html) throw new Error("No worksheet generated");
        } catch {
          fails += 1;
        }
        completed += 1;
        setDone(completed);
      }
    };

    await Promise.all(Array.from({ length: 4 }, worker));
    setUpdating(false);
    setSummary({ total, updated: total - fails, failed: fails });
    queryClient.invalidateQueries({ queryKey: ["lessons", "ordered"] });
  };

  if (cached.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <RefreshCw className="w-4 h-4 text-accent mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {updating
                  ? `Updating notes… ${done}/${cached.length}`
                  : "Update notes from Drive"}
              </p>
              <p className="text-xs font-mono text-stone-500">
                Re-pulls {cached.length} cached worksheet{cached.length === 1 ? "" : "s"} so
                Drive edits show up here. Student answers are never touched.
              </p>
            </div>
          </div>
          <Button onClick={run} disabled={updating} size="sm" variant="outline">
            {updating ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1" />
            )}
            {updating ? "Updating…" : "Update all notes"}
          </Button>
        </div>

        {updating && (
          <div className="h-1.5 rounded-full bg-stone-200/30 overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${cached.length ? (done / cached.length) * 100 : 0}%` }}
            />
          </div>
        )}

        {summary && (
          <p
            className={`text-xs font-mono ${
              summary.failed > 0 ? "text-amber-300" : "text-[#39FF14]"
            }`}
          >
            {summary.failed > 0 ? (
              <>
                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                Updated {summary.updated}/{summary.total} · {summary.failed} couldn't refresh.
              </>
            ) : (
              `All ${summary.updated} worksheets refreshed from Drive.`
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}