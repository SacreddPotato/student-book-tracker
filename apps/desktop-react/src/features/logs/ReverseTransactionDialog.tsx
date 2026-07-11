import { useI18n } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import type { LogEntry } from "../../core/backend/types";

export function ReverseTransactionDialog({ transaction, saving, onOpenChange, onConfirm }: {
  transaction: LogEntry | null; saving: boolean; onOpenChange(open: boolean): void; onConfirm(): void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={Boolean(transaction)} onOpenChange={(open) => { if (!saving) onOpenChange(open); }} title={t("logs.reverseTitle")} description={t("logs.reverseDescription")}
      footer={<><Button onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button><Button intent="destructive" busy={saving} onClick={onConfirm}>{t("logs.reverse")}</Button></>}>
      <div className="reverse-summary">{transaction?.items.map((item) => <span key={item.id}>{item.bookName}</span>)}</div>
    </Dialog>
  );
}
