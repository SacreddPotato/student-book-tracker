import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useBackend, useI18n, useNotices } from "../../app/AppProviders";
import { useAcademicYear } from "../../app/AcademicYearProvider";
import { Alert, EmptyState, LoadingState } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { SelectField } from "../../components/ui/Select";
import type { LogEntry } from "../../core/backend/types";
import { LogCard } from "./LogCard";
import { ReverseTransactionDialog } from "./ReverseTransactionDialog";

export function LogsScreen() {
  const backend = useBackend();
  const { t } = useI18n();
  const notices = useNotices();
  const queryClient = useQueryClient();
  const { years, currentYear, viewYear, archived, setViewYear } = useAcademicYear();
  const logsKey = ["logs", viewYear] as const;
  const logsQuery = useQuery({ queryKey: logsKey, queryFn: () => backend.listLogs(viewYear!), enabled: Boolean(viewYear) });
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [reversing, setReversing] = useState<LogEntry | null>(null);
  const reverseMutation = useMutation({
    mutationFn: () => backend.reverseTransaction(currentYear!, reversing!.id),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: logsKey }), queryClient.invalidateQueries({ queryKey: ["books"] }), queryClient.invalidateQueries({ queryKey: ["students"] })]); setReversing(null); notices.announce(t("feedback.transactionReversed")); },
    onError: () => notices.announce(t("errors.reverse"), "error"),
  });
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (logsQuery.data ?? []).filter((log) => (type === "all" || log.type === type) && (!needle || log.studentName?.toLocaleLowerCase().includes(needle) || log.items.some(({ bookName }) => bookName.toLocaleLowerCase().includes(needle))));
  }, [logsQuery.data, search, type]);
  return (
    <section className="logs-screen">
      <header className="workspace-heading"><div><h2>{t("logs.title")}</h2><p>{t("logs.description")}</p></div></header>
      {archived ? <Alert>{t("academicYears.archiveBanner")}</Alert> : null}
      <div className="log-filters"><SelectField label={t("academicYears.label")} value={viewYear ?? ""} options={years.map(({ academicYear }) => ({ value: academicYear, label: academicYear }))} onValueChange={setViewYear} /><div className="log-search"><Search size={17} aria-hidden="true" /><Field label={t("common.search")} value={search} placeholder={t("logs.searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} /></div>
        <SelectField label={t("fields.type")} value={type} options={[{ value: "all", label: t("logs.allTypes") }, { value: "stock_increase", label: t("logs.stockIncrease") }, { value: "student_issue", label: t("logs.studentIssue") }, { value: "reversal", label: t("logs.reversal") }]} onValueChange={setType} />
        <span className="log-count">{t("logs.count", { count: filtered.length })}</span></div>
      {logsQuery.isError ? <Alert>{t("errors.logsLoad")}</Alert> : logsQuery.isPending ? <LoadingState label={t("common.loading")} /> : filtered.length ? <div className="log-list">{filtered.map((log) => <LogCard key={log.id} log={log} onReverse={setReversing} readOnly={archived} />)}</div> : <EmptyState title={(logsQuery.data?.length ?? 0) ? t("logs.noResults") : t("logs.empty")} />}
      <ReverseTransactionDialog transaction={reversing} saving={reverseMutation.isPending} onOpenChange={(open) => { if (!open) setReversing(null); }} onConfirm={() => { if (!reverseMutation.isPending) reverseMutation.mutate(); }} />
    </section>
  );
}
