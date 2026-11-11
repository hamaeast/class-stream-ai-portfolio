import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Timer, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Prompts students to open today's Do Now as soon as they log in. It shows
// whenever today's Do Now is scheduled, active, and unsubmitted — even before
// the class-period window opens (status "upcoming") — so it's the first thing
// they see. The teacher's Active toggle is the off switch (server-side filter).
// Pulls only student-safe fields (no answer / explanation).
export default function DoNowBanner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    base44.functions
      .invoke("getTodaysDoNow", {})
      .then((res) => alive && setData(res.data))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading || !data?.scheduled || data.completed) {
    return null;
  }

  const status = data.status || "open";
  if (status === "locked") {
    return null;
  }
  const upcoming = status === "upcoming";

  const headline = upcoming
    ? data.scheduled_start_time
      ? `Today's Do Now opens at ${data.scheduled_start_time}`
      : "Today's Do Now is coming up"
    : "Today's Do Now is open";
  const sub = data.phase
    ? `${data.phase} · ${data.lesson_topic || "Complete it when class starts."}`
    : data.lesson_topic || (upcoming ? "It will open automatically at the start of class." : "Complete it before class ends.");

  return (
    <Link to="/do-now" className="block mb-6">
      <Card className="border-primary/50 bg-primary/10 hover:bg-primary/15 transition-colors">
        <CardContent className="py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Timer className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-foreground">
              {headline}
            </p>
            <p className="text-sm text-stone-300 truncate">
              {sub}
            </p>
          </div>
          <span className="text-primary text-sm font-medium inline-flex items-center shrink-0">
            {upcoming ? "Preview" : "Open"} <ArrowRight className="w-4 h-4 ml-1" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}