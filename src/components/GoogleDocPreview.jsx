import React from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { usePhaseBookHtml } from "@/lib/entityQueries";

function isGoogle(url) {
  return /(?:docs|drive)\.google\.com/.test(url || "");
}

// Drive "file/d" share links are the HTML phase books — we render those
// natively. Google Docs/Slides/Sheets get an in-app Google embed.
function driveHtmlId(url) {
  const m = (url || "").match(/\/file\/d\/([^/?#]+)/);
  return m ? m[1] : null;
}

function googleEmbedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    let m;
    if (host.includes("docs.google.com")) {
      if ((m = u.pathname.match(/\/document\/d\/([^/]+)/)))
        return `https://docs.google.com/document/d/${m[1]}/preview`;
      if ((m = u.pathname.match(/\/presentation\/d\/([^/]+)/)))
        return `https://docs.google.com/presentation/d/${m[1]}/embed`;
      if ((m = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/)))
        return `https://docs.google.com/spreadsheets/d/${m[1]}/pubhtml`;
    }
    if (host.includes("drive.google.com") && (m = u.pathname.match(/\/file\/d\/([^/]+)/))) {
      return `https://drive.google.com/file/d/${m[1]}/preview`;
    }
    return url;
  } catch {
    return url;
  }
}

const isHtmlDoc = (s) =>
  typeof s === "string" && /^\s*<(?:!doctype|html|head|body)/i.test(s.trim());

// Phase books are one doc per phase (overview + lesson1..lessonN). When a
// sectionId is requested, lift just that <article> out so each lesson renders
// on its own instead of the whole phase book at once.
function extractSection(html, sectionId) {
  if (!sectionId || !html) return null;
  const idAttr = `id="${sectionId}"`;
  const idStart = html.indexOf(idAttr);
  if (idStart === -1) return null;
  const tagStart = html.lastIndexOf("<article", idStart);
  const closeIdx = html.indexOf("</article>", idStart);
  if (tagStart === -1 || closeIdx === -1) return null;
  const articleHtml = html.slice(tagStart, closeIdx + "</article>".length);
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  const css = styleMatch ? styleMatch[1] : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div class="wrap" style="max-width:820px;margin:0 auto;padding:0 24px 64px">${articleHtml}</div></body></html>`;
}

export default function GoogleDocPreview({
  url,
  title,
  height = "80vh",
  showOriginal = true,
  className = "",
  sectionId,
}) {
  const google = isGoogle(url);
  const fileId = url && google ? driveHtmlId(url) : null;
  const { data: html, isLoading } = usePhaseBookHtml(fileId);

  if (!url) return null;

  if (!google) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center gap-2 text-sm font-mono text-[#22D3EE] hover:underline ${className}`}
      >
        <ExternalLink className="w-4 h-4" /> Open attached file
      </a>
    );
  }

  // Native render of the HTML phase book — a clean document, not source code.
  // When a sectionId is given, show only that lesson's <article>.
  const sectionHtml = extractSection(html, sectionId);
  if (isHtmlDoc(html)) {
    return (
      <div className={className}>
        <iframe
          key={sectionId ? `${fileId}:${sectionId}` : fileId}
          srcDoc={sectionHtml || html}
          title={title}
          className="w-full bg-white border-0 rounded-xl"
          style={{ height }}
          sandbox="allow-same-origin allow-popups"
        />
        {showOriginal && (
          <div className="px-2 py-2 border-t border-stone-200/60">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-[#22D3EE] hover:underline"
            >
              open_original() →
            </a>
          </div>
        )}
      </div>
    );
  }

  // Google Docs/Slides/Sheets (or a Drive file that isn't HTML): in-app embed.
  const src = googleEmbedUrl(url);
  return (
    <div className={className}>
      <div className="relative bg-white rounded-xl overflow-hidden border border-stone-200/40">
        {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ height }}
          >
            <Loader2 className="w-6 h-6 animate-spin text-[#22D3EE]" />
          </div>
        )}
        <iframe
          key={src}
          src={src}
          title={title}
          className="w-full bg-white border-0"
          style={{ height }}
          allow="autoplay"
        />
      </div>
      {showOriginal && (
        <div className="px-2 py-2 border-t border-stone-200/60">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-[#22D3EE] hover:underline"
          >
            open_original() →
          </a>
        </div>
      )}
    </div>
  );
}