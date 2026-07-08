import type { Permission } from "../rbac/permissions";
import type { SessionUser } from "./session.types";
import { resolveAppVersion } from "./app-version";

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

/**
 * SessionService — resolves the current authenticated user from the auth
 * gateway, enriches it with RBAC permissions, and attaches the app version.
 */
export class SessionService {
  constructor(
    private readonly authGateway: AuthGateway,
    private readonly permissionResolver: PermissionResolver,
  ) {}

  /**
   * Resolve the current user from the request headers.
   *
   * Returns `null` when no session is present or the session lacks a verified
   * phone number. Otherwise returns a `SessionUser` with resolved permissions
   * and the current app version.
   */
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
      version: resolveAppVersion(),
    };
  }
}
