import { ORPCError } from "@orpc/server";

import type { SessionUser } from "../modules/session/session.types";

type SessionResolver = {
  getCurrentUser: (headers: Headers) => Promise<SessionUser | null>;
};

export type RpcContext = {
  headers: Headers;
  resolveCurrentUser: () => Promise<SessionUser | null>;
};

export function createRpcContext(
  headers: Headers,
  sessionService: SessionResolver,
): RpcContext {
  let currentUserPromise: Promise<SessionUser | null> | undefined;

  return {
    headers,
    resolveCurrentUser: () => {
      currentUserPromise ??= sessionService.getCurrentUser(headers);

      return currentUserPromise;
    },
  };
}

export function getCurrentUser(context: RpcContext): Promise<SessionUser | null> {
  return context.resolveCurrentUser();
}

export async function requireCurrentUser(context: RpcContext): Promise<SessionUser> {
  const currentUser = await getCurrentUser(context);

  if (!currentUser) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return currentUser;
}
