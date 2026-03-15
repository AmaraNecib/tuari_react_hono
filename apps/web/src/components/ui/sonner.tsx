import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useAppPreferences } from "@/features/preferences/preferences"

export function Toaster(props: ToasterProps) {
  const { locale, theme } = useAppPreferences()

  return (
    <Sonner
      closeButton={false}
      dir={locale === "ar" ? "rtl" : "ltr"}
      expand
      gap={10}
      offset={{ right: 20, bottom: 20 }}
      position="bottom-right"
      richColors
      theme={theme}
      toastOptions={{
        classNames: {
          toast:
            "!w-[360px] !rounded-[24px] !border !border-border/70 !bg-card/95 !p-4 !shadow-[0_18px_50px_rgba(15,23,42,0.16)] !backdrop-blur-xl !cursor-pointer dark:!border-white/10 dark:!bg-card/92",
          title: "!text-sm !font-medium !leading-6 !text-foreground",
          description: "!text-sm !leading-6 !text-muted-foreground",
          success: "!border-emerald-500/25",
          error: "!border-destructive/25",
          closeButton: "!hidden",
        },
      }}
      visibleToasts={4}
      {...props}
    />
  )
}
