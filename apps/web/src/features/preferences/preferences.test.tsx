// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { AppPreferencesProvider, useAppPreferences } from "./preferences"

function PreferenceConsumer() {
  const { locale, theme, toggleLocale, toggleTheme } = useAppPreferences()

  return (
    <>
      <output data-testid="theme">{theme}</output>
      <output data-testid="locale">{locale}</output>
      <button onClick={toggleTheme} type="button">
        Toggle theme
      </button>
      <button onClick={toggleLocale} type="button">
        Toggle locale
      </button>
    </>
  )
}

describe("AppPreferencesProvider", () => {
  beforeEach(() => {
    document.documentElement.className = ""
    document.documentElement.lang = "en"
    document.documentElement.dir = "ltr"
    document.documentElement.dataset.theme = "light"
    document.documentElement.dataset.locale = "en"
    window.localStorage.clear()
  })

  it("hydrates theme and normalizes locale to Arabic", () => {
    render(
      <AppPreferencesProvider>
        <PreferenceConsumer />
      </AppPreferencesProvider>,
    )

    expect(screen.getByTestId("theme").textContent).toBe("light")
    expect(screen.getByTestId("locale").textContent).toBe("ar")
    expect(document.documentElement.dataset.locale).toBe("ar")
    expect(document.documentElement.dir).toBe("rtl")

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }))
    fireEvent.click(screen.getByRole("button", { name: "Toggle locale" }))

    expect(screen.getByTestId("theme").textContent).toBe("dark")
    expect(screen.getByTestId("locale").textContent).toBe("ar")
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(document.documentElement.dataset.locale).toBe("ar")
    expect(document.documentElement.dir).toBe("rtl")
  })

  it("throws when the hook is used outside the provider", () => {
    expect(() => render(<PreferenceConsumer />)).toThrowError(
      "useAppPreferences must be used within an AppPreferencesProvider",
    )
  })
})
