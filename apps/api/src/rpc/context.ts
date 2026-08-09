import { ORPCError } from "@orpc/server";

import type { SessionUser } from "../modules/session/session.types";

type SessionResolver = {
  getCurrentUser: (headers: Headers) => Promise<SessionUser | null>;
};

export type RpcContext = {
  headers: Headers;
  resolveCurrentUser: () => Promise<SessionUser | null>;
  /**
   * Socket-level remote address of the peer, taken from the transport layer
   * (Hono `env.incoming.socket.remoteAddress`). Never derived from
   * client-supplied headers — used for rate-limit keys when proxy headers
   * are not trusted.
   */
  remoteAddress?: string;
};

export function createRpcContext(
  headers: Headers,
  sessionService: SessionResolver,
  remoteAddress?: string,
): RpcContext {
  let currentUserPromise: Promise<SessionUser | null> | undefined;

  return {
    headers,
    remoteAddress,
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
