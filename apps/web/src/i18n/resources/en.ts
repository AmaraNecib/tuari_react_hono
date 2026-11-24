export const en = {
  translation: {
    common: { yes: "Yes", no: "No", loading: "Loading..." },
    settings: {
      tabs: { diagnostics: "Diagnostics" },
      diagnostics: {
        title: "App diagnostics",
        description: "View local logging status and recent events without business data or secrets.",
        enabled: "Logging enabled", initialized: "Logging ready",
        buffered: "Buffered events", dropped: "Dropped events",
        recentEvents: "Recent events", empty: "No recent events.",
        columns: { time: "Time", severity: "Severity", type: "Type", code: "Code" },
        values: { level: { error: "Error", warn: "Warning", info: "Info" }, category: { ui: "User interface", crash: "Application crash", error: "Error", lifecycle: "Application lifecycle" } },
        saveBundle: "Save support bundle", saving: "Saving bundle...",
        saved: "Support bundle saved.", saveError: "Unable to save support bundle.",
        loadError: "Unable to load diagnostics.",
      },
    },
  },
} as const
