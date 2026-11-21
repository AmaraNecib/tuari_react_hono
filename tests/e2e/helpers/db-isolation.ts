import { restartManagedApi } from "./managed-api"

export const databaseFixturesAvailable = process.env.E2E_API_MANAGED !== "0"

/** Close the owned API before starting a fresh exact database. Never DELETE ledger rows. */
export async function resetE2eDatabase(): Promise<void> {
  await restartManagedApi()
}
