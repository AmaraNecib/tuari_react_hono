import { Hono } from "hono";
import type { AnalyticsService } from "./analytics.service";

/**
 * Helper to extract user ID from request context.
 * In production, this should come from session/auth middleware.
 */
function getUserIdFromContext(c: any): string | null {
  // In development, use session ID from header or query
  // In production, this should come from authenticated session
  const userId = c.req.header("X-User-Id") || c.req.query("userId");
  return userId || null;
}

/**
 * Check if user is authorized to access analytics data.
 * For now, any authenticated user can access their own data.
 * Admin routes require admin role.
 */
function isAuthorized(c: any, targetUserId?: string): boolean {
  const userId = getUserIdFromContext(c);
  if (!userId) return false;
  
  // If accessing specific user data, ensure it's the same user
  if (targetUserId && userId !== targetUserId) {
    return false;
  }
  
  return true;
}

/**
 * Check if user has admin role.
 * For now, any authenticated user is considered admin for local analytics.
 */
function isAdmin(c: any): boolean {
  const userId = getUserIdFromContext(c);
  // In local analytics, any authenticated user can view stats
  return !!userId;
}

export function createAnalyticsRoutes(analyticsService: AnalyticsService) {
  const app = new Hono();

  /** Track an analytics event */
  app.post("/track", async (c) => {
    try {
      const userId = getUserIdFromContext(c);
      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }
      
      const body = await c.req.json();
      // Ensure the event belongs to the authenticated user
      await analyticsService.trackEvent({ ...body, userId });
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to track event:", error);
      return c.json({ success: false, error: "Failed to track event" }, 500);
    }
  });

  /** Get events with optional filters (admin only) */
  app.get("/events", async (c) => {
    try {
      if (!isAdmin(c)) {
        return c.json({ error: "Admin access required" }, 403);
      }
      
      const event = c.req.query("event");
      const startTime = c.req.query("startTime")
        ? Number(c.req.query("startTime"))
        : undefined;
      const endTime = c.req.query("endTime")
        ? Number(c.req.query("endTime"))
        : undefined;
      const limit = c.req.query("limit")
        ? Number(c.req.query("limit"))
        : undefined;

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
      if (!isAdmin(c)) {
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
      const userId = getUserIdFromContext(c);
      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }
      
      const body = await c.req.json();
      // Ensure the progress belongs to the authenticated user
      await analyticsService.trackProgress({ ...body, userId });
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
      
      // Users can only access their own level
      if (!isAuthorized(c, userId)) {
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
      const userId = c.req.param("userId");
      
      // Users can only update their own level
      if (!isAuthorized(c, userId)) {
        return c.json({ error: "Unauthorized" }, 403);
      }
      
      const { level } = await c.req.json();
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
      if (!isAdmin(c)) {
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
