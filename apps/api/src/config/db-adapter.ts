import { z } from "zod";

/** Supported database adapters: SQLite (production), InMemory (tests/CI). Postgres is future. */
export const dbAdapterSchema = z.enum(["sqlite", "inmemory"]);

export type DbAdapter = z.infer<typeof dbAdapterSchema>;
