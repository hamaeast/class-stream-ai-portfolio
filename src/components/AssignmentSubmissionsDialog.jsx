import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  FileText,
  Link as LinkIcon,
  Paperclip,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : "—";

const IMG_RE = /\.(png|jpe?g|gif|webp)$/i;

export default function AssignmentSubmissionsDialog({
  open,
  assignment,
  students,
  subIndex,
  onOpenChange,
}) {
  const [openId, setOpenId] = useState(null);
  if (!assignment) return null;

  const isLinkEmbed = assignment.submission_type === "link_embed";

  // Sort the selected class the same way the gradebook does: period then last name.
  const sorted = [...(students || [])].sort((a, b) => {
    const pa = String(a.class_period ?? "");
    const pb = String(b.class_period ?? "");
    if (pa !== pb) {
      if (!pa) return 1;
      if (!pb) return -1;
      return pa.localeCompare(pb, undefined, { numeric: true });
    }
    const la = (a.full_name || "").trim().split(/\s+/).pop().toLowerCase();
    const lb = (b.full_name || "").trim().split(/\s+/).pop().toLowerCase();
    return la.localeCompare(lb);
  });

  const submittedCount = sorted.filter(
    (s) => subIndex.get(`${s.id}|${assignment.id}`)
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#FF2BD6]" />
            {assignment.title}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {sorted.length} students · {submittedCount} submitted
            {assignment.points ? ` · ${assignment.points} pts` : ""}
            {assignment.due_date ? ` · due ${assignment.due_date}` : ""}
            {isLinkEmbed ? " · link/embed submission" : " · text + file submission"}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto -mx-1 px-1 space-y-1.5">
          {sorted.map((s) => {
            const sub = subIndex.get(`${s.id}|${assignment.id}`);
            const isOpen = openId === s.id;
            return (
              <div
                key={s.id}
                className="rounded-lg border border-stone-200/15 bg-card overflow-hidden"
              >
                <button
                  onClick={() => setOpenId(isOpen ? null : s.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-stone-400 transition-transform shrink-0",
                      isOpen && "rotate-180"
                    )}
                  />
                  <span className="font-medium text-foreground flex-1 truncate">
                    {s.full_name}
                  </span>
                  <span className="text-xs text-stone-500 font-mono shrink-0">
                    Per {s.class_period || "—"}
                  </span>
                  {sub ? (
                    <Badge className="bg-[#39FF14]/15 text-[#bff9bf] border-[#39FF14]/40 font-mono shrink-0">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Submitted
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-stone-500 border-stone-500/40 font-mono shrink-0"
                    >
                      Not Submitted
                    </Badge>
                  )}
                </button>

                {isOpen && sub && (
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-stone-200/10">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-stone-400">
                      <span>Turned in {fmt(sub.created_date)}</span>
                      {sub.status && (
                        <Badge variant="secondary" className="font-mono">
                          {sub.status}
                        </Badge>
                      )}
                      {sub.grade && (
                        <Badge className="bg-[#FF2BD6]/15 text-[#FF2BD6] border-[#FF2BD6]/40 font-mono">
                          Grade: {sub.grade}
                        </Badge>
                      )}
                    </div>

                    {isLinkEmbed ? (
                      <>
                        {sub.file_url && (
                          <div>
                            <p className="text-xs font-mono text-stone-400 mb-1 flex items-center gap-1">
                              <LinkIcon className="w-3 h-3" /> Program link
                            </p>
                            <a
                              href={sub.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-[#22D3EE] hover:underline break-all"
                            >
                              {sub.file_url}
                            </a>
                          </div>
                        )}
                        {sub.submission_text &&
                          sub.submission_text.includes("<") && (
                            <div>
                              <p className="text-xs font-mono text-stone-400 mb-1">
                                Embed preview
                              </p>
                              <div className="rounded-lg border border-stone-200/20 overflow-hidden bg-background">
                                <div
                                  className="p-3"
                                  dangerouslySetInnerHTML={{
                                    __html: sub.submission_text,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        {sub.submission_text &&
                          !sub.submission_text.includes("<") && (
                            <div>
                              <p className="text-xs font-mono text-stone-400 mb-1">
                                Submission
                              </p>
                              <p className="text-sm text-foreground whitespace-pre-wrap">
                                {sub.submission_text}
                              </p>
                            </div>
                          )}
                      </>
                    ) : (
                      <>
                        {sub.submission_text && (
                          <div>
                            <p className="text-xs font-mono text-stone-400 mb-1">
                              Answer
                            </p>
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {sub.submission_text}
                            </p>
                          </div>
                        )}
                        {sub.file_url && (
                          <div>
                            <p className="text-xs font-mono text-stone-400 mb-1 flex items-center gap-1">
                              <Paperclip className="w-3 h-3" /> Uploaded file
                            </p>
                            <a
                              href={sub.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-[#22D3EE] hover:underline break-all"
                            >
                              {sub.file_url}
                            </a>
                            {IMG_RE.test(sub.file_url) && (
                              <img
                                src={sub.file_url}
                                alt="submission"
                                className="mt-2 rounded-lg max-h-72"
                              />
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {sub.feedback && (
                      <div>
                        <p className="text-xs font-mono text-stone-400 mb-1">
                          Feedback
                        </p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {sub.feedback}
                        </p>
                      </div>
                    )}
                    {!sub.submission_text && !sub.file_url && (
                      <p className="text-sm text-stone-500 italic">
                        No content attached.
                      </p>
                    )}
                  </div>
                )}

                {isOpen && !sub && (
                  <div className="px-4 pb-4 pt-2 border-t border-stone-200/10">
                    <p className="text-sm text-stone-500 italic">Not Submitted</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to gradebook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}