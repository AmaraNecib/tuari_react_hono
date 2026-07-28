import { oc } from "@orpc/contract";
import { z } from "zod";

import { createListSchema, timestampSchema } from "./core";

/**
 * Permission string format: `resource:action` (e.g. "employees:create").
 * Validated against the closed set of resource:action pairs the system
 * currently understands.
 */
export const permissionStringSchema = z.string().regex(/^[a-z]+:[a-z]+$/);

/**
 * A role with its full permission set, as exposed by the role management
 * surface. Mirrors the API's `RoleWithPermissions` deep-module type.
 *
 * `createdAt` and `updatedAt` are included so existing consumer code
 * (employee edit page, batch create wizard, etc.) can treat this as a
 * drop-in superset of the legacy `Role` shape.
 */
export const roleWithPermissionsSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  permissions: z.array(permissionStringSchema),
});

export type RoleWithPermissions = z.infer<typeof roleWithPermissionsSchema>;
export type PermissionString = z.infer<typeof permissionStringSchema>;

/**
 * RBAC RPC contract — exposes role management to authenticated callers.
 *
 * `rbacRolesList` and `rbacRolesGet` are gated by the
 * `employees:read` permission in the middleware. That keeps the surface
 * small while still letting the role management UI render for anyone who
 * can already view employees (and therefore already has read-only access
 * to the workspace).
 */
export const rbacContract = {
  rbacRolesList: oc.output(createListSchema(roleWithPermissionsSchema)),
  rbacRolesGet: oc.input(z.object({ id: z.string().min(1) })).output(roleWithPermissionsSchema),
} as const;

export type RbacContract = typeof rbacContract;
