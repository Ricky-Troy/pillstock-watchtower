import { useQueryClient } from "@tanstack/react-query";

/** Refreshes everything a stock movement can change. */
export function useInvalidateStock() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["medicines"] }),
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["alerts"] }),
      qc.invalidateQueries({ queryKey: ["audits"] }),
    ]);
}
