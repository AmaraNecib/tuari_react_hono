import type { Permission } from "../rbac/permissions";

/**
 * Authenticated session user with resolved permissions and app version.
 *
 * - `phone` is the verified phone identifier from the auth provider.
 * - `permissions` are the RBAC permissions resolved for this user.
 * - `version` is the current app version (env var or package.json fallback).
 */
export type SessionUser = {
  id: string;
  name: string | null;
  phone: string;
  permissions: Permission[];
  version: string;
};
