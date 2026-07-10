import { useI18n } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";

export function DiscardDraftDialog({ open, onCancel, onDiscard }: {
  open: boolean;
  onCancel(): void;
  onDiscard(): void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onCancel(); }}
      title={t("students.discardTitle")}
      description={t("students.discardDescription")}
      footer={(
        <>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
          <Button intent="destructive" onClick={onDiscard}>{t("students.discard")}</Button>
        </>
      )}
    ><span className="sr-only">{t("students.discardDescription")}</span></Dialog>
  );
}
