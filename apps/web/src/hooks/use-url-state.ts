/**
 * URL state management hooks for persisting UI state in URL search params.
 * Uses native URL API for compatibility with TanStack Router.
 */
import { useCallback, useEffect, useState } from "react"

/**
 * Get current URL search params as an object.
 */
function getSearchParams(): Record<string, string> {
  const params = new URLSearchParams(window.location.search)
  const result: Record<string, string> = {}
  params.forEach((value, key) => {
    result[key] = value
  })
  return result
}

/**
 * Update URL search params without navigation.
 */
function updateSearchParams(updates: Record<string, string | null>, replace = true) {
  const params = new URLSearchParams(window.location.search)
  
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  
  const newSearch = params.toString()
  const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ""}`
  
  if (replace) {
    window.history.replaceState({}, "", newUrl)
  } else {
    window.history.pushState({}, "", newUrl)
  }
  
  // Dispatch event to trigger re-renders
  window.dispatchEvent(new Event("popstate"))
}

/**
 * Hook for managing a single URL search param.
 * Returns [value, setValue] similar to useState but persisted in URL.
 */
export function useUrlParam<T extends string>(
  key: string,
  defaultValue: T,
  options?: {
    replace?: boolean
    serializer?: (value: T) => string
    deserializer?: (value: string) => T
  }
): [T, (value: T) => void] {
  const serializer = options?.serializer ?? ((v: T) => v)
  const deserializer = options?.deserializer ?? ((v: string) => v as T)

  const [value, setValue] = useState<T>(() => {
    const params = getSearchParams()
    const rawValue = params[key]
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return defaultValue
    }
    try {
      return deserializer(rawValue)
    } catch {
      return defaultValue
    }
  })

  // Listen for popstate events
  useEffect(() => {
    const handlePopState = () => {
      const params = getSearchParams()
      const rawValue = params[key]
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        setValue(defaultValue)
      } else {
        try {
          setValue(deserializer(rawValue))
        } catch {
          setValue(defaultValue)
        }
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [key, defaultValue, deserializer])

  const updateValue = useCallback(
    (newValue: T) => {
      setValue(newValue)
      const serialized = newValue === defaultValue ? "" : serializer(newValue)
      updateSearchParams({ [key]: serialized }, options?.replace ?? true)
    },
    [key, defaultValue, serializer, options?.replace]
  )

  return [value, updateValue]
}

/**
 * Hook for managing tab state in URL.
 */
export function useUrlTab(
  tabs: readonly string[],
  defaultTab: string
): [string, (tab: string) => void] {
  return useUrlParam("tab", defaultTab, {
    replace: true,
    deserializer: (value) => (tabs.includes(value) ? value : defaultTab),
  })
}

/**
 * Hook for managing filter state in URL.
 */
export function useUrlFilter(
  key: string,
  defaultValue: string
): [string, (value: string) => void] {
  return useUrlParam(`f_${key}`, defaultValue, { replace: true })
}

/**
 * Hook for managing multiple filter states in URL.
 */
export function useUrlFilters<T extends Record<string, string>>(
  defaults: T
): [T, (updates: Partial<T>) => void, () => void] {
  const [values, setValuesState] = useState<T>(() => {
    const params = getSearchParams()
    const result = { ...defaults }
    for (const key of Object.keys(defaults)) {
      const fullKey = `f_${key}`
      const rawValue = params[fullKey]
      if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
        ;(result as Record<string, string>)[key] = rawValue
      }
    }
    return result
  })

  // Listen for popstate events
  useEffect(() => {
    const handlePopState = () => {
      const params = getSearchParams()
      const result = { ...defaults }
      for (const key of Object.keys(defaults)) {
        const fullKey = `f_${key}`
        const rawValue = params[fullKey]
        if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
          ;(result as Record<string, string>)[key] = rawValue
        }
      }
      setValuesState(result)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [defaults])

  const setValues = useCallback(
    (updates: Partial<T>) => {
      setValuesState((prev) => {
        const next = { ...prev }
        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined && value !== null) {
            ;(next as Record<string, string>)[key] = value as string
          }
        }
        return next
      })
      
      const searchUpdates: Record<string, string | null> = {}
      for (const [key, value] of Object.entries(updates)) {
        const fullKey = `f_${key}`
        if (value === undefined || value === null || value === defaults[key]) {
          searchUpdates[fullKey] = null
        } else {
          searchUpdates[fullKey] = value as string
        }
      }
      updateSearchParams(searchUpdates, true)
    },
    [defaults]
  )

  const reset = useCallback(() => {
    setValuesState(defaults)
    const searchUpdates: Record<string, string | null> = {}
    for (const key of Object.keys(defaults)) {
      searchUpdates[`f_${key}`] = null
    }
    updateSearchParams(searchUpdates, true)
  }, [defaults])

  return [values, setValues, reset]
}
