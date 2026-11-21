import { describe, expect, it, vi } from "vitest";
import { CompanyMetadataService } from "./company-metadata.service";
import { CounterpartyService } from "./counterparty.service";

describe("CompanyMetadataService", () => {
  it("serves organizational metadata without numeric finance reads", () => {
    const workforce = { listRoles: vi.fn(() => ({ items: [] })), listEmployees: vi.fn(() => ({ items: [] })) } as never;
    const operations = { listProjects: vi.fn(() => ({ items: [] })), listWarehouses: vi.fn(() => ({ items: [] })) } as never;
    const audit = { getWorkspaceMetadata: vi.fn(() => ({ roles: [], employees: [], externalCounterparties: [], projects: [], warehouses: [] })) } as never;
    const counterparties = { listExternalCounterparties: vi.fn(() => ({ items: [] })), getExternalCounterparty: vi.fn() } as never;
    const service = new CompanyMetadataService(workforce, operations, audit, counterparties);
    const result = service.getWorkspaceMetadata();
    expect(service.listRoles()).toEqual({ items: [] });
    expect(result).not.toHaveProperty("debtAccounts");
    expect(result).not.toHaveProperty("debtEntries");
    expect(result).not.toHaveProperty("salaryPayments");
  });

  it("preserves organizational filters and the delegated results", () => {
    const employees = { items: [{ id: "employee-filtered" }] };
    const projects = { items: [{ id: "project-filtered" }] };
    const warehouses = { items: [{ id: "warehouse-filtered" }] };
    const workforce = { listEmployees: vi.fn(() => employees) };
    const operations = { listProjects: vi.fn(() => projects), listWarehouses: vi.fn(() => warehouses) };
    const service = new CompanyMetadataService(workforce as never, operations as never, {} as never, {} as never);
    const filters = { status: "ACTIVE" as const };
    expect(service.listEmployees(filters)).toBe(employees);
    expect(service.listProjects(filters)).toBe(projects);
    expect(service.listWarehouses(filters)).toBe(warehouses);
    expect(workforce.listEmployees).toHaveBeenCalledWith(filters);
    expect(operations.listProjects).toHaveBeenCalledWith(filters);
    expect(operations.listWarehouses).toHaveBeenCalledWith(filters);
  });

  it("delegates counterparty CRUD through the shared mutation context", () => {
    const item = { id: "cp1", fullName: "Vendor", phoneNumber: "123", note: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    const repository = { listExternalCounterparties: vi.fn(() => [item]), getExternalCounterpartyById: vi.fn(() => item), createExternalCounterparty: vi.fn(() => item) };
    const mutation = { createMutationAuditContext: vi.fn(), withTransaction: (fn: () => unknown) => fn() };
    const counterparties = new CounterpartyService(repository, mutation as never);
    const service = new CompanyMetadataService({} as never, {} as never, {} as never, counterparties);
    expect(service.listExternalCounterparties().items).toEqual([item]);
    expect(service.getExternalCounterparty("cp1").item).toEqual(item);
    expect(service.createExternalCounterparty({ fullName: " Vendor ", phoneNumber: " 123 ", note: "  " }, { actorUserId: "owner" })).toMatchObject({ item });
    expect(repository.createExternalCounterparty).toHaveBeenCalledWith({ fullName: "Vendor", phoneNumber: "123", note: null });
    expect(mutation.createMutationAuditContext).toHaveBeenCalledWith({ actorUserId: "owner" });
  });
});
