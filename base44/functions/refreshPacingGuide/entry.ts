import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import * as XLSX from 'npm:xlsx@0.18.5';

// Source of truth: the district pacing workbook on Google Drive. An admin can
// re-pull these dates any time the spreadsheet changes (Assign dashboard →
// "Refresh pacing dates"). Keeping a record here so the source is discoverable.
// Public copy: set the PACING_FILE_ID secret in Base44 to your pacing workbook's Drive file ID.
const PACING_FILE_ID = Deno.env.get('PACING_FILE_ID') || '';
const PACING_FILE_URL = `https://docs.google.com/spreadsheets/d/${PACING_FILE_ID}/edit`;

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

// Excel serial number -> MM/DD/YYYY (UTC to avoid off-by-one).
function serialToDate(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}/${d.getUTCFullYear()}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const fileId = body?.file_id || PACING_FILE_ID;

    const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = conn?.accessToken;
    if (!token) return Response.json({ error: 'Google Drive is not connected' }, { status: 502 });

    // Download the .xlsx content (the file is stored as an Excel workbook, not
    // a native Google Sheet, so we use alt=media + SheetJS to parse it).
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const detail = await res.text();
      return Response.json({ error: `Drive download failed: ${res.status}`, detail: detail.slice(0, 200) }, { status: 502 });
    }
    const ab = await res.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!rows || !rows.length) return Response.json({ error: 'Spreadsheet is empty' }, { status: 400 });

    // Locate the header row (first row that clearly looks like the schedule).
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const cells = rows[i].map((c) => String(c || '').toLowerCase().trim());
      const hasDate = cells.some((c) => c === 'date' || c.includes('instructional date'));
      const hasPhase = cells.some((c) => c.includes('phase') || c.includes('lesson'));
      if (cells.length >= 3 && (hasDate || hasPhase)) { headerIdx = i; break; }
    }
    if (headerIdx === -1) headerIdx = 0;
    const header = rows[headerIdx].map((c) => String(c || '').toLowerCase().trim());

    const findCol = (pred) => {
      for (let i = 0; i < header.length; i++) if (pred(header[i])) return i;
      return -1;
    };
    const col = {
      date: findCol((h) => h === 'date' || h.includes('instructional date')),
      instructional_day: findCol((h) => h.includes('instructional day')),
      day: findCol((h) => h === 'day' || h.includes('day of week')),
      day_in_phase: findCol((h) => h.includes('day in phase') || h.includes('day_in_phase') || h.includes('day/phase')),
      phase: findCol((h) => h === 'phase' || h.includes('phase')),
      lesson_focus: findCol((h) => h.includes('lesson') || h.includes('focus')),
      standards: findCol((h) => h.includes('standard')),
    };

    const str = (row, key) => {
      const i = col[key];
      if (i < 0) return '';
      const v = row[i];
      if (v === null || v === undefined) return '';
      return String(v).trim();
    };

    const records = [];
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      const dateRaw = col.date >= 0 ? row[col.date] : '';
      if (dateRaw === undefined || dateRaw === null || dateRaw === '') continue;
      let date;
      if (typeof dateRaw === 'number') {
        date = serialToDate(dateRaw);
      } else if (dateRaw instanceof Date) {
        date = `${pad2(dateRaw.getMonth() + 1)}/${pad2(dateRaw.getDate())}/${dateRaw.getFullYear()}`;
      } else {
        const s = String(dateRaw).trim();
        date = /^\d{4,5}$/.test(s) ? serialToDate(Number(s)) : s;
      }
      if (!date) continue;
      records.push({
        date,
        day: str(row, 'day'),
        instructional_day: col.instructional_day >= 0 ? Number(row[col.instructional_day]) || 0 : 0,
        phase: str(row, 'phase'),
        day_in_phase: str(row, 'day_in_phase'),
        lesson_focus: str(row, 'lesson_focus'),
        standards: str(row, 'standards'),
      });
    }

    if (!records.length) return Response.json({ error: 'No pacing rows found in the sheet' }, { status: 400 });

    // Replace existing pacing data with the freshly parsed rows.
    await base44.asServiceRole.entities.PacingDay.deleteMany({});
    await base44.asServiceRole.entities.PacingDay.bulkCreate(records);

    return Response.json({
      updated: records.length,
      source: PACING_FILE_URL,
      sheet: wb.SheetNames[0],
      header: header.filter(Boolean),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});