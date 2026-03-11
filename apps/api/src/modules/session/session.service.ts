import type { SessionUser } from "./session.types";

type AuthGateway = {
  api: {
    getSession: (args: { headers: Headers }) => Promise<{
      user?: {
        id: string;
        name: string | null;
        email: string;
      } | null;
    } | null>;
  };
};

export class SessionService {
  constructor(private readonly authGateway: AuthGateway) {}

  async getCurrentUser(headers: Headers): Promise<SessionUser | null> {
    const sessionData = await this.authGateway.api.getSession({ headers });

    if (!sessionData?.user) {
      return null;
    }

    return {
      id: sessionData.user.id,
      name: sessionData.user.name,
      email: sessionData.user.email,
    };
  }
}
