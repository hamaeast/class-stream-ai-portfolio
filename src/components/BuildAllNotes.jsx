import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Hammer, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { parseLesson } from "@/lib/lessonPhases";

// Admin tool: cache a guided-notes worksheet for every phase lesson that is
// missing one. Building happens under the signed-in teacher's Google Drive
// connection (the buildLessonNotes function requires auth), so this only runs
// when an admin — not a previewed student — opens the Notes page.
// If a lesson's notes won't auto-build (the Drive file is named differently or
// stored elsewhere), the admin can paste the notes document link directly.
export default function BuildAllNotes({ lessons }) {
  const queryClient = useQueryClient();
  const [building, setBuilding] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [links, setLinks] = useState({});
  const [rowBusy, setRowBusy] = useState(null);
  const [rowErr, setRowErr] = useState({});
  const [builtIds, setBuiltIds] = useState(() => new Set());
  const [sugs, setSugs] = useState({});
  const [sugBusy, setSugBusy] = useState(null);

  const missing = useMemo(
    () =>
      (lessons || []).filter((l) => {
        const p = parseLesson(l);
        return p && !p.isOverview && !l.notes_blanks_json && !builtIds.has(l.id);
      }),
    [lessons, builtIds]
  );

  const run = async () => {
    if (building || missing.length === 0) return;
    setBuilding(true);
    setDone(0);
    setFailed([]);
    setSummary(null);

    const queue = [...missing];
    let completed = 0;
    const fails = [];
    const total = missing.length;

    const worker = async () => {
      while (queue.length) {
        const l = queue.shift();
        try {
          const res = await base44.functions.invoke("buildLessonNotes", {
            lesson_id: l.id,
          });
          const d = res?.data || res;
          if (!d || !d.html) throw new Error("No notes worksheet generated");
        } catch (e) {
          fails.push({ id: l.id, title: l.title, err: e?.message || "failed" });
        }
        completed += 1;
        setDone(completed);
      }
    };

    await Promise.all(Array.from({ length: 4 }, worker));
    setFailed(fails);
    setBuilding(false);
    setSummary({ total, built: total - fails.length, failed: fails.length });
    queryClient.invalidateQueries({ queryKey: ["lessons", "ordered"] });
  };

  // Auto-build once when an admin opens the Notes page and worksheets are still
  // missing — so notes populate without a manual button press. Runs a single
  // time per mount; anything that still fails (file not in Drive) is left for
  // the manual-link panel.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || building || missing.length === 0) return;
    autoRan.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing.length]);

  const findSugs = async (l) => {
    if (sugBusy) return;
    setSugBusy(l.id);
    try {
      const res = await base44.functions.invoke("buildLessonNotes", {
        lesson_id: l.id,
        suggest: true,
      });
      const d = res?.data || res;
      setSugs((m) => ({ ...m, [l.id]: d?.candidates || [] }));
    } catch {
      setSugs((m) => ({ ...m, [l.id]: [] }));
    } finally {
      setSugBusy(null);
    }
  };

  const buildOne = async (l) => {
    const url = (links[l.id] || "").trim();
    if (!url || rowBusy) return;
    setRowBusy(l.id);
    setRowErr((m) => ({ ...m, [l.id]: undefined }));
    try {
      const res = await base44.functions.invoke("buildLessonNotes", {
        lesson_id: l.id,
        notes_file_url: url,
        force: true,
      });
      const d = res?.data || res;
      if (!d || !d.html) throw new Error("No notes worksheet generated");
      setBuiltIds((s) => new Set(s).add(l.id));
    } catch (e) {
      setRowErr((m) => ({ ...m, [l.id]: e?.message || "Could not build" }));
    } finally {
      setRowBusy(null);
    }
  };

  if (missing.length === 0 && !summary) {
    return (
      <Card className="mb-6">
        <CardContent className="py-3 flex items-center gap-2 text-xs font-mono text-stone-400">
          <CheckCircle2 className="w-4 h-4 text-[#39FF14]" />
          Every phase lesson has guided notes cached.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <Hammer className="w-4 h-4 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {building
                  ? `Building notes… ${done}/${missing.length}`
                  : `${missing.length} phase lesson${
                      missing.length === 1 ? "" : "s"
                    } still need note${
                      missing.length === 1 ? "" : "s"
                    } cached`}
              </p>
              <p className="text-xs font-mono text-stone-500">
                Pulls each worksheet from Google Drive and caches it so it's
                ready for students.
              </p>
            </div>
          </div>
          <Button onClick={run} disabled={building} size="sm">
            {building ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Hammer className="w-4 h-4 mr-1" />
            )}
            {building ? "Building…" : "Build all missing notes"}
          </Button>
        </div>

        {building && (
          <div className="h-1.5 rounded-full bg-stone-200/30 overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${missing.length ? (done / missing.length) * 100 : 0}%` }}
            />
          </div>
        )}

        {summary && (
          <p
            className={`text-xs font-mono ${
              summary.failed > 0 ? "text-amber-300" : "text-[#39FF14]"
            }`}
          >
            Built {summary.built}/{summary.total}
            {summary.failed > 0 &&
              ` · ${summary.failed} still missing — paste their links below.`}
          </p>
        )}

        {/* Manual link panel — for lessons the auto-build couldn't resolve. */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="flex items-center gap-1 text-xs font-mono text-stone-400 hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showManual ? "rotate-180" : ""}`}
            />
            Manually add a notes link ({missing.length})
          </button>

          {showManual && (
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
              {missing.length === 0 ? (
                <p className="text-xs font-mono text-stone-500">
                  Nothing missing — all notes are cached.
                </p>
              ) : (
                missing.map((l) => (
                  <div key={l.id} className="rounded-lg border border-border/60 p-2.5 space-y-2">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {l.title}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={links[l.id] || ""}
                        onChange={(e) =>
                          setLinks((m) => ({ ...m, [l.id]: e.target.value }))
                        }
                        placeholder="Paste the notes Google Doc / Drive link…"
                        className="h-8 text-xs font-mono"
                        disabled={rowBusy === l.id}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => buildOne(l)}
                        disabled={rowBusy === l.id || !(links[l.id] || "").trim()}
                      >
                        {rowBusy === l.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Build"
                        )}
                      </Button>
                    </div>
                    {rowErr[l.id] && (
                      <p className="text-[11px] font-mono text-destructive-foreground flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {rowErr[l.id]}
                      </p>
                    )}
                    {(sugs[l.id] || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {sugs[l.id].map((c, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              setLinks((m) => ({ ...m, [l.id]: c.url }))
                            }
                            className="text-[11px] font-mono px-2 py-1 rounded border border-border/60 hover:border-primary/60 text-stone-300 hover:text-foreground truncate max-w-[230px] transition-colors"
                            title={c.url}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {(sugs[l.id] || []).length === 0 && !rowErr[l.id] && (
                      <button
                        type="button"
                        onClick={() => findSugs(l)}
                        disabled={sugBusy === l.id}
                        className="text-[11px] font-mono text-stone-400 hover:text-accent transition-colors"
                      >
                        {sugBusy === l.id
                          ? "Searching Drive…"
                          : "Find matching drive link"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}