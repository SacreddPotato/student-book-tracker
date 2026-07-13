import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { AppBackend } from "../core/backend/types";
import type { AcademicYearRow } from "../core/db/repositories/academic-years";
import type { AcademicYearAdvanceResult } from "../core/services/academic-year-service";

type AcademicYearValue = {
  years: AcademicYearRow[];
  currentYear: string | null;
  viewYear: string | null;
  archived: boolean;
  loading: boolean;
  setupReady: boolean;
  error: string | null;
  setViewYear(academicYear: string): void;
  initialize(academicYear: string): Promise<void>;
  advance(toYear: string): Promise<AcademicYearAdvanceResult>;
  refresh(): Promise<void>;
};

const AcademicYearContext = createContext<AcademicYearValue | null>(null);

export function AcademicYearProvider({
  backend,
  children,
}: {
  backend: AppBackend;
  children: ReactNode;
}) {
  const [years, setYears] = useState<AcademicYearRow[]>([]);
  const [viewYear, setViewYearState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupReady, setSetupReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncStatus = useSyncExternalStore(
    backend.syncStore.subscribe,
    backend.syncStore.getSnapshot,
    backend.syncStore.getSnapshot,
  );

  const refresh = useCallback(async () => {
    try {
      const next = await backend.listAcademicYears();
      setYears(next);
      const current = next.find(({ status }) => status === "current")?.academicYear ?? null;
      setViewYearState((selected) => (
        selected && next.some(({ academicYear }) => academicYear === selected)
          ? selected
          : current
      ));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load academic years.");
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (syncStatus.phase === "idle" || syncStatus.phase === "syncing") {
      setSetupReady(false);
      return;
    }
    let active = true;
    void refresh().then(() => {
      if (active) setSetupReady(true);
    });
    return () => { active = false; };
  }, [refresh, syncStatus.phase]);

  const currentYear = years.find(({ status }) => status === "current")?.academicYear ?? null;
  const value = useMemo<AcademicYearValue>(() => ({
    years,
    currentYear,
    viewYear,
    archived: Boolean(viewYear && currentYear && viewYear !== currentYear),
    loading,
    setupReady,
    error,
    setViewYear(academicYear) {
      if (years.some((row) => row.academicYear === academicYear)) {
        setViewYearState(academicYear);
      }
    },
    async initialize(academicYear) {
      await backend.initializeAcademicYear(academicYear);
      await refresh();
    },
    async advance(toYear) {
      const result = await backend.advanceAcademicYear(toYear);
      setViewYearState(toYear);
      await refresh();
      return result;
    },
    refresh,
  }), [backend, currentYear, error, loading, refresh, setupReady, viewYear, years]);

  return <AcademicYearContext value={value}>{children}</AcademicYearContext>;
}

export function useAcademicYear() {
  const value = useContext(AcademicYearContext);
  if (!value) throw new Error("useAcademicYear must be used inside AcademicYearProvider.");
  return value;
}
