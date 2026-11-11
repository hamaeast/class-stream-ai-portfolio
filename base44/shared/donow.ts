// Shared Do Now scheduling helpers. The school runs on Central time; the
// server (UTC) compares every Do Now against America/Chicago so scheduled
// dates and class-period times line up regardless of where the isolate runs.

export const DO_NOW_TZ = "America/Chicago";

// YYYY-MM-DD in the school timezone (en-CA emits this format).
export function todayInTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DO_NOW_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// HH:MM (24h) in the school timezone, for comparing against scheduled times.
export function nowHHMMInTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DO_NOW_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

// open | upcoming, based on the class-period start. Once a Do Now has opened
// it stays "open" for the rest of the school day (until midnight rolls the
// scheduled date over) so students who miss the narrow class window can still
// reach it — the teacher keeps it on for the whole day.
export function windowStatus(start?: string, end?: string, nowT?: string): string {
  void end;
  const now = nowT || nowHHMMInTz();
  if (start && now < start) return "upcoming";
  return "open";
}