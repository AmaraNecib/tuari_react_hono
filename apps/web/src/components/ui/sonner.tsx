import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useAppPreferences } from "@/features/preferences/preferences"

/** Toast notification container. */
export function Toaster(props: ToasterProps) {
  const { locale, theme } = useAppPreferences()

  return (
    <Sonner
      closeButton={false}
      dir={locale === "ar" ? "rtl" : "ltr"}
      expand={false}
      gap={12}
      offset={{ right: 20, bottom: 20 }}
      position="bottom-right"
      richColors
      theme={theme}
      toastOptions={{
        classNames: {
          toast:
            "!w-[min(340px,calc(100vw-32px))] !max-w-[calc(100vw-32px)] !rounded-lg !border !border-border/60 !bg-card/96 !px-4 !py-3.5 !shadow-[0_22px_44px_rgba(15,23,42,0.22)] !backdrop-blur-2xl !cursor-pointer dark:!border-white/8 dark:!bg-card/94",
          title: "!text-sm !font-semibold !leading-6 !text-foreground",
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
