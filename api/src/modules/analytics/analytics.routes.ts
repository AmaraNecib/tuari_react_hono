import { Hono } from "hono";
import type { AnalyticsService } from "./analytics.service";

export function createAnalyticsRoutes(analyticsService: AnalyticsService) {
  const app = new Hono();

  /** Track an analytics event */
  app.post("/track", async (c) => {
    try {
      const body = await c.req.json();
      await analyticsService.trackEvent(body);
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to track event:", error);
      return c.json({ success: false, error: "Failed to track event" }, 500);
    }
  });

  /** Get events with optional filters */
  app.get("/events", async (c) => {
    try {
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

  /** Get event count */
  app.get("/count", async (c) => {
    try {
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
      const body = await c.req.json();
      await analyticsService.trackProgress(body);
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
      const { level } = await c.req.json();
      await analyticsService.updateUserLevel(userId, level);
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to update user level:", error);
      return c.json({ success: false, error: "Failed to update user level" }, 500);
    }
  });

  /** Get onboarding statistics */
  app.get("/stats", async (c) => {
    try {
      const stats = await analyticsService.getStats();
      return c.json(stats);
    } catch (error) {
      console.error("Failed to get stats:", error);
      return c.json({ error: "Failed to get stats" }, 500);
    }
  });

  return app;
}
