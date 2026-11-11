import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Loader2, Hammer, BookMarked } from "lucide-react";

function parseTerms(json) {
  try {
    return JSON.parse(json || "[]");
  } catch {
    return [];
  }
}

// Teacher-only master reference: every lesson's vocabulary WORDS plus the
// teacher's definitions, grouped by phase → lesson. Backed by the admin-only
// VocabReference cache (built via buildVocabReferences, reading the lesson
// plans) so definitions are never sent to students.
export default function VocabReferencePanel({ references, building, onBuild }) {
  const [openPhases, setOpenPhases] = useState(() => new Set());

  const grouped = useMemo(() => {
    const map = new Map();
    (references || []).forEach((r) => {
      const ph = r.phase ?? null;
      if (!map.has(ph)) map.set(ph, []);
      map.get(ph).push(r);
    });
    for (const arr of map.values()) {
      arr.sort((a, b) => String(a.lesson_title || "").localeCompare(String(b.lesson_title || "")));
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] == null) return 1;
      if (b[0] == null) return -1;
      return a[0] - b[0];
    });
  }, [references]);

  const totalTerms = useMemo(
    () => (references || []).reduce((a, r) => a + parseTerms(r.terms_json).length, 0),
    [references]
  );

  const togglePhase = (key) =>
    setOpenPhases((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <BookMarked className="w-4 h-4 text-[#22D3EE]" />
          <h2 className="font-display font-semibold text-foreground">
            Vocabulary reference
          </h2>
          <span className="text-xs font-mono text-stone-500">
            {grouped.length} lessons · {totalTerms} terms
          </span>
          <Button size="sm" variant="secondary" onClick={onBuild} disabled={building} className="ml-auto">
            {building ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Hammer className="w-4 h-4 mr-1" />}
            Build / refresh
          </Button>
        </div>

        {references && references.length === 0 ? (
          <p className="text-sm font-mono text-stone-400 py-8 text-center">
            No reference yet. Click <span className="text-primary">Build / refresh</span> to pull words
            and definitions from every lesson plan.
          </p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([ph, refs]) => {
              const key = ph == null ? "unsorted" : `p${ph}`;
              const open = openPhases.has(key);
              const count = refs.reduce((a, r) => a + parseTerms(r.terms_json).length, 0);
              return (
                <div key={key} className="rounded-lg border border-stone-200/40 overflow-hidden">
                  <button
                    onClick={() => togglePhase(key)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-stone-200/5 transition-colors"
                  >
                    {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                    <span className="font-display font-semibold text-foreground">
                      {ph == null ? "Unsorted" : `Phase ${ph}`}
                    </span>
                    <span className="text-xs font-mono text-stone-500">{count} terms</span>
                    <span
                      className="ml-auto w-2 h-2 rounded-full"
                      style={{ background: `hsl(${(ph == null ? 200 : ph * 60) % 360} 90% 60%)` }}
                    />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 space-y-3">
                      {refs.map((r) => {
                        const terms = parseTerms(r.terms_json);
                        return (
                          <div key={r.id} className="rounded-md bg-background/40 border border-stone-200/30">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-200/20">
                              <BookMarked className="w-3.5 h-3.5 text-[#FF2BD6]" />
                              <h3 className="font-mono text-sm text-stone-200">{r.lesson_title}</h3>
                              <span className="text-xs font-mono text-stone-600">{terms.length}</span>
                            </div>
                            <ul className="divide-y divide-stone-200/15">
                              {terms.map((t, i) => (
                                <li key={i} className="px-3 py-2 flex gap-3 items-start">
                                  <span className="font-mono text-sm text-[#22D3EE] min-w-[140px] shrink-0">
                                    {t.word}
                                  </span>
                                  <span className="text-sm text-stone-300 leading-relaxed">
                                    {t.definition || <span className="text-stone-600 italic">— no definition —</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}