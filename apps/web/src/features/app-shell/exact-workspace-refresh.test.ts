import { QueryClient } from "@tanstack/react-query"
import { expect, it } from "vitest"
import { invalidateExactWorkspace, invalidateExactWorkspacesForUser } from "./exact-workspace-refresh"

it("invalidates fresh ownership history after a mutation without touching another workspace", async () => {
  const client = new QueryClient()
  const keys = [
    ["application", "w", "u", "projects"],
    ["application", "w", "u", "project-history:p"],
    ["application", "w", "u", "warehouse-history:h"],
    ["workspace", "w", "u", "exact-workforce", "project", "p"],
    ["application", "other", "u", "projects"],
    ["application", "w", "another-user", "project-history:p"],
  ]
  for (const key of keys) client.setQueryData(key, { cached: true })
  await invalidateExactWorkspace(client, "w", "u")
  expect(keys.map(key => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, true, true, false, false])
  client.clear()
})

it("settings sync invalidates exact families for the signed-in user only", async () => {
  const client = new QueryClient()
  const keys = [
    ["application", "w", "u", "projects"],
    ["application", "second-workspace", "u", "warehouse-history:h"],
    ["workspace", "w", "u", "exact-workforce", "employee", "e"],
    ["application", "w", "other-user", "projects"],
    ["workspace", "w", "u", "other-family"],
  ]
  for (const key of keys) client.setQueryData(key, { cached: true })
  await invalidateExactWorkspacesForUser(client, null)
  expect(keys.every(key => !client.getQueryState(key)?.isInvalidated)).toBe(true)
  await invalidateExactWorkspacesForUser(client, "u")
  expect(keys.map(key => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, true, false, false])
  client.clear()
})
