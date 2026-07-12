/**
 * LicenseSettings — Settings UI for license status display.
 *
 * Shows the current license edition, customer name, expiry,
 * enabled features, days-remaining warning, activation prompt,
 * and upgrade CTA.
 */
import { useTranslation } from "react-i18next"
import { AlertCircle, CheckCircle2, Clock, Crown, KeyRound, ShieldAlert, Star, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { useLicenseStatus } from "./license-hooks"

// ─── Edition display names ──────────────────────────────────────

const EDITION_LABELS: Record<string, { label: string; icon: typeof Crown }> = {
  standard: { label: "Standard", icon: Star },
  professional: { label: "Professional", icon: Crown },
  enterprise: { label: "Enterprise", icon: Crown },
}

const STATUS_CONFIG: Record<string, { variant: "success" | "warning" | "destructive" | "default"; icon: typeof CheckCircle2 }> = {
  valid: { variant: "success", icon: CheckCircle2 },
  warning: { variant: "warning", icon: Clock },
  expired: { variant: "destructive", icon: ShieldAlert },
  expired_grace: { variant: "warning", icon: Clock },
  not_yet_active: { variant: "default", icon: Clock },
  tampered: { variant: "destructive", icon: ShieldAlert },
  grace: { variant: "warning", icon: Clock },
  invalid: { variant: "default", icon: KeyRound },
  locked: { variant: "destructive", icon: ShieldAlert },
  unavailable: { variant: "default", icon: KeyRound },
}

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(isoString: string | null): string {
  if (!isoString) return "—"
  try {
    const date = new Date(isoString)
    return date.toLocaleDateString("ar-DZ", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  } catch {
    return isoString
  }
}

function getStatusLabel(status: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const labels: Record<string, string> = {
    valid: t("license.statusValid", "مفعل"),
    warning: t("license.statusWarning", "ينتهي قريباً"),
    expired: t("license.statusExpired", "منتهي الصلاحية"),
    expired_grace: t("license.statusExpiredGrace", "فترة سماح"),
    not_yet_active: t("license.statusNotYetActive", "غير مفعل بعد"),
    tampered: t("license.statusTampered", "تم العبث بالساعة"),
    grace: t("license.statusGrace", "فترة تجربة"),
    invalid: t("license.statusInvalid", "غير صالح"),
    locked: t("license.statusLocked", "مقفل"),
    unavailable: t("license.statusUnavailable", "غير متاح"),
  }
  return labels[status] ?? status
}

function getEditionLabel(edition: string): string {
  return EDITION_LABELS[edition]?.label ?? edition
}

function getEditionIcon(edition: string) {
  return EDITION_LABELS[edition]?.icon ?? Star
}

// ─── Component ──────────────────────────────────────────────────

/**
 * License status card for the Settings page.
 */
export function LicenseSettings() {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch } = useLicenseStatus()

  // ── Loading state ──
  if (isLoading) {
    return (
      <Surface variant="panel" className="p-5 border border-line rounded-xl">
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">{t("common.loading", "جارٍ التحميل...")}</p>
        </div>
      </Surface>
    )
  }

  // ── Error state ──
  if (isError || !data) {
    return (
      <Surface variant="panel" className="p-5 border border-line rounded-xl">
        <div className="flex flex-col items-center gap-4 py-12">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("license.loadError", "تعذر تحميل معلومات الترخيص.")}</p>
          <Button variant="outline" onClick={() => refetch()}>
            {t("common.retry", "إعادة المحاولة")}
          </Button>
        </div>
      </Surface>
    )
  }

  const StatusIcon = STATUS_CONFIG[data.status]?.icon ?? KeyRound
  const statusLabel = getStatusLabel(data.status, t)
  const EditionIcon = getEditionIcon(data.edition)
  // IPC never returns "unavailable" — that's a browser-only fallback.
  // A real license has a non-empty edition string.
  const isDesktopUnavailable = data.status === "unavailable"
  const hasLicense = !isDesktopUnavailable && (data.edition?.length ?? 0) > 0
  const showWarning = data.status === "warning" && data.daysRemaining <= 30
  const showGraceBanner = data.status === "expired_grace" || data.status === "grace"
  const showActivationPrompt = !hasLicense || data.status === "invalid" || data.status === "locked" || data.status === "tampered" || data.status === "not_yet_active"

  return (
    <Surface variant="panel" className="p-5 border border-line rounded-xl space-y-5">
      <SurfaceHeader
        title={t("license.title", "الترخيص")}
        description={t("license.description", "معلومات الترخيص والإصدار الحالية")}
      />

      {/* ── Warning banner (30 days or less) ── */}
      {showWarning && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-warning-soft border border-warning" dir="rtl">
          <AlertCircle className="h-5 w-5 mt-0.5 text-warning shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-warning-foreground">
              {t("license.warningTitle", "الترخيص على وشك الانتهاء")}
            </p>
            <p className="mt-1 text-warning-foreground/80">
              {t("license.warningDescription", "سيتم انتهاء صلاحية الترخيص خلال {{days}} يوم.", { days: data.daysRemaining })}
            </p>
          </div>
        </div>
      )}

      {/* ── Grace period banner ── */}
      {showGraceBanner && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-warning-soft border border-warning" dir="rtl">
          <Clock className="h-5 w-5 mt-0.5 text-warning shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-warning-foreground">
              {data.status === "grace"
                ? t("license.graceTitle", "فترة تجربة ما بعد التثبيت")
                : t("license.expiredGraceTitle", "فترة سماح بعد انتهاء الترخيص")}
            </p>
            <p className="mt-1 text-warning-foreground/80">
              {data.status === "grace"
                ? t("license.graceDescription", "متبقي {{days}} يوم من فترة التجربة.", { days: data.daysRemaining })
                : t("license.expiredGraceDescription", "متبقي {{days}} يوم من فترة السماح. الرجاء تجديد الترخيص.", { days: Math.max(0, 30 + data.daysRemaining) })
              }
            </p>
          </div>
        </div>
      )}

      {/* ── Status badge ── */}
      <div className="flex items-center gap-2" dir="rtl">
        <StatusIcon className="h-5 w-5" />
        <span className="text-sm font-medium">{statusLabel}</span>
      </div>

      {/* ── License info cards ── */}
      {hasLicense && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Edition */}
          <div className="p-4 rounded-lg border border-line space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <EditionIcon className="h-4 w-4" />
              <span>{t("license.edition", "الإصدار")}</span>
            </div>
            <p className="text-lg font-semibold capitalize">
              {getEditionLabel(data.edition) || t("license.noEdition", "غير محدد")}
            </p>
          </div>

          {/* Customer */}
          <div className="p-4 rounded-lg border border-line space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Users className="h-4 w-4" />
              <span>{t("license.customer", "العميل")}</span>
            </div>
            <p className="text-lg font-semibold">
              {data.issuedTo || t("license.noCustomer", "غير معروف")}
            </p>
            {data.email && (
              <p className="text-sm text-muted-foreground">{data.email}</p>
            )}
          </div>

          {/* Expiry */}
          <div className="p-4 rounded-lg border border-line space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Clock className="h-4 w-4" />
              <span>{t("license.expiry", "تاريخ الانتهاء")}</span>
            </div>
            <p className="text-lg font-semibold">
              {data.validUntil
                ? formatDate(data.validUntil)
                : t("license.lifetime", "مدى الحياة")}
            </p>
            {data.validUntil && (
              <p className="text-sm text-muted-foreground">
                {data.daysRemaining > 0
                  ? t("license.daysRemaining", "متبقي {{days}} يوم", { days: data.daysRemaining })
                  : t("license.expired", "منتهي الصلاحية")}
              </p>
            )}
          </div>

          {/* License type */}
          <div className="p-4 rounded-lg border border-line space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <KeyRound className="h-4 w-4" />
              <span>{t("license.type", "النوع")}</span>
            </div>
            <p className="text-lg font-semibold capitalize">
              {data.licenseType === "perpetual"
                ? t("license.perpetual", "دائم")
                : data.licenseType === "subscription"
                  ? t("license.subscription", "اشتراك")
                  : data.licenseType || t("license.noType", "غير محدد")}
            </p>
            {data.maxUsers > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("license.maxUsers", "الحد الأقصى {{count}} مستخدم", { count: data.maxUsers })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Features list ── */}
      {hasLicense && data.features.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">
            {t("license.features", "الميزات المتاحة")}
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.features.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm" dir="rtl">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty features state ── */}
      {hasLicense && data.features.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("license.noFeatures", "لا توجد ميزات إضافية في هذا الإصدار.")}
        </p>
      )}

      {/* ── Activation prompt ── */}
      {(showActivationPrompt) && (
        <div className="p-4 rounded-lg border border-line space-y-3" dir="rtl">
          <p className="text-sm text-muted-foreground">
            {t("license.activationPrompt", "ليس لديك ترخيص نشط. يرجى تفعيل الترخيص للوصول إلى جميع الميزات.")}
          </p>
          <Button disabled>
            <KeyRound className="h-4 w-4 ml-2" />
            {t("license.activateButton", "تفعيل الترخيص")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("license.activateDisabled", "سيتم تفعيل خاصية التفعيل في التحديث القادم")}
          </p>
        </div>
      )}

      {/* ── Upgrade CTA (only for non-valid states) ── */}
      {hasLicense && data.status !== "valid" && data.status !== "warning" && (
      <div className="p-4 rounded-lg border border-line space-y-2" dir="rtl">
        <p className="text-sm">
          {data.status === "tampered"
            ? t("license.tamperedUpgrade", "تم الكشف عن عبث في الساعة. يرجى التواصل مع الدعم الفني.")
            : data.edition === "standard"
              ? t("license.upgradeToProfessional", "ترقية إلى Professional للاستفادة من الميزات المتقدمة.")
              : data.edition === "professional"
                ? t("license.upgradeToEnterprise", "ترقية إلى Enterprise للحصول على جميع الميزات.")
                : t("license.upgradePrompt", "لترقية الإصدار أو تجديد الترخيص، يرجى التواصل مع فريق الدعم.")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("license.contactInfo", "البريد الإلكتروني: support@tuari.app")}
        </p>
      </div>
      )}
    </Surface>
  )
}
