export const en = {
  translation: {
    auth: { errors: { profileNameLength: "Enter a name between 1 and 120 characters." } },
    common: { yes: "Yes", no: "No", loading: "Loading..." },
    experimentalSettlement: {
      title: "Settle between accounts",
      newSettlement: "Record account settlement",
      help: "This operation reduces what each side owes by the same amount without a cash or inventory movement. Reverse the settlement before cancelling a linked invoice.",
      dialogDescription: "Choose one payable and one receivable debt, then review both balances before confirming.",
      cancelGuard: "Reverse this settlement before cancelling its linked invoice.",
    },
    settings: {
      tabs: { diagnostics: "Diagnostics" },
      diagnostics: {
        title: "App diagnostics",
        description: "View local logging status and recent events without business data or secrets.",
        enabled: "Logging enabled", initialized: "Logging ready",
        buffered: "Buffered events", dropped: "Dropped events",
        recentEvents: "Recent events", empty: "No recent events.",
        columns: { time: "Time", severity: "Severity", type: "Event description", code: "Code" },
        values: { level: { error: "Error", warn: "Warning", info: "Info" }, category: { ui: "User interface", crash: "Application crash", error: "Error", lifecycle: "Application lifecycle" } },
        descriptions: { ui: "User interface error", crash: "The application reported a crash.", error: "Error without additional details.", lifecycle: "An application lifecycle event occurred." },
        unknownEvent: "Unknown event",
        saveBundle: "Save support bundle", saving: "Saving bundle...",
        saved: "Support bundle saved.", saveError: "Unable to save support bundle.",
        loadError: "Unable to load diagnostics.",
      },
    },
  },
} as const
