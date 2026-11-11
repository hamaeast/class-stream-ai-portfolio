// Security: graded student records (QuizResponse, CFAResponse,
// PracticeResponse, NotesResponse, DoNowResponse, Submission) are written by
// server functions with the service role, which stamps created_by_id to the
// service account. The owning student is stored in student_id; rows written
// before this change still carry the student in created_by_id.

// The student who owns a record.
export const ownerOf = (r) => r?.student_id || r?.created_by_id;

// filter() query matching a student's records, new and legacy.
export const ownedBy = (userId) => ({
  $or: [{ created_by_id: userId }, { student_id: userId }],
});

// Unwraps a base44.functions.invoke() result.
export const fnData = (res) => res?.data || res || {};
