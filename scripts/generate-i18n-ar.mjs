#!/usr/bin/env node
/**
 * One-shot generator for issue #271: rewrite apps/web/src/i18n/resources/ar.ts
 * with all missing keys added (inline fallbacks promoted + hand-written Arabic
 * for raw-key sites) and duplicate/dead namespaces collapsed.
 *
 * Run from repo root:  node scripts/generate-i18n-ar.mjs
 * Then verify:          git diff --stat apps/web/src/i18n/resources/ar.ts
 *                       node scripts/check-i18n-keys.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)))
const resourcesPath = join(rootDir, "apps/web/src/i18n/resources/ar.ts")
const reportPath = join(rootDir, ".scratch/i18n-report.json")

// ── parse existing resources ────────────────────────────────────────────────
function parseResources(filePath) {
  const source = readFileSync(filePath, "utf8")
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText
  const assignIndex = transpiled.lastIndexOf("exports.ar = ")
  const body = transpiled.slice(assignIndex).replace(/^exports\.ar = /, "").replace(/\s*;\s*$/, "")
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${body});`)().translation
}

// ── manual Arabic for keys WITHOUT usable inline fallbacks ──────────────────
// Keys already canonical (renames happen at call sites, not here) are skipped.
const MANUAL = {
  // common
  "common.creationError": "تعذر إنشاء العنصر الآن.",
  "common.creating": "جارٍ الإنشاء...",
  "common.create": "إنشاء",
  "common.back": "رجوع",
  "common.saving": "جارٍ الحفظ...",
  "common.note": "ملاحظة",
  "common.previous": "السابق",
  "common.next": "التالي",
  "common.fieldRequired": "{{field}} مطلوب.",
  "common.currency": "دج",
  // shell (bottom nav)
  "shell.dashboard": "لوحة التحكم",
  "shell.employees": "العاملون",
  "shell.warehouses": "المستودعات",
  // debts (canonical top-level block; moved from sections.debts + dead debt.*)
  "debts.label": "الديون",
  "debts.description": "متابعة أرصدة العمال والأطراف الخارجية مع سجل مالي بسيط وآمن في هذه المرحلة.",
  "debts.consolidateDescription": "ادمج حركتين افتتاحيتين من اتجاهين متعاكسين (دائن ومدين) لنفس الطرف في رصيد واحد صافٍ.",
  "debts.selectOneFromEachSide": "حدد حركة من كل جانب لتجميدهما.",
  "debts.settleToZero": "تسوية إلى صفر",
  // detailPages.debt
  "detailPages.debt.currency": "دج",
  "detailPages.debt.caseLabel": "حالة الدين",
  "detailPages.debt.paymentNotePlaceholder": "اختياري — تفصيل عن الدفعة",
  "detailPages.debt.partySummaryCard.openCases": "مفتوحة",
  "detailPages.debt.partySummaryCard.closedCases": "مغلقة",
  "detailPages.debt.partySummaryCard.balanceLabel": "الرصيد",
  "detailPages.debt.payment.title": "تسديد دفعة",
  "detailPages.debt.payment.currentBalance": "الرصيد الحالي",
  "detailPages.debt.payment.amount": "مبلغ الدفعة",
  "detailPages.debt.payment.payFull": "تسديد كامل المبلغ",
  "detailPages.debt.payment.settlePrompt": "سيتم تسوية حساب الدين بالكامل.",
  "detailPages.debt.payment.confirm": "تأكيد الدفعة",
  "detailPages.debt.settlement.settle": "تسوية الحساب",
  // detailPages.employee — delete/leave disabled reasons
  "detailPages.employee.deleteReasonManagementHistory": "لا يمكن حذف عامل له سجل إدارة.",
  "detailPages.employee.deleteReasonWorkHistory": "لا يمكن حذف عامل له سجل عمل.",
  "detailPages.employee.deleteReasonHistoryOrPayments": "لا يمكن حذف عامل له سجل إدارة أو دفعات مرتبطة.",
  "detailPages.employee.deleteReasonManagedScope": "لا يمكن حذف عامل يدير مشاريع أو مستودعات.",
  "detailPages.employee.deleteReasonFallback": "تعذر حذف هذا العامل.",
  "detailPages.employee.leaveReasonInactive": "لا يمكن إنهاء عامل غير نشط.",
  "detailPages.employee.leaveReasonWorkerLinked": "أنهِ ارتباطات هذا العامل أولاً.",
  "detailPages.employee.leaveReasonProjectManagerLinked": "أنهِ إدارة المشاريع وارتباطاته أولاً.",
  "detailPages.employee.leaveReasonWarehouseManagerLinked": "أنهِ إدارة المستودعات وارتباطاته أولاً.",
  "detailPages.employee.leaveReasonFallback": "تعذر إنهاء هذا العامل.",
  "detailPages.employee.status": "الحالة",
  // detailPages.project / warehouse archive reasons
  "detailPages.project.archiveReasonWorkers": "لا يمكن أرشفة مشروع له عمال مرتبطون.",
  "detailPages.warehouse.archiveReasonManagerAndWorkers": "لا يمكن أرشفة مستودع له مدير وعمال مرتبطون.",
  "detailPages.warehouse.archiveReasonWorkers": "لا يمكن أرشفة مستودع له عمال مرتبطون.",
  "detailPages.warehouse.archiveReasonManager": "لا يمكن أرشفة مستودع له مدير مسؤول.",
  // inventory.transfer
  "inventory.transfer.creating": "جارٍ التحويل...",
  "inventory.transfer.create": "إنشاء التحويل",
  // systemLog — tokenizer keys MUST equal the server's emitted Arabic
  // (apps/api/src/modules/company/company.system-log.ts)
  "systemLog.completed": "مكتمل",
  "systemLog.completedFeminine": "مكتملة",
  "systemLog.entryType": "نوع الحركة",
  "systemLog.value": "القيمة",
  "systemLog.balance": "الرصيد بعد العملية",
  "systemLog.status": "الحالة",
  "systemLog.paidAmount": "المبلغ المدفوع",
  // auth — flat canonical keys for login-page (auth.login.* renamed at call site)
  "auth.description": "لوحة عمل مركزة للأقسام الأساسية",
  "auth.hidePassword": "إخفاء كلمة المرور",
  "auth.showPassword": "إظهار كلمة المرور",
  "auth.loading": "جارٍ الدخول...",
  "auth.footer": "نظام إدارة محلي - بياناتك آمنة على جهازك",
  "auth.errors.phoneRequired": "رقم الهاتف مطلوب",
  "auth.errors.phoneInvalid": "رقم الهاتف غير صحيح",
  "auth.errors.passwordRequired": "كلمة المرور مطلوبة",
  "auth.errors.passwordTooShort": "كلمة المرور قصيرة جداً",
  // auditLog — moved from the shadowed auth.auditLog block
  "auditLog.description": "عرض ومراجعة جميع التغييرات والعمليات المنفذة في النظام",
  "auditLog.exportCsv": "تصدير CSV",
  "auditLog.search": "البحث",
  "auditLog.searchPlaceholder": "ابحث عن مستخدم أو مورد...",
  "auditLog.domain": "النطاق",
  "auditLog.domainInventory": "المخزون",
  "auditLog.domainDebts": "الديون",
  "auditLog.domainEmployees": "الموظفون",
  "auditLog.domainProjects": "المشاريع",
  "auditLog.action": "الإجراء",
  "auditLog.loadError": "خطأ في تحميل السجل:",
  "auditLog.noResults": "لا توجد عمليات مطابقة للفلاتر",
  // inventory invoice create — dynamic fallback key
  "inventory.invoiceCreate.invalidAssetPrice": "سعر الأصل غير صالح في السطر {{index}} - الأصل {{assetIndex}}.",
  // validation
  "validation.counterpartyRequired": "اختر الطرف المقابل.",
  "validation.itemsRequired": "أضف عنصرًا واحدًا على الأقل.",
}

// ── helpers ─────────────────────────────────────────────────────────────────
function setPath(obj, dottedKey, value) {
  const parts = dottedKey.split(".")
  let node = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (typeof node[part] !== "object" || node[part] === null) {
      node[part] = {}
    }
    node = node[part]
  }
  node[parts[parts.length - 1]] = value
}

function getPath(obj, dottedKey) {
  let node = obj
  for (const part of dottedKey.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) return undefined
    node = node[part]
  }
  return node
}

function deletePath(obj, dottedKey) {
  const parts = dottedKey.split(".")
  let node = obj
  for (let i = 0; i < parts.length - 1; i++) {
    node = node[parts[i]]
    if (node === null || typeof node !== "object") return
  }
  delete node[parts[parts.length - 1]]
}

// ── serialize matching the file's existing style ────────────────────────────
function serialize(value, indent = 0) {
  const pad = "  ".repeat(indent)
  if (typeof value !== "object" || value === null) {
    return `${pad}${JSON.stringify(value)}`
  }
  const isArray = Array.isArray(value)
  const entries = Object.entries(value)
  if (entries.length === 0) {
    return `${pad}${isArray ? "[]" : "{}"}`
  }
  const lines = [`${pad}${isArray ? "[" : "{"}`]
  for (const [k, v] of entries) {
    const keyLabel = isArray ? "" : `${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k)}: `
    if (typeof v === "object" && v !== null) {
      lines.push(`${pad}  ${keyLabel}${serialize(v, indent + 1).trimStart()},`)
    } else {
      lines.push(`${pad}  ${keyLabel}${JSON.stringify(v)},`)
    }
  }
  lines.push(`${pad}${isArray ? "]" : "}"}`)
  return lines.join("\n")
}

// ── main ────────────────────────────────────────────────────────────────────
function main() {
  const resource = parseResources(resourcesPath)

  // 1. Canonical deletions (collapse duplicates / dead code)
  deletePath(resource, "auth.auditLog") // shadowed block — merged into top-level auditLog
  deletePath(resource, "sections.debts") // collapsed into top-level debts
  deletePath(resource, "debt") // dead top-level block (unused keys)
  deletePath(resource, "auditLog.emptyFiltered") // kept via additions below if needed

  // 2. Fallback promotions from the report (dedupe; majority text wins)
  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const byKey = new Map()
  for (const c of report.fallbackGaps) {
    if (c.fallback === null) continue // template/options fallback — handled manually
    if (!byKey.has(c.key)) byKey.set(c.key, new Map())
    const counts = byKey.get(c.key)
    counts.set(c.fallback, (counts.get(c.fallback) ?? 0) + 1)
  }
  let promoted = 0
  for (const [key, counts] of byKey) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    setPath(resource, key, best)
    promoted++
  }

  // 3. Manual Arabic (missing keys + null-fallback keys)
  for (const [key, value] of Object.entries(MANUAL)) {
    setPath(resource, key, value)
  }

  // 4. auditLog: restore emptyFiltered (removed above accidentally)
  setPath(resource, "auditLog.emptyFiltered", "لا توجد عمليات مطابقة للفلاتر")

  // 5. Serialize and write
  const header = `/**\n * Arabic translations for the application.\n */\nexport const ar = {\n  translation: `
  const out = `${header}${serialize(resource.translation ?? resource, 1).trimStart()},\n} as const\n`
  writeFileSync(resourcesPath, out)
  console.log(`wrote ${resourcesPath}`)
  console.log(`promoted ${promoted} fallback-only keys, added ${Object.keys(MANUAL).length} manual keys`)
}

main()
