import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, UserCircle } from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreview } from "@/lib/PreviewContext";

export default function PreviewStudent() {
  const navigate = useNavigate();
  const { startPreview } = usePreview();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    base44.entities.User.list()
      .then((us) => setUsers((us || []).filter((u) => u.role !== "admin")))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const periods = useMemo(
    () => [...new Set(users.map((u) => u.class_period).filter(Boolean))].sort(),
    [users]
  );
  const filtered = users.filter(
    (u) =>
      (period === "all" || u.class_period === period) &&
      (!q || (u.full_name || "").toLowerCase().includes(q.toLowerCase()))
  );

  const view = (s) => {
    startPreview(s);
    navigate("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <CodeHeader
        chip="preview.student()"
        title="Preview Student"
        subtitle="See the classroom exactly as a student sees it."
      />

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="w-44">
          <label className="text-xs text-stone-500 font-mono">filter.period</label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All periods</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>Period {p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-stone-500 font-mono">search.name</label>
          <div className="relative mt-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search students…"
              className="w-full pl-8 pr-3 py-2 rounded-md border border-input bg-transparent text-sm"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-stone-400 py-12">No students found.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-stone-200 bg-card p-4"
            >
              <UserCircle className="w-9 h-9 text-stone-300 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground truncate">
                  {s.full_name || s.email}
                </p>
                <div className="flex gap-2 mt-0.5 flex-wrap">
                  {s.grade && <Badge variant="secondary">Grade {s.grade}</Badge>}
                  {s.class_period && <Badge variant="outline">Period {s.class_period}</Badge>}
                </div>
              </div>
              <Button size="sm" onClick={() => view(s)}>View</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}