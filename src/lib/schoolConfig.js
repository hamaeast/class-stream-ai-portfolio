// School-specific values come from environment variables so the public copy
// carries no real school, district, or Google Drive details. See .env.example.
const env = /** @type {any} */ (import.meta).env || {};

export const SCHOOL_SHORT_NAME = env.VITE_SCHOOL_SHORT_NAME || 'Class Stream';
export const COURSE_NAME = env.VITE_COURSE_NAME || 'Computer Science';
export const DISTRICT_SHORT_NAME = env.VITE_DISTRICT_SHORT_NAME || 'District';
export const SCHOOL_YEAR_LABEL = env.VITE_SCHOOL_YEAR_LABEL || '2026-2027';
export const SCHOOL_CALENDAR_IMAGE_URL = env.VITE_SCHOOL_CALENDAR_IMAGE_URL || '';
export const PACING_GUIDE_URL = env.VITE_PACING_GUIDE_URL || '';

// Lesson-plan Google Drive file IDs, as a JSON object {"Lesson title": "fileId"}.
function parseJson(text, fallback) { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } }
export const LESSON_PLAN_FILE_IDS = parseJson(env.VITE_LESSON_PLAN_FILE_IDS, {});

// Lesson record IDs that should not get an auto-created graded assignment
// (orientation / course-intro lessons), comma-separated.
export const NO_ASSIGNMENT_LESSON_IDS = String(env.VITE_NO_ASSIGNMENT_LESSON_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
