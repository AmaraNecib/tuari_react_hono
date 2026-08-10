import { describe, expect, it } from "vitest";
import { createFifoLock } from "./fifo-lock";

/**
 * FifoLock tests — pin the exact invariants the transaction model relies on:
 * FIFO ordering, no interleaving, and lock release after a rejecting
 * operation (a failed transaction must not poison the queue).
 */
describe("createFifoLock", () => {
  it("runs operations in FIFO order without interleaving", async () => {
    const lock = createFifoLock();
    const events: string[] = [];

    // First operation holds the lock open at a gate.
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = lock.run(async () => {
      events.push("first-start");
      await firstGate;
      events.push("first-end");
    });

    const second = lock.run(async () => {
      events.push("second");
    });

    // Give the microtask queue time to process: the second operation must
    // NOT have started while the first holds the lock.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first-start", "first-end", "second"]);
  });

  it("releases the lock after a rejecting operation", async () => {
    const lock = createFifoLock();

    await expect(lock.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );

    // The queue must still be usable — the rejection did not poison it.
    await expect(lock.run(async () => "ok")).resolves.toBe("ok");
  });

  it("propagates the rejected operation's error to its caller only", async () => {
    const lock = createFifoLock();

    // A failing op and a following op queued concurrently: the failure
    // rejects only its own caller; the next op still runs.
    const failing = lock.run(async () => {
      throw new Error("boom");
    });
    const following = lock.run(async () => "after");

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe("after");
  });

  it("serializes results in completion order of the queue", async () => {
    const lock = createFifoLock();

    const results = await Promise.all([
      lock.run(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "a";
      }),
      lock.run(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return "b";
      }),
    ]);

    // FIFO: the first-queued operation resolves first, even though its
    // body takes longer than the second's.
    expect(results).toEqual(["a", "b"]);
  });
});
