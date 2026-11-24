/**
 * i18n configuration for internationalization.
 */
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { ar } from "./resources/ar"
import { en } from "./resources/en"

/**
 * resources = component.
 */
export const resources = {
  ar,
  en,
} as const

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: "ar",
    fallbackLng: "ar",
    supportedLngs: ["ar", "en"],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  })
}

export { i18n }
