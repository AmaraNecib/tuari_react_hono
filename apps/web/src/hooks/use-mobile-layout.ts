import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 640; // sm: 640px
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

export function useMobileLayout() {
  const initial = getInitialState();
  const [isMobile, setIsMobile] = useState(initial.isMobile);
  const [isTablet, setIsTablet] = useState(initial.isTablet);
  const [isDesktop, setIsDesktop] = useState(initial.isDesktop);
  const [windowWidth, setWindowWidth] = useState(initial.windowWidth);

  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      setIsMobile(width < TABLET_BREAKPOINT);
      setIsTablet(width >= TABLET_BREAKPOINT && width < DESKTOP_BREAKPOINT);
      setIsDesktop(width >= DESKTOP_BREAKPOINT);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  return {
    isMobile,
    isTablet,
    isDesktop,
    windowWidth,
    isSmallScreen: isMobile || isTablet,
  };
}
