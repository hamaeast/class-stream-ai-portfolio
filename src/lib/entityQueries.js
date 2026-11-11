import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ownedBy } from "@/lib/ownership";
import { usePreview } from "@/lib/PreviewContext";

// Cache read-only lesson/assignment lookups so students and admins clicking
// around reuse cached data instead of re-pulling from the API on every visit.
const CACHE_OPTS = {
  staleTime: 30 * 60 * 1000, // treat data as fresh for 30 minutes
  gcTime: 24 * 60 * 60 * 1000, // keep cached data for 24 hours when unused
  refetchOnMount: false,
};

// Current authenticated user, cached so every page shares one auth.me() call.
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
    staleTime: 10 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnMount: false,
  });
}

// A student's assignment submissions, cached across page visits.
export function useSubmissions(userId) {
  return useQuery({
    queryKey: ["submissions", userId],
    queryFn: () => base44.entities.Submission.filter(ownedBy(userId)),
    enabled: !!userId,
    ...CACHE_OPTS,
  });
}

export function useLessons() {
  return useQuery({
    queryKey: ["lessons", "ordered"],
    queryFn: () => base44.entities.Lesson.list("order"),
    ...CACHE_OPTS,
  });
}

export function useLesson(id) {
  return useQuery({
    queryKey: ["lesson", id],
    queryFn: () => base44.entities.Lesson.get(id),
    enabled: !!id,
    ...CACHE_OPTS,
  });
}

// Fetch a phase book's HTML once (server-cached in the backend function), then
// render it natively. Client cache is permanent for the session.
export function usePhaseBookHtml(fileId) {
  return useQuery({
    queryKey: ["phaseBookHtml", fileId],
    queryFn: async () => {
      const res = await base44.functions.invoke("getPhaseBook", { file_id: fileId });
      return res.data.html;
    },
    enabled: !!fileId,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnMount: false,
  });
}
export function useAssignments() {
  return useQuery({
    queryKey: ["assignments", "all"],
    queryFn: () => base44.entities.Assignment.list("-created_date"),
    ...CACHE_OPTS,
  });
}

export function useAssignmentsForLesson(lessonId) {
  return useQuery({
    queryKey: ["assignments", "lesson", lessonId],
    queryFn: () =>
      base44.entities.Assignment.filter({ lesson_id: lessonId }, "-created_date"),
    enabled: !!lessonId,
    ...CACHE_OPTS,
  });
}

export function useAssignment(id) {
  return useQuery({
    queryKey: ["assignment", id],
    queryFn: () => base44.entities.Assignment.get(id),
    enabled: !!id,
    ...CACHE_OPTS,
  });
}

// The current learner's check-ins, for the checkmarks shown beside each
// opened lesson part. When an admin is previewing a student, returns that
// student's check-ins instead of the admin's own.
export function useCheckins() {
  const { previewStudent } = usePreview();
  const { data: me } = useMe();
  const who = previewStudent || me;
  return useQuery({
    queryKey: ["checkins", previewStudent?.id || "mine"],
    queryFn: () =>
      base44.entities.CheckIn.filter(
        { created_by_id: who.id },
        "-created_date",
        500
      ),
    enabled: !!who,
    ...CACHE_OPTS,
  });
}

// A student's AI-graded practice attempts (owner-scoped, cached across views).
export function usePracticeResponses(userId) {
  return useQuery({
    queryKey: ["practiceResponses", userId],
    queryFn: () => base44.entities.PracticeResponse.filter(ownedBy(userId)),
    enabled: !!userId,
    ...CACHE_OPTS,
  });
}

// A student's submitted-notes records, cached across page visits.
export function useNotesResponses(userId) {
  return useQuery({
    queryKey: ["notesresponses", userId],
    queryFn: () => base44.entities.NotesResponse.filter(ownedBy(userId)),
    enabled: !!userId,
    ...CACHE_OPTS,
  });
}

// A student's quiz responses, cached across page visits.
export function useQuizResponses(userId) {
  return useQuery({
    queryKey: ["quizresponses", userId],
    queryFn: () => base44.entities.QuizResponse.filter(ownedBy(userId)),
    enabled: !!userId,
    ...CACHE_OPTS,
  });
}

// Pacing guide rows, used to align vocabulary availability to the current
// lesson (students only see words up to where the class has reached).
export function usePacingDays() {
  return useQuery({
    queryKey: ["pacingDays"],
    queryFn: () => base44.entities.PacingDay.list(),
    ...CACHE_OPTS,
  });
}

// Teacher-only master vocabulary reference (admin entity) — each lesson's
// words + definitions, cached so the reference view doesn't re-pull Drive.
export function useVocabReferences() {
  const { previewStudent } = usePreview();
  const { data: me } = useMe();
  const adm = me?.role === "admin" && !previewStudent;
  return useQuery({
    queryKey: ["vocabRefs"],
    queryFn: () => base44.entities.VocabReference.list("-created_date", 500),
    enabled: !!adm,
    ...CACHE_OPTS,
  });
}