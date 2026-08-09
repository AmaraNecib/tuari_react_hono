import { expect, test, type APIRequestContext } from "@playwright/test"

import { BOOTSTRAP_SETUP_KEY } from "./helpers/session"

const API_URL = "http://127.0.0.1:4318"

/**
 * Drives the authBootstrap ORPC procedure over the wire — the same endpoint
 * the web bootstrap form calls. ORPC envelopes input/output as `{ json }`.
 */
async function callBootstrap(request: APIRequestContext, setupSecret: string) {
  const response = await request.post(`${API_URL}/rpc/authBootstrap`, {
    // The /rpc/* middleware rejects requests without an allowed Origin —
    // mirror the web app's origin exactly as a browser would.
    headers: { Origin: "http://127.0.0.1:3000" },
    data: {
      json: {
        name: "مدير الاختبار",
        phone: "0699999999",
        password: "password123",
        setupSecret,
      },
    },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as {
    json?: {
      success?: boolean
      error?: { code?: string; message?: string }
    }
  }
}

test.describe.configure({ mode: "serial" })

test("bootstrap setup-key gate rejects a wrong key before touching the port", async ({
  request,
}) => {
  const body = await callBootstrap(request, "wrong-setup-key-4f2a9c1e-0000")

  expect(body.json?.success).toBe(false)
  expect(body.json?.error?.code).toBe("UNAUTHORIZED")
  expect(body.json?.error?.message).toBe("رمز الإعداد الأول غير صحيح.")
})

test("bootstrap setup-key gate accepts the configured key", async ({ request }) => {
  const body = await callBootstrap(request, BOOTSTRAP_SETUP_KEY)

  if (body.json?.success === true) {
    // Standalone run on a fresh DB: the first user was created — the gate
    // accepted the configured key and the request proceeded past it.
    return
  }

  // Full-suite run: the DB was already bootstrapped by admin-account.spec,
  // so the gate passed and the port reported the already-configured conflict.
  expect(body.json?.success).toBe(false)
  expect(body.json?.error?.code).toBe("CONFLICT")
})
