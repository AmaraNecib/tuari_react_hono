// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@/lib/query-client";
import { LicenseSettings } from "./license-settings";
import type { LicenseStatusData } from "./license-hooks";

// ─── Mock useLicenseStatus ─────────────────────────────────────

const mockUseLicenseStatus = vi.fn();

vi.mock("./license-hooks", () => ({
  useLicenseStatus: () => mockUseLicenseStatus(),
}));

// ─── Mock useTranslation with interpolation support ────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      if (!fallback) return key;
      // Simple interpolation for {{var}} patterns
      let result = fallback;
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        }
      }
      return result;
    },
  }),
}));

// ─── Helpers ───────────────────────────────────────────────────

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = createAppQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function createLicenseData(overrides: Partial<LicenseStatusData> = {}): LicenseStatusData {
  return {
    edition: "enterprise",
    issuedTo: "Acme Corp",
    email: "admin@acme.dz",
    features: ["multi_user", "lan_server", "encrypted_db"],
    maxUsers: 50,
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2029-01-01T00:00:00Z",
    licenseType: "subscription",
    status: "valid",
    daysRemaining: 180,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe("LicenseSettings", () => {
  beforeEach(() => {
    mockUseLicenseStatus.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state", () => {
    mockUseLicenseStatus.mockReturnValue({ isLoading: true });

    renderWithQuery(<LicenseSettings />);
    expect(screen.queryByText("جارٍ التحميل...")).toBeTruthy();
  });

  it("shows error state with retry button", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      refetch: vi.fn(),
    });

    renderWithQuery(<LicenseSettings />);
    expect(screen.queryByText("تعذر تحميل معلومات الترخيص.")).toBeTruthy();
    expect(screen.queryByText("إعادة المحاولة")).toBeTruthy();
  });

  it("shows license info for a valid license", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData(),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("معلومات الترخيص والإصدار الحالية")).toBeTruthy();
    expect(screen.queryByText("مفعل")).toBeTruthy();
    expect(screen.queryByText("Enterprise")).toBeTruthy();
    expect(screen.queryByText("Acme Corp")).toBeTruthy();
    expect(screen.queryByText("admin@acme.dz")).toBeTruthy();
    expect(screen.queryByText("اشتراك")).toBeTruthy();
    expect(screen.queryByText("multi_user")).toBeTruthy();
    expect(screen.queryByText("lan_server")).toBeTruthy();
    expect(screen.queryByText("encrypted_db")).toBeTruthy();
  });

  it("shows warning banner when days remaining are 30 or less", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "warning", daysRemaining: 15 }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("الترخيص على وشك الانتهاء")).toBeTruthy();
    expect(screen.queryByText("سيتم انتهاء صلاحية الترخيص خلال 15 يوم.")).toBeTruthy();
  });

  it("shows grace period banner", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "expired_grace", daysRemaining: 10 }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("فترة سماح بعد انتهاء الترخيص")).toBeTruthy();
    expect(screen.queryByText("متبقي 10 يوم من فترة السماح. الرجاء تجديد الترخيص.")).toBeTruthy();
  });

  it("shows lifetime for perpetual license", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({
        validUntil: null,
        licenseType: "perpetual",
      }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("دائم")).toBeTruthy();
    expect(screen.queryByText("مدى الحياة")).toBeTruthy();
  });

  it("shows activation prompt when no valid license", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "invalid", issuedTo: "" }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("ليس لديك ترخيص نشط. يرجى تفعيل الترخيص للوصول إلى جميع الميزات.")).toBeTruthy();
    expect(screen.queryByText("تفعيل الترخيص")).toBeTruthy();
    expect(screen.queryByText("سيتم تفعيل خاصية التفعيل في التحديث القادم")).toBeTruthy();
  });

  it("shows upgrade CTA for locked state", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "locked", daysRemaining: -30 }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText(/يرجى التواصل مع فريق الدعم/)).toBeTruthy();
  });

  it("shows license info for personal use", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({
        edition: "professional",
        issuedTo: "Mohamed Amine",
        email: "amine@example.com",
        features: ["multi_user", "lan_server"],
        maxUsers: 10,
        licenseType: "perpetual",
        status: "valid",
        daysRemaining: 9999,
        validUntil: null,
      }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("مفعل")).toBeTruthy();
    expect(screen.queryByText("Professional")).toBeTruthy();
    expect(screen.queryByText("Mohamed Amine")).toBeTruthy();
    expect(screen.queryByText("amine@example.com")).toBeTruthy();
    expect(screen.queryByText("دائم")).toBeTruthy();
    expect(screen.queryByText("مدى الحياة")).toBeTruthy();
    expect(screen.queryByText("multi_user")).toBeTruthy();
    expect(screen.queryByText("lan_server")).toBeTruthy();
  });

  it("shows empty features message when features list is empty", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ features: [] }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("لا توجد ميزات إضافية في هذا الإصدار.")).toBeTruthy();
  });
});
