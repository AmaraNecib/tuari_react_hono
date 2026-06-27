import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/form-controls"
import { useCreateExternalCounterpartyMutation } from "@/features/app-shell/mock-dashboard"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"

export function ExternalCounterpartyCreatePage({ onCreated }: { onCreated: (counterpartyId: string) => void }) {
  const { t } = useTranslation()
  const createMutation = useCreateExternalCounterpartyMutation()
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [note, setNote] = useState("")

  return (
    <Surface className="p-6 xl:p-7" variant="panel">
      <SurfaceHeader
        title={t("externals.create.title", "إضافة جهة خارجية")}
        description={t("externals.create.description", "أنشئ الطرف الخارجي أولًا ثم سجّل القيود من صفحته الخاصة. لا يوجد إنشاء inline في هذا الإصدار.")}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{t("externals.create.fullName", "الاسم الكامل")}</span>
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{t("externals.create.phoneNumber", "رقم الهاتف")}</span>
          <Input dir="ltr" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="text-sm font-medium text-foreground">{t("common.note", "ملاحظة")}</span>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>

      <PageFooterActions className="mt-6">
        <Button
          disabled={fullName.trim().length === 0 || phoneNumber.trim().length === 0 || createMutation.isPending}
          onClick={async () => {
            const result = await createMutation.mutateAsync({
              fullName: fullName.trim(),
              note: note.trim() || null,
              phoneNumber: phoneNumber.trim(),
            })

            onCreated(result.item.id)
          }}
        >
          {t("externals.create.save", "حفظ الطرف الخارجي")}
        </Button>
      </PageFooterActions>
    </Surface>
  )
}
