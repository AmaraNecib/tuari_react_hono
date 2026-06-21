import { ORPCError } from "@orpc/server";
import type { RpcContext } from "../../rpc/context";
import type { Permission } from "./permissions";

export type PermissionMiddleware = {
  withPermission<TInput, TOutput>(
    required: Permission | Permission[],
    handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput>,
  ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput>;
};

async function resolveUserPermissions(context: RpcContext): Promise<string[]> {
  const user = await context.resolveCurrentUser();
  if (!user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return (user as any).permissions ?? [];
}

function hasPermission(userPermissions: string[], required: Permission): boolean {
  return userPermissions.includes(required);
}

export function createPermissionMiddleware(): PermissionMiddleware {
  return {
    withPermission<TInput, TOutput>(
      required: Permission | Permission[],
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput>,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        const userPermissions = await resolveUserPermissions(context);
        const requiredPermissions = Array.isArray(required) ? required : [required];

        const allowed = requiredPermissions.some((p) => hasPermission(userPermissions, p));
        if (!allowed) {
          throw new ORPCError("FORBIDDEN", {
            message: "ليس لديك صلاحية للقيام بهذا الإجراء.",
          });
        }

        return handler({ context, input });
      };
    },
  };
}
