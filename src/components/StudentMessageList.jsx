import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { format, parseISO, isSameDay } from "date-fns";
import CodeHeader from "@/components/CodeHeader";

const isVisibleFor = (user, m) => {
  if (m.deleted_at) return false;
  if (m.target_type === "all") return true;
  if (m.target_type === "individual") return m.target_user_id === user.id;
  if (m.target_type === "block") {
    const periods = String(m.target_periods || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return !!user.class_period && periods.includes(user.class_period);
  }
  return false;
};

const groupByDay = (items) => {
  const groups = {};
  for (const m of items) {
    const key = m.created_date ? format(parseISO(m.created_date), "yyyy-MM-dd") : "unknown";
    (groups[key] = groups[key] || []).push(m);
  }
  return Object.keys(groups).sort((a, b) => (a < b ? 1 : -1)).map((k) => ({ key: k, items: groups[k] }));
};

export default function StudentMessageList({ user }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const all = await base44.entities.Message.list("-created_date");
      setMessages(all || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create") setMessages((p) => [event.data, ...p]);
      else if (event.type === "update") setMessages((p) => p.map((m) => (m.id === event.data.id ? event.data : m)));
      else if (event.type === "delete") setMessages((p) => p.filter((m) => m.id !== event.id));
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const visible = useMemo(() => messages.filter((m) => isVisibleFor(user, m)), [messages, user]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  const dayLabel = (key) => {
    try {
      const d = parseISO(key);
      if (isSameDay(d, new Date())) return "Today";
      return format(d, "EEEE, MMM d, yyyy");
    } catch (e) {
      return key === "unknown" ? "Messages" : key;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <CodeHeader chip="messages.inbox()" title="Messages" subtitle="Messages your teacher has sent you, newest first." />
      {groups.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-16">No messages yet.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur py-2 mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">{dayLabel(g.key)}</h2>
              </div>
              <div className="space-y-3">
                {g.items.map((m) => (
                  <div key={m.id} className="rounded-lg border border-stone-200/60 bg-card p-4 hover:border-primary/60 hover:shadow-[0_0_24px_-6px_hsl(187_100%_50%/0.45)] transition-all duration-200">
                    <p className="text-xs text-[#22D3EE] mb-1 font-mono">
                      {m.created_date ? format(parseISO(m.created_date), "h:mm a") : ""}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}