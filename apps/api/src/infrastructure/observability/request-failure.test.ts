import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isFailureLogged,
  logRequestFailure,
  markFailureLogged,
  readResponseBody,
  resolveFailureCode,
  resolveFailureMessage,
  unwrapResponseBody,
} from "./request-failure";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logRequestFailure", () => {
  it("emits one structured error line with the route, status and message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logRequestFailure({
      method: "POST",
      path: "/rpc/inventoryInvoiceGroupsCreate",
      status: 400,
      message: "اسم العنصر مستخدم بالفعل.",
      code: "VALIDATION",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain("\"level\":\"ERROR\"");
    expect(line).toContain("/rpc/inventoryInvoiceGroupsCreate");
    expect(line).toContain("\"status\":400");
    expect(line).toContain("اسم العنصر مستخدم بالفعل.");
    expect(line).toContain("VALIDATION");
  });

  it("omits the error code when none was resolved", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logRequestFailure({ method: "GET", path: "/missing", status: 404, message: "not found" });

    expect(String(spy.mock.calls[0]?.[0])).not.toContain("errorCode");
  });
});

describe("failure-log dedupe marker", () => {
  it("is false until the request is marked", () => {
    const context = {};
    expect(isFailureLogged(context)).toBe(false);
    markFailureLogged(context);
    expect(isFailureLogged(context)).toBe(true);
  });
});

describe("resolveFailureMessage / resolveFailureCode", () => {
  it("reads an ORPC error envelope", () => {
    const body = { defined: false, code: "NOT_FOUND", message: "غير موجود" };
    expect(resolveFailureMessage(body)).toBe("غير موجود");
    expect(resolveFailureCode(body)).toBe("NOT_FOUND");
  });

  it("reads an entity failure envelope", () => {
    const body = { success: false, error: { code: "VALIDATION", message: "خطأ" } };
    expect(resolveFailureMessage(body)).toBe("خطأ");
    expect(resolveFailureCode(body)).toBe("VALIDATION");
  });

  it("returns undefined for a non-object body", () => {
    expect(resolveFailureMessage("nope")).toBeUndefined();
    expect(resolveFailureCode(null)).toBeUndefined();
  });
});

describe("unwrapResponseBody", () => {
  it("unwraps the ORPC standard-protocol envelope", () => {
    expect(unwrapResponseBody({ json: { success: false } })).toEqual({ success: false });
  });

  it("leaves a plain body untouched", () => {
    expect(unwrapResponseBody({ message: "Blocked origin." })).toEqual({ message: "Blocked origin." });
  });
});

describe("readResponseBody", () => {
  it("parses a JSON response without consuming it", async () => {
    const response = Response.json({ message: "boom" });
    expect(await readResponseBody(response)).toEqual({ message: "boom" });
    expect(await response.json()).toEqual({ message: "boom" });
  });

  it("returns undefined for a non-JSON response", async () => {
    expect(await readResponseBody(new Response("plain text"))).toBeUndefined();
  });

  it("returns undefined for an unparseable JSON response", async () => {
    const response = new Response("{not json", { headers: { "content-type": "application/json" } });
    expect(await readResponseBody(response)).toBeUndefined();
  });
});
