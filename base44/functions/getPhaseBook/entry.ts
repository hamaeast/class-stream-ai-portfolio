import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Module-level cache: each phase book / lesson-plan doc is pulled from Google
// Drive once per isolate.
const cache = new Map();
// Don't persist giant docs in the DB — keep records small and reliable.
const MAX_PERSIST = 250000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fileId = body?.file_id;
    if (!fileId) return Response.json({ error: 'file_id required' }, { status: 400 });

    if (cache.has(fileId)) {
      return Response.json({ html: cache.get(fileId) });
    }

    // DB-backed cache: survives isolate restarts and is shared across users, so
    // the lesson-plan / phase-book HTML only hits Drive once per file globally.
    const cached = await base44.asServiceRole.entities.LessonPlanCache.filter({ file_id: fileId });
    if (cached.length > 0) {
      const html = cached[0].html;
      cache.set(fileId, html);
      return Response.json({ html });
    }

    const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = conn?.accessToken;
    if (!token) return Response.json({ error: 'Drive not connected' }, { status: 502 });

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      return Response.json({ error: `Drive fetch failed: ${res.status}` }, { status: 502 });
    }
    const html = await res.text();
    cache.set(fileId, html);

    if (html && html.length <= MAX_PERSIST) {
      try {
        await base44.asServiceRole.entities.LessonPlanCache.create({ file_id: fileId, html });
      } catch (_e) {
        // Persist failure is non-fatal — the module cache still serves this isolate.
      }
    }

    return Response.json({ html });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});