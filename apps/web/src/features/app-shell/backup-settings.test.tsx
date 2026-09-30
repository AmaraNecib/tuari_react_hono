// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@/lib/query-client";
import { ar } from "@/i18n/resources/ar";
import { BackupSettings } from "./backup-settings";
import type { BackupStatus } from "@tuari/contracts";

// ─── Mock the hooks module ─────────────────────────────────────

const mockUseBackupStatusQuery = vi.fn();
const mockUseSetBackupsRootMutation = vi.fn();
const mockPickBackupFolder = vi.fn();

vi.mock("./backup-hooks", () => ({
  useBackupStatusQuery: () => mockUseBackupStatusQuery(),
  useSetBackupsRootMutation: () => mockUseSetBackupsRootMutation(),
  pickBackupFolder: () => mockPickBackupFolder(),
}));

// ─── Mock useTranslation with real Arabic strings ──────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: unknown, maybeOptions?: Record<string, unknown>) => {
      const options =
        typeof fallbackOrOptions === "object"
          ? (fallbackOrOptions as Record<string, unknown>)
          : maybeOptions;
      const fallback = typeof fallbackOrOptions === "string" ? fallbackOrOptions : undefined;
      let node: unknown = ar.translation;
      for (const part of key.split(".")) {
        if (node === null || typeof node !== "object" || !(part in node)) {
          node = undefined;
          break;
        }
        node = (node as Record<string, unknown>)[part];
      }
      let result = typeof node === "string" ? node : (fallback ?? key);
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        }
      }
      return result;
    },
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = createAppQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const ROOT = "/mnt/usb/tuari-backups";

function createStatus(overrides: Partial<BackupStatus> = {}): BackupStatus {
  return {
    lastSuccessAt: null,
    lastBackupPath: null,
    lastFailure: null,
    backupsRootPath: ROOT,
    retention: { daily: 14, weekly: 8, monthly: 6 },
    ...overrides,
  };
}

function loaded(status: BackupStatus) {
  mockUseBackupStatusQuery.mockReturnValue({
    isLoading: false,
    isError: false,
    data: status,
  });
}

function mutationResolving(result: unknown) {
  const mutateAsync = vi.fn().mockResolvedValue(result);
  mockUseSetBackupsRootMutation.mockReturnValue({ mutateAsync, isPending: false });
  return mutateAsync;
}

describe("BackupSettings", () => {
  beforeEach(() => {
    mockUseBackupStatusQuery.mockReset();
    mockUseSetBackupsRootMutation.mockReset();
    mockPickBackupFolder.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a loading state", () => {
    mockUseBackupStatusQuery.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    mockUseSetBackupsRootMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    renderWithQuery(<BackupSettings />);

    expect(screen.queryByText("جارٍ تحميل حالة النسخ الاحتياطي...")).toBeTruthy();
  });

  it("renders the never-run state with an honest explanation", () => {
    loaded(createStatus());
    mutationResolving({ success: true, path: ROOT, persisted: true });

    renderWithQuery(<BackupSettings />);

    const panel = screen.getByTestId("backup-status");
    expect(panel.getAttribute("data-state")).toBe("never-run");
    expect(screen.queryByText("لا توجد نسخة احتياطية بعد")).toBeTruthy();
    // The empty state must not overstate what a backup protects.
    expect(
      screen.queryByText(/لا تحمي من تعطل القرص/),
    ).toBeTruthy();
  });

  it("renders the last success time and folder path", () => {
    loaded(
      createStatus({
        lastSuccessAt: new Date().toISOString(),
        lastBackupPath: "/mnt/usb/tuari-backups/2026-01-14",
      }),
    );
    mutationResolving({ success: true, path: ROOT, persisted: true });

    renderWithQuery(<BackupSettings />);

    const panel = screen.getByTestId("backup-status");
    expect(panel.getAttribute("data-state")).toBe("success");
    expect(screen.queryByText("آخر نسخة احتياطية ناجحة")).toBeTruthy();
    expect(screen.queryByText("/mnt/usb/tuari-backups/2026-01-14")).toBeTruthy();
  });

  it("flags a stale last success as overdue", () => {
    loaded(
      createStatus({
        lastSuccessAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        lastBackupPath: "/mnt/usb/tuari-backups/2026-01-14",
      }),
    );
    mutationResolving({ success: true, path: ROOT, persisted: true });

    renderWithQuery(<BackupSettings />);

    const panel = screen.getByTestId("backup-status");
    expect(panel.getAttribute("data-state")).toBe("overdue");
    expect(screen.queryByText("آخر نسخة احتياطية قديمة")).toBeTruthy();
  });

  it("renders a recorded failure loudly with its reason", () => {
    loaded(
      createStatus({
        lastFailure: {
          at: "2026-01-15T08:00:00.000Z",
          reason: "EACCES: permission denied",
        },
      }),
    );
    mutationResolving({ success: true, path: ROOT, persisted: true });

    renderWithQuery(<BackupSettings />);

    const panel = screen.getByTestId("backup-status");
    expect(panel.getAttribute("data-state")).toBe("failed");
    expect(screen.queryByText("فشلت آخر محاولة نسخ احتياطي")).toBeTruthy();
    expect(screen.queryByText("EACCES: permission denied")).toBeTruthy();
  });

  it("saves a valid path and reports success", async () => {
    loaded(createStatus());
    const mutateAsync = mutationResolving({
      success: true,
      path: "/mnt/usb/other-backups",
      persisted: true,
    });

    renderWithQuery(<BackupSettings />);

    const input = screen.getByDisplayValue(ROOT);
    fireEvent.change(input, { target: { value: "/mnt/usb/other-backups" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المسار" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith("/mnt/usb/other-backups");
    });
    expect(screen.queryByText("تم حفظ مجلد النسخ الاحتياطي.")).toBeTruthy();
  });

  it("rejects an invalid path with the message naming the problem", async () => {
    loaded(createStatus());
    const mutateAsync = mutationResolving({
      success: false,
      error: "the path is a file, not a folder: /mnt/usb/file.txt",
    });

    renderWithQuery(<BackupSettings />);

    const input = screen.getByDisplayValue(ROOT);
    fireEvent.change(input, { target: { value: "/mnt/usb/file.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المسار" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith("/mnt/usb/file.txt");
    });
    expect(
      screen.queryByText("the path is a file, not a folder: /mnt/usb/file.txt"),
    ).toBeTruthy();
  });

  it("does not call the server for an empty path", () => {
    loaded(createStatus());
    const mutateAsync = mutationResolving({ success: true, path: ROOT, persisted: true });

    renderWithQuery(<BackupSettings />);

    fireEvent.change(screen.getByDisplayValue(ROOT), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المسار" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("مسار مجلد النسخ الاحتياطي مطلوب.")).toBeTruthy();
  });

  it("states when the choice cannot be persisted", async () => {
    loaded(createStatus());
    mutationResolving({ success: true, path: ROOT, persisted: false });

    renderWithQuery(<BackupSettings />);

    fireEvent.click(screen.getByRole("button", { name: "حفظ المسار" }));

    await waitFor(() => {
      expect(screen.queryByText(/هذه الجلسة فقط/)).toBeTruthy();
    });
  });
});
