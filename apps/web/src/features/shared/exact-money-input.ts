import { Money } from "@tuari/contracts"

/** Normalize supported entry notation only at submit. Draft input stays untouched. */
export function parseLocalizedMoneyInput(value: string): Money {
  if (typeof value !== "string" || value.length > 128) throw new TypeError("Invalid monetary input")
  const digits = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹"
  const ascii = value.trim().replace(/[٠-٩۰-۹]/g, digit => String(digits.indexOf(digit) % 10))
  const match = /^(-?)([\d,٬ \u00a0\u202f]*)(?:[.٫](\d*))?$/.exec(ascii)
  if (!match || (!match[2] && !match[3])) throw new TypeError("Expected a decimal monetary amount")
  let whole = match[2] || "0"
  const separators = new Set(whole.match(/[,٬ \u00a0\u202f]/g))
  if (separators.size > 1) throw new TypeError("Mixed grouping separators are ambiguous")
  if (separators.size) {
    const separator = [...separators][0]!
    const groups = whole.split(separator)
    if (!/^\d{1,3}$/.test(groups[0]!) || groups.slice(1).some(group => !/^\d{3}$/.test(group))) {
      throw new TypeError("Invalid monetary grouping")
    }
    whole = groups.join("")
  }
  whole = whole.replace(/^0+(?=\d)/, "")
  const fraction = match[3] ? `.${match[3]}` : ""
  return Money.parse(`${match[1]}${whole}${fraction}`)
}
