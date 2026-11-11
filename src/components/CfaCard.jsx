import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, BookOpen, ClipboardList } from "lucide-react";
import ReactMarkdown from "react-markdown";
import CfaForm from "@/components/CfaForm";
import CfaEditor from "@/components/CfaEditor";

// One CFA card. Students always see the study guide; the CFA questions are
// hidden until the teacher releases (published). Teachers see the full editor.
export default function CfaCard({ cfa, isAdmin, onChanged }) {
  const hasGuide = !!cfa.study_guide?.trim();
  const hasQuestions = (() => {
    try {
      const o = JSON.parse(cfa.questions_json || "[]");
      return Array.isArray(o) && o.length > 0;
    } catch {
      return false;
    }
  })();

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="font-mono text-base flex items-center gap-2 flex-wrap">
          <ClipboardList className="w-4 h-4 text-[#22D3EE]" />
          {cfa.title}
          {isAdmin && (
            <Badge variant={cfa.published ? "default" : "secondary"} className="ml-1">
              {cfa.published ? "released" : "draft"}
            </Badge>
          )}
          {!isAdmin && !cfa.published && hasQuestions && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 gap-1">
              <Lock className="w-3 h-3" /> Not released yet
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Study guide — always visible */}
        <div>
          <h4 className="font-mono text-xs text-stone-500 mb-2 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> study guide
          </h4>
          {hasGuide ? (
            <div className="prose prose-invert max-w-none text-sm text-foreground/90 [&_h1]:text-foreground [&_h2]:text-foreground [&_strong]:text-foreground [&_li]:text-foreground/80 [&_p]:text-foreground/80">
              <ReactMarkdown>{cfa.study_guide}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              {isAdmin
                ? "No study guide yet — click AI generate to create one."
                : "The study guide for this CFA hasn't been posted yet."}
            </p>
          )}
        </div>

        {/* CFA / editor */}
        <div>
          <h4 className="font-mono text-xs text-stone-500 mb-2 flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" /> CFA
          </h4>
          {isAdmin ? (
            <CfaEditor cfa={cfa} onChanged={onChanged} />
          ) : cfa.published && hasQuestions ? (
            <CfaForm cfa={cfa} />
          ) : (
            <div className="rounded-lg border border-amber-300/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-300 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {cfa.published
                ? "This CFA has no questions yet."
                : "Your teacher hasn't released this CFA yet."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}