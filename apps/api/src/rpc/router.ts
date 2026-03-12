import { ORPCError, implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import type { AppDependencies } from "../app/dependencies";
import { AppError } from "../modules/shared/app-error";
import type { RpcContext } from "./context";

type RouterDependencies = Pick<
  AppDependencies,
  | "sessionService"
  | "auditLogService"
  | "workerService"
  | "projectService"
  | "warehouseService"
  | "salaryService"
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
    workers: {
      list: os.workers.list.handler(async ({ context, input }) => {
        await requireUser(context.headers);
        return dependencies.workerService.list(input);
      }),
      get: os.workers.get.handler(async ({ context, input }) => {
        await requireUser(context.headers);

        try {
          return await dependencies.workerService.getById(input.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      create: os.workers.create.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.workerService.create(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      update: os.workers.update.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.workerService.update(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      reassign: os.workers.reassign.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.workerService.reassign(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      changeStatus: os.workers.changeStatus.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return await dependencies.workerService.changeStatus(input, user.id);
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      delete: os.workers.delete.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);

        try {
          return {
            success: await dependencies.workerService.softDelete(input.id, user.id),
          };
        } catch (error) {
          throw toOrpcError(error);
        }
      }),
      activity: os.workers.activity.handler(async ({ context, input }) => {
        await requireUser(context.headers);
        return dependencies.auditLogService.listForEntity("WORKER", input.id);
      }),
      salary: {
        list: os.workers.salary.list.handler(async ({ context, input }) => {
          await requireUser(context.headers);

          try {
            return await dependencies.salaryService.listByWorkerId(input.id);
          } catch (error) {
            throw toOrpcError(error);
          }
        }),
        record: os.workers.salary.record.handler(async ({ context, input }) => {
          const user = await requireUser(context.headers);

          try {
            return await dependencies.salaryService.record(input, user.id);
          } catch (error) {
            throw toOrpcError(error);
          }
        }),
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
      list: os.audits.list.handler(async ({ context, input }) => {
        await requireUser(context.headers);
        return dependencies.auditLogService.list(input);
      }),
    },
  });
}
