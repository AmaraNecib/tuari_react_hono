import type { Permission } from "../rbac/permissions";
import type { SessionUser } from "./session.types";

type AuthGateway = {
  api: {
    getSession: (args: { headers: Headers }) => Promise<{
      user?: {
        id: string;
        name: string | null;
        phoneNumber?: string | null;
      } | null;
    } | null>;
  };
};

type PermissionResolver = {
  getPermissionsForUserId: (userId: string) => Promise<Permission[]>;
};

export class SessionService {
  constructor(
    private readonly authGateway: AuthGateway,
    private readonly permissionResolver: PermissionResolver,
  ) {}

  async getCurrentUser(headers: Headers): Promise<SessionUser | null> {
    const sessionData = await this.authGateway.api.getSession({ headers });

    if (!sessionData?.user?.phoneNumber) {
      return null;
    }

    const permissions = await this.permissionResolver.getPermissionsForUserId(sessionData.user.id);

    return {
      id: sessionData.user.id,
      name: sessionData.user.name,
      phone: sessionData.user.phoneNumber,
      permissions,
    };
  }
}
