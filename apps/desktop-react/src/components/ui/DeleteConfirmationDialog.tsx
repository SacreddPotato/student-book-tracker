import { useI18n } from "../../app/AppProviders";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export function DeleteConfirmationDialog({
  open,
  title,
  description,
  entityName,
  saving,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  entityName: string;
  saving: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(): void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!saving) onOpenChange(next); }}
      title={title}
      description={description}
      footer={(
        <>
          <Button onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button>
          <Button intent="destructive" busy={saving} onClick={onConfirm}>{t("common.delete")}</Button>
        </>
      )}
    >
      <strong>{entityName}</strong>
    </Dialog>
  );
}
