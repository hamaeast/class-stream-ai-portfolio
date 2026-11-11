import React from "react";
import { motion } from "framer-motion";

const GLYPHS = ["</>", "{ }", "[ ]", "0x", "=>", ";", "++", "fn", "#!", "//"];

export default function CodeHeader({ title, subtitle, chip, tags }) {
  return (
    <header className="relative mb-8 overflow-hidden rounded-2xl border border-stone-200/60 bg-card p-6 sm:p-8">
      <div className="pointer-events-none absolute -top-20 -left-10 w-60 h-60 rounded-full blur-3xl opacity-30 bg-primary" />
      <div className="pointer-events-none absolute -bottom-24 right-0 w-60 h-60 rounded-full blur-3xl opacity-25 bg-[#FF2BD6]" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {GLYPHS.map((g, i) => (
          <motion.span
            key={i}
            className="absolute font-mono text-sm font-semibold text-[#22D3EE]/50"
            style={{ left: `${(i * 42) % 90}%`, top: `${(i * 61) % 70}%` }}
            animate={{ y: [0, -10, 0], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 4 + (i % 3), repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
          >{g}</motion.span>
        ))}
      </div>
      <div className="relative z-10">
        {chip && (
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 mb-4 text-xs font-mono text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
            {chip}
          </div>
        )}
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-[#22D3EE] via-[#FF2BD6] to-[#39FF14] bg-clip-text text-transparent">
            {"< "}{title}{" />"}
          </span>
        </h1>
        {subtitle && (
          <p className="text-stone-400 mt-2 font-mono text-sm">
            <span className="text-[#39FF14]">$/</span> {subtitle}
          </p>
        )}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5 font-mono text-xs">
            {tags.map((t, i) => {
              const cls = t.color || "text-[#22D3EE] border-[#22D3EE]/30 bg-[#22D3EE]/10";
              return (
                <span key={i} className={`px-2 py-1 rounded border ${cls}`}>{t.label}</span>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}