import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRpcFailureStore,
  isFailureLogged,
  logRequestFailure,
  logRpcResponseFailure,
  markFailureLogged,
  readResponseBody,
  recordInterceptedFailure,
  resolveFailureCode,
  resolveFailureMessage,
  runWithRpcFailureStore,
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

  it("includes the encode-failure marker only when set", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logRequestFailure({ method: "POST", path: "/rpc/x", status: 500, message: "boom" });
    logRequestFailure({ method: "POST", path: "/rpc/x", status: 500, message: "boom", encodeFailed: true });

    expect(String(spy.mock.calls[0]?.[0])).not.toContain("encodeFailed");
    expect(String(spy.mock.calls[1]?.[0])).toContain('"encodeFailed":true');
  });
});

describe("failure-log dedupe marker", () => {
  it("is false outside a request store", () => {
    expect(isFailureLogged()).toBe(false);
    // A mark with no active store is a no-op, not a crash.
    expect(() => markFailureLogged()).not.toThrow();
  });

  it("is false until the request is marked, and scoped to that request", () => {
    const first = createRpcFailureStore();
    const second = createRpcFailureStore();

    runWithRpcFailureStore(first, () => {
      expect(isFailureLogged()).toBe(false);
      markFailureLogged();
      expect(isFailureLogged()).toBe(true);
    });

    // A sibling request's store is untouched.
    runWithRpcFailureStore(second, () => {
      expect(isFailureLogged()).toBe(false);
    });
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

  it("returns undefined for a response with no content-type", async () => {
    expect(await readResponseBody(new Response(null, { status: 400 }))).toBeUndefined();
  });

  it("returns undefined for an unparseable JSON response", async () => {
    const response = new Response("{not json", { headers: { "content-type": "application/json" } });
    expect(await readResponseBody(response)).toBeUndefined();
  });
});

describe("recordInterceptedFailure classification", () => {
  it("flags an encode failure and clears the flag for a malformed request", () => {
    const store = createRpcFailureStore();

    runWithRpcFailureStore(store, () => {
      // Malformed body: the client's fault, no marker.
      recordInterceptedFailure(new SyntaxError("Unexpected token"));
      expect(store.encodeFailed).toBe(false);

      // The server failing to prepare its own response: flagged.
      recordInterceptedFailure(new TypeError("Converting circular structure to JSON"));
      expect(store.encodeFailed).toBe(true);
    });
  });

  it("is a no-op outside a request store", () => {
    expect(() => recordInterceptedFailure(new Error("boom"))).not.toThrow();
  });
});

describe("logRpcResponseFailure", () => {
  it("marks an encode failure and never logs a malformed 400 as one", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const decodeStore = createRpcFailureStore();
    decodeStore.encodeFailed = false;
    await logRpcResponseFailure(
      decodeStore,
      "POST",
      "/rpc/x",
      Response.json({ json: { code: "BAD_REQUEST", message: "Malformed request." } }, { status: 400 }),
    );

    const encodeStore = createRpcFailureStore();
    encodeStore.encodeFailed = true;
    await logRpcResponseFailure(
      encodeStore,
      "POST",
      "/rpc/x",
      Response.json({ json: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } }, { status: 500 }),
    );

    const decodeLine = String(spy.mock.calls[0]?.[0]);
    const encodeLine = String(spy.mock.calls[1]?.[0]);
    expect(decodeLine).toContain('"status":400');
    expect(decodeLine).not.toContain("encodeFailed");
    expect(encodeLine).toContain('"status":500');
    expect(encodeLine).toContain('"encodeFailed":true');
  });

  it("skips a response the client interceptor already logged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createRpcFailureStore();
    store.logged = true;

    await logRpcResponseFailure(store, "POST", "/rpc/x", Response.json({}, { status: 500 }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls back to the mapped status when the body carries no message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await logRpcResponseFailure(
      createRpcFailureStore(),
      "POST",
      "/rpc/x",
      Response.json({ json: { code: "BAD_REQUEST" } }, { status: 400 }),
    );

    expect(String(spy.mock.calls[0]?.[0])).toContain("HTTP 400");
  });
});

describe("an encode failure end to end through both helpers", () => {
  it("classifies the server error and emits one 500 line flagged encodeFailed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createRpcFailureStore();

    // What the request interceptor sees when `codec.encode` throws: the raw
    // serializer error (here the stack overflow a circular output would cause).
    runWithRpcFailureStore(store, () => {
      recordInterceptedFailure(new RangeError("Maximum call stack size exceeded"));
    });

    await logRpcResponseFailure(
      store,
      "POST",
      "/rpc/x",
      Response.json(
        { json: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
        { status: 500 },
      ),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain('"status":500');
    expect(line).toContain('"encodeFailed":true');
  });
});
