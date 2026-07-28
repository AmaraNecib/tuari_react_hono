// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@/lib/query-client";
import { useLicenseStatus, type LicenseStatusData } from "./license-hooks";

// ─── Mock @tauri-apps/api/core ────────────────────────────────

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// ─── Helpers ───────────────────────────────────────────────────

function createWrapper() {
  const queryClient = createAppQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ─── Mock window.__TAURI_INTERNALS__ ───────────────────────────

function mockDesktopRuntime() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function mockBrowserRuntime() {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

// ─── Tests ─────────────────────────────────────────────────────

const mockLicenseStatus: LicenseStatusData = {
  edition: "enterprise",
  editionLabel: "انتربرايز",
  issuedTo: "Acme Corp",
  email: "admin@acme.dz",
  customerName: "Acme Corp",
  features: ["multi_user", "lan_server", "encrypted_db"],
  maxUsers: 50,
  hasLicense: true,
  isGracePeriod: false,
  isExpired: false,
  isLocked: false,
  validFrom: "2026-01-01T00:00:00Z",
  validUntil: "2029-01-01T00:00:00Z",
  licenseType: "subscription",
  status: "valid",
  daysRemaining: 180,
};

describe("useLicenseStatus", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns default data in browser preview mode", async () => {
    mockBrowserRuntime();

    const { result } = renderHook(() => useLicenseStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      edition: "",
      editionLabel: "",
      issuedTo: "",
      email: "",
      customerName: null,
      features: [],
      maxUsers: 0,
      hasLicense: false,
      isGracePeriod: false,
      isExpired: false,
      isLocked: false,
      validFrom: "",
      validUntil: null,
      licenseType: "",
      status: "unavailable",
      daysRemaining: 0,
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("fetches license status from Tauri on desktop", async () => {
    mockDesktopRuntime();
    invokeMock.mockResolvedValue(mockLicenseStatus);

    const { result } = renderHook(() => useLicenseStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockLicenseStatus);
    expect(invokeMock).toHaveBeenCalledWith("get_license_status");
  });

  it("does not retry on error", async () => {
    mockDesktopRuntime();
    invokeMock.mockRejectedValue(new Error("bridge offline"));

    const { result } = renderHook(() => useLicenseStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
