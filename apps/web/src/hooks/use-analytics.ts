import { useCallback, useState } from "react"
import { onboardingAnalytics, getEvents, getEventCount } from "@/lib/analytics-db"

interface UseAnalyticsReturn {
  trackEvent: typeof onboardingAnalytics
  getRecentEvents: (limit?: number) => Promise<Array<Record<string, unknown>>>
  getEventCount: (event: string) => Promise<number>
  isLoading: boolean
  error: string | null
}

/**
 * Hook for tracking and querying onboarding analytics.
 */
export function useAnalytics(): UseAnalyticsReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getRecentEvents = useCallback(async (limit = 10) => {
    setIsLoading(true)
    setError(null)
    try {
      const events = await getEvents({ limit })
      return events
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get events")
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  const countEvents = useCallback(async (event: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const count = await getEventCount(event)
      return count
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to count events")
      return 0
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    trackEvent: onboardingAnalytics,
    getRecentEvents,
    getEventCount: countEvents,
    isLoading,
    error,
  }
}

interface TourAnalytics {
  tourId: string
  startTime: number
  currentStep: number
}

/**
 * Hook for tracking guided tour analytics.
 */
export function useTourAnalytics(tourId: string) {
  const [tourData, setTourData] = useState<TourAnalytics | null>(null)

  const startTour = useCallback(() => {
    const startTime = Date.now()
    setTourData({ tourId, startTime, currentStep: 0 })
    onboardingAnalytics.trackTourStarted(tourId)
  }, [tourId])

  const viewStep = useCallback(
    (step: number, stepId: string) => {
      setTourData((prev) => (prev ? { ...prev, currentStep: step } : null))
      onboardingAnalytics.trackTourStepViewed(tourId, step, stepId)
    },
    [tourId],
  )

  const completeTour = useCallback(
    (totalSteps: number) => {
      if (tourData) {
        const duration = Date.now() - tourData.startTime
        onboardingAnalytics.trackTourCompleted(tourId, totalSteps, duration)
      }
      setTourData(null)
    },
    [tourId, tourData],
  )

  const skipTour = useCallback(() => {
    if (tourData) {
      onboardingAnalytics.trackTourSkipped(tourId, tourData.currentStep)
    }
    setTourData(null)
  }, [tourId, tourData])

  return {
    startTour,
    viewStep,
    completeTour,
    skipTour,
    isActive: tourData !== null,
  }
}

interface TutorialAnalytics {
  tutorialId: string
  startTime: number
  completedSteps: string[]
}

/**
 * Hook for tracking interactive tutorial analytics.
 */
export function useTutorialAnalytics(tutorialId: string) {
  const [tutorialData, setTutorialData] = useState<TutorialAnalytics | null>(null)

  const startTutorial = useCallback(() => {
    const startTime = Date.now()
    setTutorialData({ tutorialId, startTime, completedSteps: [] })
    onboardingAnalytics.trackTutorialStarted(tutorialId)
  }, [tutorialId])

  const completeStep = useCallback(
    (stepId: string, stepNumber: number) => {
      setTutorialData((prev) =>
        prev
          ? { ...prev, completedSteps: [...prev.completedSteps, stepId] }
          : null,
      )
      onboardingAnalytics.trackTutorialStepCompleted(tutorialId, stepId, stepNumber)
    },
    [tutorialId],
  )

  const completeTutorial = useCallback(() => {
    if (tutorialData) {
      const duration = Date.now() - tutorialData.startTime
      onboardingAnalytics.trackTutorialCompleted(tutorialId, duration)
    }
    setTutorialData(null)
  }, [tutorialId, tutorialData])

  return {
    startTutorial,
    completeStep,
    completeTutorial,
    isActive: tutorialData !== null,
  }
}
