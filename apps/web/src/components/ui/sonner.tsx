import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useAppPreferences } from "@/features/preferences/preferences"

export function Toaster(props: ToasterProps) {
  const { theme } = useAppPreferences()

  return (
    <Sonner
      closeButton
      position="top-center"
      richColors
      theme={theme}
      {...props}
    />
  )
}
