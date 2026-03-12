import { ORPCError, implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import type { AppDependencies } from "../app/dependencies";
import { AppError } from "../modules/shared/app-error";
import type { RpcContext } from "./context";

type RouterDependencies = Pick<
  AppDependencies,
  | "auditLogService"
  | "sessionService"
  | "roleService"
  | "employeeService"
  | "employeeManagerAssignmentService"
  | "employeeProjectAssignmentService"
  | "projectService"
  | "warehouseService"
>;

const mapAppErrorCode = (code: AppError["code"]) => {
  switch (code) {
    case "NOT_FOUND":
      return "NOT_FOUND" as const;
    case "CONFLICT":
      return "CONFLICT" as const;
    case "BAD_REQUEST":
    default:
      return "BAD_REQUEST" as const;
  }
};

const toOrpcError = (error: unknown) => {
  if (error instanceof AppError) {
    return new ORPCError(mapAppErrorCode(error.code), {
      message: error.message,
    });
  }

  return error;
};

export function createRouter(dependencies: RouterDependencies) {
  const os = implement(appContract).$context<RpcContext>();
  const auditOs = implement(appContract.audits).$context<RpcContext>();

  const requireUser = async (headers: Headers) => {
    const user = await dependencies.sessionService.getCurrentUser(headers);

    if (!user) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return user;
  };

  return os.router({
    health: os.health.handler(() => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    })),
    session: os.session.handler(async ({ context }) => ({
      user: await dependencies.sessionService.getCurrentUser(context.headers),
    })),
    roles: {
      list: os.roles.list.handler(async ({ context, input }) => {
        await requireUser(context.headers);
        return dependencies.roleService.list(input);
      }),
      get: os.roles.get.handler(async ({ context, input }) => {
        await requireUser(context.headers);

        try {
          return await dependencies.roleService.getById(input.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      create: os.roles.create.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.roleService.create(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      update: os.roles.update.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.roleService.update(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      delete: os.roles.delete.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return {
            success: await dependencies.roleService.softDelete(input.id, user.id),
          };
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
    },
    employees: {
      list: os.employees.list.handler(async ({ context, input }) => {
        await requireUser(context.headers);
        return dependencies.employeeService.list(input);
      }),
      get: os.employees.get.handler(async ({ context, input }) => {
        await requireUser(context.headers);

        try {
          return await dependencies.employeeService.getById(input.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      create: os.employees.create.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.employeeService.create(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      update: os.employees.update.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.employeeService.update(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      delete: os.employees.delete.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return {
            success: await dependencies.employeeService.softDelete(input.id, user.id),
          };
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      managerAssignments: {
        list: os.employees.managerAssignments.list.handler(async ({ context, input }) => {
          await requireUser(context.headers);
          return dependencies.employeeManagerAssignmentService.list(input);
        }),
        get: os.employees.managerAssignments.get.handler(async ({ context, input }) => {
          await requireUser(context.headers);

          try {
            return await dependencies.employeeManagerAssignmentService.getById(input.id);
          } catch (error) {
            throw toOrpcError(error);
          }
        }),
        create: os.employees.managerAssignments.create.handler(
          async ({ context, input }) => {
            const user = await requireUser(context.headers);

            try {
              return await dependencies.employeeManagerAssignmentService.create(
                input,
                user.id,
              );
            } catch (error) {
              throw toOrpcError(error);
            }
          },
        ),
        update: os.employees.managerAssignments.update.handler(
          async ({ context, input }) => {
            const user = await requireUser(context.headers);

            try {
              return await dependencies.employeeManagerAssignmentService.update(
                input,
                user.id,
              );
            } catch (error) {
              throw toOrpcError(error);
            }
          },
        ),
        delete: os.employees.managerAssignments.delete.handler(
          async ({ context, input }) => {
            const user = await requireUser(context.headers);

            try {
              return {
                success: await dependencies.employeeManagerAssignmentService.softDelete(
                  input.id,
                  user.id,
                ),
              };
            } catch (error) {
              throw toOrpcError(error);
            }
          },
        ),
      },
      projectAssignments: {
        list: os.employees.projectAssignments.list.handler(async ({ context, input }) => {
          await requireUser(context.headers);
          return dependencies.employeeProjectAssignmentService.list(input);
        }),
        get: os.employees.projectAssignments.get.handler(async ({ context, input }) => {
          await requireUser(context.headers);

          try {
            return await dependencies.employeeProjectAssignmentService.getById(input.id);
          } catch (error) {
            throw toOrpcError(error);
          }
        }),
        create: os.employees.projectAssignments.create.handler(
          async ({ context, input }) => {
            const user = await requireUser(context.headers);

            try {
              return await dependencies.employeeProjectAssignmentService.create(
                input,
                user.id,
              );
            } catch (error) {
              throw toOrpcError(error);
            }
          },
        ),
        update: os.employees.projectAssignments.update.handler(
          async ({ context, input }) => {
            const user = await requireUser(context.headers);

            try {
              return await dependencies.employeeProjectAssignmentService.update(
                input,
                user.id,
              );
            } catch (error) {
              throw toOrpcError(error);
            }
          },
        ),
        delete: os.employees.projectAssignments.delete.handler(
          async ({ context, input }) => {
            const user = await requireUser(context.headers);

            try {
              return {
                success: await dependencies.employeeProjectAssignmentService.softDelete(
                  input.id,
                  user.id,
                ),
              };
            } catch (error) {
              throw toOrpcError(error);
            }
          },
        ),
      },
    },
    projects: {
      list: os.projects.list.handler(async ({ context, input }) => {
        await requireUser(context.headers);
        return dependencies.projectService.list(input);
      }),
      get: os.projects.get.handler(async ({ context, input }) => {
        await requireUser(context.headers);

        try {
          return await dependencies.projectService.getById(input.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      create: os.projects.create.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.projectService.create(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      update: os.projects.update.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.projectService.update(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      delete: os.projects.delete.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return {
            success: await dependencies.projectService.softDelete(input.id, user.id),
          };
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
    },
    warehouses: {
      list: os.warehouses.list.handler(async ({ context, input }) => {
        await requireUser(context.headers);
        return dependencies.warehouseService.list(input);
      }),
      get: os.warehouses.get.handler(async ({ context, input }) => {
        await requireUser(context.headers);

        try {
          return await dependencies.warehouseService.getById(input.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      create: os.warehouses.create.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.warehouseService.create(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      update: os.warehouses.update.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.warehouseService.update(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      delete: os.warehouses.delete.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return {
            success: await dependencies.warehouseService.softDelete(input.id, user.id),
          };
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
    },
    audits: {
      list: auditOs.list.handler(async ({ context, input }) => {
        await requireUser(context.headers);
        return dependencies.auditLogService.list(input);
      }),
    },
  });
}
