import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { extractVocabWords } from '../../shared/vocabExtract.ts';

// Pulls the teacher's vocabulary WORDS for a single lesson straight from the
// lesson-plan Google Doc (the "vocab-list" section) — no LLM, so it never
// spends integration credits. Only the words are returned; the student adds
// their own definitions, so the teacher's definitions (which follow each
// <strong> in the doc) are intentionally not sent to students.

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fileId = body?.file_id;
    if (!fileId) return Response.json({ error: "file_id required" }, { status: 400 });

    const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
    const token = conn?.accessToken;
    if (!token) return Response.json({ error: "Drive not connected" }, { status: 502 });

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return Response.json({ error: `Drive fetch failed: ${res.status}` }, { status: 502 });
    const html = await res.text();

    return Response.json({ file_id: fileId, words: extractVocabWords(html) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}