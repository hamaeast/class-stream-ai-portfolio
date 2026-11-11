import React from "react";
import { Link } from "react-router-dom";
import { Code2, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";

// A standalone assignment (no lesson_id) placed between two phases via
// `phase_after`. Rendered in the module tree as its own item, linking to the
// standard assignment detail/submission page.
export default function StandaloneAssignmentRow({ assignment }) {
  const due = assignment.due_date
    ? format(parseISO(assignment.due_date), "MMM d")
    : null;
  return (
    <Link
      to={`/assignments/${assignment.id}`}
      className="group flex items-center gap-3 rounded-lg border border-[#FF2BD6]/30 bg-[#FF2BD6]/5 px-3 py-2.5 hover:bg-[#FF2BD6]/10 transition-colors"
    >
      <Code2 className="w-4 h-4 shrink-0 text-[#FF2BD6]" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-semibold text-foreground truncate group-hover:text-[#22D3EE]">
          {assignment.title}
        </p>
        {assignment.description && (
          <p className="text-xs text-stone-500 truncate">
            {assignment.description}
          </p>
        )}
      </div>
      {due && (
        <span className="inline-flex items-center gap-1 text-xs text-stone-400 shrink-0">
          <Calendar className="w-3 h-3" /> Due {due}
        </span>
      )}
      <span className="inline-flex items-center rounded-full border border-[#FF2BD6]/40 bg-[#FF2BD6]/10 text-[#FF2BD6] text-[10px] font-mono px-2 py-0.5 shrink-0">
        {assignment.points ? `${assignment.points} pts` : "assignment"}
      </span>
    </Link>
  );
}