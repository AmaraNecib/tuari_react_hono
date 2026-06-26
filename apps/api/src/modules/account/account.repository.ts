import { eq, and } from "drizzle-orm";
import type { AppDrizzle } from "../../infrastructure/database/drizzle";
import { account, user, userProfileHistory } from "../../schema";

/** Represents a user's profile record (id, name, phone). */
export type AccountProfileRecord = {
  id: string;
  name: string | null;
  phone: string;
};

/** Transaction-scoped operations for account data mutations. */
export type AccountRepositoryTransaction = {
  createProfileHistory(input: {
    actorLabel: string | null;
    actorUserId: string;
    createdAt: Date;
    id: string;
    name: string | null;
    passwordChanged?: number;
    phone: string | null;
    previousName: string | null;
    previousPhone: string | null;
    transactionId: string;
    updatedAt: Date;
    userId: string;
  }): Promise<void>;
  findCredentialPasswordByUserId(userId: string): Promise<string | null>;
  findUserIdByPhoneNumber(phone: string): Promise<string | null>;
  updateUserProfile(input: {
    id: string;
    name?: string;
    phone?: string;
    updatedAt: Date;
  }): Promise<AccountProfileRecord>;
};

/** Repository interface for account data access with transaction support. */
export type AccountRepository = {
  withTransaction<T>(run: (transaction: AccountRepositoryTransaction) => Promise<T>): Promise<T>;
};

class DrizzleAccountRepositoryTransaction implements AccountRepositoryTransaction {
  constructor(private readonly tx: AppDrizzle) {}

  /** Record a user profile change in the audit trail. */
  async createProfileHistory(input: {
    actorLabel: string | null;
    actorUserId: string;
    createdAt: Date;
    id: string;
    name: string | null;
    passwordChanged?: number;
    phone: string | null;
    previousName: string | null;
    previousPhone: string | null;
    transactionId: string;
    updatedAt: Date;
    userId: string;
  }) {
    await this.tx.insert(userProfileHistory).values({
      id: input.id,
      userId: input.userId,
      name: input.name,
      phone: input.phone,
      previousName: input.previousName,
      previousPhone: input.previousPhone,
      passwordChanged: (input.passwordChanged ?? false) ? 1 : 0,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      transactionId: input.transactionId,
      createdAt: input.createdAt.toISOString(),
      updatedAt: input.updatedAt.toISOString(),
    });
  }

  /** Look up the hashed password for a credential-type account. */
  async findCredentialPasswordByUserId(userId: string) {
    const rows = await this.tx
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .limit(1);

    return rows[0]?.password ?? null;
  }

  /** Find a user ID by their phone number. */
  async findUserIdByPhoneNumber(phone: string) {
    const rows = await this.tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.phoneNumber, phone))
      .limit(1);

    return rows[0]?.id ?? null;
  }

  /** Update a user's name and/or phone number. */
  async updateUserProfile(input: {
    id: string;
    name?: string;
    phone?: string;
    updatedAt: Date;
  }) {
    const updateData: Record<string, unknown> = {
      updatedAt: input.updatedAt.toISOString(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.phone !== undefined) {
      updateData.phoneNumber = input.phone;
      updateData.phoneNumberVerified = 1;
    }

    await this.tx
      .update(user)
      .set(updateData)
      .where(eq(user.id, input.id));

    const rows = await this.tx
      .select({
        id: user.id,
        name: user.name,
        phone: user.phoneNumber,
      })
      .from(user)
      .where(eq(user.id, input.id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new Error(`User not found: ${input.id}`);
    }

    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
    };
  }
}

/**
 * Drizzle-based implementation of AccountRepository.
 * Uses Drizzle ORM for type-safe queries against the user/account tables.
 */
/** Drizzle-based account repository — handles user profile and credential queries. */
export class DrizzleAccountRepository implements AccountRepository {
  constructor(private readonly db: AppDrizzle) {}

  withTransaction<T>(run: (transaction: AccountRepositoryTransaction) => Promise<T>) {
    return this.db.transaction(async (tx) => {
      const repoTx = new DrizzleAccountRepositoryTransaction(tx as unknown as AppDrizzle);
      return run(repoTx);
    });
  }
}
