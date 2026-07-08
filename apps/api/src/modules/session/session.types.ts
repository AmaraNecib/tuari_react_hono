import type { Permission } from "../rbac/permissions";

export type SessionUser = {
  id: string;
  name: string | null;
  phone: string;
  permissions: Permission[];
  version: string;
};
