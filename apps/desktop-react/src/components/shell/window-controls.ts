export type WindowControls = {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onResized(listener: () => void): Promise<() => void>;
};

export async function createTauriWindowControls(): Promise<WindowControls> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const window = getCurrentWindow();

  return {
    minimize: () => window.minimize(),
    toggleMaximize: () => window.toggleMaximize(),
    close: () => window.close(),
    isMaximized: () => window.isMaximized(),
    onResized: (listener) => window.onResized(() => listener()),
  };
}
