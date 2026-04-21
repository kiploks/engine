import { useCallback, useEffect, useState } from "react";
import type { LocalReportDetails } from "./types";

type ReportDataState = {
  loading: boolean;
  error: string | null;
  detail: LocalReportDetails | null;
  refresh: () => Promise<void>;
};

export function useReportData(reportId: string): ReportDataState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<LocalReportDetails | null>(null);

  const refresh = useCallback(async () => {
    if (!reportId) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/reports/" + encodeURIComponent(reportId));
      if (!r.ok) {
        setError(`HTTP ${r.status} while loading report`);
        setDetail(null);
        return;
      }
      const data = (await r.json()) as unknown;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        setError("Invalid report payload");
        setDetail(null);
        return;
      }
      setError(null);
      setDetail(data as LocalReportDetails);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setError(err || "Failed to load report");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, error, detail, refresh };
}
