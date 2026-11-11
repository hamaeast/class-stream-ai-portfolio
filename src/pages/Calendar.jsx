import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import CodeHeader from "@/components/CodeHeader";
import { Image } from "@/components/ui/image";
import { SCHOOL_CALENDAR_IMAGE_URL, DISTRICT_SHORT_NAME, SCHOOL_YEAR_LABEL } from "@/lib/schoolConfig";

// Public copy: set VITE_SCHOOL_CALENDAR_IMAGE_URL to your school calendar image.
const CALENDAR_IMG = SCHOOL_CALENDAR_IMAGE_URL;

// Fallback aspect (a portrait-ish calendar) so the image always renders even
// if the natural-dimension probe fails — never stalls on a spinner.
const FALLBACK_DIMS = { w: 1000, h: 1414 };

// Calendar page: the uploaded district school calendar image (not the
// pacing guide). The pacing schedule itself lives on the Assign + dashboards.
export default function CalendarPage() {
  const [dims, setDims] = useState(null);

  // Measure the natural image first so the Image wrapper gets a real aspect
  // ratio (without originWidth/originHeight the absolutely-positioned child
  // images render in a 0-height box and nothing shows).
  useEffect(() => {
    if (!CALENDAR_IMG) return;
    const img = document.createElement("img");
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      setDims(w && h ? { w, h } : FALLBACK_DIMS);
    };
    img.onerror = () => setDims(FALLBACK_DIMS);
    img.src = CALENDAR_IMG;
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <CodeHeader
        chip="calendar.view()"
        title="Calendar"
        subtitle={`${DISTRICT_SHORT_NAME} ${SCHOOL_YEAR_LABEL} school calendar.`}
        tags={[{ label: "2026–2027", color: "text-[#22D3EE] border-[#22D3EE]/30 bg-[#22D3EE]/10" }]}
      />
      <div className="rounded-xl border border-stone-200/40 overflow-hidden bg-card">
        {!CALENDAR_IMG ? (
          <p className="p-6 text-sm text-muted-foreground">Set VITE_SCHOOL_CALENDAR_IMAGE_URL to show your school calendar here.</p>
        ) : dims ? (
          <Image
            src={CALENDAR_IMG}
            alt={`${DISTRICT_SHORT_NAME} ${SCHOOL_YEAR_LABEL} calendar`}
            fittingType="fit"
            originWidth={dims.w}
            originHeight={dims.h}
            className="w-full"
          />
        ) : (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
          </div>
        )}
      </div>
    </div>
  );
}