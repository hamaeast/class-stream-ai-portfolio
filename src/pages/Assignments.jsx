import React, { useEffect, useState } from "react";
import { NO_ASSIGNMENT_LESSON_IDS } from "@/lib/schoolConfig";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { usePreview } from "@/lib/PreviewContext";
import TeacherAssignments from "@/components/TeacherAssignments";
import StudentLessonAssignments from "@/components/StudentLessonAssignments";
import CodeHeader from "@/components/CodeHeader";

// Shared Assignments tab. Teachers get a lesson-grouped list (and we auto-create
// the 5-point "Assignment" for any lesson missing one). Students get a per-lesson
// short-answer form that stays locked until they've opened that lesson's document.
export default function Assignments() {
  const { previewStudent } = usePreview();
  const [user, setUser] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const reloadAssignments = async () => {
    const asg = await base44.entities.Assignment.list();
    setAssignments(asg || []);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      let v = previewStudent;
      try {
        v = v || (await base44.auth.me());
      } catch {}
      if (!active) return;
      setUser(v);
      const admin = !previewStudent && v?.role === "admin";

      const [ls, asg] = await Promise.all([
        base44.entities.Lesson.list("order"),
        base44.entities.Assignment.list(),
      ]);
      if (!active) return;
      setLessons(ls || []);
      setAssignments(asg || []);

      // Ensure every lesson has its default 5-point "Assignment" (idempotent).
      if (admin) {
        const have = new Set(
          (asg || []).filter((a) => a.title === "Assignment").map((a) => a.lesson_id)
        );
        // Orientation / course-intro lessons don't get a graded assignment.
        const noAssignment = new Set(NO_ASSIGNMENT_LESSON_IDS); // set via VITE_NO_ASSIGNMENT_LESSON_IDS
        const missing = (ls || []).filter(
          (l) => !have.has(l.id) && !noAssignment.has(l.id)
        );
        if (missing.length) {
          await base44.entities.Assignment.bulkCreate(
            missing.map((l) => ({
              title: "Assignment",
              lesson_id: l.id,
              description: "Worth 5 points.",
            }))
          );
          await reloadAssignments();
        }
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [previewStudent?.id]);

  // Live update when assignments are published/unpublished elsewhere.
  useEffect(() => {
    const handler = () => reloadAssignments();
    window.addEventListener("rt:assignment", handler);
    window.addEventListener("rt:lesson", handler);
    return () => {
      window.removeEventListener("rt:assignment", handler);
      window.removeEventListener("rt:lesson", handler);
    };
  }, []);

  const isAdminView = !previewStudent && user?.role === "admin";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <CodeHeader
        chip="assignments.view()"
        title="Assignments"
        subtitle={isAdminView ? "all lessons" : previewStudent?.full_name || "your lessons"}
      />
      {isAdminView ? (
        <TeacherAssignments lessons={lessons} assignments={assignments} />
      ) : (
        <StudentLessonAssignments
          lessons={lessons}
          assignments={assignments}
          student={previewStudent || user}
        />
      )}
    </div>
  );
}