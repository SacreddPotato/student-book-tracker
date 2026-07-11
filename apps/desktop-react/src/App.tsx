import type { AppBackend } from "./core/backend/types";
import { AppProviders, useI18n, useNavigation } from "./app/AppProviders";
import { AppShell } from "./components/shell/AppShell";
import { StudentsScreen } from "./features/students/StudentsScreen";
import { BooksScreen } from "./features/books/BooksScreen";
import { LogsScreen } from "./features/logs/LogsScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { SyncStatus } from "./features/sync/SyncStatus";
import { UpdateNotice } from "./features/settings/UpdateNotice";
import { AppLifecycle } from "./app/AppLifecycle";

function WorkspacePlaceholder() {
  const { t } = useI18n();
  const { screen } = useNavigation();
  return (
    <><AppShell statusSlot={<SyncStatus />}>{screen === "students" ? <StudentsScreen /> : screen === "books" ? <BooksScreen /> : screen === "logs" ? <LogsScreen /> : screen === "settings" ? <SettingsScreen /> : (
      <section className="workspace-placeholder"><h2>{t(`tabs.${screen}`)}</h2></section>
    )}</AppShell><UpdateNotice /></>
  );
}

export default function App({ backend }: { backend: AppBackend }) {
  return (
    <AppProviders backend={backend}>
      <AppLifecycle />
      <WorkspacePlaceholder />
    </AppProviders>
  );
}
