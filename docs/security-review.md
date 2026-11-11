# Security review

Findings from a review of grading and data access, and how this public copy fixes them. None of these changes have been deployed to the live app.

## Findings

| # | Finding | Risk | Severity | Status |
|-|-|-|-|-|
| 1 | Students could write their own scores. `QuizResponse`, `CFAResponse`, `PracticeResponse`, `NotesResponse` and `DoNowResponse` let the owner create and update their row, and the browser computed `score`/`status` and saved it (quiz, CFA, practice, notes). `submitDoNow` graded on the server but saved user-scoped, so the same open rule applied. | Any student could post any grade to the gradebook with one API call. | High | Fixed in this public copy (not deployed to the live app) |
| 2 | Quiz and CFA answer keys were readable. `Lesson.quiz_json` and `CFA.questions_json` held `answer_index`, `CFA` is readable by every user, and `buildLessonQuiz` returned the answers to any caller. | A student could read every correct answer before taking a quiz or CFA. | High | Fixed in this public copy (not deployed to the live app) |
| 3 | `Assignment` and `Submission` had no row-level rules. | Any user could create, edit or delete assignments, read every student's submissions, and set `grade`/`feedback` on any submission. | High | Fixed in this public copy (not deployed to the live app) |
| 4 | AI practice grading dropped items the model skipped from both score and maximum, and accepted results for ids that were not submitted. | Inflated percentages; a skipped item posted without teacher review. | Medium | Fixed in this public copy (not deployed to the live app) |

## What changed

**1. Scores are computed and written on the server.**
- The five response entities and `Submission` are now create/update/delete **admin-only**. Students read their own rows through `created_by_id` (rows written before this change) or the new `student_id` field.
- A service-role write stamps `created_by_id` to the service account and it can't be overridden, so server functions stamp `student_id` instead (the pattern `VocabularyWord` already used). The frontend matches ownership with `ownerOf()` / `ownedBy()` in `src/lib/ownership.js`; server functions use `base44/shared/studentRecords.ts`.
- New functions:
  - `submitQuiz` (`start`, `save`, `new_attempt`, `submit`): 0.5 point per correct answer, the 5-minute minimum checked against the server-stamped `started_at`, and "return for another attempt" only from `returned`. No retake half-credit rule exists in the code, so none was added.
  - `submitCfa` (`start`, `save`, `submit`): 1 point per correct answer; only released CFAs.
  - `saveNotes`: autosave plus turn-in. Awards 5 points only when every answer box on the worksheet is filled. `base44/shared/notesBlanks.ts` mirrors the worksheet's render transforms so the server sees the same boxes as the student.
  - `saveSubmission`: saves the student's own text/file and resets `status` to `submitted` (as the UI did). It never accepts `grade` or `feedback`.
- `gradePractice` now saves the `PracticeResponse` itself with the rules `PracticeView` used: point goal, 3-attempt limit, `under_review` below 0.90 confidence, attempt history, and the manual-review fallback (score 0, `under_review`) when AI grading fails.
- `submitDoNow` / `getTodaysDoNow` write and read with the service role and `student_id`.
- Drafts: autosave calls only accept answers (`selections`, `blanks`). Score, total, status and grade are never taken from the client. Practice drafts were already browser-only (`localStorage`).

**2. Answer keys moved to an admin-only entity.**
- New `AssessmentAnswerKey` (`kind: quiz | cfa`, `ref_id`, `answers_json`), admin-only for all operations, like `PracticeAnswerKey`.
- `buildLessonQuiz`, `buildCfa` and the new `saveCfaQuestions` (used by `CfaEditor`) write the key there and save only `{question, choices}` to the readable JSON.
- `getAssessmentKey` returns the answers to admins (CfaEditor, read-only teacher/preview views) and to a student only after their own attempt is graded, which is when the quiz/CFA UI already highlights the correct answers. `submitQuiz`/`submitCfa` also return them in the submit response.
- Legacy records: `migrateAnswerKeys` (admin) strips inline answers from every lesson and CFA. `submitQuiz`, `submitCfa` and `buildLessonQuiz` also migrate a record lazily when they touch it, and grading falls back to inline answers if no key exists yet.

