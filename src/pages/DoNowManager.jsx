import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useDoNows, useDoNowResponses } from "@/lib/donowQueries";
import { useMe } from "@/lib/entityQueries";
import CodeHeader from "@/components/CodeHeader";
import DoNowForm from "@/components/DoNowForm";
import DoNowReport from "@/components/DoNowReport";
import { Plus, Pencil, Copy, Trash2, BarChart3, Loader2, RefreshCw, CalendarDays } from "lucide-react";

export default function DoNowManager() {
  const [users, setUsers] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [filter, setFilter] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [busy, setBusy] = useState("");
  const qc = useQueryClient();
  const { data: me } = useMe();

  const { data: doNows = [], isLoading } = useDoNows();
  const { data: responses = [] } = useDoNowResponses();

  const refresh = () => qc.invalidateQueries({ queryKey: ["doNow", "all"] });

  // Keep a local user list for report join (admin-only entity).
  useEffect(() => {
    base44.entities.User.list("-full_name")
      .then(setUsers)
      .catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const m = {};
    for (const r of responses) m[r.do_now_id] = (m[r.do_now_id] || 0) + 1;
    return m;
  }, [responses]);

  const phases = useMemo(() => {
    const set = new Set();
    doNows.forEach((d) => d.phase && set.add(d.phase));
    return [...set].sort();
  }, [doNows]);

  const visible = useMemo(() => {
    const f = filter.toLowerCase();
    return doNows.filter((d) => {
      if (phaseFilter && d.phase !== phaseFilter) return false;
      if (!f) return true;
      return (
        (d.lesson_topic || "").toLowerCase().includes(f) ||
        (d.question || "").toLowerCase().includes(f) ||
        (d.do_now_id || "").toLowerCase().includes(f)
      );
    });
  }, [doNows, filter, phaseFilter]);

  async function openNew() {
    const next = (doNows.reduce((n, d) => Math.max(n, d.day_number || 0), 0) || 0) + 1;
    setEditing(null);
    setFormOpen(true);
    // prefill placeholder is handled by emptyForm; bump nothing here
    void next;
  }

  function openEdit(d) {
    setEditing(d);
    setFormOpen(true);
  }

  async function save(form) {
    if (editing) {
      await base44.entities.DoNow.update(editing.id, form);
    } else {
      const { _id, ...rest } = form;
      void _id;
      await base44.entities.DoNow.create(rest);
    }
    refresh();
  }

  async function duplicate(d) {
    const { id, created_date, updated_date, created_by_id, ...rest } = d;
    void id; void created_date; void updated_date; void created_by_id;
    await base44.entities.DoNow.create({
      ...rest,
      do_now_id: `${rest.do_now_id}-COPY`,
      scheduled_date: "",
      scheduled_start_time: "",
      scheduled_end_time: "",
      active: false,
    });
    refresh();
  }

  async function remove(d) {
    if (!window.confirm(`Delete ${d.do_now_id}? This cannot be undone.`)) return;
    setBusy(d.id);
    try {
      await base44.entities.DoNow.delete(d.id);
      refresh();
    } finally {
      setBusy("");
    }
  }

  async function toggleActive(d) {
    await base44.entities.DoNow.update(d.id, { active: !d.active });
    refresh();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <CodeHeader
        chip="do_nows.admin()"
        title="Do Now Manager"
        subtitle="Edit, schedule, and review daily warm-ups"
        tags={[
          { label: `${doNows.length} questions`, color: "text-[#22D3EE] border-[#22D3EE]/30 bg-[#22D3EE]/10" },
          { label: `${responses.length} attempts`, color: "text-[#FF2BD6] border-[#FF2BD6]/30 bg-[#FF2BD6]/10" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3 mt-6 mb-4">
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Do Now</Button>
        <Button variant="outline" onClick={refresh}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
          >
            <option value="" className="bg-card">All units</option>
            {phases.map((p) => (
              <option key={p} value={p} className="bg-card">{p}</option>
            ))}
          </select>
          <Input
            placeholder="Search questions…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-56"
          />
        </div>
      </div>

      <Card className="border-stone-200/20">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-stone-400">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Topic</th>
                <th className="px-3 py-2 font-medium">Question</th>
                <th className="px-3 py-2 font-medium">Pts</th>
                <th className="px-3 py-2 font-medium">Gradebook</th>
                <th className="px-3 py-2 font-medium">Schedule</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id} className="border-t border-stone-200/10 hover:bg-secondary/20">
                  <td className="px-3 py-2 text-stone-400 font-mono">{d.do_now_id}<span className="text-[10px] block">#{d.day_number}</span></td>
                  <td className="px-3 py-2 text-foreground">{d.phase}</td>
                  <td className="px-3 py-2 text-stone-300">{d.lesson_topic}</td>
                  <td className="px-3 py-2 text-foreground max-w-[260px] truncate">{d.question}</td>
                  <td className="px-3 py-2 text-foreground">{d.points_possible}</td>
                  <td className="px-3 py-2">
                    <Badge variant={d.gradebook_setting === "Yes" ? "default" : d.gradebook_setting === "No" ? "secondary" : "outline"} className="text-[10px]">
                      {d.gradebook_setting}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-stone-400 whitespace-nowrap">
                    {d.scheduled_date
                      ? <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />{d.scheduled_date}<span className="text-[10px] text-stone-500"> · {d.scheduled_start_time || "—"}–{d.scheduled_end_time || "—"}</span></span>
                      : <span className="text-stone-500">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Switch checked={!!d.active} onCheckedChange={() => toggleActive(d)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="Reports" onClick={() => setReportFor(d)} count={counts[d.do_now_id]}>
                        <BarChart3 className="w-4 h-4" />
                      </IconBtn>
                      <button title="Edit" onClick={() => openEdit(d)} className="p-1.5 rounded hover:bg-secondary text-stone-300"><Pencil className="w-4 h-4" /></button>
                      <button title="Duplicate" onClick={() => duplicate(d)} className="p-1.5 rounded hover:bg-secondary text-stone-300"><Copy className="w-4 h-4" /></button>
                      <button title="Delete" disabled={busy === d.id} onClick={() => remove(d)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive">
                        {busy === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-stone-500">No Do Nows match your filter.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="mt-4 text-center">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">cd ../dashboard</Link>
        </Button>
      </div>

      <DoNowForm
        open={formOpen}
        record={editing}
        onClose={() => setFormOpen(false)}
        onSave={save}
      />
      <DoNowReport
        open={!!reportFor}
        doNow={reportFor}
        responses={responses}
        users={users}
        onClose={() => setReportFor(null)}
      />
    </div>
  );
}

function IconBtn({ title, onClick, count, children }) {
  return (
    <button title={title} onClick={onClick} className="relative p-1.5 rounded hover:bg-secondary text-stone-300">
      {children}
      {!!count && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  );
}