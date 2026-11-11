import React from "react";
import { motion } from "framer-motion";

// Subtle, fixed circuit-board overlay rendered behind every page. Low opacity
// + pointer-events-none so it never hurts readability or interaction.
const PULSES = [
  { x: 100, y: 220, dx: 520, dy: 0, dur: 7, color: "hsl(187 100% 50%)" },
  { x: 520, y: 220, dx: 0, dy: 360, dur: 6, color: "hsl(160 100% 48%)" },
  { x: 180, y: 700, dx: 600, dy: -120, dur: 9, color: "hsl(320 100% 62%)" },
  { x: 820, y: 120, dx: -300, dy: 460, dur: 8, color: "hsl(187 100% 50%)" },
];

export default function CircuitBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-[0.16] print:hidden">
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1000 1000"
        aria-hidden="true"
      >
        <defs>
          <pattern id="circuit-tile" width="140" height="140" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="hsl(187 100% 50%)" strokeWidth="1">
              <path d="M0 36 H46 V84 H140" />
              <path d="M0 104 H92 V48 H140" />
              <path d="M36 0 V36 M92 0 V104 M46 140 V84 M112 140 V48" />
            </g>
            <g fill="none" stroke="hsl(160 100% 48%)" strokeWidth="1">
              <path d="M140 24 H104 V70 H0" />
              <path d="M70 0 V24" />
            </g>
            <g fill="hsl(187 100% 50%)">
              <circle cx="46" cy="36" r="2.6" />
              <circle cx="92" cy="48" r="2.6" />
              <circle cx="104" cy="70" r="2.6" />
              <circle cx="46" cy="84" r="2.6" />
              <circle cx="112" cy="48" r="2.6" />
              <circle cx="92" cy="104" r="2.6" />
            </g>
            <g fill="none" stroke="hsl(320 100% 62%)" strokeWidth="1">
              <rect x="58" y="58" width="28" height="16" rx="2" />
              <path d="M62 58 V53 M69 58 V53 M76 58 V53 M83 58 V53 M62 74 V79 M69 74 V79 M76 74 V79 M83 74 V79" />
            </g>
          </pattern>
        </defs>
        <rect width="1000" height="1000" fill="url(#circuit-tile)" />
      </svg>
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 1000 1000"
        aria-hidden="true"
      >
        {PULSES.map((p, i) => (
          <motion.circle
            key={i}
            r="3.2"
            fill={p.color}
            initial={{ cx: p.x, cy: p.y }}
            animate={{ cx: [p.x, p.x + p.dx, p.x], cy: [p.y, p.y + p.dy, p.y] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 0 4px currentColor)" }}
          />
        ))}
      </svg>
    </div>
  );
}