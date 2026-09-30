// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"

import { AppMutationError, useCreateDebtAccountMutation, useCreateEmployeesBatchMutation, useResetWorkspaceMutation } from "./workspace-mutations"
import { workspaceDomainQueryPrefix, workspaceQueryPrefix } from "./workspace-keys"

const rpcMocks = vi.hoisted(() => ({ employeesBatchCreate: vi.fn(), debtAccountsCreate: vi.fn() }))

vi.mock("@/lib/orpc-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orpc-client")>("@/lib/orpc-client")
  return {
    ...actual,
    rpcClient: {
      employeesBatchCreate: rpcMocks.employeesBatchCreate,
      debtAccountsCreate: rpcMocks.debtAccountsCreate,
    },
  }
})

describe("useResetWorkspaceMutation — snapshot-aware reset (issue #276)", () => {
  function wrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      // createElement keeps this file .ts (no JSX transform needed).
      return createElement(QueryClientProvider, { client: queryClient }, children)
    }
  }

  it("invalidates BOTH the workspace-domain namespace and the snapshot namespace", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useResetWorkspaceMutation(), {
      wrapper: wrapper(queryClient),
    })

    act(() => {
      result.current.mutate()
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The shell composite now reads the single workspaceSnapshot key, so a
    // reset must clear the snapshot namespace too — otherwise the dashboard
    // stays stale while the reset toast claims success (Greptile finding on
    // PR #304).
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workspaceDomainQueryPrefix })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workspaceQueryPrefix })
  })
})

describe("useCreateDebtAccountMutation — no silent direction or opening default (issue #458)", () => {
  function wrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children)
    }
  }

  it("passes the chosen direction and leaves an absent opening balance absent", async () => {
    rpcMocks.debtAccountsCreate.mockResolvedValue({
      success: true,
      message: "ok",
      item: { id: "acc-1" },
    })

    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreateDebtAccountMutation(), {
      wrapper: wrapper(queryClient),
    })

    await result.current.mutateAsync({
      partyType: "INTERNAL_WORKER",
      workerId: "w-1",
      direction: "RECEIVABLE",
    })

    // A missing opening must stay absent: the wire rejects a supplied 0, so a
    // mutation that coerces `undefined ?? 0` would break empty-account creation.
    expect(rpcMocks.debtAccountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "RECEIVABLE",
        openingBalanceDzd: undefined,
      }),
    )
  })
})

describe("AppMutationError", () => {
  it("creates an error with message and default code", () => {
    const error = new AppMutationError({ message: "Test error" })

    expect(error.message).toBe("Test error")
    expect(error.name).toBe("AppMutationError")
    expect(error.code).toBe("BUSINESS_RULE")
    expect(error.fieldErrors).toEqual([])
  })

  it("creates an error with code and field errors", () => {
    const fieldErrors = [
      { field: "email", message: "Invalid email" },
      { field: "phone", message: "Invalid phone" },
    ]

    const error = new AppMutationError({
      message: "Validation failed",
      code: "VALIDATION",
      fieldErrors,
    })

    expect(error.message).toBe("Validation failed")
    expect(error.code).toBe("VALIDATION")
    expect(error.fieldErrors).toEqual(fieldErrors)
  })

  it("defaults code to BUSINESS_RULE when not provided", () => {
    const error = new AppMutationError({
      message: "Some error",
    })

    expect(error.code).toBe("BUSINESS_RULE")
  })

  it("defaults fieldErrors to empty array when not provided", () => {
    const error = new AppMutationError({
      message: "Some error",
      code: "CONFLICT",
    })

    expect(error.fieldErrors).toEqual([])
  })

  it("is instanceof Error", () => {
    const error = new AppMutationError({ message: "Test" })

    expect(error instanceof Error).toBe(true)
  })
})

