import { ORPCError } from "@orpc/server";
import type { AppError } from "@tuari/contracts";

import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { InputValidator } from "../infrastructure/validation/input-validator";
import { requireCurrentUser, type RpcContext } from "./context";

// Generic schema interface for validation
export interface ValidatorSchema {
  parse(input: unknown): unknown;
  parseAsync(input: unknown): Promise<unknown>;
}

export type MutationAuditContext = {
  actorUserId: string;
  actorLabel: string;
  transactionId: string;
};

type RouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "isBootstrapOwner">;
};

export type RpcMiddleware = ReturnType<typeof createRpcMiddleware>;

export function createRpcMiddleware(dependencies: RouterDependencies) {
  async function requireWorkspaceAdmin(context: RpcContext) {
    const currentUser = await requireCurrentUser(context);

    if (!(await dependencies.authBootstrapService.isBootstrapOwner(currentUser.id))) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "هذا الإجراء متاح فقط لحساب الإدارة الرئيسي.",
      });
    }

    return currentUser;
  }

  async function createMutationAuditContext(context: RpcContext): Promise<MutationAuditContext> {
    const currentUser = await requireWorkspaceAdmin(context);

    return {
      actorUserId: currentUser.id,
      actorLabel: currentUser.name ?? currentUser.phone,
      transactionId: crypto.randomUUID(),
    };
  }

  return {
    queryAuth<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput>,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        await requireWorkspaceAdmin(context);
        return handler({ context, input });
      };
    },

    queryAuthValidated<TInput, TOutput>(
      schema: ValidatorSchema,
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput>,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        await requireWorkspaceAdmin(context);
        const validatedInput = InputValidator.validate<TInput>(input, schema);
        return handler({ context, input: validatedInput });
      };
    },

    mutationAudit<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput; auditContext: MutationAuditContext }) => TOutput,
      errorResolver: (error: unknown) => any,
    ): (params: { context: RpcContext; input: TInput }) => Promise<any> {
      return async ({ context, input }) => {
        const auditContext = await createMutationAuditContext(context);
        try {
          return handler({ context, input, auditContext });
        } catch (error) {
          return errorResolver(error);
        }
      };
    },

    mutationAuditValidated<TInput, TOutput>(
      schema: ValidatorSchema,
      handler: (params: { context: RpcContext; input: TInput; auditContext: MutationAuditContext }) => TOutput,
      errorResolver: (error: unknown) => any,
    ): (params: { context: RpcContext; input: TInput }) => Promise<any> {
      return async ({ context, input }) => {
        const auditContext = await createMutationAuditContext(context);
        try {
          const validatedInput = InputValidator.validate<TInput>(input, schema);
          return handler({ context, input: validatedInput, auditContext });
        } catch (error) {
          return errorResolver(error);
        }
      };
    },
  };
}
