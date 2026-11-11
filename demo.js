/* Class Stream isolated demo. No network access (blocked by the page's CSP). */
(function () {
  const D = window.DemoData;
  const P = window.DemoPolicy;
  const app = document.getElementById('app');

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const badge = (cls, text) => h('span', { class: `badge ${cls}` }, text);

  function simBox(label, prompt, response, note) {
    return h('div', { class: 'sim' },
      h('span', { class: 'tag' }, 'Simulated AI response'), ' ', h('b', {}, label),
      h('p', { class: 'small' }, note || 'Prerecorded for this demo. In the live app this step sends the prompt below to a language model through Base44 and asks for JSON matching a schema.'),
      h('details', {}, h('summary', {}, 'Prompt the live app would send'), h('pre', {}, prompt)),
      h('details', {}, h('summary', {}, 'Prerecorded JSON reply used here'), h('pre', {}, JSON.stringify(response, null, 2))));
  }

  const state = {
    imp: { prac: D.practiceDoc, key: D.keyDoc, result: null },
    cfa: { generated: false, data: null, dropped: 0, published: false, saved: '' },
    grade: { graded: {}, approved: {}, adjust: {} },
  };

  // ======================= 1. Import a worksheet =======================
  function doImport() {
    const prac = P.parseLines(state.imp.prac.split('\n'), false);
    const key = P.parseLines(state.imp.key.split('\n'), true);
    state.imp.result = { prac, ...P.buildPayloads(prac, key) };
    render();
  }

  function importView() {
    const s = state.imp; const r = s.result;
    return [
      h('section', { class: 'panel' },
        h('div', { class: 'row' }, h('h2', {}, 'Walkthrough 1 · Import a worksheet from Google Docs'), badge('by-code', 'No AI: rule-based parsing')),
        h('p', { class: 'muted' }, `Teacher view · ${D.lesson.title}`),
        h('p', { class: 'small' }, 'The teacher already writes practice worksheets and answer keys as Google Docs, using headers like "PRACTICE · 1 PT 1." The app turns those documents into an interactive worksheet without retyping and without an AI call: the structure is predictable, so a parser is cheaper and more reliable.'),
        h('div', { class: 'grid2 mt' },
          h('div', {}, h('label', { for: 'pd' }, 'Practice document (sample text)'), h('textarea', { id: 'pd', rows: 14, oninput: e => { s.prac = e.target.value; } }, s.prac)),
          h('div', {}, h('label', { for: 'kd' }, 'Answer key document (sample text)'), h('textarea', { id: 'kd', rows: 14, oninput: e => { s.key = e.target.value; } }, s.key))),
        h('div', { class: 'row mt' }, h('button', { class: 'primary', onclick: doImport }, 'Import worksheet'), h('span', { class: 'small muted' }, 'Try editing a header or point value, then import again.')),
        r ? h('div', { class: 'grid2 mt' },
          h('div', { class: 'evidence' }, h('b', {}, `What students see: "${r.practicePayload.title}" · point goal ${r.practicePayload.point_goal}`),
            r.practicePayload.questions.map(q => h('div', { class: 'qcard' }, h('div', { class: 'row' }, badge(`tier-${q.tier}`, q.tier.toUpperCase()), h('span', { class: 'small muted' }, `${q.points} pt${q.points > 1 ? 's' : ''}`)), h('p', {}, q.prompt))),
            h('p', { class: 'small muted' }, 'No answers are included in the student copy.')),
          h('div', { class: 'qcard' }, h('b', {}, 'Answer key (teacher-only; stored server-side)'),
            r.keyItems.map(k => h('p', { class: 'small' }, h('b', {}, `${k.id} (${k.points}): `), k.model_answer || h('i', {}, 'no answer found'))),
            h('p', { class: 'small muted' }, 'In production this is the PracticeAnswerKey entity, readable only by admins. The AI grader reads it on the server.'))) : null,
        h('p', { class: 'where' }, 'Mirrors base44/shared/practiceParser.ts (parseDoc, buildPayloads) and base44/functions/buildLessonPractice. Production first fetches each Doc as HTML from Google Drive. Lesson notes and quizzes are imported the same way, and imported notes and lesson-plan pages are cached so documents aren\'t fetched and processed again.'))
    ];
  }

  // ======================= 2. Formative assessment =======================
  function generateCfa() {
    const raw = D.cfa.response;
    const cleaned = P.cleanCfa(raw);
    state.cfa = { generated: true, data: cleaned, dropped: raw.questions.length - cleaned.questions.length, published: false, saved: '' };
    render();
  }

  function cfaView() {
    const c = state.cfa; const prompt = D.cfa.prompt.replace('{{lessonContext}}', D.cfa.lessonContext);
    const qs = c.data ? c.data.questions : [];
    const noteFor = q => (D.cfa.response.questions.find(x => x.question === q.question) || {}).note;
    return [
      h('section', { class: 'panel' },
        h('div', { class: 'row' }, h('h2', {}, 'Walkthrough 2 · Generate and edit a formative assessment'), badge('by-ai', 'AI drafts · teacher decides')),
        h('p', { class: 'muted' }, `Teacher view · CFA for ${D.cfa.phases}`),
        h('p', { class: 'small' }, 'The model gets the titles and short context for the lessons in the selected phases. It returns a study guide and 10 multiple-choice questions. Code removes malformed questions, saves the draft hidden from students, and the teacher edits it before releasing it.'),
        !c.generated ? h('div', { class: 'row mt' }, h('button', { class: 'primary', onclick: generateCfa }, 'Generate study guide + questions')) : null,
        c.generated ? [
          h('div', { class: 'status warn' }, h('b', {}, c.published ? 'Released to students. ' : 'Saved as a draft, hidden from students. '), c.dropped ? `Code dropped ${c.dropped} malformed question${c.dropped > 1 ? 's' : ''} (not exactly 4 choices). ` : '', 'The sample reply is cut to six questions to keep the demo short; the real prompt asks for 10.'),
          h('div', { class: 'evidence' }, h('b', {}, 'Study guide'), h('pre', { class: 'tutorial' }, c.data.study_guide)),
          qs.map((q, i) => h('div', { class: 'qcard' },
            h('label', {}, `Question ${i + 1}`, h('input', { type: 'text', value: q.question, oninput: e => { q.question = e.target.value; } })),
            noteFor(q) ? h('p', { class: 'status warn small' }, noteFor(q)) : null,
            h('div', { class: 'choices' }, q.choices.map((ch, j) => h('label', { class: 'check' },
              h('input', { type: 'radio', name: `q${i}`, checked: q.answer_index === j, onchange: () => { q.answer_index = j; render(); } }), ch, q.answer_index === j ? badge('ok', 'correct') : null))),
            h('button', { onclick: () => { qs.splice(i, 1); render(); } }, 'Delete question'))),
          h('div', { class: 'row mt' },
            h('button', { onclick: () => { c.saved = `Saved ${qs.length} questions (demo, not sent anywhere).`; render(); } }, 'Save edits'),
            h('button', { class: 'primary', onclick: () => { c.published = !c.published; render(); } }, c.published ? 'Hide from students' : 'Release to students')),
          c.saved ? h('p', { class: 'small muted' }, c.saved) : null,
          simBox('CFA draft', prompt, D.cfa.response),
        ] : null,
        h('p', { class: 'where' }, 'Mirrors base44/functions/buildCfa and src/components/CfaEditor.jsx. Enforced in code: drop questions without text or exactly 4 choices, clamp answer_index to 0–3, save new CFAs with published=false, and only the teacher can edit or release them. The CFA is scored in code by matching answer_index. Asked in the prompt only: clear, fair, evenly spread questions. Known gap: in production, CFA records (including answer_index) are readable by any signed-in user.'))
    ];
  }

  // ======================= 3. Grading + teacher review =======================
  const keyItems = () => P.buildPayloads(P.parseLines(D.practiceDoc.split('\n'), false), P.parseLines(D.keyDoc.split('\n'), true)).keyItems;

  function gradeView() {
    const g = state.grade; const keys = keyItems();
    const items = sub => keys.map(k => ({ id: k.id, points: k.points, prompt: k.prompt, model_answer: k.model_answer, student_answer: sub.answers[k.id] }));
    return [
      h('section', { class: 'panel' },
        h('div', { class: 'row' }, h('h2', {}, 'Walkthrough 3 · Review an AI-scored practice'), badge('by-ai', 'AI scores · teacher reviews')),
        h('p', { class: 'small' }, 'Practice answers are scored against the teacher\'s model answers, with partial credit and a 6th-grade writing bar. The model also reports how confident it is in each score. If its points-weighted confidence is below 0.90, the attempt goes to the teacher instead of the gradebook. That 0.90 is a threshold on the model\'s own estimate, not a measured accuracy rate.')),
      ...D.submissions.map((sub, si) => {
        const r = g.graded[si];
        const approved = g.approved[si];
        return h('section', { class: 'panel' },
          h('div', { class: 'row' }, h('h3', {}, sub.student), h('span', { class: 'muted small' }, D.lesson.title),
            r ? (approved ? badge('ok', `Approved by teacher · ${approved}`) : r.review_needed ? badge('flag', `Pending teacher review · confidence ${r.confidence.toFixed(2)}`) : badge('ok', `Posted to gradebook · confidence ${r.confidence.toFixed(2)}`)) : null),
          !r ? h('button', { class: 'primary', onclick: () => { g.graded[si] = P.finalizeGrades(keys, sub.ai); render(); } }, 'Submit practice (student)') : null,
          keys.map(k => {
            const res = r && r.results.find(x => x.id === k.id);
            const adjKey = `${si}:${k.id}`;
            return h('div', { class: 'qcard' },
              h('div', { class: 'row' }, h('b', {}, `${k.id} · ${k.prompt}`)),
              h('p', {}, h('b', {}, 'Answer: '), h('code', {}, sub.answers[k.id])),
              r ? h('p', { class: 'small' }, h('b', {}, `${res.score} / ${res.max} pts`), ` · confidence ${res.confidence.toFixed(2)} · ${res.feedback}`) : null,
              r && r.review_needed && !approved ? h('div', { class: 'row small' }, h('span', { class: 'muted' }, `Model answer: ${k.model_answer}`),
                h('label', { class: 'check' }, 'Teacher score', h('input', { type: 'number', min: 0, max: k.points, step: 0.5, value: g.adjust[adjKey] ?? res.score, oninput: e => { g.adjust[adjKey] = e.target.value; } }))) : null);
          }),
          r && r.review_needed && !approved ? h('div', { class: 'row mt' }, h('button', { class: 'primary', onclick: () => {
            const total = keys.reduce((a, k) => { const res = r.results.find(x => x.id === k.id); const v = Number(g.adjust[`${si}:${k.id}`] ?? res.score); return a + Math.max(0, Math.min(k.points, v || 0)); }, 0);
            g.approved[si] = `${total}/${r.total_max} pts`; render();
          } }, 'Approve and post to gradebook')) : null,
          r ? simBox('Practice grading', D.gradingPrompt.replace('{{items}}', JSON.stringify(items(sub))), { results: sub.ai, total_score: sub.ai.reduce((a, x) => a + x.score, 0) }) : null);
      }),
      h('p', { class: 'where' }, 'Mirrors base44/shared/gradePractice.ts, src/components/PracticeView.jsx, and src/pages/ReviewPractices.jsx. Enforced in code: answer keys stay server-side; each score is clamped to the item\'s points; confidence below 0.90 sets status "under_review"; if the grading call fails, the attempt goes to manual teacher grading; teacher-adjusted scores are clamped too. Asked in the prompt only: lenient writing bar, honest confidence, one-sentence feedback.')
    ];
  }

  // ======================= routing =======================
  const views = { import: importView, cfa: cfaView, grade: gradeView };
  function current() { const t = location.hash.replace('#', ''); return views[t] ? t : 'import'; }
  function render() {
    const tab = current();
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    app.replaceChildren(...views[tab]().flat());
  }
  window.addEventListener('hashchange', render);

  const scenes = {
    'import': () => { location.hash = 'import'; doImport(); },
    'cfa': () => { location.hash = 'cfa'; generateCfa(); },
    'grade': () => { location.hash = 'grade'; state.grade.graded[0] = P.finalizeGrades(keyItems(), D.submissions[0].ai); state.grade.graded[1] = P.finalizeGrades(keyItems(), D.submissions[1].ai); },
    'review': () => { location.hash = 'grade'; state.grade.graded[1] = P.finalizeGrades(keyItems(), D.submissions[1].ai); },
  };
  const scene = new URLSearchParams(location.search).get('scene');
  if (scenes[scene]) scenes[scene]();
  render();
})();
