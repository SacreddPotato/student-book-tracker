import { useEffect, useState } from "react";

import { useBackend, useI18n, useNavigation } from "../../app/AppProviders";
import { useExternalStore } from "../../app/use-external-store";
import { Button } from "../../components/ui/Button";

export function UpdateNotice() {
  const backend = useBackend();
  const navigation = useNavigation();
  const { t } = useI18n();
  const updater = useExternalStore(backend.updater.store);
  const [dismissedVersions, setDismissedVersions] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (updater.phase === "idle") void backend.updater.check();
  }, [backend.updater, updater.phase]);
  const version = updater.availableVersion;
  if (updater.phase !== "available" || !version || dismissedVersions.has(version)) return null;
  async function viewUpdate() {
    if (await navigation.requestScreen("settings")) {
      setDismissedVersions((current) => new Set(current).add(version!));
    }
  }
  return (
    <aside className="update-notice" aria-label={t("updater.notificationTitle")}>
      <div><strong>{t("updater.notificationTitle")}</strong><span>{t("updater.available", { version })}</span></div>
      <div><Button size="small" intent="primary" onClick={() => void viewUpdate()}>{t("updater.view")}</Button><Button size="small" intent="quiet" onClick={() => setDismissedVersions((current) => new Set(current).add(version))}>{t("updater.dismiss")}</Button></div>
    </aside>
  );
}
