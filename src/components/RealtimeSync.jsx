import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// One source of cross-side real-time updates. Subscribes to the core entities
// and, on every change (create/update/delete from any user), invalidates the
// matching react-query caches (so hook-based pages refetch) AND dispatches a
// browser event (rt:<entity>) that local-state pages listen for to refetch.
// This is what makes a teacher publishing on one machine appear instantly on
// a student's machine (and vice-versa).

const ENTITIES = ["Lesson", "Assignment", "Submission", "QuizResponse", "NotesResponse", "CheckIn", "PracticeResponse", "PacingDay"];

const INVALIDATE = {
  Lesson: ["lessons", "lesson"],
  Assignment: ["assignments", "assignment"],
  CheckIn: ["checkins"],
  Submission: ["submissions"],
  QuizResponse: ["quizresponses"],
  NotesResponse: ["notesresponses"],
  PracticeResponse: ["practiceResponses"],
  PacingDay: ["pacing"],
};

export default function RealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const unsubs = ENTITIES.map((name) => {
      try {
        return base44.entities[name].subscribe(() => {
          const keys = INVALIDATE[name] || [];
          keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
          window.dispatchEvent(new CustomEvent(`rt:${name.toLowerCase()}`));
        });
      } catch (e) {
        return () => {};
      }
    });
    return () => unsubs.forEach((u) => u && u());
  }, [qc]);

  return null;
}