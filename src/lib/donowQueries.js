import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const CACHE_OPTS = {
  staleTime: 30 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
};

// All Do Nows for the teacher dashboard (admin-only entity).
export function useDoNows() {
  return useQuery({
    queryKey: ["doNow", "all"],
    queryFn: () => base44.entities.DoNow.list("day_number"),
    ...CACHE_OPTS,
  });
}

// Every Do Now response — joined to Do Nows + users for completion reports.
export function useDoNowResponses() {
  return useQuery({
    queryKey: ["doNowResponses", "all"],
    queryFn: () => base44.entities.DoNowResponse.list("-created_date", 500),
    ...CACHE_OPTS,
  });
}