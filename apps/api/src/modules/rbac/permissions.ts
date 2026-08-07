/**
 * Permission definitions for the RBAC system.
 *
 * Permissions follow the format `resource:action` (e.g. "employees:create").
 * The colon separator is used so that downstream consumers (logs, audit
 * trails, serialized permission strings) can disambiguate the boundary
 * between resource and action even when the resource name itself
 * contains a period.
 *
 * New resources are added here as modules are deepened. The middleware
 * checks permissions from the user's session, which is populated at login
 * from the role_permission junction table.
 */

const RESOURCES = {
  employees: ["create", "read", "update", "delete"],
  projects: ["create", "read", "update", "delete"],
  warehouses: ["create", "read", "update", "delete"],
  inventory: ["create", "read", "update", "delete", "transfer"],
  debts: ["create", "read", "update", "settle"],
  invoices: ["create", "read", "update", "delete"],
  payments: ["create", "read", "update", "delete"],
} as const;

export type ResourcePermission = {
  [R in keyof typeof RESOURCES]: `${R & string}:${(typeof RESOURCES)[R][number]}`;
}[keyof typeof RESOURCES];

export type Permission = ResourcePermission;

export const RESOURCE_PERMISSIONS: { [K in keyof typeof RESOURCES]: readonly (typeof RESOURCES)[K][number][] } = RESOURCES;

export const ALL_PERMISSIONS: readonly Permission[] = Object.entries(RESOURCE_PERMISSIONS).flatMap(
  ([resource, actions]) => actions.map((action) => `${resource}:${action}` as Permission),
);

export function isPermission(value: string): value is Permission {
  // Exactly one colon (`resource:action`). Trailing segments from a
  // corrupted/legacy row (e.g. `employees:create:extra`) must not validate:
  // the type-level Permission union only ever has one colon, and this gate
  // filters role_permission rows at read time (sqlite-role.repository).
  const [resource, action, ...extra] = value.split(":");
  if (extra.length > 0 || !resource || !action) return false;
  const actions = RESOURCE_PERMISSIONS[resource as keyof typeof RESOURCE_PERMISSIONS];
  if (!actions) return false;
  return (actions as readonly string[]).includes(action);
}

export function isResourcePermission(
  resource: string,
  action: string,
): resource is keyof typeof RESOURCE_PERMISSIONS {
  const actions = RESOURCE_PERMISSIONS[resource as keyof typeof RESOURCE_PERMISSIONS];
  if (!actions) return false;
  return (actions as readonly string[]).includes(action);
}
