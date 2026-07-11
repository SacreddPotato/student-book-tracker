import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, CloudOff, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useBackend, useI18n, useNotices } from "../../app/AppProviders";
import { useExternalStore } from "../../app/use-external-store";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert, EmptyState, LoadingState } from "../../components/ui/Feedback";

const conflictsKey = ["sync", "conflicts"] as const;

export function SyncStatus() {
  const backend = useBackend();
  const { t } = useI18n();
  const notices = useNotices();
  const queryClient = useQueryClient();
  const status = useExternalStore(backend.syncStore);
  const [open, setOpen] = useState(false);
  const conflicts = useQuery({ queryKey: conflictsKey, queryFn: () => backend.listConflicts(), enabled: open });
  const acknowledge = useMutation({ mutationFn: (id: string) => backend.acknowledgeConflict(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: conflictsKey }); notices.announce(t("feedback.conflictAcknowledged")); } });
  const label = t(`sync.${status.phase}`);
  const Icon = status.phase === "synced" ? Check : status.phase === "offline" ? CloudOff : status.phase === "syncing" ? RefreshCw : AlertCircle;
  const active = conflicts.data?.filter(({ acknowledged }) => !acknowledged) ?? [];
  return (
    <>
      <button type="button" className="sync-status-button" data-phase={status.phase} aria-label={label} onClick={() => setOpen(true)}><Icon size={16} aria-hidden="true" /><span>{label}</span>{status.unacknowledgedRejectedCount ? <Badge tone="danger">{status.unacknowledgedRejectedCount}</Badge> : null}</button>
      <Dialog open={open} onOpenChange={setOpen} title={t("sync.conflicts")} description={status.lastSyncedAt ? t("sync.lastSync", { time: status.lastSyncedAt }) : t("sync.never")} footer={<Button busy={status.phase === "syncing"} onClick={() => void backend.requestSync()}><RefreshCw size={16} />{t("sync.retry")}</Button>}>
        <div className="sync-summary"><Badge>{t("sync.pending", { count: status.pendingCount })}</Badge><Badge tone={status.rejectedCount ? "danger" : "neutral"}>{t("sync.rejectedCount", { count: status.rejectedCount })}</Badge></div>
        {conflicts.isError ? <Alert>{t("sync.conflictLoadFailed")}</Alert> : conflicts.isPending ? <LoadingState label={t("common.loading")} /> : active.length ? <div className="conflict-list">{active.map((conflict) => <article className="conflict-card" key={conflict.commandId}><div><h3>{conflict.isInsufficientStock ? t("sync.insufficientStock") : t("sync.rejected")}</h3>{conflict.studentName ? <p><strong>{t("sync.student")}:</strong> {conflict.studentName}</p> : null}{conflict.bookNames.length ? <p><strong>{t("sync.books")}:</strong> {(conflict.bookSelections?.length ? conflict.bookSelections.map(({ bookName, semester }) => `${bookName} — ${t(`semesters.${semester}`)}`) : conflict.bookNames).join(", ")}</p> : null}{conflict.row.lastError ? <small>{conflict.row.lastError}</small> : null}</div><Button size="small" onClick={() => acknowledge.mutate(conflict.commandId)} busy={acknowledge.isPending}>{t("sync.acknowledge")}</Button></article>)}</div> : <EmptyState title={t("sync.synced")} />}
      </Dialog>
    </>
  );
}
