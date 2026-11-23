import type { ExternalCounterpartyCreateInput } from "@tuari/contracts";
import { CompanyError } from "./company.errors";
import { normalizeText, successResult } from "./company.helpers";
import type { FinanceRepository } from "./finance.repository";
import type { MutationAuditContext, ExternalCounterpartyListFilters } from "./company.types";
import { WorkspaceMutationContext } from "./workspace-mutation-context";

/** Nonfinancial CRUD for external organization metadata. */
export class CounterpartyService {
  constructor(
    private readonly repository: Pick<FinanceRepository, "listExternalCounterparties" | "getExternalCounterpartyById" | "createExternalCounterparty">,
    private readonly mutation: WorkspaceMutationContext,
  ) {}

  listExternalCounterparties(filters?: ExternalCounterpartyListFilters) {
    return { items: this.repository.listExternalCounterparties(filters) };
  }

  getExternalCounterparty(id: string) {
    const item = this.repository.getExternalCounterpartyById(id);
    if (!item) throw new CompanyError("NOT_FOUND", "تعذر العثور على الطرف الخارجي المطلوب.");
    return successResult("تم تحميل الطرف الخارجي بنجاح.", item);
  }

  createExternalCounterparty(input: ExternalCounterpartyCreateInput, auditContext?: MutationAuditContext) {
    this.mutation.createMutationAuditContext(auditContext);
    return this.mutation.withTransaction(() => {
      const item = this.repository.createExternalCounterparty({
        fullName: input.fullName.trim(),
        phoneNumber: input.phoneNumber.trim(),
        note: normalizeText(input.note),
      });
      return successResult("تم إنشاء الطرف الخارجي بنجاح.", item);
    });
  }
}
