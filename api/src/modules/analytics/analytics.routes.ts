import { Hono } from "hono";
import type { AnalyticsService } from "./analytics.service";
import type { SessionUser } from "@/modules/session/session.types";

/**
 * Session resolver interface for extracting authenticated user from headers.
 */
type SessionResolver = {
  getCurrentUser: (headers: Headers) => Promise<SessionUser | null>;
};

/**
 * Authenticated user context extracted from request.
 */
type AuthContext = {
  userId: string;
  role?: string;
};

/**
 * Extract authenticated user from request headers using session resolver.
 * This is the ONLY way to get user identity - no caller-controlled fallbacks.
 */
async function getAuthContext(
  c: any,
  sessionResolver: SessionResolver,
): Promise<AuthContext | null> {
  const user = await sessionResolver.getCurrentUser(c.req.raw.headers);
  if (!user) return null;
  
  return {
    userId: user.id,
    role: (user as any).role,
  };
}

/**
 * Check if user is authorized to access analytics data.
 * Users can only access their own data.
 */
function isAuthorized(auth: AuthContext | null, targetUserId: string): boolean {
  if (!auth) return false;
  return auth.userId === targetUserId;
}

/**
 * Check if user has admin role.
 * Uses trusted server-side admin claim from authenticated session.
 */
function isAdmin(auth: AuthContext | null): boolean {
  if (!auth) return false;
  // Check for trusted admin role claim from session
  // In production, this should come from JWT claims or session data
  return auth.role === "admin" || auth.role === "ADMIN";
}

export function createAnalyticsRoutes(
  analyticsService: AnalyticsService,
  sessionResolver: SessionResolver,
) {
  const app = new Hono();

  /** Track an analytics event */
  app.post("/track", async (c) => {
    try {
      const auth = await getAuthContext(c, sessionResolver);
      if (!auth) {
        return c.json({ error: "Authentication required" }, 401);
      }
      
      const body = await c.req.json();
      // Ensure the event belongs to the authenticated user
      await analyticsService.trackEvent({ ...body, userId: auth.userId });
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to track event:", error);
      return c.json({ success: false, error: "Failed to track event" }, 500);
    }
  });

  /** Get events with optional filters (admin only) */
  app.get("/events", async (c) => {
    try {
      const auth = await getAuthContext(c, sessionResolver);
      if (!isAdmin(auth)) {
        return c.json({ error: "Admin access required" }, 403);
      }
      
      const event = c.req.query("event");
      const startTimeRaw = c.req.query("startTime");
      const endTimeRaw = c.req.query("endTime");
      const limitRaw = c.req.query("limit");
      
      // Validate startTime
      let startTime: number | undefined;
      if (startTimeRaw) {
        const parsed = Number(startTimeRaw);
        if (!Number.isFinite(parsed)) {
          return c.json({ error: "Invalid startTime: must be a finite number" }, 400);
        }
        startTime = parsed;
      }
      
      // Validate endTime
      let endTime: number | undefined;
      if (endTimeRaw) {
        const parsed = Number(endTimeRaw);
        if (!Number.isFinite(parsed)) {
          return c.json({ error: "Invalid endTime: must be a finite number" }, 400);
        }
        endTime = parsed;
      }
      
      // Validate limit (1-1000)
      let limit: number | undefined;
      if (limitRaw) {
        const parsed = Number(limitRaw);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1000 || !Number.isInteger(parsed)) {
          return c.json({ error: "Invalid limit: must be an integer between 1 and 1000" }, 400);
        }
        limit = parsed;
      }

      const events = await analyticsService.getEvents({
        event,
        startTime,
        endTime,
        limit,
      });

      return c.json(events);
    } catch (error) {
      console.error("Failed to get events:", error);
      return c.json({ error: "Failed to get events" }, 500);
    }
  });

  /** Get event count (admin only) */
  app.get("/count", async (c) => {
    try {
      const auth = await getAuthContext(c, sessionResolver);
      if (!isAdmin(auth)) {
        return c.json({ error: "Admin access required" }, 403);
      }
      
      const event = c.req.query("event");
      if (!event) {
        return c.json({ error: "event parameter is required" }, 400);
      }

      const count = await analyticsService.getEventCount(event);
      return c.json({ count });
    } catch (error) {
      console.error("Failed to count events:", error);
      return c.json({ error: "Failed to count events" }, 500);
    }
  });

  /** Track onboarding progress */
  app.post("/progress", async (c) => {
    try {
      const auth = await getAuthContext(c, sessionResolver);
      if (!auth) {
        return c.json({ error: "Authentication required" }, 401);
      }
      
      const body = await c.req.json();
      // Ensure the progress belongs to the authenticated user
      await analyticsService.trackProgress({ ...body, userId: auth.userId });
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to track progress:", error);
      return c.json({ success: false, error: "Failed to track progress" }, 500);
    }
  });

  /** Get user's onboarding level */
  app.get("/level/:userId", async (c) => {
    try {
      const userId = c.req.param("userId");
      const auth = await getAuthContext(c, sessionResolver);
      
      // Users can only access their own level
      if (!isAuthorized(auth, userId)) {
        return c.json({ error: "Unauthorized" }, 403);
      }
      
      const level = await analyticsService.getUserLevel(userId);
      return c.json({ level });
    } catch (error) {
      console.error("Failed to get user level:", error);
      return c.json({ error: "Failed to get user level" }, 500);
    }
  });

  /** Update user's onboarding level */
  app.put("/level/:userId", async (c) => {
    try {
      const auth = await getAuthContext(c, sessionResolver);
      const userId = c.req.param("userId");
      
      // Users can only update their own level
      if (!isAuthorized(auth, userId)) {
        return c.json({ error: "Unauthorized" }, 403);
      }
      
      const { level } = await c.req.json();
      
      // Validate level is a valid number
      if (typeof level !== "number" || !Number.isFinite(level) || level < 1 || level > 3) {
        return c.json({ error: "Invalid level: must be 1, 2, or 3" }, 400);
      }
      
      await analyticsService.updateUserLevel(userId, level);
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to update user level:", error);
      return c.json({ success: false, error: "Failed to update user level" }, 500);
    }
  });

  /** Get onboarding statistics (admin only) */
  app.get("/stats", async (c) => {
    try {
      const auth = await getAuthContext(c, sessionResolver);
      if (!isAdmin(auth)) {
        return c.json({ error: "Admin access required" }, 403);
      }
      
      const stats = await analyticsService.getStats();
      return c.json(stats);
    } catch (error) {
      console.error("Failed to get stats:", error);
      return c.json({ error: "Failed to get stats" }, 500);
    }
  });

  return app;
}
