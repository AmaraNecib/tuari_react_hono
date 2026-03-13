import { auth } from "../infrastructure/auth/auth";
import { SessionService } from "../modules/session/session.service";

export const appDependencies = {
  auth,
  sessionService: new SessionService(auth),
} as const;

export type AppDependencies = typeof appDependencies;
