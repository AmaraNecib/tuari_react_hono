import type { ExternalCounterpartyCreateInput } from "@tuari/contracts";
import type { OperationsService } from "./operations.service";
import type { WorkforceService } from "./workforce.service";
import type { AuditService } from "./audit.service";
import type { CounterpartyService } from "./counterparty.service";
import type { ExternalCounterpartyListFilters, MutationAuditContext } from "./company.types";

/** Narrow nonfinancial company API for roots that must not construct FinanceService. */
export class CompanyMetadataService {
  constructor(
    private readonly workforce: WorkforceService,
    private readonly operations: OperationsService,
    private readonly audit: AuditService,
    private readonly counterparties: CounterpartyService,
  ) {}

  listRoles() { return this.workforce.listRoles(); }
  listEmployees(...args: Parameters<WorkforceService["listEmployees"]>) { return this.workforce.listEmployees(...args); }
  listProjects(...args: Parameters<OperationsService["listProjects"]>) { return this.operations.listProjects(...args); }
  listWarehouses(...args: Parameters<OperationsService["listWarehouses"]>) { return this.operations.listWarehouses(...args); }
  getWorkspaceMetadata() { return this.audit.getWorkspaceMetadata(); }
  listExternalCounterparties(filters?: ExternalCounterpartyListFilters) { return this.counterparties.listExternalCounterparties(filters); }
  getExternalCounterparty(id: string) { return this.counterparties.getExternalCounterparty(id); }
  createExternalCounterparty(input: ExternalCounterpartyCreateInput, context?: MutationAuditContext) {
    return this.counterparties.createExternalCounterparty(input, context);
  }
}
