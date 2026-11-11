import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Vocab reads are cached like the other entity lookups so bouncing between
// pages doesn't re-pull the student's whole list every time.
const CACHE_OPTS = {
  staleTime: 10 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
  refetchOnMount: false,
};

// A student's collected vocabulary words (latest first).
export function useVocabulary(userId) {
  return useQuery({
    queryKey: ["vocab", userId],
    queryFn: () =>
      base44.entities.VocabularyWord.filter({ $or: [{ created_by_id: userId }, { student_id: userId }] }, "-created_date", 500),
    enabled: !!userId,
    ...CACHE_OPTS,
  });
}