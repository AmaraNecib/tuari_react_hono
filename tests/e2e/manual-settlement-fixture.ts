import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { createDatabaseConnection } from "../../apps/api/src/infrastructure/database/factory"
import { createFifoLock } from "../../apps/api/src/infrastructure/database/fifo-lock"
import { SqliteExactFinanceRepository } from "../../apps/api/src/modules/company/adapters/sqlite-exact-finance.repository"
import { ExactFinanceService } from "../../apps/api/src/modules/company/exact-finance.service"
if (process.env.CONNECTED_EXACT_TEST !== "1") throw new Error("Explicit disposable test only")
const [run, command, value] = process.argv.slice(2)
if (!run || !command) throw new Error("Missing fixture arguments")
const db = createDatabaseConnection(join(run, "exact.sqlite"), "")
try {
  if (command === "producer") {
    const finance = new ExactFinanceService(new SqliteExactFinanceRepository(db, createFifoLock()), { id: randomUUID, now: () => new Date().toISOString() })
    console.log(JSON.stringify(finance.forProducer({ type: "PAYROLL_ADVANCE", id: randomUUID() }).postEntry({ requestId: randomUUID(), debtAccountId: value!, entryType: "ADJUSTMENT", signedAmountDzd: "1.00" })))
  } else if (command === "deny") {
    const owner = db.prepare("SELECT user_id AS id FROM app_bootstrap_state WHERE singleton=1").get() as { id: string }
    const id = randomUUID(); const now = new Date().toISOString()
    db.prepare('INSERT INTO user(id,name,"phoneNumber",created_at,updated_at) VALUES (?,?,?,?,?)').run(id,"Other owner",id,now,now)
    db.prepare("UPDATE app_bootstrap_state SET user_id=? WHERE singleton=1").run(id)
    console.log(JSON.stringify(owner))
  } else if (command === "restore") {
    db.prepare("UPDATE app_bootstrap_state SET user_id=? WHERE singleton=1").run(value!)
    console.log("{}")
  } else throw new Error("Unknown fixture operation")
} finally { db.close() }
