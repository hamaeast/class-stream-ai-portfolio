// Parse lesson titles into phase groupings.
//   "Phase 2 — Output"               -> overview lesson for phase 2
//   "Phase 2 · Lesson 4 — Escape..." -> a lesson inside phase 2
export function parseLesson(l) {
  const overview = l.title.match(/^Phase\s*(\d+)\s*[—–-]\s*(.+)$/);
  if (overview) return { phase: Number(overview[1]), isOverview: true };
  const lesson = l.title.match(
    /^Phase\s*(\d+)\s*·\s*Lesson\s*(\d+)\s*[—–-]\s*(.+)$/
  );
  if (lesson)
    return {
      phase: Number(lesson[1]),
      isOverview: false,
      num: Number(lesson[2]),
      name: lesson[3],
    };
  return null;
}

export function phaseLabel(overview) {
  if (!overview) return null;
  return overview.title.replace(/^Phase\s*\d+\s*[—–-]\s*/, "");
}

export function groupByPhase(lessons) {
  const phases = new Map();
  const intro = [];
  for (const l of lessons) {
    const p = parseLesson(l);
    if (!p) {
      intro.push(l);
      continue;
    }
    if (!phases.has(p.phase)) phases.set(p.phase, { overview: null, lessons: [] });
    const grp = phases.get(p.phase);
    if (p.isOverview) grp.overview = l;
    else grp.lessons.push({ ...l, _num: p.num, _name: p.name });
  }
  for (const g of phases.values()) g.lessons.sort((a, b) => a._num - b._num);
  intro.sort((a, b) => (a.order || 0) - (b.order || 0));
  return { phases, intro };
}