import { Fragment } from "react"
import { CurrencyRun } from "./money-value"

/** Adapts existing generated DZD prose without parsing or reformatting its numbers. */
export function CurrencyProse({ text }: { text: string }) {
  const amounts = /(?<![\p{L}\p{N}.,+−-])[+−-]?[0-9٠-٩]+(?:[.,٬٫\u00a0\u202f][0-9٠-٩]+)*(?:[eE][+-]?[0-9]+)?[ \t]+(د\.ج|دج)(?![\p{L}\p{N}])/gu
  const parts = []
  let offset = 0
  for (const match of text.matchAll(amounts)) {
    parts.push(<Fragment key={`text-${offset}`}>{text.slice(offset, match.index)}</Fragment>)
    const currencyLabel = match[1]!
    const amount = match[0].slice(0, -currencyLabel.length).trimEnd()
    parts.push(<CurrencyRun key={`amount-${match.index}`} amount={amount} currencyLabel={currencyLabel} />)
    offset = match.index + match[0].length
  }
  return <>{parts}{text.slice(offset)}</>
}
