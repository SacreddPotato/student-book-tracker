import { BookOpen, GraduationCap, History, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { useI18n, useNavigation, useNotices, type ScreenId } from "../../app/AppProviders";

const screens: Array<{ id: ScreenId; icon: typeof GraduationCap }> = [
  { id: "students", icon: GraduationCap },
  { id: "books", icon: BookOpen },
  { id: "logs", icon: History },
  { id: "settings", icon: Settings },
];

export function AppShell({ children, statusSlot }: {
  children: ReactNode;
  statusSlot?: ReactNode;
}) {
  const { language, setLanguage, t } = useI18n();
  const navigation = useNavigation();
  const { notices, dismiss } = useNotices();

  return (
    <div className="app-shell">
      <aside className="app-rail">
        <div className="app-brand" aria-label={t("app.title")}>
          <span className="app-brand-mark"><BookOpen size={22} /></span>
          <span className="app-brand-copy">
            <strong>{t("app.title")}</strong>
            <small>{t("app.workspace")}</small>
          </span>
        </div>
        <nav className="app-navigation" aria-label={t("app.primarySections")}>
          {screens.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="app-nav-button"
              data-active={navigation.screen === id || undefined}
              aria-pressed={navigation.screen === id}
              onClick={() => void navigation.requestScreen(id)}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{t(`tabs.${id}`)}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="app-main-column">
        <header className="app-topbar">
          <div>
            <span className="app-eyebrow">{t("app.workspace")}</span>
            <h1>{t(`tabs.${navigation.screen}`)}</h1>
          </div>
          <div className="app-topbar-controls">
            <div className="app-shell-status">{statusSlot}</div>
            <div className="language-toggle" aria-label={t("settings.language")}>
              <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
              <button type="button" aria-pressed={language === "ar"} onClick={() => setLanguage("ar")}>AR</button>
            </div>
          </div>
        </header>
        <main className="app-workspace">{children}</main>
      </div>
      <div className="app-notices" aria-live="polite" aria-atomic="false">
        {notices.map((notice) => (
          <div className="app-notice" data-tone={notice.tone} key={notice.id}>
            <span>{notice.message}</span>
            <button type="button" onClick={() => dismiss(notice.id)} aria-label={t("common.close")}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
