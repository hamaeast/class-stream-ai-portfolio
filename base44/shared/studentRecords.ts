// Security: graded student records (QuizResponse, CFAResponse,
// PracticeResponse, NotesResponse, DoNowResponse, Submission) are written
// only by server functions using the service role; students can read their own
// rows but can no longer create/update them, so they can't set score, status
// or grade fields themselves.
//
// A service-role write stamps created_by_id to the service account and it
// can't be overridden, so ownership is anchored on student_id instead (the
// same pattern VocabularyWord uses). Rows written by the student before this
// change still match on created_by_id.

export function isOwnedBy(row, userId) {
  return !!row && (row.student_id === userId || row.created_by_id === userId);
}

// Finds the caller's record for `query` (e.g. { lesson_id }) via the service
// role. Filters ownership in code so it matches both new (student_id) and
// legacy (created_by_id) rows without relying on $or support in filter().
export async function findOwnRecord(base44, entity, query, userId) {
  const rows = await base44.asServiceRole.entities[entity].filter(query);
  return (rows || []).find((r) => isOwnedBy(r, userId)) || null;
}

// Creates or updates the caller's record with the service role. Always stamps
// student_id so legacy rows get backfilled on their next write.
export async function writeOwnRecord(base44, entity, existing, userId, patch) {
  const svc = base44.asServiceRole.entities[entity];
  const data = { ...patch, student_id: userId };
  return existing ? await svc.update(existing.id, data) : await svc.create(data);
}
