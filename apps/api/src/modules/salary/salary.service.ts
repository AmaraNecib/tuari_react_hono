import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { AppError } from "../shared/app-error";
import type { Worker } from "../workers/worker.entity";
import { PrismaWorkerRepository } from "../workers/prisma-worker.repository";
import type { SalaryTransaction, SalaryTransactionType } from "./salary-transaction.entity";
import { PrismaSalaryTransactionRepository } from "./prisma-salary-transaction.repository";

type RecordSalaryTransactionInput = {
  workerId: string;
  type: SalaryTransactionType;
  amountDzd: number;
  note?: string | null;
  effectiveAt?: string;
};

const toWorkerSalarySnapshot = (worker: Worker) => ({
  id: worker.id,
  salaryDzd: worker.salaryDzd,
});

export class SalaryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly workers: PrismaWorkerRepository,
    private readonly salaryTransactions: PrismaSalaryTransactionRepository,
    private readonly audits: PrismaAuditLogRepository,
  ) {}

  async listByWorkerId(workerId: string): Promise<SalaryTransaction[]> {
    const worker = await this.workers.getById(workerId);

    if (!worker) {
      throw new AppError("NOT_FOUND", "Worker not found.");
    }

    return this.salaryTransactions.listByWorkerId(workerId);
  }

  async record(
    input: RecordSalaryTransactionInput,
    actorUserId: string | null,
  ): Promise<{ worker: Worker; transaction: SalaryTransaction }> {
    const existingWorker = await this.workers.getById(input.workerId);

    if (!existingWorker) {
      throw new AppError("NOT_FOUND", "Worker not found.");
    }

    return this.prisma.$transaction(async (tx) => {
      const workers = this.workers.withClient(tx);
      const salaryTransactions = this.salaryTransactions.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : now;
      const beforeSalaryDzd = existingWorker.salaryDzd;
      const afterSalaryDzd =
        input.type === "SALARY_SET" ? input.amountDzd : existingWorker.salaryDzd;

      const worker =
        afterSalaryDzd !== beforeSalaryDzd
          ? await workers.updateSalary({
              id: existingWorker.id,
              salaryDzd: afterSalaryDzd,
              updatedAt: now,
            })
          : existingWorker;

      const transaction = await salaryTransactions.create({
        id: randomUUID(),
        workerId: existingWorker.id,
        type: input.type,
        amountDzd: input.amountDzd,
        note: input.note ?? null,
        beforeSalaryDzd,
        afterSalaryDzd,
        effectiveAt,
        createdByUserId: actorUserId,
        createdAt: now,
      });

      await audits.create({
        id: randomUUID(),
        entityType: "WORKER",
        entityId: existingWorker.id,
        actionType: "SALARY_CHANGED",
        summaryKey: "audit.worker.salary_recorded",
        actorUserId,
        occurredAt: now,
        before: toWorkerSalarySnapshot(existingWorker),
        after: toWorkerSalarySnapshot(worker),
        metadata: {
          salaryTransactionId: transaction.id,
          transactionType: transaction.type,
          amountDzd: transaction.amountDzd,
          note: transaction.note,
        },
        createdAt: now,
      });

      return {
        worker,
        transaction,
      };
    });
  }
}
