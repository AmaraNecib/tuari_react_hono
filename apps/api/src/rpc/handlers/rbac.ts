import { implement, ORPCError } from "@orpc/server";

import type { RoleModule } from "../../modules/rbac/role.module";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

/**
 * RBAC handlers — surface the role management endpoints.
 *
 * Both endpoints are gated by `employees:read` (a coarse but pragmatic
 * gate: anyone who can view the workspace can also see the role
 * configuration). The role management UI sits inside the same app shell
 * as the employees page, so reusing the existing permission is the
 * least-friction option. A future iteration can introduce a dedicated
 * `rbac:read` permission if finer control is needed.
 */
export function createRbacHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  roleModule: RoleModule,
) {
  return {
    rbacRolesList: os.rbacRolesList.handler(
      m.withPermission(
        "employees:read",
        m.withAuth(async () => {
          const roles = await roleModule.list();
          return { items: roles };
        }),
      ),
    ),

    rbacRolesGet: os.rbacRolesGet.handler(
      m.withPermission(
        "employees:read",
        m.withAuth(async ({ input }: { context: RpcContext; input: unknown }) => {
          const id = (input as { id: string }).id;
          const role = await roleModule.getById(id);
          if (!role) {
            throw new ORPCError("NOT_FOUND", { message: "Role not found" });
          }
          return role;
        }),
      ),
    ),
  };
}
