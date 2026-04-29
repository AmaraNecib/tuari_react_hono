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
  try {
    await initializeRuntimeConfig();
    await initializeDesktopAuthSession();
    const { router } = await import("@/router");

    ReactDOM.createRoot(appRoot).render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>,
    );
  } catch {
    appRoot.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;text-align:center;direction:rtl">
        <div>
          <p style="font-size:1.1rem;color:#555;margin-bottom:1rem">فشل تهيئة التطبيق. يرجى إعادة التشغيل.</p>
          <button onclick="location.reload()" style="padding:.5rem 1.5rem;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#fff">
            إعادة المحاولة
          </button>
        </div>
      </div>
    `
  }
}

bootstrap();
