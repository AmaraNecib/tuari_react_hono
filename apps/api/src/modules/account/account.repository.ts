import type { PrismaClient, PrismaTransactionClient } from "@prisma/client"

export type AccountProfileRecord = {
  id: string
  name: string | null
  phone: string
}

export type AccountRepositoryTransaction = {
  createProfileHistory(input: {
    actorLabel: string | null
    actorUserId: string
    createdAt: Date
    id: string
    name: string | null
    phone: string
    transactionId: string
    updatedAt: Date
    userId: string
  }): Promise<void>
  findCredentialPasswordByUserId(userId: string): Promise<string | null>
  findUserIdByPhoneNumber(phone: string): Promise<string | null>
  updateUserProfile(input: {
    id: string
    name?: string
    phone?: string
    updatedAt: Date
  }): Promise<AccountProfileRecord>
}

export type AccountRepository = {
  withTransaction<T>(run: (transaction: AccountRepositoryTransaction) => Promise<T>): Promise<T>
}

class PrismaAccountRepositoryTransaction implements AccountRepositoryTransaction {
  constructor(private readonly prisma: PrismaTransactionClient) {}

  async createProfileHistory(input: {
    actorLabel: string | null
    actorUserId: string
    createdAt: Date
    id: string
    name: string | null
    phone: string
    transactionId: string
    updatedAt: Date
    userId: string
  }) {
    await this.prisma.userProfileHistory.create({
      data: input,
    })
  }

  async findCredentialPasswordByUserId(userId: string) {
    const account = await this.prisma.account.findFirst({
      where: {
        userId,
        providerId: "credential",
      },
      select: { password: true },
    })

    return account?.password ?? null
  }

  async findUserIdByPhoneNumber(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: phone },
      select: { id: true },
    })

    return user?.id ?? null
  }

  async updateUserProfile(input: {
    id: string
    name?: string
    phone?: string
    updatedAt: Date
  }) {
    const user = await this.prisma.user.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phoneNumber: input.phone, phoneNumberVerified: true } : {}),
        updatedAt: input.updatedAt,
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
      },
    })

    return {
      id: user.id,
      name: user.name,
      phone: user.phoneNumber,
    }
  }
}

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  withTransaction<T>(run: (transaction: AccountRepositoryTransaction) => Promise<T>) {
    return this.prisma.$transaction((tx) => run(new PrismaAccountRepositoryTransaction(tx)))
  }
}
