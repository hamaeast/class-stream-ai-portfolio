// Server copy of the notes-worksheet render transforms in
// src/components/NotesBlanks.jsx (stripNameDate, addQuickCheckInputs), so the
// server sees the same set of answer boxes the student sees. Keep in sync.

export const stripNameDate = (html) =>
  String(html || "").replace(/<p>([\s\S]*?)<\/p>/gi, (m, inner) =>
    /Name:/i.test(inner) && /Date:/i.test(inner) && /<input/i.test(inner) ? "" : m
  );

export const addQuickCheckInputs = (html) => {
  const h = String(html || "");
  const marker = h.search(/quick[\s_-]?check/i);
  if (marker < 0) return h;
  const before = h.slice(0, marker);
  let n = 0;
  const after = h.slice(marker).replace(/<p>([\s\S]*?)<\/p>/gi, (m, inner) => {
    if (/<input/i.test(inner)) return m;
    const text = inner.replace(/<[^>]*>/g, "").trim();
    if (!text) return m;
    const numbered = /^\s*\d+[.)]/.test(text);
    const question = /[?？]\s*$/.test(text);
    if (!(numbered || question)) return m;
    n += 1;
    return `<p>${inner} <input type="text" data-blank="qc${n}" class="nb-blank" size="22" maxlength="120" autocomplete="off" /></p>`;
  });
  return before + after;
};

// The data-blank ids of every answer box on the rendered worksheet.
export function blankIds(html) {
  const rendered = stripNameDate(addQuickCheckInputs(html));
  const ids = [];
  rendered.replace(/<input[^>]*data-blank="([^"]+)"[^>]*>/gi, (_m, id) => {
    ids.push(id);
    return _m;
  });
  return ids;
}
