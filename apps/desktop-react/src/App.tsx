import type { AppBackend } from "./core/backend/types";
import { AppProviders, useI18n, useNavigation } from "./app/AppProviders";
import { AppShell } from "./components/shell/AppShell";

function WorkspacePlaceholder() {
  const { t } = useI18n();
  const { screen } = useNavigation();
  return (
    <AppShell>
      <section className="workspace-placeholder">
        <h2>{t(`tabs.${screen}`)}</h2>
      </section>
    </AppShell>
  );
}

export default function App({ backend }: { backend: AppBackend }) {
  return (
    <AppProviders backend={backend}>
      <WorkspacePlaceholder />
    </AppProviders>
  );
}
