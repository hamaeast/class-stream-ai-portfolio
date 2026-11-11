import React, { useState } from "react";
import { ExternalLink, Columns2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import GoogleDocPreview from "@/components/GoogleDocPreview";
import NotesBlanks from "@/components/NotesBlanks";
import { parseLesson } from "@/lib/lessonPhases";

// Which phase-book article a lesson maps to, for the split-screen lesson pane.
function lessonSectionId(lesson) {
  const p = parseLesson(lesson);
  if (!p) return null;
  return p.isOverview ? "overview" : `lesson${p.num}`;
}

// Notes area shown on the lesson page's "notes" part. Everyone can pop the
// matching lesson open in a separate tab; admins additionally get a
// split-screen toggle that lays the lesson document beside the worksheet.
export default function NotesView({ lesson, isAdmin }) {
  const [split, setSplit] = useState(true);

  const url = lesson.file_url;
  const sectionId = lessonSectionId(lesson);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <a
          href={`/lessons/${lesson.id}?part=lesson`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-200/30 px-3 py-1.5 text-xs font-mono text-stone-300 hover:text-[#22D3EE] hover:border-[#22D3EE]/40"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open lesson in new tab
        </a>
        <div className="inline-flex rounded-md border border-stone-200/20 overflow-hidden">
          <Button
            size="sm"
            variant={split ? "default" : "ghost"}
            onClick={() => setSplit(true)}
            className="rounded-none"
          >
            <Columns2 className="w-3.5 h-3.5 mr-1" /> Split
          </Button>
          <Button
            size="sm"
            variant={!split ? "default" : "ghost"}
            onClick={() => setSplit(false)}
            className="rounded-none border-l border-stone-200/20"
          >
            <FileText className="w-3.5 h-3.5 mr-1" /> Notes
          </Button>
        </div>
      </div>

      {split ? (
        <div className="grid lg:grid-cols-2 gap-4 items-stretch">
          <Card className="overflow-hidden min-h-[80vh] h-[80vh]">
            <CardContent className="p-0 h-full">
              {url ? (
                <GoogleDocPreview
                  url={url}
                  title={lesson.title}
                  sectionId={sectionId}
                  height="80vh"
                  showOriginal
                />
              ) : lesson.content ? (
                <div
                  className="p-6 prose prose-stone max-w-none [&_a]:text-[#22D3EE]"
                  dangerouslySetInnerHTML={{ __html: lesson.content }}
                />
              ) : (
                <div className="p-6 text-sm text-stone-400">
                  No lesson document is linked to show alongside the notes.
                </div>
              )}
            </CardContent>
          </Card>
          <div className="min-w-0 h-[80vh] overflow-y-auto pr-1">
            <NotesBlanks lesson={lesson} />
          </div>
        </div>
      ) : (
        <NotesBlanks lesson={lesson} />
      )}
    </div>
  );
}