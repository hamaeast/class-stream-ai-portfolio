import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Save,
  Send,
  CheckCircle2,
  Lock,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePreview } from "@/lib/PreviewContext";
import { fnData, ownedBy } from "@/lib/ownership";

const parseCached = (v) => {
  try {
    const o = JSON.parse(v);
    return o && o.html ? o : null;
  } catch {
    return null;
  }
};
const parseAnswers = (v) => {
  try {
    return JSON.parse(v)?.blanks || {};
  } catch {
    return {};
  }
};
const topicOf = (t) => (String(t || "").split("—")[1] || t || "").trim();

// Drop the "Name: ___ Date: ___" header line mammoth pulled from the notes
// doc — it isn't a real fill-in and shouldn't block submission. Applied at
// render so already-cached lessons are cleaned up without a re-cache.
// NOTE: base44/shared/notesBlanks.ts mirrors stripNameDate/addQuickCheckInputs
// so the server can check every box is filled on submit. Keep them in sync.
const stripNameDate = (html) =>
  String(html || "").replace(/<p>([\s\S]*?)<\/p>/gi, (m, inner) =>
    /Name:/i.test(inner) && /Date:/i.test(inner) && /<input/i.test(inner) ? "" : m
  );

// The notes docs end with a "Quick Check" section of plain-prompt paragraphs
// (no underscores), so they never became blanks. After the Quick Check
// header, turn each numbered prompt / question into an answer box so it's
// required to submit. Idempotent: paragraphs already holding an <input> are
// skipped, so this is safe over cached HTML that already has the boxes.
const addQuickCheckInputs = (html) => {
  const h = String(html || "");
  const marker = h.search(/quick[\s_-]?check/i);
  if (marker < 0) return h;
  const before = h.slice(0, marker);
  let n = 0;
  const after = h.slice(marker).replace(/<p>([\s\S]*?)<\/p>/gi, (m, inner) => {
    if (/<input/i.test(inner)) return m;
    const text = inner.replace(/<[^>]*>/g, "").trim();
    if (!text) return m;
    const numbered = /^\s*\d+[.)]/.test(text);
    const question = /[?？]\s*$/.test(text);
    if (!(numbered || question)) return m;
    n += 1;
    return `<p>${inner} <input type="text" data-blank="qc${n}" class="nb-blank" size="22" maxlength="120" autocomplete="off" /></p>`;
  });
  return before + after;
};

// Teacher answer-key render: replace each fill-in <input> with a highlighted
// green span holding the generated answer, so the teacher sees the completed
// worksheet read-only. Never used on the student-facing worksheet.
function injectAnswers(html, keyMap) {
  return String(html || "").replace(
    /<input[^>]*data-blank="([^"]+)"[^>]*>/gi,
    (_m, id) => {
      const ans = keyMap && keyMap[id] ? String(keyMap[id]).trim() : "";
      if (!ans)
        return `<span class="nb-blank nb-blank-key nb-blank-empty">(no answer)</span>`;
      const safe = ans
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">");
      return `<span class="nb-blank nb-blank-key">${safe}</span>`;
    }
  );
}

