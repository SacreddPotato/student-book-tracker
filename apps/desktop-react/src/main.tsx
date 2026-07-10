import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";

import App from "./App";
import { createFixtureBackend } from "./core/backend/fixture-backend";
import { createBrowserFixtureBackend } from "./core/backend/browser-fixtures";
import { createTauriBackend } from "./core/backend/tauri-backend";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/shell.css";
import "./styles/students.css";
import "./styles/books.css";
import "./styles/operations.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing React root element.");
}
const rootElement = root;

async function bootstrap() {
  const searchParams = new URLSearchParams(window.location.search);
  const fixtureRequested = searchParams.get("runtime") === "fixture";
  if (fixtureRequested && import.meta.env.PROD) {
    throw new Error("The fixture runtime is unavailable in production builds.");
  }
  const backend = fixtureRequested || (import.meta.env.DEV && !isTauri())
    ? (fixtureRequested ? createBrowserFixtureBackend(searchParams.get("scenario")) : createFixtureBackend())
    : await createTauriBackend();
  await backend.initialize();
  createRoot(rootElement).render(
    <StrictMode>
      <App backend={backend} />
    </StrictMode>,
  );
}

void bootstrap().catch((error: unknown) => {
  console.error("Failed to start the desktop application", error);
  rootElement.textContent = error instanceof Error ? error.message : "Application startup failed.";
});
