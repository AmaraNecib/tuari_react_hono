// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@/lib/query-client";
import { LicenseSettings } from "./license-settings";
import { ar } from "@/i18n/resources/ar";
import type { LicenseStatusData } from "./license-hooks"
import {
  ALGERIA_DAY_LONG,
  MIDNIGHT_CROSSING,
  UTC_DAY_LONG,
  pinUtcTimeZone,
} from "@/test-utils/algeria-day";

// ─── Mock useLicenseStatus ─────────────────────────────────────

const mockUseLicenseStatus = vi.fn();

vi.mock("./license-hooks", () => ({
  useLicenseStatus: () => mockUseLicenseStatus(),
}));

// ─── Mock useTranslation with interpolation support ────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      let node: unknown = ar.translation;
      for (const part of key.split(".")) {
        if (node === null || typeof node !== "object" || !(part in node)) {
          node = undefined;
          break;
        }
        node = (node as Record<string, unknown>)[part];
      }
      let result = typeof node === "string" ? node : (fallback ?? key);
      // Simple interpolation for {{var}} patterns
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
    expect(screen.queryByText("جارٍ التنفيذ...")).toBeTruthy();
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

  it("keeps the neutral border on the license error panel (no destructive border regression, issue #38 review)", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      refetch: vi.fn(),
    });

    renderWithQuery(<LicenseSettings />);
    const alertClasses = screen.getByRole("alert").className;
    expect(alertClasses).toContain("border-line");
    expect(alertClasses).not.toContain("border-destructive");
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

  it("shows grace period banner with correct remaining days", () => {
    // daysRemaining is negative for expired licenses (days since expiry)
    // Grace period is 30 days, so -5 means 25 grace days remaining
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "expired_grace", daysRemaining: -5 }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("فترة سماح بعد انتهاء الترخيص")).toBeTruthy();
    expect(screen.queryByText("متبقي 25 يوم من فترة السماح. الرجاء تجديد الترخيص.")).toBeTruthy();
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

  it("shows no license info for invalid state (activation handled by M5.1)", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "invalid", issuedTo: "", edition: "" }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("غير صالح")).toBeTruthy();
    // Info cards should not render for invalid state (no edition)
    expect(screen.queryByText("الإصدار")).toBeNull();
  });

  it("shows upgrade CTA for locked state", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "locked", daysRemaining: -30 }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("انتهت صلاحية الترخيص. يرجى تجديد الترخيص لاستئناف العمل.")).toBeTruthy();
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

  it("shows tampered state with specialized upgrade text", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "tampered" }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("تم العبث بالساعة")).toBeTruthy();
    expect(screen.queryByText("تم الكشف عن عبث في الساعة. يرجى التواصل مع الدعم الفني.")).toBeTruthy();
  });

  it("shows not_yet_active state with correct status label", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ status: "not_yet_active" }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText("غير مفعل بعد")).toBeTruthy();
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

describe("stored business day timezone (#473)", () => {
  let restoreTimeZone: () => void;

  beforeEach(() => {
    restoreTimeZone = pinUtcTimeZone();
    mockUseLicenseStatus.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    restoreTimeZone();
  });

  it("runs under UTC so the assertions are not vacuous", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
    expect(ALGERIA_DAY_LONG).not.toBe(UTC_DAY_LONG);
  });

  it("renders the licence expiry date on its Algeria day, not the ambient UTC day", () => {
    mockUseLicenseStatus.mockReturnValue({
      isLoading: false,
      isError: false,
      data: createLicenseData({ validUntil: MIDNIGHT_CROSSING }),
    });

    renderWithQuery(<LicenseSettings />);

    expect(screen.queryByText(ALGERIA_DAY_LONG)).toBeTruthy();
    expect(screen.queryByText(UTC_DAY_LONG)).toBeNull();
  });
});
