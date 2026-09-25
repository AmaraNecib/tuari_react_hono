import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, TEST_PASSWORD, TEST_PHONE } from "./helpers/session"
import { apiBaseUrl, webBaseUrl } from "./helpers/urls"

test.describe.configure({ mode: "serial" })

const API_URL = apiBaseUrl()
const WEB_ORIGIN = webBaseUrl()

/**
 * Security batch regression (#283):
 * 1. Phone+password sign-in must still work after the placeholder OTP
 *    `sendOTP` callback was removed (no OTP delivery, nothing logged).
 * 2. Authenticated RPC calls carrying a spoofed X-Forwarded-For header must
 *    still succeed — the rate-limit key now uses the socket address when
 *    `API_TRUST_PROXY_HEADERS` is unset (default), so spoofing the header
 *    neither breaks requests nor resets the rate budget.
 */
test("phone+password sign-in still works after the OTP placeholder removal", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible()
})

test("authenticated RPC calls with a spoofed X-Forwarded-For header still succeed", async ({
  page,
  request,
}) => {
  // Ensure the bootstrap user exists (idempotent — signs in if already created).
  await bootstrapOrSignIn(page)

  const signIn = await request.post(`${API_URL}/api/auth/sign-in/phone-number`, {
    headers: { origin: WEB_ORIGIN },
    data: { phoneNumber: TEST_PHONE, password: TEST_PASSWORD },
  })
  expect(signIn.status()).toBe(200)

  const setCookie = signIn.headers()["set-cookie"] ?? ""
  const sessionCookie = setCookie.split(",")[0]?.split(";")[0]
  expect(sessionCookie).toContain("=")

  // A client-supplied X-Forwarded-For must be ignored (untrusted by default);
  // the request still succeeds and resolves the real session user.
  const session = await request.post(`${API_URL}/rpc/session`, {
    headers: {
      "content-type": "application/json",
      origin: WEB_ORIGIN,
      cookie: sessionCookie,
      "x-forwarded-for": "203.0.113.99",
    },
    data: { json: null, meta: [] },
  })

  expect(session.status()).toBe(200)
  const body = await session.json()
  expect(body.json?.user?.phone).toBe(TEST_PHONE)
})
