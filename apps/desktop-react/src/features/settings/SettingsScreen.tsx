import { Download, Languages, RefreshCw, Rocket } from "lucide-react";

import { useBackend, useI18n } from "../../app/AppProviders";
import { useExternalStore } from "../../app/use-external-store";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";

export function SettingsScreen() {
  const backend = useBackend();
  const { language, setLanguage, t } = useI18n();
  const updater = useExternalStore(backend.updater.store);
  const busy = ["checking", "downloading", "installing"].includes(updater.phase);
  const message = updater.phase === "disabled" ? t("updater.disabled")
    : updater.phase === "upToDate" ? t("updater.upToDate")
    : updater.phase === "available" ? t("updater.available", { version: updater.availableVersion ?? "" })
    : updater.phase === "ready" ? t("updater.ready")
    : updater.phase === "failed" ? t("updater.failed") : null;
  return (
    <section className="settings-screen">
      <header className="workspace-heading"><div><h2>{t("settings.title")}</h2><p>{t("settings.description")}</p></div></header>
      <div className="settings-grid">
        <article className="settings-card"><div className="settings-card-icon"><Languages size={21} /></div><div className="settings-card-content"><h3>{t("settings.language")}</h3><div className="settings-language"><Button intent={language === "en" ? "primary" : "secondary"} onClick={() => setLanguage("en")}>{t("languages.en")}</Button><Button intent={language === "ar" ? "primary" : "secondary"} onClick={() => setLanguage("ar")}>{t("languages.ar")}</Button></div></div></article>
        <article className="settings-card"><div className="settings-card-icon"><Rocket size={21} /></div><div className="settings-card-content"><h3>{t("settings.updates")}</h3><p>{t("settings.currentVersion", { version: updater.currentVersion })}</p>{updater.phase === "failed" ? <Alert>{message}</Alert> : message ? <div className="update-message" data-phase={updater.phase}>{message}</div> : null}
          <div className="settings-actions">
            {["idle", "disabled", "upToDate", "failed"].includes(updater.phase) ? <Button busy={updater.phase === "checking"} disabled={busy} onClick={() => void backend.updater.check()}><RefreshCw size={16} />{t("updater.check")}</Button> : null}
            {updater.phase === "checking" ? <Button busy disabled>{t("updater.checking")}</Button> : null}
            {updater.phase === "available" ? <Button intent="primary" onClick={() => void backend.updater.download()}><Download size={16} />{t("updater.download")}</Button> : null}
            {updater.phase === "downloading" ? <Button busy disabled>{t("updater.downloading")}</Button> : null}
            {updater.phase === "ready" ? <Button intent="primary" onClick={() => void backend.updater.install()}><Rocket size={16} />{t("updater.install")}</Button> : null}
            {updater.phase === "installing" ? <Button busy disabled>{t("updater.installing")}</Button> : null}
          </div>
        </div></article>
      </div>
    </section>
  );
}
