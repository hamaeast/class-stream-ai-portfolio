import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, FileText, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import CodeHeader from "@/components/CodeHeader";
import GoogleDocPreview from "@/components/GoogleDocPreview";
import { SECTION_HEADING, NEON_ACCENT } from "@/lib/neon-styles";
import { useLesson, useAssignmentsForLesson } from "@/lib/entityQueries";
import { base44 } from "@/api/base44Client";
import { parseLesson } from "@/lib/lessonPhases";
import { planForLesson } from "@/lib/lessonPlans";
import QuizForm from "@/components/QuizForm";
import NotesView from "@/components/NotesView";
import PracticeView from "@/components/PracticeView";
import LessonObjective from "@/components/LessonObjective";
import LessonStepNav, { STEPS, STEP_META } from "@/components/LessonStepNav";

// Which phase-book article a lesson maps to: the phase overview, or a
// specific <article id="lessonN">. Keeps each opened lesson isolated instead
// of rendering the whole phase book.
function lessonSectionId(lesson) {
  const p = parseLesson(lesson);
  if (!p) return null;
  return p.isOverview ? "overview" : `lesson${p.num}`;
}

export default function LessonDetail() {
  const id =
    new URLSearchParams(window.location.search).get("id") ||
    window.location.pathname.split("/").pop();
  const { data: lesson, isLoading: loadingLesson } = useLesson(id);
  const { data: assignments = [], isLoading: loadingAssignments } =
    useAssignmentsForLesson(id);
  const loading = loadingLesson || loadingAssignments;

  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const part = new URLSearchParams(window.location.search).get("part") || "lesson";
  const from = new URLSearchParams(window.location.search).get("from");

  // Ordered progression gate: each part unlocks after the previous one is
  // done. lesson → notes opens the notes; practice only unlocks after the
  // notes are SUBMITTED (finished); quiz unlocks after practice is viewed.
  const [viewed, setViewed] = useState(new Set());
  const [notesSubmitted, setNotesSubmitted] = useState(false);

  const refreshNotes = useCallback(async () => {
    if (!me || me.role === "admin") return;
    try {
      const mine = await base44.entities.NotesResponse.filter({
        lesson_id: id,
        created_by_id: me.id,
      });
      setNotesSubmitted((mine || []).some((r) => r.status === "submitted"));
    } catch {
      /* ignore */
    }
  }, [me, id]);

  useEffect(() => {
    if (!me || me.role === "admin") return;
    let active = true;
    (async () => {
      try {
        const list = await base44.entities.CheckIn.filter({
          lesson_id: id,
          created_by_id: me.id,
        });
        if (!active) return;
        const set = new Set(list.map((c) => c.part));
        set.add(part); // arriving on a part counts as having viewed it
        setViewed(set);
        await refreshNotes();
      } catch (e) {
        setViewed(new Set([part]));
      }
    })();
    return () => {
      active = false;
    };
  }, [me, id, part, refreshNotes]);

  // React to the student turning in their notes: as soon as they submit the
  // notes worksheet, the practice step unlocks without a page reload.
  useEffect(() => {
    if (!me || me.role === "admin") return;
    const unsub = base44.entities.NotesResponse.subscribe((ev) => {
      if (ev?.data?.lesson_id !== id) return;
      refreshNotes();
    });
    return unsub;
  }, [me, id, refreshNotes]);

  // Record that this student opened this lesson part (admins are skipped), so
  // they and the teacher see a datestamped checkmark for the work.
  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!active) return;
        setMe(me);
        if (!me || me.role === "admin") return;
        const existing = await base44.entities.CheckIn.filter({
          lesson_id: id,
          part,
          created_by_id: me.id,
        });
        if (active && existing.length === 0)
          await base44.entities.CheckIn.create({ lesson_id: id, part });
      } catch (e) {
        /* best-effort */
      }
    })();
    return () => {
      active = false;
    };
  }, [id, part]);

  // Auto-seed the student's vocabulary list with the WORDS from this lesson's
  // lesson-plan Drive doc the first time they open the lesson. Only the words
  // are pulled (tagged with phase + lesson); the student adds the definitions.
  // Runs once per student/lesson (skipped if they already have any words for
  // it) and never for admins. No LLM is used, so this never spends credits.
  useEffect(() => {
    if (!me || me.role === "admin" || !lesson) return;
    let active = true;
    (async () => {
      try {
        const existing = await base44.entities.VocabularyWord.filter({
          lesson_id: id,
          created_by_id: me.id,
        });
        if (!active) return;
        if (existing && existing.length) return;
        const plan = planForLesson(lesson);
        if (!plan) return; // no lesson-plan doc for this lesson → nothing to seed
        const res = await base44.functions.invoke("seedLessonVocab", {
          file_id: plan.fileId,
        });
        const words = (res.data && res.data.words) || [];
        if (!active || !words.length) return;
        const payload = words.map((w) => ({
          word: w,
          definition: "",
          example_sentence: "",
          phase: plan.phase,
          lesson_id: id,
          lesson_title: lesson.title,
          source: "lesson",
          student_id: me.id,
        }));
        await base44.entities.VocabularyWord.bulkCreate(payload);
      } catch {
        /* best-effort seeding */
      }
    })();
    return () => {
      active = false;
    };
  }, [me, id, lesson]);

  const currentIndex = STEPS.indexOf(part);
  const bypass = !me || me.role === "admin";

  // A step is "done" (unlocks the next one) when:
  //  - lesson:  the student opened it (has a CheckIn for "lesson")
  //  - notes:   the student SUBMITTED the notes worksheet (finished them)
  //  - practice: the student opened the practice (has a CheckIn for it)
  const isStepDone = (p) => {
    if (bypass) return true;
    if (p === "notes") return notesSubmitted;
    return viewed.has(p);
  };

  let allowedMax = STEPS.length - 1;
  for (let i = 1; i < STEPS.length; i++) {
    if (!isStepDone(STEPS[i - 1])) {
      allowedMax = i - 1;
      break;
    }
  }

  // If a student lands on a part they haven't unlocked yet, send them back to
  // the furthest step they're allowed to be on.
  useEffect(() => {
    if (!me || me.role === "admin") return;
    if (currentIndex > allowedMax) {
      const url = new URL(window.location.href);
      url.searchParams.set("part", STEPS[allowedMax]);
      navigate(url.pathname + "?" + url.searchParams.toString(), { replace: true });
    }
  }, [me, currentIndex, allowedMax]);

  const goPart = (p) => {
    const url = new URL(window.location.href);
    url.searchParams.set("part", p);
    navigate(url.pathname + "?" + url.searchParams.toString());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-stone-500">Lesson not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const isAdmin = !!me && me.role === "admin";
  const unlockedKeys = STEPS.filter((_, i) =>
    i === 0 ? true : isStepDone(STEPS[i - 1])
  );
  const doneKeys = isAdmin
    ? []
    : STEPS.filter((k) => (k === "notes" ? notesSubmitted : viewed.has(k)));

  const nextStep = STEPS[currentIndex + 1] || null;

  return (
    <div className={`${part === "notes" ? "max-w-7xl" : "max-w-3xl"} mx-auto px-6 py-10`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => (from === "teacher" ? navigate("/teacher") : navigate(-1))}
        className="mb-6 -ml-2 font-mono text-xs text-stone-400 hover:text-[#22D3EE]"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />{" "}
        {from === "teacher" ? "cd ../dashboard" : "cd ../"}
      </Button>

      <CodeHeader
        chip="lesson.view()"
        title={lesson.title}
        subtitle={lesson.description || "Read the material and try the activities below."}
      />

      <LessonStepNav
        currentKey={part}
        unlockedKeys={unlockedKeys}
        doneKeys={doneKeys}
        onNavigate={goPart}
      />

      {part !== "notes" && part !== "practice" && (
        <LessonObjective lesson={lesson} />
      )}

      {part !== "notes" && part !== "practice" && (
        lesson.file_url ? (
          <Card className="mb-8 overflow-hidden">
            <CardContent className="p-0">
              <GoogleDocPreview
                url={lesson.file_url}
                title={lesson.title}
                sectionId={lessonSectionId(lesson)}
                height="80vh"
                showOriginal
              />
            </CardContent>
          </Card>
        ) : lesson.content ? (
          <Card className="mb-8">
            <CardContent className="p-6">
              {/<\/?[a-z][\s\S]*?>/i.test(lesson.content) ? (
                <div
                  className="prose prose-stone max-w-none [&_a]:text-[#22D3EE] [&_code]:font-mono"
                  dangerouslySetInnerHTML={{ __html: lesson.content }}
                />
              ) : (
                <div className="prose prose-stone max-w-none">
                  <ReactMarkdown>{lesson.content}</ReactMarkdown>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null
      )}

      {part === "notes" && <NotesView lesson={lesson} isAdmin={isAdmin} />}

      {part === "practice" && <PracticeView lesson={lesson} me={me} isAdmin={isAdmin} />}

      {part === "quiz" && <QuizForm lesson={lesson} />}

      {part !== "notes" && part !== "practice" && (
        <>
          <h2 className={`${SECTION_HEADING} mb-4`}>
            <FileText className={`w-4 h-4 ${NEON_ACCENT}`} />{" "}
            <span className="text-[#39FF14]">{"$ "}</span>assignments_in_lesson
          </h2>
          <Card>
            <CardContent className="py-10 text-center text-stone-400">
              Assignments for this lesson will appear here.
            </CardContent>
          </Card>
        </>
      )}

      {nextStep && unlockedKeys.includes(nextStep) && (
        <div className="mt-8 flex justify-end">
          <Button onClick={() => goPart(nextStep)}>
            Continue to {STEP_META[nextStep].label}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}