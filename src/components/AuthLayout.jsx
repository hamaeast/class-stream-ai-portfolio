import React from "react";
import CircuitBackground from "@/components/CircuitBackground";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <CircuitBackground />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4 shadow-[0_0_24px_-6px_hsl(187_100%_50%/0.6)]">
            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#22D3EE] via-[#FF2BD6] to-[#39FF14] bg-clip-text text-transparent">
              {title}
            </span>
          </h1>
          {subtitle && <p className="text-muted-foreground mt-2 font-mono text-sm">{subtitle}</p>}
        </div>
        <div className="bg-card/90 backdrop-blur rounded-2xl shadow-lg border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}