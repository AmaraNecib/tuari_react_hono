import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 640; // sm: 640px
const TABLET_BREAKPOINT = 768; // md: 768px
const DESKTOP_BREAKPOINT = 1024; // lg: 1024px

export function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [windowWidth, setWindowWidth] = useState(0);

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
