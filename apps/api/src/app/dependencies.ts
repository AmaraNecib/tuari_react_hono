import { auth } from "../infrastructure/auth/auth";
import { prisma } from "../infrastructure/database/prisma";
import { PrismaAuditLogRepository } from "../modules/audit/prisma-audit-log.repository";
import { AuditLogService } from "../modules/audit/audit-log.service";
import { PrismaProjectRepository } from "../modules/projects/prisma-project.repository";
import { ProjectService } from "../modules/projects/project.service";
import { PrismaSalaryTransactionRepository } from "../modules/salary/prisma-salary-transaction.repository";
import { SalaryService } from "../modules/salary/salary.service";
import { SessionService } from "../modules/session/session.service";
import { PrismaWarehouseRepository } from "../modules/warehouses/prisma-warehouse.repository";
import { WarehouseService } from "../modules/warehouses/warehouse.service";
import { PrismaWorkerRepository } from "../modules/workers/prisma-worker.repository";
import { WorkerService } from "../modules/workers/worker.service";

const workerRepository = new PrismaWorkerRepository(prisma);
const projectRepository = new PrismaProjectRepository(prisma);
const warehouseRepository = new PrismaWarehouseRepository(prisma);
const auditLogRepository = new PrismaAuditLogRepository(prisma);
const salaryTransactionRepository = new PrismaSalaryTransactionRepository(prisma);

export const appDependencies = {
  auth,
  sessionService: new SessionService(auth),
  auditLogService: new AuditLogService(auditLogRepository),
  workerService: new WorkerService(
    prisma,
    workerRepository,
    projectRepository,
    auditLogRepository,
  ),
  projectService: new ProjectService(
    prisma,
    projectRepository,
    workerRepository,
    auditLogRepository,
  ),
  warehouseService: new WarehouseService(
    prisma,
    warehouseRepository,
    workerRepository,
    projectRepository,
    auditLogRepository,
  ),
  salaryService: new SalaryService(
    prisma,
    workerRepository,
    salaryTransactionRepository,
    auditLogRepository,
  ),
} as const;

export type AppDependencies = typeof appDependencies;
