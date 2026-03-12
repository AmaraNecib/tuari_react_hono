export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type RoleReference = Pick<Role, "id" | "key" | "name" | "isSystem">;

export type RoleListFilters = {
  key?: string;
  isSystem?: boolean;
  includeDeleted?: boolean;
};