describe("mutation error handling patterns", () => {
  it("handles entity success result format", () => {
    const result = {
      success: true as const,
      message: "Created successfully",
      item: { id: "1", name: "Test" },
    }

    if (result.success) {
      expect(result.message).toBe("Created successfully")
      expect(result.item.id).toBe("1")
    }
  })

  it("handles entity failure result format", () => {
    const result = {
      success: false as const,
      error: { message: "Creation failed" },
    }

    if (!result.success) {
      expect(result.error.message).toBe("Creation failed")
    }
  })

  it("handles delete success result format", () => {
    const result = {
      success: true as const,
      message: "Deleted successfully",
    }

    if (result.success) {
      expect(result.message).toBe("Deleted successfully")
    }
  })

  it("handles delete failure result format", () => {
    const result = {
      success: false as const,
      error: { message: "Deletion failed" },
    }

    if (!result.success) {
      expect(result.error.message).toBe("Deletion failed")
    }
  })

  it("creates AppMutationError from failure result", () => {
    const failureResult = {
      success: false as const,
      error: {
        message: "Validation error",
        code: "VALIDATION" as const,
        fieldErrors: [{ field: "email", message: "Invalid email" }],
      },
    }

    if (!failureResult.success) {
      const error = new AppMutationError(failureResult.error)
      expect(error.code).toBe("VALIDATION")
      expect(error.fieldErrors).toHaveLength(1)
    }
  })
})

describe("unique suffix generation", () => {
  it("generates different suffixes on repeated calls", () => {
    const suffixes = new Set<string>()

    for (let i = 0; i < 10; i++) {
      const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
      suffixes.add(suffix)
    }

    expect(suffixes.size).toBeGreaterThan(1)
  })

  it("suffix format is timestamp-random", () => {
    const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
    const parts = suffix.split("-")

    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatch(/^[0-9a-z]+$/)
    expect(parts[1]).toMatch(/^\d+$/)
  })
})

describe("mutation result validation", () => {
  it("validates entity result has required fields", () => {
    const validResult = {
      success: true as const,
      message: "Success",
      item: { id: "1" },
    }

    expect(validResult.success).toBe(true)
    expect(typeof validResult.message).toBe("string")
    expect(typeof validResult.item).toBe("object")
  })

  it("validates failure result has required fields", () => {
    const failureResult = {
      success: false as const,
      error: { message: "Error occurred" },
    }

    expect(failureResult.success).toBe(false)
    expect(typeof failureResult.error.message).toBe("string")
  })

  it("requires message for success results", () => {
    const result = {
      success: true as const,
      message: "Operation completed",
      item: {},
    }

    if (result.success) {
      expect(result.message).toBeDefined()
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  it("requires error object for failure results", () => {
    const result = {
      success: false as const,
      error: { message: "Something went wrong" },
    }

    if (!result.success) {
      expect(result.error).toBeDefined()
      expect(result.error.message).toBeDefined()
    }
  })
})

describe("useCreateEmployeesBatchMutation — created ids reach the caller", () => {
  function wrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children)
    }
  }

  it("returns the created employees with their real ids, not only a count", async () => {
    const employee = { id: "emp-new-1", firstName: "سعيد", lastName: "بلقاسم" }
    rpcMocks.employeesBatchCreate.mockResolvedValue({
      success: true,
      message: "ok",
      item: { employees: [employee], managerAssignments: [], projectAssignments: [] },
    })

    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreateEmployeesBatchMutation(), {
      wrapper: wrapper(queryClient),
    })

    const output = await result.current.mutateAsync({
      employees: [
        {
          firstName: "سعيد",
          lastName: "بلقاسم",
          phone: "0661112233",
          roleId: "role-project-manager",
          status: "ACTIVE",
          managerId: null,
          salaryAmountDzd: null,
          salaryPeriod: null,
          notes: null,
        },
      ],
    })

    // Inline-create callers select `employees[0].id`; a regression to
    // `{ id: "new" }` would be invisible without this pin.
    expect(output.createdCount).toBe(1)
    expect(output.employees).toEqual([employee])
    expect(rpcMocks.employeesBatchCreate).toHaveBeenCalledTimes(1)
  })
})
