import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { RecordPageFrame } from "@/features/shared/record-page-frame"

type ActivationPageProps = {
  title: string
  description: string
  keyLabel: string
  keyPlaceholder: string
  activateLabel: string
  activatingLabel: string
  successMessage: string | null
  errorMessage: string | null
  onActivate: (key: string) => Promise<void>
}

/**
 * License activation page where the user enters a license key and activates it.
 *
 * @description Component
 */
export function ActivationPage({
  title,
  description,
  keyLabel,
  keyPlaceholder,
  activateLabel,
  activatingLabel,
  successMessage,
  errorMessage,
  onActivate,
}: ActivationPageProps) {
  const { t } = useTranslation()
  const [key, setKey] = useState("")
  const [isActivating, setIsActivating] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedKey = key.trim()
    if (!trimmedKey) {
      setFieldError(t("license.keyRequired", "يرجى إدخال مفتاح الترخيص."))
      return
    }

    setFieldError(null)
    setIsActivating(true)

    try {
      await onActivate(trimmedKey)
      setKey("")
    } catch (error) {
      // Error is handled by parent via errorMessage prop
    } finally {
      setIsActivating(false)
    }
  }

  const displayError = fieldError || errorMessage

  return (
    <RecordPageFrame title={title}>
      <div className="p-5 border border-line rounded-xl">
        {successMessage ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-success/10 p-4 text-success">
              <svg
                className="h-5 w-5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
              <p className="text-sm font-medium">{successMessage}</p>
            </div>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>

            <Field
              label={keyLabel}
              error={displayError ?? undefined}
            >
              <Input
                dir="ltr"
                placeholder={keyPlaceholder}
                value={key}
                onChange={(event) => {
                  setKey(event.target.value)
                  if (fieldError) setFieldError(null)
                }}
              />
            </Field>

            {displayError && !fieldError && (
              <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-4 text-destructive">
                <svg
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
                <p className="text-sm font-medium">{displayError}</p>
              </div>
            )}

            <div className="flex justify-start" dir="rtl">
              <Button disabled={isActivating} type="submit">
                {isActivating ? activatingLabel : activateLabel}
              </Button>
            </div>
          </form>
        )}
      </div>
    </RecordPageFrame>
  )
}

export default ActivationPage
