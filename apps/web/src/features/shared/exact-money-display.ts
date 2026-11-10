import { Money } from "@tuari/contracts"

/** Wide report totals are display-only strings, never accepted as persisted Money. */
export function formatExactMoney(value: string, options: { aggregate?: boolean; grouped?: boolean; signed?: boolean } = {}): { text: string; zero: boolean } {
  let wire: string
  if (options.aggregate) {
    if (typeof value !== "string" || value.length > 256 || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
      throw new TypeError("Expected a bounded canonical exact report total")
    }
    wire = value === "-0.00" ? "0.00" : value
  } else {
    wire = Money.parse(value).toWire()
  }
  const zero = wire === "0.00"
  const [whole = "", cents = ""] = wire.split(".")
  const fraction = cents.replace(/0+$/, "")
  const grouped = options.grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole
  return { text: `${options.signed && !wire.startsWith("-") ? "+" : ""}${grouped}${fraction ? `.${fraction}` : ""}`, zero }
}
