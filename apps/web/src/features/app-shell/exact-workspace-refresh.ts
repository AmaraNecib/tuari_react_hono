import type { QueryClient } from "@tanstack/react-query"

/** Invalidate the scoped reference/history family and earning readbacks together. */
export async function invalidateExactWorkspace(queryClient: QueryClient, workspaceId: string, userId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["application", workspaceId, userId] }),
    queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, userId, "exact-workforce"] }),
  ])
}

/** Settings synchronization may refresh every cached workspace owned by this user. */
export async function invalidateExactWorkspacesForUser(queryClient: QueryClient, userId: string | null): Promise<void> {
  if (!userId) return
  await queryClient.invalidateQueries({ predicate: query => {
    const key = query.queryKey
    return key[2] === userId && (key[0] === "application" || key[0] === "workspace" && key[3] === "exact-workforce")
  } })
}
