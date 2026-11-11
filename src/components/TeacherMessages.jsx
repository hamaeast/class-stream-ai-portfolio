import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, Send } from "lucide-react";
import { format, parseISO } from "date-fns";

const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const ordinal = (n) => {
  const num = Number(n);
  const s = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function TeacherMessages({ students, messages, onRefresh }) {
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [studentId, setStudentId] = useState("");
  const [periods, setPeriods] = useState([]);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const togglePeriod = (p) =>
    setPeriods((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const canSend =
    body.trim() &&
    (targetType === "all" ||
      (targetType === "individual" && studentId) ||
      (targetType === "block" && periods.length > 0));

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await base44.entities.Message.create({
        body: body.trim(),
        target_type: targetType,
        target_user_id: targetType === "individual" ? studentId : "",
        target_periods: targetType === "block" ? periods.join(",") : "",
      });
      setBody("");
      setStudentId("");
      setPeriods([]);
      onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this message? It will be removed from students and stamped with today's date.")) return;
    setDeletingId(id);
    try {
      await base44.entities.Message.update(id, { deleted_at: new Date().toISOString() });
      onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  const targetLabel = (m) => {
    if (m.target_type === "all") return "All students";
    if (m.target_type === "individual") {
      const s = students.find((u) => u.id === m.target_user_id);
      return s?.full_name || s?.email || "Individual";
    }
    if (m.target_type === "block") {
      const ps = String(m.target_periods || "").split(",").filter(Boolean);
      return `Periods ${ps.join(", ")}`;
    }
    return "";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-foreground mb-3">New message</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {["all", "block", "individual"].map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={targetType === t ? "default" : "outline"}
                  onClick={() => setTargetType(t)}
                >
                  {t === "all" ? "All" : t === "block" ? "Period(s)" : "Individual"}
                </Button>
              ))}
            </div>
            {targetType === "individual" && (
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {targetType === "block" && (
              <div className="flex flex-wrap gap-2">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePeriod(p)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      periods.includes(p)
                        ? "bg-primary text-white border-primary"
                        : "bg-card text-stone-600 border-stone-200 hover:border-stone-300"
                    }`}
                  >
                    {ordinal(p)} Period
                  </button>
                ))}
              </div>
            )}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message…"
              rows={3}
            />
            <Button onClick={send} disabled={!canSend || sending} className="bg-primary hover:bg-primary/90">
              {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="font-semibold text-foreground mb-3">Sent messages</h3>
        {messages.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-stone-400">No messages yet.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <Card key={m.id} className={m.deleted_at ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="secondary" className="text-stone-600">
                          {targetLabel(m)}
                        </Badge>
                        <span className="text-xs text-stone-400">
                          {m.created_date ? format(parseISO(m.created_date), "MMM d, yyyy · h:mm a") : ""}
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{m.body}</p>
                      {m.deleted_at && (
                        <p className="text-xs text-red-500 mt-1">
                          Deleted {format(parseISO(m.deleted_at), "MMM d, yyyy · h:mm a")}
                        </p>
                      )}
                    </div>
                    {!m.deleted_at && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === m.id}
                        onClick={() => remove(m.id)}
                      >
                        {deletingId === m.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-red-500" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}