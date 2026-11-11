// Drive "Lesson Plan - <lesson>.html" documents — per-lesson interactive lesson
// plans (collapsible dropdown boxes), shown on a dedicated Lesson Plans page,
// separate from the lesson material. All phases wired up.
import { LESSON_PLAN_FILE_IDS } from "@/lib/schoolConfig";

// Public copy: the production file IDs were removed. Supply your own via
// VITE_LESSON_PLAN_FILE_IDS (JSON: {"Lesson title": "driveFileId"}).
const LESSON_PLAN_LIST = [
  // Phase 1 — What Is CS
  { phase: 1, title: "What Is Computer Science?" },
  { phase: 1, title: "IDEs and Hello World" },
  { phase: 1, title: "Programming Languages" },
  { phase: 1, title: "Binary" },
  { phase: 1, title: "Hardware" },
  { phase: 1, title: "Software and Operating Systems" },
  // Phase 2 — Output
  { phase: 2, title: "ASCII Art Coding" },
  { phase: 2, title: "ASCII Art Planning" },
  { phase: 2, title: "Comments" },
  { phase: 2, title: "Concatenation and Characters" },
  { phase: 2, title: "Escape Characters" },
  { phase: 2, title: "Output" },
  { phase: 2, title: "String Literals and Variables" },
  // Phase 3 — Thinking Like a Programmer
  { phase: 3, title: "Critical Thinking" },
  { phase: 3, title: "Debugging" },
  { phase: 3, title: "Flowcharts" },
  { phase: 3, title: "Pseudocode" },
  { phase: 3, title: "Putting It Together" },
  // Phase 4 — Input and Strings
  { phase: 4, title: "charAt and substring" },
  { phase: 4, title: "equals" },
  { phase: 4, title: "Length and Case" },
  { phase: 4, title: "Name Game" },
  { phase: 4, title: "Pig Latin" },
  { phase: 4, title: "Scanner" },
  // Phase 5 — Decisions
  { phase: 5, title: "Combining Conditions" },
  { phase: 5, title: "Division and Decimals" },
  { phase: 5, title: "Magic 8 Ball" },
  { phase: 5, title: "Making Decisions" },
  { phase: 5, title: "Numbers and Arithmetic" },
  { phase: 5, title: "Random" },
  { phase: 5, title: "Switch" },
  { phase: 5, title: "Themed Selector" },
  // Phase 6 — Loops
  { phase: 6, title: "Counting and Totaling" },
  { phase: 6, title: "Do While and Input" },
  { phase: 6, title: "Guess My Number" },
  { phase: 6, title: "Name Game Song" },
  { phase: 6, title: "Number Guesser" },
  { phase: 6, title: "The Halving Strategy" },
  { phase: 6, title: "While Loops" },
  // Phase 7 — Methods
  { phase: 7, title: "Battle Simulator" },
  { phase: 7, title: "Char and ASCII" },
  { phase: 7, title: "For Loops" },
  { phase: 7, title: "Giving and Getting" },
  { phase: 7, title: "Password Generator" },
  { phase: 7, title: "Your First Method" },
  // Phase 8 — Arrays and Collections
  { phase: 8, title: "ArrayList" },
  { phase: 8, title: "Arrays" },
  { phase: 8, title: "Arrays Meet Methods" },
  { phase: 8, title: "Meet Maps and Sets" },
  { phase: 8, title: "Passion Quiz" },
  { phase: 8, title: "Gingerbread Runner (Extension)" },
  { phase: 8, title: "Sports Tracker" },
  { phase: 8, title: "Stacks and Queues" },
  // Phase 9 — Collecting Data
  { phase: 9, title: "Asking A Fair Question" },
  { phase: 9, title: "Data That Lies" },
  { phase: 9, title: "Go Collect" },
  { phase: 9, title: "Surveys Arent The Only Way" },
  { phase: 9, title: "What Counts As Data" },
  // Phase 10 — Working with Data
  { phase: 10, title: "Dirty Data" },
  { phase: 10, title: "From Text To Counts" },
  { phase: 10, title: "Old Tools Real Data" },
  { phase: 10, title: "Reading Real Files" },
  { phase: 10, title: "Where Data Lives" },
  { phase: 10, title: "Writing and Appending" },
  // Phase 11 — Making Meaning from Data
  { phase: 11, title: "Correlation Isnt Causation" },
  { phase: 11, title: "Does X Go With Y" },
  { phase: 11, title: "Honest Conclusions" },
  { phase: 11, title: "Picture the Pattern" },
  { phase: 11, title: "Quartiles and the Spreadsheet Bridge" },
  { phase: 11, title: "Tell the Story" },
  // Phase 12 — Encryption
  { phase: 12, title: "Around the Horn" },
  { phase: 12, title: "Break the Code" },
  { phase: 12, title: "One Letter Over" },
  { phase: 12, title: "Project Caesar Cipher" },
  { phase: 12, title: "Scramble the Whole Message" },
  { phase: 12, title: "Undo the Scramble" },
  { phase: 12, title: "Why This Wouldnt Stop Anyone" },
  // Phase 13 (Extension) — Objects
  { phase: 13, title: "2D Arrays" },
  { phase: 13, title: "Built in One Line" },
  { phase: 13, title: "Many at Once" },
  { phase: 13, title: "Objects That Do Things" },
  { phase: 13, title: "Two Lists That Want to Be One" },
  // Phase 14 — Networking and Cybersecurity
  { phase: 14, title: "How the Internet Moves Data" },
  { phase: 14, title: "Keeping Information Safe" },
  { phase: 14, title: "Phase 14 — Lesson 4" },
  { phase: 14, title: "Phase 14 — Lesson 5" },
  { phase: 14, title: "The Machines That Carry It" },
  // Phase 15 — Career and Professional Readiness
  { phase: 15, title: "Being Findable" },
  { phase: 15, title: "Doing It Right" },
  { phase: 15, title: "Talking About Your Work" },
  { phase: 15, title: "Where This Can Take You" },
  { phase: 15, title: "Your Proof You Can Do It" },
];

export const LESSON_PLAN_DOCS = LESSON_PLAN_LIST.map((d) => ({ ...d, fileId: LESSON_PLAN_FILE_IDS[d.title] || "" }));

import { parseLesson } from "./lessonPhases";

// Match a Lesson entity to its lesson-plan Drive doc (by phase + normalized
// lesson name). Returns { phase, title, fileId } or null if there's no plan doc
// for this lesson (e.g. overview lessons, or lessons without a written plan).
export function planForLesson(lesson) {
  if (!lesson) return null;
  const p = parseLesson(lesson);
  if (!p || p.isOverview) return null;
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(p.name);
  return (
    LESSON_PLAN_DOCS.find((d) => d.phase === p.phase && norm(d.title) === target) || null
  );
}

export function plansForPhase(phase) {
  return LESSON_PLAN_DOCS.filter((d) => d.phase === Number(phase));
}

export function phasesWithPlans() {
  return new Set(LESSON_PLAN_DOCS.map((d) => d.phase));
}