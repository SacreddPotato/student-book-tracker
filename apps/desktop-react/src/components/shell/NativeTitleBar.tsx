import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useI18n } from "../../app/AppProviders";
import { createTauriWindowControls, type WindowControls } from "./window-controls";

export function NativeTitleBar({ controls: injectedControls }: { controls?: WindowControls }) {
  const { t } = useI18n();
  const [controls, setControls] = useState<WindowControls | null>(injectedControls ?? null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (injectedControls) return;
    let active = true;
    void createTauriWindowControls().then((nextControls) => {
      if (active) setControls(nextControls);
    });
    return () => { active = false; };
  }, [injectedControls]);

  useEffect(() => {
    if (!controls) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      const next = await controls.isMaximized();
      if (active) setMaximized(next);
    };
    void refresh();
    void controls.onResized(() => void refresh()).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [controls]);

  return (
    <header className="native-titlebar" data-tauri-drag-region>
      <div className="native-titlebar-title" data-tauri-drag-region>
        {t("app.title")}
      </div>
      <div className="native-titlebar-actions">
        <button type="button" aria-label={t("window.minimize")} onClick={() => void controls?.minimize()}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t(maximized ? "window.restore" : "window.maximize")}
          onClick={() => void controls?.toggleMaximize()}
        >
          {maximized ? <Copy size={14} aria-hidden="true" /> : <Square size={14} aria-hidden="true" />}
        </button>
        <button className="native-titlebar-close" type="button" aria-label={t("window.close")} onClick={() => void controls?.close()}>
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
