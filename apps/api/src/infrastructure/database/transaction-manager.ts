import { AsyncLocalStorage } from "node:async_hooks";

import type { Prisma, PrismaClient } from "@prisma/client";

const transactionStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

export type DatabaseClient = Prisma.TransactionClient | PrismaClient;

export interface TransactionManager {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export function resolveDatabaseClient(prisma: PrismaClient): DatabaseClient {
  return transactionStorage.getStore() ?? prisma;
}

export class PrismaTransactionManager implements TransactionManager {
  constructor(private readonly prisma: PrismaClient) {}

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const existingTransaction = transactionStorage.getStore();

    if (existingTransaction) {
      return work();
    }

    return this.prisma.$transaction((transaction) =>
      transactionStorage.run(transaction, work),
    );
  }
}
