/**
 * Analytics client for onboarding tracking.
 * Calls the API which stores data in SQLite via Drizzle.
 */

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : ""

interface AnalyticsEvent {
  event: string
  data: Record<string, unknown>
  timestamp: number
  sessionId: string
}

function getSessionId(): string {
  let sessionId = sessionStorage.getItem("analytics-session-id")
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    sessionStorage.setItem("analytics-session-id", sessionId)
  }
  return sessionId
}

export async function trackEvent(
  event: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const analyticsEvent: AnalyticsEvent = {
      event,
      data,
      timestamp: Date.now(),
      sessionId: getSessionId(),
    }

    // Fire and forget - don't block UI
    fetch(`${API_BASE}/api/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analyticsEvent),
    }).catch(() => {
      // Silently fail - analytics shouldn't break the app
    })
  } catch (error) {
    console.error("Failed to track event:", error)
  }
}

export async function getEvents(
  options: {
    event?: string
    startTime?: number
    endTime?: number
    limit?: number
  } = {},
): Promise<Array<Record<string, unknown>>> {
  try {
    const params = new URLSearchParams()
    if (options.event) params.set("event", options.event)
    if (options.startTime) params.set("startTime", String(options.startTime))
    if (options.endTime) params.set("endTime", String(options.endTime))
    if (options.limit) params.set("limit", String(options.limit))

    const response = await fetch(`${API_BASE}/api/analytics/events?${params}`)
    if (!response.ok) throw new Error("Failed to fetch events")
    return await response.json()
  } catch (error) {
    console.error("Failed to get events:", error)
    return []
  }
}

export async function getEventCount(event: string): Promise<number> {
  try {
    const response = await fetch(
      `${API_BASE}/api/analytics/count?event=${encodeURIComponent(event)}`,
    )
    if (!response.ok) throw new Error("Failed to count events")
    const data = await response.json()
    return data.count ?? 0
  } catch (error) {
    console.error("Failed to get event count:", error)
    return 0
  }
}

// Convenience functions for onboarding events

/**
 * onboardingAnalytics = component.
 */
export const onboardingAnalytics = {
  trackTourStarted: (tourId: string) =>
    trackEvent("tour_started", { tourId }),

  trackTourStepViewed: (tourId: string, step: number, stepId: string) =>
    trackEvent("tour_step_viewed", { tourId, step, stepId }),

  trackTourCompleted: (tourId: string, steps: number, duration: number) =>
    trackEvent("tour_completed", { tourId, steps, duration }),

  trackTourSkipped: (tourId: string, atStep: number) =>
    trackEvent("tour_skipped", { tourId, atStep }),

  trackTutorialStarted: (tutorialId: string) =>
    trackEvent("tutorial_started", { tutorialId }),

  trackTutorialStepCompleted: (tutorialId: string, stepId: string, stepNumber: number) =>
    trackEvent("tutorial_step_completed", { tutorialId, stepId, stepNumber }),

  trackTutorialCompleted: (tutorialId: string, duration: number) =>
    trackEvent("tutorial_completed", { tutorialId, duration }),

  trackEmptyStateCTAClicked: (feature: string, ctaType: "primary" | "secondary") =>
    trackEvent("empty_state_cta_clicked", { feature, ctaType }),

  trackTooltipDismissed: (tooltipId: string) =>
    trackEvent("tooltip_dismissed", { tooltipId }),

  trackHelpArticleViewed: (articleId: string) =>
    trackEvent("help_article_viewed", { articleId }),

  trackOnboardingLevelChanged: (fromLevel: number, toLevel: number) =>
    trackEvent("onboarding_level_changed", { fromLevel, toLevel }),

  trackTaskCompleted: (taskId: string, category: string) =>
    trackEvent("task_completed", { taskId, category }),
}
