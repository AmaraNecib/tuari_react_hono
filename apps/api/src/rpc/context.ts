import { ORPCError } from "@orpc/server";

import type { SessionUser } from "../modules/session/session.types";

type SessionResolver = {
  getCurrentUser: (headers: Headers) => Promise<SessionUser | null>;
};

export type RpcContext = {
  headers: Headers;
  currentUser: SessionUser | null;
};

export async function createRpcContext(
  headers: Headers,
  sessionService: SessionResolver,
): Promise<RpcContext> {
  return {
    headers,
    currentUser: await sessionService.getCurrentUser(headers),
  };
}

export function requireCurrentUser(context: RpcContext): SessionUser {
  if (!context.currentUser) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return context.currentUser;
}
