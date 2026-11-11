import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, BookMarked, Plus, ChevronDown, ChevronRight, Users, Sparkles } from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import AddWordDialog from "@/components/AddWordDialog";
import VocabWordCard from "@/components/VocabWordCard";
import VocabReferencePanel from "@/components/VocabReferencePanel";
import { useVocabulary } from "@/lib/vocabQueries";
import { useLessons, useMe, usePacingDays, useVocabReferences } from "@/lib/entityQueries";
import { usePreview } from "@/lib/PreviewContext";
import { SECTION_HEADING } from "@/lib/neon-styles";
import { LESSON_PLAN_DOCS } from "@/lib/lessonPlans";
import { reachedLessonIds, reachedDocList, todayISO } from "@/lib/vocabPacing";

// Persists which phase accordions are open on the Vocabulary page so they
// stay open/closed when a student navigates away and comes back.
const VOCAB_OPEN_KEY = "vocab.openPhases";

// Vocabulary tracker: students grow a personal list grouped by phase and
// lesson, auto-pulled in step with the pacing guide (up to the current
// lesson). Teachers get a master reference (all lessons + definitions) and can
// also browse any student's list and leave inline comments on their words.
export default function Vocabulary() {
  const { previewStudent } = usePreview();
  const { data: me } = useMe();
  const { data: lessons = [] } = useLessons();
  const { data: pacing = [] } = usePacingDays();
  const { data: vocabRefs = [], refetch: refetchRefs } = useVocabReferences();
  const [params] = useSearchParams();
  const defaultLessonId = params.get("lesson_id") || "";

  const isAdminViewer = me?.role === "admin";
  const actingAsStudent = !!previewStudent || !isAdminViewer;
  const canComment = isAdminViewer && !previewStudent;

  // Admin (not preview) picks a student to view; students and preview always
  // show the acting student's own list.
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  useEffect(() => {
    if (!isAdminViewer || previewStudent) return;
    (async () => {
      try {
        const us = await base44.entities.User.list();
        setStudents((us || []).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")));
      } catch {
        /* ignore */
      }
    })();
  }, [isAdminViewer, previewStudent]);

  const target = previewStudent || (isAdminViewer && !previewStudent ? students.find((s) => s.id === selectedStudentId) || null : me);
  const targetId = target?.id;
  const { data: words = [], isLoading, refetch } = useVocabulary(targetId);

  const [addOpen, setAddOpen] = useState(false);
  // Restore open phases from sessionStorage on mount; null = not yet
  // defaulted from loaded words (first visit).
  const [openPhases, setOpenPhases] = useState(() => {
    try {
      const saved = sessionStorage.getItem(VOCAB_OPEN_KEY);
      if (saved) return new Set(JSON.parse(saved));
    } catch {
      /* ignore */
    }
    return null;
  });
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState("");

  // ── Pacing alignment ───────────────────────────────────────────────────
  const todayStr = useMemo(() => todayISO(), []);
  const reachedIds = useMemo(
    () => reachedLessonIds(lessons, pacing, todayStr),
    [lessons, pacing, todayStr]
  );
  const reachedDocs = useMemo(
    () => reachedDocList(lessons, pacing, LESSON_PLAN_DOCS, todayStr),
    [lessons, pacing, todayStr]
  );

  // Teacher-only: word → official definition, flattened from the reference
  // cache. Passed into each card so a teacher viewing a student's list sees the
  // same word the student sees PLUS the reference definition (never shown to
  // students — they write their own).
  const refDefByWord = useMemo(() => {
    const m = new Map();
    (vocabRefs || []).forEach((r) => {
      let terms = [];
      try {
        terms = JSON.parse(r.terms_json || "[]");
      } catch {
        /* ignore */
      }
      (terms || []).forEach((t) => {
        if (t && t.word) m.set(String(t.word).toLowerCase(), t.definition || "");
      });
    });
    return m;
  }, [vocabRefs]);
  const refDefFor = (w) =>
    canComment ? refDefByWord.get(String(w?.word || "").toLowerCase()) : undefined;

  // Teacher-only tab: "reference" (all lessons + definitions) vs "student"
  // (browse a selected student's filled-in list).
  const [teacherView, setTeacherView] = useState("reference");
  const [buildingRefs, setBuildingRefs] = useState(false);
  const showReference = canComment && teacherView === "reference";

  // Students only see words tied to lessons the class has already reached
  // (plus their own unsorted, manually-added words). Teachers viewing a
  // student see that student's whole list.
  // De-duplicate by normalized word so each term shows exactly once — the
  // student sees the word once and fills in the single definition field.
  // (Auto-seeding can race and create the same word twice; this hides extras.)
  const visibleWords = useMemo(() => {
    const list = actingAsStudent
      ? (words || []).filter((w) => !w.lesson_id || reachedIds.has(w.lesson_id))
      : (words || []);
    const seen = new Set();
    const out = [];
    for (const w of list) {
      const key = String(w.word || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
    return out;
  }, [words, actingAsStudent, reachedIds]);

  // Auto-seed the reached-lesson words for the acting student once they land
  // here, so their list is pre-populated through the current pacing lesson.
  // Only fires when some reached lesson still has no word (idempotent + cheap).
  const coveredReached = useMemo(() => {
    const s = new Set();
    (words || []).forEach((w) => {
      if (w.lesson_id && reachedIds.has(w.lesson_id)) s.add(w.lesson_id);
    });
    return s;
  }, [words, reachedIds]);
  const didAutoSeedRef = useRef(false);
  useEffect(() => {
    didAutoSeedRef.current = false;
  }, [target?.id]);
  useEffect(() => {
    if (!actingAsStudent || !target?.id || seeding) return;
    if (didAutoSeedRef.current) return;
    if (reachedDocs.length && coveredReached.size < reachedIds.size) {
      didAutoSeedRef.current = true;
      (async () => {
        setSeeding(true);
        try {
          await base44.functions.invoke("seedStudentVocabFromPlans", {
            student_user_id: target.id,
            docs: reachedDocs,
          });
          refetch();
        } catch {
          /* ignore — student can still add words manually */
        } finally {
          setSeeding(false);
        }
      })();
    }
  }, [actingAsStudent, target?.id, reachedDocs, coveredReached, reachedIds, refetch, seeding]);

  // Teacher: pull all words for the selected student (teacher's choice to
  // populate ahead of pacing). Student auto-seed above caps to pacing.
  const seedFromPlans = async () => {
    if (!target?.id) return;
    setSeeding(true);
    setSeedResult("");
    try {
      const docs = LESSON_PLAN_DOCS.map((d) => ({ phase: d.phase, title: d.title, fileId: d.fileId }));
      const res = await base44.functions.invoke("seedStudentVocabFromPlans", {
        student_user_id: target.id,
        docs,
      });
      const d = res.data || {};
      setSeedResult(`Added ${d.words_added ?? 0} words across ${d.lessons_seeded ?? 0} lessons.`);
      refetch();
    } catch (e) {
      setSeedResult("Could not seed: " + (e?.message || "error"));
    } finally {
      setSeeding(false);
    }
  };

  // Teacher: build/refresh the all-lessons reference (words + definitions).
  const buildReferences = async () => {
    setBuildingRefs(true);
    try {
      const docs = LESSON_PLAN_DOCS.map((d) => ({ phase: d.phase, title: d.title, fileId: d.fileId }));
      await base44.functions.invoke("buildVocabReferences", { docs });
      refetchRefs();
    } catch {
      /* ignore */
    } finally {
      setBuildingRefs(false);
    }
  };

  // Group visible words by phase → lesson (→ unsorted within phase).
  const grouped = useMemo(() => {
    const phaseMap = new Map();
    const lessonTitle = (id) => (lessons || []).find((l) => l.id === id)?.title || "Lesson";
    (visibleWords || []).forEach((w) => {
      const ph = w.phase ?? null;
      if (!phaseMap.has(ph)) phaseMap.set(ph, { lessons: new Map(), unsorted: [] });
      const grp = phaseMap.get(ph);
      if (w.lesson_id) {
        if (!grp.lessons.has(w.lesson_id))
          grp.lessons.set(w.lesson_id, { title: w.lesson_title || lessonTitle(w.lesson_id), words: [] });
        grp.lessons.get(w.lesson_id).words.push(w);
      } else {
        grp.unsorted.push(w);
      }
    });
    const phases = [...phaseMap.entries()].sort((a, b) => {
      if (a[0] == null) return 1;
      if (b[0] == null) return -1;
      return a[0] - b[0];
    });
    return phases;
  }, [visibleWords, lessons]);

  // On first visit (no saved open-state), default-open every phase that has
  // words. Saved state is restored on mount, so open/closed phases survive
  // navigating away and back to the dashboard.
  useEffect(() => {
    if (openPhases !== null) return;
    const initial = new Set(grouped.map(([ph]) => (ph == null ? "unsorted" : `p${ph}`)));
    setOpenPhases(initial);
    try {
      sessionStorage.setItem(VOCAB_OPEN_KEY, JSON.stringify([...initial]));
    } catch {
      /* ignore */
    }
  }, [openPhases, grouped.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePhase = (key) =>
    setOpenPhases((prev) => {
      const next = new Set(prev || []);
      next.has(key) ? next.delete(key) : next.add(key);
      try {
        sessionStorage.setItem(VOCAB_OPEN_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });

  const total = (visibleWords || []).length;
  const phaseLabel = (ph) => (ph == null ? "Unsorted" : `Phase ${ph}`);

  const onAdded = () => refetch();
  const onWordChanged = () => refetch();
  const onWordRemoved = () => refetch();

  const isReady = !!target;

  if (!isReady && isLoading)
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <CodeHeader
        chip={actingAsStudent ? "vocab.collect()" : "vocab.review()"}
        title="Vocabulary"
        subtitle={
          actingAsStudent
            ? "Grow your personal CS vocabulary as you move through lessons."
            : "Browse the vocabulary reference, or any student's list to leave comments."
        }
        tags={[
          actingAsStudent
            ? { label: reachedIds.size ? `through current lesson · ${total} words` : `${total} words`, color: "text-[#39FF14] border-[#39FF14]/30 bg-[#39FF14]/10" }
            : { label: `${total} words`, color: "text-[#22D3EE] border-[#22D3EE]/30 bg-[#22D3EE]/10" },
        ]}
      />

      {canComment && (
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setTeacherView("reference")}
            className={`px-3 py-1.5 rounded-md font-mono text-sm border transition-colors ${
              teacherView === "reference"
                ? "border-primary text-primary bg-primary/10"
                : "border-stone-200/40 text-stone-400 hover:text-foreground"
            }`}
          >
            Reference (all lessons)
          </button>
          <button
            onClick={() => setTeacherView("student")}
            className={`px-3 py-1.5 rounded-md font-mono text-sm border transition-colors ${
              teacherView === "student"
                ? "border-primary text-primary bg-primary/10"
                : "border-stone-200/40 text-stone-400 hover:text-foreground"
            }`}
          >
            Student lists
          </button>
        </div>
      )}

      {showReference ? (
        <VocabReferencePanel
          references={vocabRefs}
          building={buildingRefs}
          onBuild={buildReferences}
        />
      ) : (
        <>
          {canComment && (
            <Card className="mb-6">
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <Users className="w-4 h-4 text-[#22D3EE]" />
                <label className="text-sm font-mono text-stone-300 flex items-center gap-2">
                  Student
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="bg-card border border-stone-200/60 rounded-md px-3 py-1.5 text-sm text-foreground min-w-[220px]"
                  >
                    <option value="">Select a student…</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id} className="bg-card text-foreground">
                        {s.full_name} {s.class_period ? `· P${s.class_period}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {target && (
                  <span className="text-xs font-mono text-stone-400">
                    {target.full_name}
                    {target.class_period ? ` · Period ${target.class_period}` : ""}
                  </span>
                )}
                {target && (
                  <Button size="sm" variant="secondary" onClick={seedFromPlans} disabled={seeding} className="ml-auto">
                    {seeding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                    Seed from lesson plans
                  </Button>
                )}
                {seedResult && (
                  <span className="text-xs font-mono text-stone-400 w-full">{seedResult}</span>
                )}
              </CardContent>
            </Card>
          )}

          {actingAsStudent && (
            <div className="flex items-center justify-between mb-6">
              <h2 className={SECTION_HEADING}>
                <BookMarked className={`w-4 h-4 text-[#22D3EE]`} />
                <span className="text-[#39FF14]">{"$ "}</span>my_words
              </h2>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add word
              </Button>
            </div>
          )}

          {!target ? (
            <Card>
              <CardContent className="py-16 text-center text-stone-400 font-mono text-sm">
                Pick a student to view their vocabulary.
              </CardContent>
            </Card>
          ) : isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
            </div>
          ) : total === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <BookMarked className="w-8 h-8 text-stone-500 mx-auto mb-3" />
                <p className="text-stone-400 font-mono text-sm">
                  {actingAsStudent
                    ? "No words pulled yet for the lessons you've reached — they'll appear automatically as the class advances through the pacing guide."
                    : "This student hasn't added any words yet."}
                </p>
                {actingAsStudent && (
                  <Button className="mt-4" onClick={() => setAddOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Add your first word
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {grouped.map(([ph, grp]) => {
                const key = ph == null ? "unsorted" : `p${ph}`;
                const open = !!openPhases && openPhases.has(key);
                const count = grp.unsorted.length + [...grp.lessons.values()].reduce((a, l) => a + l.words.length, 0);
                return (
                  <div key={key} className="rounded-xl border border-stone-200/40 bg-card/60 overflow-hidden">
                    <button
                      onClick={() => togglePhase(key)}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-stone-200/5 transition-colors"
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-stone-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-stone-400" />
                      )}
                      <span className="font-display font-semibold text-foreground">{phaseLabel(ph)}</span>
                      <span className="text-xs font-mono text-stone-500">{count} words</span>
                      <span
                        className="ml-auto w-2 h-2 rounded-full"
                        style={{ background: `hsl(${(ph == null ? 200 : ph * 60) % 360} 90% 60%)` }}
                      />
                    </button>

                    {open && (
                      <div className="px-4 pb-4 space-y-4">
                        {[...grp.lessons.entries()].map(([lessonId, lg]) => (
                          <div key={lessonId}>
                            <div className="flex items-center gap-2 mb-2">
                              <BookMarked className="w-3.5 h-3.5 text-[#FF2BD6]" />
                              <h3 className="font-mono text-sm text-stone-300">{lg.title}</h3>
                              <span className="text-xs font-mono text-stone-600">{lg.words.length}</span>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                              {lg.words.map((w) => (
                                <VocabWordCard
                                  key={w.id}
                                  word={w}
                                  canEdit={actingAsStudent}
                                  canComment={canComment}
                                  referenceDef={refDefFor(w)}
                                  onChanged={onWordChanged}
                                  onRemoved={onWordRemoved}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                        {grp.unsorted.length > 0 && (
                          <div>
                            {grp.lessons.size > 0 && (
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-mono text-sm text-stone-400">Unsorted</h3>
                              </div>
                            )}
                            <div className="grid sm:grid-cols-2 gap-3">
                              {grp.unsorted.map((w) => (
                                <VocabWordCard
                                  key={w.id}
                                  word={w}
                                  canEdit={actingAsStudent}
                                  canComment={canComment}
                                  referenceDef={refDefFor(w)}
                                  onChanged={onWordChanged}
                                  onRemoved={onWordRemoved}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {actingAsStudent && (
            <AddWordDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              lessons={lessons}
              defaultLessonId={defaultLessonId}
              onAdded={onAdded}
            />
          )}
        </>
      )}
    </div>
  );
}