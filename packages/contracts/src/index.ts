import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";

export const todoSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
});

export const appContract = {
  health: oc.output(
    z.object({
      status: z.literal("ok"),
      timestamp: z.string(),
    }),
  ),
  session: oc.output(
    z.object({
      user: sessionUserSchema.nullable(),
    }),
  ),
  todos: {
    list: oc.output(z.array(todoSchema)),
    create: oc
      .input(
        z.object({
          title: z.string().min(1).max(120),
        }),
      )
      .output(todoSchema),
    toggle: oc
      .input(
        z.object({
          id: z.string(),
          completed: z.boolean(),
        }),
      )
      .output(todoSchema),
    remove: oc
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .output(z.object({ success: z.boolean() })),
  },
};

export type AppContract = typeof appContract;
export type AppClient = ContractRouterClient<AppContract>;