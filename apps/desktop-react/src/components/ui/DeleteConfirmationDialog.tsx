import { useEffect, useId, useState, type FormEvent } from "react";

import { useI18n } from "../../app/AppProviders";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Field } from "./Field";

const DELETE_PASSWORD = "az2006";

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
  const formId = useId();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    setPassword("");
    setPasswordError(null);
  }, [entityName, open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (password !== DELETE_PASSWORD) {
      setPasswordError(t("deletion.incorrectPassword"));
      return;
    }
    setPasswordError(null);
    onConfirm();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!saving) onOpenChange(next); }}
      title={title}
      description={description}
      footer={(
        <>
          <Button type="button" onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button>
          <Button type="submit" form={formId} intent="destructive" busy={saving} disabled={!password}>{t("common.delete")}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={submit} className="delete-confirmation-form">
        <strong>{entityName}</strong>
        <Field
          label={t("deletion.password")}
          type="password"
          autoComplete="off"
          value={password}
          error={passwordError}
          autoFocus
          onChange={(event) => {
            setPassword(event.target.value);
            setPasswordError(null);
          }}
        />
      </form>
    </Dialog>
  );
}
