# AI design

Class Stream makes **4 AI calls**, all on the server through Base44's `integrations.Core.InvokeLLM`, and all asking for JSON that matches a schema. Everything else that handles course content is ordinary code: importing notes, practice, quizzes, vocabulary and pacing from documents, scoring quizzes and assessments, and building grades.

| AI call | File | Who sees the output | Purpose |
|-|-|-|-|
| Practice scoring | `base44/shared/gradePractice.ts` (via `gradePractice`) | Student and teacher | Score open answers against teacher model answers |
| Bulk re-score | `base44/functions/regradePractice` | Student and teacher | Re-score submitted attempts after the teacher edits an answer key |
| Formative assessment draft | `base44/functions/buildCfa` | Teacher first, then students if released | Study guide + 10 multiple-choice questions |
| Guided-notes answer key | `base44/functions/generateNotesAnswerKey` | Teacher only | Fill in the teacher's key for fill-in-the-blank notes |

## Where the code chose rules over AI

- **Worksheet, notes and quiz import** use a parser (`practiceParser.ts`) because the teacher's documents follow a fixed format. That makes import repeatable and free, with no model involved.
- **Quiz and formative-assessment scoring** compares the chosen option with the stored correct index in code, on the server (`submitQuiz`, `submitCfa`). The correct indexes live in the admin-only `AssessmentAnswerKey` entity, not on the question records students can read.
- **Caching:** imported notes and lesson-plan pages are saved after the first fetch (`buildLessonNotes`, `getPhaseBook` with `LessonPlanCache`). The notes answer key is saved on the lesson, so the AI runs once per lesson.
- **Re-scoring only when needed:** after a practice edit, `PracticeView.jsx` compares the old and new answer keys. It skips the bulk re-score when only the worksheet wording changed ("skip the credit spend").
- **Batching:** bulk re-scoring runs five submissions at a time instead of one at a time.

## Protections: enforced in code vs. asked in the prompt

| Protection | Enforced in code? | Where |
|-|-|-|
| Answer keys hidden from students | **Yes**: `PracticeAnswerKey` is admin-only (row-level security) and is read on the server | `PracticeAnswerKey.jsonc`, `gradePractice.ts` |
| Each AI score clamped to 0..item points | **Yes** | `gradePractice.ts` |
| Every submitted item gets a score | **Yes**: an item the model skips scores 0 of its points with confidence 0 (so the attempt goes to the teacher); results for items that weren't submitted are ignored | `gradePractice.ts` |
| Low model confidence goes to the teacher | **Yes**: the points-weighted average of the model's self-reported confidence; below 0.90 sets `under_review` | `gradePractice.ts`, `gradePractice` function |
| AI scoring fails → attempt saved for the teacher to grade by hand | **Yes** (if the whole request fails, the student keeps their draft and can resubmit) | `gradePractice` function |
| Students can't write their own scores | **Yes**: response records are create/update admin-only; scores are computed and saved by server functions | see `docs/security-review.md` |
| Teacher-adjusted scores clamped | **Yes** | `ReviewPractices.jsx` |
| Assessment questions well-formed (text, exactly 4 choices, answer 0–3) | **Yes**: malformed ones are dropped | `buildCfa` |
| New assessments hidden until the teacher releases them | **Yes**: saved with `published: false` | `buildCfa`, `CFAs.jsx`, `CfaEditor.jsx` |
| Notes answer key never sent to students | **Yes**: loaded only in teacher mode | `NotesBlanks.jsx` |
| 6th-grade writing bar; don't penalize spelling | Prompt only | `gradePractice.ts` |
| Honest confidence values | Prompt only. Nothing checks them. | `gradePractice.ts` |
| Questions clear, fair, spread across phases | Prompt only; the teacher reviews before release | `buildCfa` |
| Answer key factually correct, 1–6 words | Prompt only; the teacher sees it | `generateNotesAnswerKey` |

**About the 0.90 threshold:** it applies to the model's own estimate of how sure it is. It isn't an accuracy rate, and the app's scoring accuracy hasn't been measured.

## Known gaps

- **Fixed in this public copy (not deployed to the live app): assessment answers were readable by students.** `questions_json` and `quiz_json` included `answer_index`, and scoring ran in the browser. Answers now live in the admin-only `AssessmentAnswerKey`, scoring runs on the server, and students get the correct answers only after their attempt is graded. Records built before the change keep inline answers until `migrateAnswerKeys` is run (or until the record is next opened). See `docs/security-review.md`.
- **Model-reported confidence can be wrong.** A confidently wrong score posts without review. The teacher can still adjust grades later.
- **Fixed in this public copy (not deployed to the live app): a skipped item used to drop out** of both the score and the maximum, inflating the percentage. Every submitted item now appears in the results; a skipped one scores 0, keeps its maximum, and sends the attempt to the teacher.
- **The answer key is the model's best guess** when a blank is ambiguous, and it's saved without an explicit teacher-approval step.
- **Student answers are inserted into the prompt as data.** There is no code-level defense against text written to manipulate the grader, beyond the score clamp and confidence review.
