import { describe, expect, it } from "vitest"
import { createInstance } from "i18next"
import { resources } from "./index"

describe("diagnostics translations", () => {
  it("resolves English and Arabic diagnostics without raw keys", async () => {
    const instance = createInstance()
    await instance.init({ resources, lng: "en", fallbackLng: "ar", supportedLngs: ["en", "ar"] })
    expect(instance.t("settings.diagnostics.saveBundle")).toBe("Save support bundle")
    expect(instance.dir()).toBe("ltr")
    await instance.changeLanguage("ar")
    expect(instance.t("settings.diagnostics.saveBundle")).toBe("حفظ حزمة الدعم")
    expect(instance.dir()).toBe("rtl")
  })
})
