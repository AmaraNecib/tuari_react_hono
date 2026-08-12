import { describe, expect, it } from "vitest";
import {
  createFifoLock,
  FifoLockBusyError,
  FifoLockTimeoutError,
} from "./fifo-lock";

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

  it("throws loudly on reentrant run instead of deadlocking", async () => {
    const lock = createFifoLock();

    // A nested run called while an operation is executing would await a
    // tail that can only resolve after the outer operation finishes — a
    // permanent hang. The lock must throw immediately instead.
    await lock.run(async () => {
      expect(() => lock.run(async () => "nested")).toThrow(/not reentrant/);
    });

    // The queue is still usable after the guarded call.
    await expect(lock.run(async () => "after")).resolves.toBe("after");
  });

  it("keeps the queue alive when an operation throws synchronously", async () => {
    const lock = createFifoLock();

    // A synchronous throw (how raw better-sqlite3 failures surface) is
    // converted to a rejection and must not poison the queue.
    const failing = lock.run(() => {
      throw new Error("sync boom");
    });
    const following = lock.run(async () => "after");

    await expect(failing).rejects.toThrow("sync boom");
    await expect(following).resolves.toBe("after");
  });

  it("does not flag independent lock instances as reentrant", async () => {
    const a = createFifoLock();
    const b = createFifoLock();

    // The reentrancy guard is per-lock: a nested run on a DIFFERENT lock
    // can never deadlock this one (it chains its own tail), so it must be
    // allowed.
    const result = await a.run(async () => b.run(async () => "nested-other"));
    expect(result).toBe("nested-other");
  });

  it("runSync executes immediately when the lock is free", () => {
    const lock = createFifoLock();

    // A synchronous writer runs its own transaction directly when no
    // async flow holds the connection.
    expect(lock.runSync(() => 42)).toBe(42);
  });

  it("runSync executes directly when called inside a run (own-run join)", async () => {
    const lock = createFifoLock();

    // A sync writer reached from inside a locked async flow deliberately
    // joins that flow's open transaction (join-outer pattern). It must NOT
    // be treated as a foreign writer.
    const result = await lock.run(async () => lock.runSync(() => "joined"));
    expect(result).toBe("joined");
  });

  it("runSync still joins our own run across an await hop", async () => {
    const lock = createFifoLock();

    // The production join-outer flows (payment/invoice runInTransaction
    // → recordInvoicePayment) reach the sync writer AFTER an await inside
    // the run — the exact hop where AsyncLocalStorage propagation could
    // regress. The own-run detection must survive a real yield.
    const result = await lock.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return lock.runSync(() => "joined-after-yield");
    });
    expect(result).toBe("joined-after-yield");
  });

  it("runSync throws FifoLockBusyError when another operation holds the lock", async () => {
    const lock = createFifoLock();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A foreign async flow holds the connection open (like an async
    // transaction awaiting bcrypt). A sync writer must not silently join it.
    const holder = lock.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The busy failure is a distinct, catchable type — not an opaque Error.
    expect(() => lock.runSync(() => "should-not-run")).toThrow(FifoLockBusyError);

    release();
    await holder;

    // The queue is still usable once the holder settles.
    expect(lock.runSync(() => "after")).toBe("after");
  });

  it("runSync runs ahead of a queued-but-unstarted run (documented precedence inversion)", async () => {
    const lock = createFifoLock();
    let started = false;

    // A queued async run has NOT started yet (activeCount === 0), so the
    // sync writer executes immediately instead of queueing behind it — no
    // transaction is open to join. Pins the accepted precedence inversion.
    const queued = lock.run(async () => {
      started = true;
      return "tx";
    });
    expect(lock.runSync(() => "sync-first")).toBe("sync-first");
    await queued;
    expect(started).toBe(true);
  });

  it("runSync on an independent lock is not blocked by another lock's run", async () => {
    const a = createFifoLock();
    const b = createFifoLock();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const holder = a.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The busy-check is per-lock: an unrelated lock's sync section is safe.
    expect(b.runSync(() => "ok")).toBe("ok");

    release();
    await holder;
  });

  it("runSync keeps the queue alive after throwing", async () => {
    const lock = createFifoLock();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const holder = lock.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(() => lock.runSync(() => "x")).toThrow(FifoLockBusyError);
    release();
    await holder;

    await expect(lock.run(async () => "after")).resolves.toBe("after");
  });

  it("bounds the wait for a queued operation when timeoutMs is set", async () => {
    const lock = createFifoLock({ timeoutMs: 30 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A never-settling holder must not make queued operations wait forever:
    // the queued run rejects after the bound and abandons its slot.
    const holder = lock.run(async () => {
      await gate;
    });
    const queued = lock.run(async () => "ran");

    await expect(queued).rejects.toThrow(FifoLockTimeoutError);
    release();
    await holder;

    // The abandoned slot must not poison the queue.
    await expect(lock.run(async () => "after")).resolves.toBe("after");
  });

  it("timed-out operations never execute; multiple abandoned slots keep the queue FIFO", async () => {
    const lock = createFifoLock({ timeoutMs: 20 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A hung holder; several queued ops all time out and abandon their
    // slots. None of them may execute (no side effects after the caller
    // already gave up), and once the holder releases the queue must still
    // be FIFO.
    const holder = lock.run(async () => {
      await gate;
    });
    let executed = false;
    await expect(
      lock.run(async () => {
        executed = true;
      }),
    ).rejects.toThrow(FifoLockTimeoutError);
    await expect(
      lock.run(async () => {
        executed = true;
      }),
    ).rejects.toThrow(FifoLockTimeoutError);
    expect(executed).toBe(false);

    release();
    await holder;

    const order: string[] = [];
    await Promise.all([
      lock.run(async () => {
        order.push("1");
      }),
      lock.run(async () => {
        order.push("2");
      }),
    ]);
    expect(order).toEqual(["1", "2"]);
  });

  it("does not time out an operation that waits only briefly for its turn", async () => {
    const lock = createFifoLock({ timeoutMs: 100 });

    const first = lock.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "a";
    });
    const second = lock.run(async () => "b");

    await expect(Promise.all([first, second])).resolves.toEqual(["a", "b"]);
  });

  it("rejects a non-positive timeoutMs at construction", () => {
    expect(() => createFifoLock({ timeoutMs: 0 })).toThrow(/positive integer/);
    expect(() => createFifoLock({ timeoutMs: -5 })).toThrow(/positive integer/);
    expect(() => createFifoLock({ timeoutMs: 1.5 })).toThrow(/positive integer/);
  });
});
