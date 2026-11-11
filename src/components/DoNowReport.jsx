import React, { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, CheckCircle2, XCircle, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ownerOf } from "@/lib/ownership";

export default function DoNowReport({ open, doNow, responses, users, onClose }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");
  const dn = doNow;
  const rows = useMemo(() => {
    if (!dn) return [];
    const nameFor = (id) =>
      users.find((u) => u.id === id)?.full_name ||
      users.find((u) => u.id === id)?.email ||
      (id ? id.slice(-6) : "—");
    return responses
      .filter((r) => r.do_now_id === dn.do_now_id)
      .map((r) => ({ ...r, student: nameFor(ownerOf(r)) }))
      .sort((a, b) => (a.student || "").localeCompare(b.student || ""));
  }, [dn, responses, users]);

  const turnedIn = rows.filter((r) => !!r.completed_at);
  const avgScore = useMemo(() => {
    if (!turnedIn.length) return 0;
    const sc = turnedIn.reduce((s, r) => s + (r.score || 0), 0);
    const ps = turnedIn.reduce((s, r) => s + (r.points_possible || dn?.points_possible || 1), 0);
    return ps ? Math.round((sc / ps) * 100) : 0;
  }, [turnedIn, dn]);

  async function reopen(resp) {
    setBusy(resp.id);
    try {
      await base44.entities.DoNowResponse.update(resp.id, { reopened: true });
      qc.invalidateQueries({ queryKey: ["doNowResponses", "all"] });
    } finally {
      setBusy("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-stone-200/20">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Do Now report · {dn?.do_now_id}
          </DialogTitle>
          <p className="text-sm text-stone-400">{dn?.question}</p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 my-4">
          <Stat label="Turned in" value={`${turnedIn.length}`} />
          <Stat label="Avg score" value={`${avgScore}%`} />
          <Stat label="Points" value={`${dn?.points_possible ?? 1}`} />
        </div>

        <div className="rounded-lg border border-stone-200/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-stone-400">
              <tr>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Answer</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-stone-500">No attempts yet.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-stone-200/10">
                  <td className="px-3 py-2 text-foreground">{r.student}</td>
                  <td className="px-3 py-2">
                    {r.answer ? (
                      <span className="inline-flex items-center gap-1.5">
                        {r.is_correct
                          ? <CheckCircle2 className="w-4 h-4 text-[#39FF14]" />
                          : <XCircle className="w-4 h-4 text-destructive" />}
                        {r.answer}
                      </span>
                    ) : (
                      <span className="text-stone-500 inline-flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" /> no answer
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {r.score} / {r.points_possible ?? dn?.points_possible ?? 1}
                    {r.reopened && <Badge variant="secondary" className="ml-2 text-[10px]">reopened</Badge>}
                  </td>
                  <td className="px-3 py-2 text-stone-400">
                    {r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.completed_at && !r.reopened && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.id}
                        onClick={() => reopen(r)}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-4">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-stone-200/20 bg-card px-4 py-3">
      <p className="text-xs text-stone-400">{label}</p>
      <p className="font-display text-2xl font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  );
}