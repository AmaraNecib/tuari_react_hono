import type { Prisma } from "@prisma/client";

import type { DatabaseClient } from "../shared/database-client";
import type { SalaryTransaction, SalaryTransactionType } from "./salary-transaction.entity";
import type {
  SalaryTransactionRepository,
  SalaryTransactionWriteInput,
} from "./salary-transaction.repository";

const salaryTransactionInclude = {
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.SalaryTransactionInclude;

type SalaryTransactionRow = Prisma.SalaryTransactionGetPayload<{
  include: typeof salaryTransactionInclude;
}>;

const toSalaryTransaction = (row: SalaryTransactionRow): SalaryTransaction => ({
  id: row.id,
  workerId: row.workerId,
  type: row.type as SalaryTransactionType,
  amountDzd: row.amountDzd,
  note: row.note,
  beforeSalaryDzd: row.beforeSalaryDzd,
  afterSalaryDzd: row.afterSalaryDzd,
  effectiveAt: row.effectiveAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  createdByUser: row.createdByUser
    ? {
        id: row.createdByUser.id,
        name: row.createdByUser.name,
        email: row.createdByUser.email,
      }
    : null,
});

export class PrismaSalaryTransactionRepository
  implements SalaryTransactionRepository
{
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaSalaryTransactionRepository {
    return new PrismaSalaryTransactionRepository(db);
  }

  async listByWorkerId(workerId: string): Promise<SalaryTransaction[]> {
    const rows = await this.db.salaryTransaction.findMany({
      where: { workerId },
      include: salaryTransactionInclude,
      orderBy: [
        { effectiveAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    return rows.map(toSalaryTransaction);
  }

  async create(input: SalaryTransactionWriteInput): Promise<SalaryTransaction> {
    const row = await this.db.salaryTransaction.create({
      data: {
        id: input.id,
        workerId: input.workerId,
        type: input.type,
        amountDzd: input.amountDzd,
        note: input.note,
        beforeSalaryDzd: input.beforeSalaryDzd,
        afterSalaryDzd: input.afterSalaryDzd,
        effectiveAt: input.effectiveAt,
        createdByUserId: input.createdByUserId,
        createdAt: input.createdAt,
      },
      include: salaryTransactionInclude,
    });

    return toSalaryTransaction(row);
  }
}
