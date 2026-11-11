// Shared vocabulary-extraction helpers used by the vocab seeding functions.
// Kept here so the per-lesson extraction (seedLessonVocab), the teacher
// bulk-seed (seedStudentVocabFromPlans), and the teacher reference build
// (buildVocabReferences) parse Drive docs identically.

export function decodeEntities(s: string): string {
  return s
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/'/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&/g, "&")
    .trim();
}

// Pulls every <div class="vocab-item">…</div> block from a lesson-plan doc's
// "vocab-list" sections and returns the WORD plus the teacher's definition
// (the text following the <strong>). Order-preserving, case-insensitive
// de-duplication by word.
export function extractVocabTerms(html: string): { word: string; definition: string }[] {
  const terms: { word: string; definition: string }[] = [];
  const seen = new Set<string>();
  const re = /<div class="vocab-item"[\s\S]*?<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = m[0];
    const strong = inner.match(/<strong>([^<]+)<\/strong>/);
    if (!strong) continue;
    const word = decodeEntities(strong[1]);
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    // Definition = the vocab-item text with the entire <strong>…</strong>
    // element removed, remaining tags stripped, whitespace collapsed.
    const defHtml = inner.replace(/<strong>[\s\S]*?<\/strong>/, "");
    const definition = decodeEntities(defHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    seen.add(key);
    terms.push({ word, definition });
  }
  return terms;
}

// Convenience: words only (for student seeding — students add their own
// definitions, so the teacher definitions are never sent to them).
export function extractVocabWords(html: string): string[] {
  return extractVocabTerms(html).map((t) => t.word);
}