# Public-copy notes

This repository was made from an export of the production Base44 app and then cleaned for public sharing. The live app was not changed, and this repository is not connected to it. Git history starts fresh here.

## Removed or generalized

| What | Where | Change |
|-|-|-|
| 92 Google Drive file IDs for the teacher's lesson-plan documents | `src/lib/lessonPlans.js` | Removed. Lesson titles remain; IDs come from `VITE_LESSON_PLAN_FILE_IDS` |
| Pacing-workbook Drive link | `base44/functions/refreshPacingGuide`, `src/pages/Assign.jsx` | `PACING_FILE_ID` secret / `VITE_PACING_GUIDE_URL` |
| School-calendar image hosted under the app's Base44 storage (exposed the app ID) | `src/pages/Calendar.jsx` | `VITE_SCHOOL_CALENDAR_IMAGE_URL`; placeholder when unset |
| School and district names | `Layout.jsx`, `Calendar.jsx`, `Assign.jsx`, `PacingGuide.jsx`, `TeacherAssignConsole.jsx`, `refreshPacingGuide` | Settings in `src/lib/schoolConfig.js` and generic wording |
| Three production database record IDs (course-intro lessons) | `src/pages/Assignments.jsx` | `VITE_NO_ASSIGNMENT_LESSON_IDS` |
| Generic Base44 README | `README.md` | Replaced with a project overview |

No student names, emails, API keys or tokens were found in the export. The `.env.example` file contains placeholders only.

## Kept on purpose

- **Lesson titles and course phases** (e.g. "String Literals and Variables"): generic course structure, needed to make sense of the code.
- **An "Arkansas Standard" field label** on the Do Now form: it names a public statewide framework.
- **`America/Chicago` time zone** used for Do Now dates.
- **`AGENTS.md` / `CLAUDE.md`**: Base44's standard instructions for AI coding assistants.

## Other changes in this copy

- Unused imports flagged by the export's own lint rules were removed automatically (`eslint --fix`). They were already in the export.
- The settings changes above build and lint, but they **have not been run against a Base44 backend**.
