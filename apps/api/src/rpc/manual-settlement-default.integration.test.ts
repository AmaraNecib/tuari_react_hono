import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createRouterClient } from "@orpc/server";
import type { AppClient } from "@tuari/contracts";
import { createFreshExactAppDependencies } from "../app/fresh-exact-dependencies";
import { createAppConfig } from "../config";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createRpcContext } from "./context";
import { createRouter } from "./router";

it("leaves default startup schema unchanged and all manual endpoints unavailable", async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-613-default-")), "app.sqlite");
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
  const root = await createFreshExactAppDependencies({ databasePath, databaseKey: "" }, config);
  try {
    const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Owner", phone: "0612345678", password: "password123" });
    if (!owner.success) throw new Error("Bootstrap failed");
    const session = await (await root.auth.$context).internalAdapter.createSession(owner.item.id);
    const client = createRouterClient(createRouter(root), { context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), root.sessionService) }) as AppClient;
    const pair = { externalCounterpartyId: "party", payableOriginalEntryId: "p", receivableOriginalEntryId: "r", currency: "DZD" as const, amountDzd: "1.00" };
    await expect(client.financial.manualSettlement.preview(pair)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(client.financial.manualSettlement.history({ externalCounterpartyId: "party" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(client.financial.manualSettlement.confirm({ ...pair, requestId: "confirm", expectedPayableRemainingDzd: "1.00", expectedReceivableRemainingDzd: "1.00" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(client.financial.manualSettlement.reverse({ requestId: "reverse", settlementId: "missing", reason: "Unavailable" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const db = createDatabaseConnection(databasePath, "");
    try {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'manual_debt_settlement%'").all()).toEqual([]);
    } finally { db.close(); }
  } finally { root.close(); }
  await expect(createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config)).rejects.toThrow();
});
