/**
 * Persistence boundary for the first-user bootstrap flow (issue #196).
 *
 * `AuthBootstrapService` depends on this narrow port instead of Drizzle /
 * better-sqlite3 directly. All database knowledge (schema, SQL, transactions)
 * lives in an adapter that implements {@link BootstrapPort}.
 */

/** The created first user, as reported back to the service. */
export interface BootstrapUserRecord {
  id: string;
  name: string;
  phone: string;
}

/**
 * Everything the port needs to create the first user.
 *
 * The service has already normalized the name and hashed the password via
 * better-auth — the port only persists.
 */
export interface CreateFirstUserInput {
  /** Trimmed display name. */
  name: string;
  /** Verified phone number. */
  phone: string;
  /** Password hash produced by the auth instance (never the raw password). */
  passwordHash: string;
}

/**
 * Outcome of {@link BootstrapPort.createFirstUser}.
 *
 * "Already configured" and a concurrent bootstrap race are both normal,
 * non-exceptional outcomes (the service answers with a CONFLICT result), so the
 * port models them as a value instead of an exception.
 */
export type CreateFirstUserResult =
  | { status: "created"; user: BootstrapUserRecord }
  | { status: "conflict" };

/**
 * All database operations the bootstrap service needs.
 *
 * Three methods that hide the transaction, the uniqueness-race handling, and
 * the schema behind a single persistence seam.
 */
export interface BootstrapPort {
  /**
   * Atomically create the first user (user + credential account + bootstrap
   * state) inside a write transaction.
   *
   * Returns `conflict` — without inserting anything — when the system is
   * already configured, or when a concurrent bootstrap won the race.
   */
  createFirstUser(input: CreateFirstUserInput): Promise<CreateFirstUserResult>;
  /** Whether any user with a valid phone, or the bootstrap state, exists. */
  hasConfiguredUsers(): Promise<boolean>;
  /** Whether the given user is the bootstrap owner (the first user). */
  isBootstrapOwner(userId: string): Promise<boolean>;
}
