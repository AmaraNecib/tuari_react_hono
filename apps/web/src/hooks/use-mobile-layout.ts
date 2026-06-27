/**
 * Hook for detecting mobile/tablet layout and managing responsive state.
 */
import { useCallback, useEffect, useState } from "react";

const TABLET_BREAKPOINT = 768; // md: 768px
const DESKTOP_BREAKPOINT = 1024; // lg: 1024px

function getInitialState() {
  if (typeof window === "undefined") {
    return { isMobile: false, isTablet: false, isDesktop: true, windowWidth: 1024 };
  }
  const width = window.innerWidth;
  return {
    isMobile: width < TABLET_BREAKPOINT,
    isTablet: width >= TABLET_BREAKPOINT && width < DESKTOP_BREAKPOINT,
    isDesktop: width >= DESKTOP_BREAKPOINT,
    windowWidth: width,
  };
}

/**
 * useMobileLayout() component.
 */
export function useMobileLayout() {
  const initial = getInitialState();
  const [isMobile, setIsMobile] = useState(initial.isMobile);
  const [isTablet, setIsTablet] = useState(initial.isTablet);
  const [isDesktop, setIsDesktop] = useState(initial.isDesktop);
  const [windowWidth, setWindowWidth] = useState(initial.windowWidth);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      setIsMobile(width < TABLET_BREAKPOINT);
      setIsTablet(width >= TABLET_BREAKPOINT && width < DESKTOP_BREAKPOINT);
      setIsDesktop(width >= DESKTOP_BREAKPOINT);
      // Close mobile sidebar on resize to desktop
      if (width >= DESKTOP_BREAKPOINT) {
        setSidebarOpen(false);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return {
    isMobile,
    isTablet,
    isDesktop,
    windowWidth,
    isSmallScreen: isMobile || isTablet,
    sidebarOpen,
    toggleSidebar,
    closeSidebar,
  };
}
