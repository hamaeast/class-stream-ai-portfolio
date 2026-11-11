import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NEON_CARD } from "@/lib/neon-styles";

function unescape(s) {
  return s
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/'/g, "'")
    .replace(/&/g, "&");
}

// Parse one line like "Question? a) x b) y c) z d) w" into parts.
function parseLine(line) {
  const m = line.match(
    /^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/
  );
  if (m) {
    return {
      q: m[1],
      options: [m[2], m[3], m[4], m[5]],
      letters: ["a", "b", "c", "d"],
    };
  }
  return { q: line, options: null, letters: null };
}

export default function QuizViewer({ description }) {
  const lines = description
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(unescape);
  if (!lines.length) return null;

  const title = lines[0];
  const questions = lines.slice(1).map(parseLine);

  return (
    <Card className={`mb-6 ${NEON_CARD}`}>
      <CardHeader className="pb-3">
        <CardTitle className="font-mono text-base text-[#22D3EE]">
          {"// "}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.map((item, i) =>
          item.options ? (
            <div
              key={i}
              className="rounded-lg border border-stone-200/20 bg-stone-200/5 p-4"
            >
              <p className="text-sm text-foreground mb-3 leading-relaxed">
                <span className="text-stone-500 font-mono mr-1.5">{i + 1}.</span>
                {item.q}
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {item.options.map((opt, j) => (
                  <div
                    key={j}
                    className="flex items-start gap-2 text-sm text-foreground rounded border border-stone-200/10 bg-stone-100/5 px-2.5 py-1.5"
                  >
                    <span className="font-mono text-[#FDE047] font-semibold shrink-0">
                      {item.letters[j]})
                    </span>
                    <span>{opt}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p key={i} className="text-sm text-stone-400 font-mono">
              {item.q}
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}