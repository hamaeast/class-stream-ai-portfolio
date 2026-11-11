import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePhaseBookHtml } from "@/lib/entityQueries";

// Appends a tiny height-reporter so the iframe sizes to its own content (no inner
// scrollbar) and re-measures when a dropdown box opens/closes — keeping the
// lesson plan's own interactively-authored collapsibles working exactly as on
// the source site.
function withAutoHeight(html, id) {
  if (!html) return html;
  const s = `<script>(function(){function h(){parent.postMessage({lpId:"${id}",h:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)},"*");}window.addEventListener("load",h);window.addEventListener("resize",h);document.addEventListener("click",function(){setTimeout(h,0);setTimeout(h,120);setTimeout(h,320);setTimeout(h,650);});})();</script>`;
  return html.includes("</body>") ? html.replace("</body>", s + "</body>") : html + s;
}

export default function LessonPlanDoc({ fileId, title }) {
  const { data: html, isLoading } = usePhaseBookHtml(fileId);
  const [height, setHeight] = useState(620);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data && e.data.lpId === fileId && e.data.h) setHeight(e.data.h);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [fileId]);

  if (isLoading || !html) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <iframe
      title={`Lesson Plan — ${title || ""}`}
      srcDoc={withAutoHeight(html, fileId)}
      className="w-full block bg-white"
      style={{ height: Math.max(height, 300) }}
    />
  );
}