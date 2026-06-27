import { eq, and, gte, lte, count } from "drizzle-orm";
import { analyticsEvent, onboardingProgress, userOnboardingLevel } from "../../schema/analytics";
import type { AppDrizzle } from "../../infrastructure/database/drizzle";

interface TrackEventInput {
  event: string
  data?: Record<string, unknown>
  timestamp: number
  sessionId: string
  userId?: string
}

interface GetEventsOptions {
  event?: string
  startTime?: number
  endTime?: number
  limit?: number
  userId?: string
}

export class AnalyticsService {
  constructor(private readonly db: AppDrizzle) {}

  /** Track an analytics event */
  async trackEvent(input: TrackEventInput): Promise<void> {
    await this.db.insert(analyticsEvent).values({
      event: input.event,
      data: input.data ? JSON.stringify(input.data) : null,
      timestamp: new Date(input.timestamp),
      sessionId: input.sessionId,
      userId: input.userId,
    });
  }

  /** Get events with optional filters */
  async getEvents(options: GetEventsOptions = {}) {
    const conditions = [];

    if (options.event) {
      conditions.push(eq(analyticsEvent.event, options.event));
    }

    if (options.startTime) {
      conditions.push(gte(analyticsEvent.timestamp, new Date(options.startTime)));
    }

    if (options.endTime) {
      conditions.push(lte(analyticsEvent.timestamp, new Date(options.endTime)));
    }

    if (options.userId) {
      conditions.push(eq(analyticsEvent.userId, options.userId));
    }

    const query = this.db
      .select()
      .from(analyticsEvent)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(analyticsEvent.timestamp);

    if (options.limit) {
      query.limit(options.limit);
    }

    const events = await query;

    // Parse JSON data field
    return events.map((event) => ({
      ...event,
      data: event.data ? JSON.parse(event.data) : {},
    }));
  }

  /** Get count of events matching criteria */
  async getEventCount(event: string, userId?: string): Promise<number> {
    const conditions = [eq(analyticsEvent.event, event)];

    if (userId) {
      conditions.push(eq(analyticsEvent.userId, userId));
    }

    const [result] = await this.db
      .select({ count: count() })
      .from(analyticsEvent)
      .where(and(...conditions));

    return result?.count ?? 0;
  }

  /** Track onboarding progress */
  async trackProgress(input: {
    userId: string
    feature: string
    featureId: string
    status: "started" | "completed" | "skipped"
    duration?: number
    metadata?: Record<string, unknown>
  }) {
    const now = new Date();

    if (input.status === "started") {
      await this.db.insert(onboardingProgress).values({
        userId: input.userId,
        feature: input.feature,
        featureId: input.featureId,
        status: input.status,
        startedAt: now,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      });
    } else {
      // Update existing progress record
      await this.db
        .update(onboardingProgress)
        .set({
          status: input.status,
          completedAt: now,
          duration: input.duration,
        })
        .where(
          and(
            eq(onboardingProgress.userId, input.userId),
            eq(onboardingProgress.feature, input.feature),
            eq(onboardingProgress.featureId, input.featureId),
            eq(onboardingProgress.status, "started"),
          ),
        );
    }
  }

  /** Get user's onboarding level */
  async getUserLevel(userId: string): Promise<number> {
    const [result] = await this.db
      .select()
      .from(userOnboardingLevel)
      .where(eq(userOnboardingLevel.userId, userId));

    return result?.level ?? 1;
  }

  /** Update user's onboarding level */
  async updateUserLevel(userId: string, level: number): Promise<void> {
    const existing = await this.db
      .select()
      .from(userOnboardingLevel)
      .where(eq(userOnboardingLevel.userId, userId));

    if (existing.length > 0) {
      await this.db
        .update(userOnboardingLevel)
        .set({ level, updatedAt: new Date().toISOString() })
        .where(eq(userOnboardingLevel.userId, userId));
    } else {
      await this.db.insert(userOnboardingLevel).values({
        userId,
        level,
      });
    }
  }

  /** Get onboarding statistics */
  async getStats(userId?: string) {
    const tourStarted = await this.getEventCount("tour_started", userId);
    const tourCompleted = await this.getEventCount("tour_completed", userId);
    const tutorialStarted = await this.getEventCount("tutorial_started", userId);
    const tutorialCompleted = await this.getEventCount("tutorial_completed", userId);

    return {
      tourStarted,
      tourCompleted,
      tourCompletionRate: tourStarted > 0 ? (tourCompleted / tourStarted) * 100 : 0,
      tutorialStarted,
      tutorialCompleted,
      tutorialCompletionRate: tutorialStarted > 0 ? (tutorialCompleted / tutorialStarted) * 100 : 0,
    };
  }
}
