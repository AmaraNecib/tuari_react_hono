import "@/i18n"

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { bootstrapPreferences } from "@/features/preferences/preference-constants";
import { initializeDesktopAuthSession } from "@/lib/desktop-auth-session";
import { initializeRuntimeConfig } from "@/lib/runtime-config";
import "./styles.css";

bootstrapPreferences();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

const appRoot = rootElement;

async function bootstrap() {
  await initializeRuntimeConfig();
  await initializeDesktopAuthSession();
  const { router } = await import("@/router");

  ReactDOM.createRoot(appRoot).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}

void bootstrap();
