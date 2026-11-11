import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { format, parseISO } from "date-fns";

const isVisibleFor = (user, m) => {
  if (m.deleted_at) return false;
  if (m.target_type === "all") return true;
  if (m.target_type === "individual") return m.target_user_id === user.id;
  if (m.target_type === "block") {
    const periods = String(m.target_periods || "").split(",").map((p) => p.trim()).filter(Boolean);
    return !!user.class_period && periods.includes(user.class_period);
  }
  return false;
};

export default function StudentMessages({ user }) {
  const [messages, setMessages] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [open, setOpen] = useState(false);
  const storageKey = `msg_dismissed_${user.id}`;

  const reload = async () => {
    try {
      const all = await base44.entities.Message.list("-created_date");
      setMessages(all || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    reload();
    try {
      setDismissed(new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")));
    } catch (e) {}
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
  const pendingToasts = useMemo(() => visible.filter((m) => !dismissed.has(m.id)), [visible, dismissed]);

  const dismiss = (id) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch (e) {}
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 md:bottom-6 z-40 inline-flex items-center gap-2 rounded-full bg-primary text-white shadow-lg px-4 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <MessageSquare className="w-4 h-4" />
        Messages
        {pendingToasts.length > 0 && (
          <span className="ml-1 min-w-5 h-5 inline-flex items-center justify-center rounded-full bg-destructive text-white text-[11px] px-1.5">
            {pendingToasts.length}
          </span>
        )}
      </button>

      <div className="fixed top-3 right-3 z-50 w-[calc(100%-1.5rem)] sm:w-80 space-y-2">
        {pendingToasts.map((m) => (
          <div key={m.id} className="rounded-lg border border-stone-200 bg-card shadow-lg p-3">
            <p className="text-xs text-stone-500">
              {m.created_date ? format(parseISO(m.created_date), "MMM d, h:mm a") : "New message"}
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap mt-1">{m.body}</p>
            <Button
              size="sm"
              className="mt-2 w-full bg-primary hover:bg-primary/90 text-xs"
              onClick={() => dismiss(m.id)}
            >
              Dismiss
            </Button>
          </div>
        ))}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Messages</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 overflow-y-auto pb-6">
            {visible.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-8">No messages.</p>
            ) : (
              visible.map((m) => (
                <div key={m.id} className="rounded-lg border border-stone-200 bg-card p-3">
                  <p className="text-xs text-stone-500 mb-1">
                    {m.created_date ? format(parseISO(m.created_date), "MMM d, yyyy · h:mm a") : ""}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{m.body}</p>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}