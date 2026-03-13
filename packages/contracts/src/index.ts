import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";

export const entityIdSchema = z.string().min(1);
export const timestampSchema = z.string().min(1);

export const phonePasswordSignInSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional(),
});

export const appErrorCodeSchema = z.enum([
  "VALIDATION",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "CONFLICT",
  "BUSINESS_RULE",
]);

export const fieldErrorSchema = z.object({
  field: z.string().min(1),
  message: z.string().min(1),
});

export const appErrorSchema = z.object({
  code: appErrorCodeSchema,
  message: z.string().min(1),
  fieldErrors: z.array(fieldErrorSchema).default([]),
});

export const mutationSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1).optional(),
});

export const employeeStatusSchema = z.enum(["ACTIVE", "INACTIVE", "LEFT"]);
export const projectStatusSchema = z.enum([
  "ACTIVE",
  "STOPPED",
  "COMPLETED",
  "ARCHIVED",
]);
export const warehouseStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const assignmentStatusSchema = z.enum(["ACTIVE", "ENDED", "ARCHIVED"]);

export const roleSchema = z.object({
  id: entityIdSchema,
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  isSystem: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeSchema = z.object({
  id: entityIdSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  roleId: entityIdSchema,
  status: employeeStatusSchema,
  notes: z.string().min(1).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeManagerAssignmentSchema = z.object({
  id: entityIdSchema,
  workerId: entityIdSchema,
  managerId: entityIdSchema,
  status: assignmentStatusSchema,
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: z.string().min(1).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeProjectAssignmentSchema = z.object({
  id: entityIdSchema,
  employeeId: entityIdSchema,
  projectId: entityIdSchema,
  status: assignmentStatusSchema,
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: z.string().min(1).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const projectSchema = z.object({
  id: entityIdSchema,
  name: z.string().min(1),
  location: z.string().min(1).nullable(),
  managerId: entityIdSchema.nullable(),
  status: projectStatusSchema,
  notes: z.string().min(1).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const warehouseSchema = z.object({
  id: entityIdSchema,
  name: z.string().min(1),
  address: z.string().min(1).nullable(),
  managerId: entityIdSchema.nullable(),
  status: warehouseStatusSchema,
  notes: z.string().min(1).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const sessionUserSchema = z.object({
  id: entityIdSchema,
  name: z.string().min(1).nullable(),
  phone: z.string().min(1),
});

export const healthCheckSchema = z.object({
  status: z.literal("ok"),
  timestamp: timestampSchema,
});

export const sessionSchema = z.object({
  user: sessionUserSchema.nullable(),
});

export const appContract = {
  health: oc.output(healthCheckSchema),
  session: oc.output(sessionSchema),
};

export type PhonePasswordSignInInput = z.infer<typeof phonePasswordSignInSchema>;
export type AppError = z.infer<typeof appErrorSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type AppContract = typeof appContract;
export type AppClient = ContractRouterClient<AppContract>;