export default function NotesBlanks({ lesson }) {
  const { previewStudent } = usePreview();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [content, setContent] = useState(null);
  const [respId, setRespId] = useState(null);
  const [status, setStatus] = useState("in_progress");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [answerKey, setAnswerKey] = useState(null);
  const [isTeacherKey, setIsTeacherKey] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);

  const containerRef = useRef(null);
  const respIdRef = useRef(null);
  const answersRef = useRef({});
  const statusRef = useRef("in_progress");
  const readOnlyRef = useRef(false);
  const autosaveTimer = useRef(null);
  const lessonId = lesson.id;
  const title = content?.title || `Notes - ${topicOf(lesson.title)}`;

  // Load user, the cached notes worksheet, and either the saved student
  // response (student / previewed student) OR the teacher-only auto-generated
  // answer key (admin viewing directly — not previewing a student).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = previewStudent || (await base44.auth.me().catch(() => null));
        if (!active) return;
        setMe(user);
        // Teacher answer-key mode: an admin opening the lesson directly (not
        // previewing a student). The worksheet renders filled + read-only.
        const teacherMode = !previewStudent && user?.role === "admin";
        setIsTeacherKey(teacherMode);
        const ro = !!previewStudent || teacherMode;
        setReadOnly(ro);
        readOnlyRef.current = ro;

        // Cached notes — generate + cache on the fly if missing (teachers need
        // them too, to build an answer key).
        let cached = parseCached(lesson.notes_blanks_json);
        if (!cached) {
          const res = await base44.functions.invoke("buildLessonNotes", {
            lesson_id: lesson.id,
          });
          const d = res.data || res;
          if (d && d.html) cached = { title: d.title, html: d.html, blankCount: d.blankCount };
          else throw new Error("Notes could not be generated");
        }
        if (!active) return;
        setContent(cached);

        if (teacherMode) {
          // Generate (and cache) the answer key server-side, then fill the
          // blanks inline. Never loaded for students / preview.
          setKeyLoading(true);
          try {
            const r = await base44.functions.invoke("generateNotesAnswerKey", {
              lesson_id: lesson.id,
            });
            const d = r.data || r;
            if (active && d?.blanks) setAnswerKey(d.blanks);
          } catch {}
          if (active) setKeyLoading(false);
        } else {
          // Existing response (student's own, or the previewed student's).
          const ownerId = (previewStudent || user)?.id;
          if (ownerId) {
            const mine = await base44.entities.NotesResponse.filter({
              lesson_id: lesson.id,
              ...ownedBy(ownerId),
            });
            const r = (mine || [])[0];
            if (r) {
              respIdRef.current = r.id;
              setRespId(r.id);
              answersRef.current = parseAnswers(r.answers_text);
              setStatus(r.status || "in_progress");
              statusRef.current = r.status || "in_progress";
              setSavedAt(r.updated_date || r.created_date);
            }
          }
        }
        if (active) setReady(true);
      } catch (e) {
        setErr(e.message || "Something went wrong loading notes");
        setReady(true);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, previewStudent?.id]);

  // Once the cached HTML is rendered, wire the live <input> boxes: prefill from
  // saved answers, disable when read-only / submitted, and autosave on typing.
  useEffect(() => {
    if (!ready || !content) return;
    const container = containerRef.current;
    if (!container) return;
    const inputs = Array.from(container.querySelectorAll("input[data-blank]"));
    let wired = false;
    inputs.forEach((el) => {
      const i = el.getAttribute("data-blank");
      el.value = answersRef.current[i] || "";
      const locked = readOnlyRef.current || statusRef.current === "submitted";
      el.disabled = locked;
      el.addEventListener("input", () => {
        if (locked) return;
        answersRef.current[i] = el.value;
        scheduleAutosave();
      });
      wired = true;
    });
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, content]);

  const scheduleAutosave = () => {
    if (readOnlyRef.current || statusRef.current === "submitted") return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => persist("in_progress"), 1200);
  };

  const persist = async (overrideStatus) => {
    if (readOnlyRef.current) return;
    try {
      setSaving(true);
      const next = overrideStatus || statusRef.current;
      // Security: saveNotes writes the record server-side and awards the
      // 5 points itself on submit (after checking every box is filled); the
      // client only sends the typed blanks.
      const res = await base44.functions.invoke("saveNotes", {
        lesson_id: lesson.id,
        blanks: answersRef.current,
        submit: next === "submitted",
      });
      const r = fnData(res).record;
      if (r && r.id && !respIdRef.current) {
        respIdRef.current = r.id;
        setRespId(r.id);
      }
      setSavedAt(new Date());
      return true;
    } catch (e) {
      setErr(e.message || "Could not save your notes");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onSaveNow = () => persist("in_progress");

  const onSubmit = async () => {
    if (readOnlyRef.current || statusRef.current === "submitted") return;
    const container = containerRef.current;
    const inputs = container
      ? Array.from(container.querySelectorAll("input[data-blank]"))
      : [];
    const allFilled = inputs.length > 0 && inputs.every((el) => (el.value || "").trim() !== "");
    if (!allFilled) {
      setAlertOpen(true);
      return;
    }
    setSubmitting(true);
    // A pending autosave would now be rejected once the notes are locked.
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const ok = await persist("submitted");
    if (!ok) {
      setSubmitting(false);
      return;
    }
    setStatus("submitted");
    statusRef.current = "submitted";
    inputs.forEach((el) => (el.disabled = true));
    setSubmitting(false);
  };

  if (!ready) {
    return (
      <Card className="mb-8">
        <CardContent className="py-12 text-center text-stone-400 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-mono text-sm">Preparing your guided notes…</span>
        </CardContent>
      </Card>
    );
  }

  if (err && !content) {
    return (
      <Card className="mb-8">
        <CardContent className="py-10 text-center text-stone-400">
          {err}
        </CardContent>
      </Card>
    );
  }

  const submitted = status === "submitted";

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">
            {title}
          </h2>
          <p className="text-xs font-mono text-stone-400 mt-0.5">
            <span className="text-[#39FF14]">$/</span> fill_in_the_blanks() ·
            worth 5 points when every box is filled
          </p>
        </div>
        {!readOnly && (
          <span className="text-xs font-mono text-stone-500 inline-flex items-center gap-1">
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                <span className="text-stone-400">Auto-saving…</span>
              </>
            ) : savedAt ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
                <span className="text-[#39FF14]">
                  Auto-saved {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
                Auto-save on
              </>
            )}
          </span>
        )}
        {submitted && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#39FF14]/40 bg-[#39FF14]/10 px-2.5 py-1 text-xs font-mono text-[#39FF14]">
            <CheckCircle2 className="w-3.5 h-3.5" /> Submitted · 5/5
          </span>
        )}
        {isTeacherKey && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#39FF14]/40 bg-[#39FF14]/10 px-2.5 py-1 text-xs font-mono text-[#39FF14]">
            {keyLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <KeyRound className="w-3.5 h-3.5" />
            )}
            {keyLoading ? "Generating answer key…" : "Teacher answer key · auto-generated"}
          </span>
        )}
        {readOnly && !submitted && !isTeacherKey && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-200/40 px-2.5 py-1 text-xs font-mono text-stone-400">
            <Lock className="w-3.5 h-3.5" /> Read only
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-6">
          {isTeacherKey ? (
            <div
              className="notes-doc max-w-none"
              dangerouslySetInnerHTML={{
                __html: injectAnswers(
                  stripNameDate(addQuickCheckInputs(content.html)),
                  answerKey
                ),
              }}
            />
          ) : (
            <div
              ref={containerRef}
              className="notes-doc max-w-none"
              dangerouslySetInnerHTML={{ __html: stripNameDate(addQuickCheckInputs(content.html)) }}
            />
          )}
        </CardContent>
      </Card>

      {!readOnly && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" onClick={onSaveNow} disabled={saving || submitted}>
            <Save className="w-4 h-4 mr-1" /> Save now
          </Button>
          <Button onClick={onSubmit} disabled={saving || submitting || submitted}>
            <Send className="w-4 h-4 mr-1" />
            {submitted ? "Submitted" : "Submit"}
          </Button>
          {saving ? (
            <span className="text-xs font-mono text-stone-400 inline-flex items-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Auto-saving…
            </span>
          ) : savedAt ? (
            <span className="text-xs font-mono text-stone-500 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
              <span className="text-[#39FF14]">
                Auto-saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            </span>
          ) : (
            <span className="text-xs font-mono text-stone-500 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
              Auto-save on
            </span>
          )}
        </div>
      )}

      {err && (
        <p className="text-xs font-mono text-destructive-foreground">{err}</p>
      )}

      {alertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="max-w-md w-full rounded-xl border border-stone-200 bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-[#FF2BD6] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-foreground">
                  You did not fill in each box
                </h3>
                <p className="text-sm text-stone-400 mt-1">
                  Please fill in each box to submit your notes.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setAlertOpen(false)}>OK</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}