**3. Assignment and Submission rules.**
- `Assignment`: read for everyone (`{}`, the same form `CFA` uses), create/update/delete admin-only. All assignment writes in `src/` are in teacher views.
- `Submission`: read own (or admin), create/update/delete admin-only. Students edit their submission before grading (the UI re-saves it), so both turn-in screens go through `saveSubmission`. This is stricter than "student can create own": a direct create would let a student set `grade`, which row rules can't prevent field by field.

**4. Skipped items.**
- `base44/shared/gradePractice.ts` builds results from the submitted items. A skipped item gets score 0, its key points as max, feedback "Not graded automatically" and confidence 0, so `review_needed` is set. Results for ids that weren't submitted are ignored.
- The same rule is in `demo/policy.js` (`finalizeGrades`, optional `submittedIds`, default every key item) with a test in `demo/policy.test.mjs`.

## Files changed

| Area | Files |
|-|-|
| Entities | `base44/entities/AssessmentAnswerKey.jsonc` (new), `QuizResponse`, `CFAResponse`, `PracticeResponse`, `NotesResponse`, `DoNowResponse`, `Submission`, `Assignment` (rules, `student_id`), `Lesson`, `CFA` (field descriptions) |
| Shared server code | `base44/shared/studentRecords.ts`, `assessmentKey.ts`, `notesBlanks.ts` (new); `gradePractice.ts` |
| New functions | `submitQuiz`, `submitCfa`, `getAssessmentKey`, `saveCfaQuestions`, `migrateAnswerKeys`, `saveNotes`, `saveSubmission` |
| Changed functions | `gradePractice`, `submitDoNow`, `getTodaysDoNow`, `buildLessonQuiz`, `buildCfa`, `exportCompleteGradesCsv` |
| Frontend | `src/lib/ownership.js` (new), `src/lib/entityQueries.js`, `QuizForm.jsx`, `CfaForm.jsx`, `CfaEditor.jsx`, `PracticeView.jsx`, `NotesBlanks.jsx`, `StudentLessonAssignments.jsx`, `AssignmentGradingPanel.jsx`, `OverdueAssignmentsDialog.jsx`, `StudentWorkDialog.jsx`, `DoNowReport.jsx`, pages `AssignmentDetail`, `Grades`, `LessonDetail`, `Notes`, `Quizzes`, `ReviewPractices`, `TeacherDashboard` |
| Demo and docs | `demo/policy.js`, `demo/policy.test.mjs`, `docs/ai-design.md`, this file |

## Checks run

- `npm run lint`: 0 errors.
- `npm run build`: passes.
- `npx tsc -p ./jsconfig.json`: 729 errors, the same as before the change.
- `node --test demo/policy.test.mjs`: 6 of 6 pass (one new).
- The shared server modules (`gradePractice.ts` missing/extra items, quiz/CFA scoring and key split, legacy migration, ownership lookup, notes box detection) were exercised with Deno against a mocked Base44 client. That test lives outside the repo.

## Untested

Base44 functions can't run outside Base44, so none of this has run against a real backend:

- Every new or changed function end to end, including service-role writes and the `student_id` ownership stamp.
- The row rules: that `data.student_id` read rules work on these entities, that students can no longer write them, and that real-time updates still reach students for rows written by the service role.
- The `$or` ownership filter combined with other fields in `filter()` calls from the browser (`vocabQueries.js` already uses `$or` on its own).
- The quiz, CFA, notes, practice, Do Now and assignment flows in the UI, including the teacher preview views and `CfaEditor` loading the key.
- `migrateAnswerKeys` on real data.

## Remaining gaps

- **Deploy order matters.** Deploy the functions before the entity rule changes and run `migrateAnswerKeys` once; until then, legacy lessons/CFAs keep inline answers.
- If the `gradePractice` call itself fails (network or a 500), the attempt is no longer saved for manual grading. The student sees an error and keeps the draft. Before, the browser saved a 0-score `under_review` attempt. AI grading failures inside the function still use the manual-review fallback.
- The 5-minute "review the lesson before a reattempt" gate on practice is still enforced only in the browser. It is a pacing rule, not a grade field.
- Unreleased CFA questions (without answers) are still readable through the API, because the `CFA` record also holds the study guide, which students always see.
- `Assignment` read `{}` follows the existing `CFA` form. If the app ever allows anonymous visitors, this should be narrowed to signed-in users.
