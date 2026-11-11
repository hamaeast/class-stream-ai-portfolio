import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Plus, ClipboardList } from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import CfaCard from "@/components/CfaCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePreview } from "@/lib/PreviewContext";

export default function CFAs() {
  const { previewStudent } = usePreview();
  const [me, setMe] = useState(null);
  const [cfas, setCfas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const list = await base44.entities.CFA.list("phase_start");
    setCfas(list || []);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      let v = previewStudent;
      if (!v) {
        try {
          v = await base44.auth.me();
        } catch {}
      }
      if (!active) return;
      setMe(v);
      try {
        await load();
      } catch {}
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [previewStudent?.id]);

  const isAdmin = !previewStudent && me?.role === "admin";

  const createCfa = async () => {
    const s = Number(newStart);
    const e = Number(newEnd);
    if (!s || !e || e < s) return;
    setCreating(true);
    try {
      await base44.entities.CFA.create({
        title: `CFA: Phase ${s}-${e}`,
        phase_start: s,
        phase_end: e,
        study_guide: "",
        questions_json: "[]",
        published: false,
      });
      setNewStart("");
      setNewEnd("");
      await load();
    } finally {
      setCreating(false);
    }
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
        chip="cfa.list()"
        title="Common Formative Assessments"
        subtitle="One CFA per 3-phase block — study guides are always open; the CFA opens when your teacher releases it."
        tags={[
          { label: "study guide", color: "text-[#39FF14] border-[#39FF14]/30 bg-[#39FF14]/10" },
          { label: "auto-graded", color: "text-[#22D3EE] border-[#22D3EE]/30 bg-[#22D3EE]/10" },
        ]}
      />

      {isAdmin && (
        <div className="mb-6 rounded-xl border border-stone-200/20 bg-card p-4">
          <Label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <Plus className="w-4 h-4 text-[#22D3EE]" /> New CFA
          </Label>
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <span className="text-xs text-stone-500 mr-1">Phase from</span>
              <Input
                type="number"
                min={1}
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-24 bg-input border-stone-200/50"
                placeholder="1"
              />
            </div>
            <div>
              <span className="text-xs text-stone-500 mr-1">to</span>
              <Input
                type="number"
                min={1}
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="w-24 bg-input border-stone-200/50"
                placeholder="3"
              />
            </div>
            <Button onClick={createCfa} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create CFA
            </Button>
            <span className="text-xs text-stone-500 ml-2">
              Creates an empty draft — then click "AI generate" inside the card.
            </span>
          </div>
        </div>
      )}

      {cfas.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {isAdmin
              ? "No CFAs yet. Create one above to get started."
              : "No CFAs posted yet."}
          </p>
        </div>
      ) : (
        cfas.map((cfa) => (
          <CfaCard
            key={cfa.id}
            cfa={cfa}
            isAdmin={isAdmin}
            onChanged={load}
          />
        ))
      )}
    </div>
  );
}