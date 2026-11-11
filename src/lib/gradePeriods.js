// Nine-weeks grading periods + grade computation helpers shared across the app.
// First day of school Aug 4 2026. End dates provided by the teacher:
//  NW1 ends Oct 8 2026, NW2 ends Jan 8 2027, NW3 ends Mar 18 2027, NW4 ends May 28 2027.

export const NINE_WEEKS = [
  { number: 1, name: "1st Nine Weeks", startDate: "2026-08-04", endDate: "2026-10-08" },
  { number: 2, name: "2nd Nine Weeks", startDate: "2026-10-09", endDate: "2027-01-08" },
  { number: 3, name: "3rd Nine Weeks", startDate: "2027-01-09", endDate: "2027-03-18" },
  { number: 4, name: "4th Nine Weeks", startDate: "2027-03-19", endDate: "2027-05-28" },
];

export const NINE_WEEKS_OPTIONS = [
  { value: "all", label: "All nine weeks" },
  ...NINE_WEEKS.map((nw) => ({ value: String(nw.number), label: nw.name })),
];

// Resolve the nine weeks number (1-4) for an assignment from due_date + override.
// "omitted" excludes from all nine weeks; "1".."4" forces into that nine weeks.
export function assignmentPeriod(dueDate, override) {
  if (override === "omitted") return "omitted";
  if (override && String(override).match(/^[1-4]$/)) return Number(override);
  if (!dueDate) return null;
  const d = String(dueDate).slice(0, 10);
  for (const nw of NINE_WEEKS) {
    if (d >= nw.startDate && d <= nw.endDate) return nw.number;
  }
  return null;
}

// Resolve the nine weeks for a quiz response using its attempted_at date.
export function responsePeriod(attemptedAt) {
  if (!attemptedAt) return null;
  const d = String(attemptedAt).slice(0, 10);
  for (const nw of NINE_WEEKS) {
    if (d >= nw.startDate && d <= nw.endDate) return nw.number;
  }
  return null;
}

// Absolute (no-override) period for an assignment — used to know what was omitted.
export function assignmentAutoPeriod(dueDate) {
  return assignmentPeriod(dueDate, null);
}

export function periodName(n) {
  if (n === "omitted") return "Omitted";
  const nw = NINE_WEEKS.find((x) => x.number === Number(n));
  return nw ? nw.name : "Unassigned";
}

export function currentNineWeeks() {
  const today = new Date().toISOString().slice(0, 10);
  for (const nw of NINE_WEEKS) {
    if (today >= nw.startDate && today <= nw.endDate) return nw.number;
  }
  return null;
}

const LETTER_PERCENT = {
  "A+": 98, A: 95, "A-": 92,
  "B+": 88, B: 85, "B-": 82,
  "C+": 78, C: 75, "C-": 72,
  "D+": 68, D: 65, "D-": 62,
  F: 55,
};

// Convert a stored assignment grade (letter or numeric) to a 0-100 percentage.
export function letterToPercent(grade) {
  if (grade == null || grade === "") return null;
  const g = String(grade).trim().toUpperCase();
  if (LETTER_PERCENT[g] !== undefined) return LETTER_PERCENT[g];
  const num = parseFloat(g);
  if (!isNaN(num)) {
    if (g.includes("/")) {
      const [a, b] = g.split("/").map((x) => parseFloat(x));
      return b ? Math.round((a / b) * 100) : a;
    }
    return num > 1 ? Math.round(num) : Math.round(num * 100);
  }
  return null;
}

export function percentToLetter(p) {
  if (p == null) return "—";
  if (p >= 92) return "A";
  if (p >= 90) return "A-";
  if (p >= 87) return "B+";
  if (p >= 83) return "B";
  if (p >= 80) return "B-";
  if (p >= 77) return "C+";
  if (p >= 73) return "C";
  if (p >= 70) return "C-";
  if (p >= 67) return "D+";
  if (p >= 63) return "D";
  if (p >= 60) return "D-";
  return "F";
}