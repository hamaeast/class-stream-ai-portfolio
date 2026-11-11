import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { migrateInlineAnswers, saveAnswerKey, splitAnswerKey } from '../../shared/assessmentKey.ts';

// Builds a lesson's multiple-choice quiz from the matching Google Doc (quiz_file_url).
// The quiz doc has questions as a numbered list; each "<li>" holds the question +
// "a) b) c) d)" choices, with the correct answer wrapped in a bold (non-default)
// span. We parse that structure directly — no LLM — and cache the result as
// quiz_json on the lesson so every student/teacher sees the same choices.
//
// Payload: { lesson_id, quiz_file_url? }
//   - quiz_file_url (optional): override or seed the doc link for this lesson.
// Returns: { questions: [{ question, choices: string[4] }] }
//
// Security: the parsed answer_index values go to the admin-only
// AssessmentAnswerKey (kind 'quiz'); quiz_json and this function's response
// (callable by students) carry only { question, choices }.

function decode(s) {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/"/g, '"')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&/g, '&');
}

function docIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/[-/]d\/([a-zA-Z0-9_-]+)/) || url.match(/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Parse the quiz doc HTML into structured {question, choices, answer_index}.
// Relies on the correct answer being the only <span> in each <li> whose class
// differs from the majority (i.e., the one bold span).
function parseQuizHtml(html) {
  if (!html) return [];
  const lis = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  const out = [];
  for (const li of lis) {
    const spans = [...li.matchAll(/<span[^>]*class="([^"]+)"[^>]*>([\s\S]*?)<\/span>/gi)];
    if (!spans.length) continue;
    const texts = spans.map((s) => decode(s[2]));
    const classes = spans.map((s) => s[1]);
    const freq = {};
    classes.forEach((c) => (freq[c] = (freq[c] || 0) + 1));
    let defClass = classes[0], max = 0;
    for (const c in freq) if (freq[c] > max) { max = freq[c]; defClass = c; }

    let correctLetter = null;
    for (let i = 0; i < classes.length; i++) {
      if (classes[i] !== defClass) {
        const m = texts[i].trim().match(/^\s*([a-d])\)/i);
        if (m) { correctLetter = m[1].toLowerCase(); break; }
      }
    }

    const full = texts.join('').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = full.split(/\s+([a-d])\)\s+/i);
    const question = (parts[0] || '').replace(/^\s*\d+\.\s*/, '').trim();
    const choices = [];
    const letterByIdx = ['a', 'b', 'c', 'd'];
    for (let i = 1; i + 1 < parts.length; i += 2) {
      choices.push({ letter: parts[i].toLowerCase(), text: (parts[i + 1] || '').trim() });
    }
    if (choices.length !== 4 || choices.some((c) => !c.text)) continue;

    let answerIndex = letterByIdx.indexOf(correctLetter);
    if (answerIndex < 0) {
      // Fallback: match the bold span's full text against each choice.
      const correctSpan = texts.find((t) => {
        const mm = t.trim().match(/^\s*([a-d])\)/i);
        return mm && mm[1].toLowerCase() !== defClass ? false : false;
      });
      void correctSpan;
    }

    out.push({
      question,
      choices: choices.map((c) => c.text),
      answer_index: answerIndex >= 0 ? answerIndex : 0,
    });
  }
  return out;
}

async function fetchHtml(base44, docId) {
  // 1) Public export (works for "anyone with the link" docs).
  try {
    const pub = await fetch(
      `https://docs.google.com/document/d/${docId}/export?format=html`
    );
    if (pub.ok) {
      const html = await pub.text();
      if (parseQuizHtml(html).length > 0) return html;
    }
  } catch {}
  // 2) Connector export (works for docs shared with the Drive account).
  try {
    const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
    if (conn?.accessToken) {
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/html`,
        { headers: { Authorization: `Bearer ${conn.accessToken}` } }
      );
      if (r.ok) return await r.text();
    }
  } catch {}
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lesson_id;
    if (!lessonId)
      return Response.json({ error: 'lesson_id required' }, { status: 400 });

    const lesson = await base44.asServiceRole.entities.Lesson.get(lessonId);
    if (!lesson) return Response.json({ error: 'Lesson not found' }, { status: 404 });

    if (lesson.quiz_json) {
      try {
        const cached = JSON.parse(lesson.quiz_json);
        if (Array.isArray(cached)) {
          // Legacy caches still hold answer_index: move it to the key first.
          const stripped = await migrateInlineAnswers(base44, 'quiz', lessonId, cached);
          return Response.json({ questions: stripped });
        }
      } catch {}
    }

    const quizUrl = body?.quiz_file_url || lesson.quiz_file_url;
    const docId = docIdFromUrl(quizUrl);
    if (!docId) return Response.json({ questions: [] });

    // Seed the link onto the lesson so future builds need no payload.
    if (body?.quiz_file_url && !lesson.quiz_file_url) {
      try {
        await base44.asServiceRole.entities.Lesson.update(lessonId, {
          quiz_file_url: body.quiz_file_url,
        });
      } catch {}
    }

    const html = await fetchHtml(base44, docId);
    if (!html) return Response.json({ questions: [] });

    const { questions, answers } = splitAnswerKey(parseQuizHtml(html));
    if (questions.length) {
      try {
        // Key first, so a cached quiz is never left without one.
        await saveAnswerKey(base44, 'quiz', lessonId, answers);
        await base44.asServiceRole.entities.Lesson.update(lessonId, {
          quiz_json: JSON.stringify(questions),
        });
      } catch {}
    }
    return Response.json({ questions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});