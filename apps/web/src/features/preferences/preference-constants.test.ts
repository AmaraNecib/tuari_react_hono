// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  applyLocale,
  applyTheme,
  bootstrapPreferences,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  getLocaleDirection,
  getNextLocale,
  getNextTheme,
  STORAGE_KEYS,
} from "./preference-constants";

describe("preference constants", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.lang = "";
    document.documentElement.dir = "";
    document.documentElement.dataset.theme = "";
    document.documentElement.dataset.locale = "";
    window.localStorage.clear();
  });

  it("toggles between supported themes and locales", () => {
    expect(getNextTheme("light")).toBe("dark");
    expect(getNextTheme("dark")).toBe("light");
    expect(getNextLocale("en")).toBe("ar");
    expect(getNextLocale("ar")).toBe("en");
    expect(getLocaleDirection("en")).toBe("ltr");
    expect(getLocaleDirection("ar")).toBe("rtl");
  });

  it("persists theme and locale changes on the root element", () => {
    applyTheme("dark");
    applyLocale("ar");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.dataset.locale).toBe("ar");
    expect(window.localStorage.getItem(STORAGE_KEYS.theme)).toBe("dark");
    expect(window.localStorage.getItem(STORAGE_KEYS.locale)).toBe("ar");
  });

  it("bootstraps saved preferences and falls back to defaults", () => {
    bootstrapPreferences();

    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
    expect(document.documentElement.dataset.locale).toBe(DEFAULT_LOCALE);

    window.localStorage.setItem(STORAGE_KEYS.theme, "dark");
    window.localStorage.setItem(STORAGE_KEYS.locale, "ar");

    bootstrapPreferences();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.locale).toBe("ar");
  });
});
