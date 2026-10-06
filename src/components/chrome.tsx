import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type ChromeCtx = {
  hidden: boolean;
  acquireHide: () => () => void;
};

const Ctx = createContext<ChromeCtx>({ hidden: false, acquireHide: () => () => {} });

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [hideCount, setHideCount] = useState(0);
  const acquireHide = useCallback(() => {
    setHideCount((count) => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHideCount((count) => Math.max(0, count - 1));
    };
  }, []);
  return <Ctx.Provider value={{ hidden: hideCount > 0, acquireHide }}>{children}</Ctx.Provider>;
}

export function useChrome() {
  return useContext(Ctx);
}

/** Hides the gold counter + bottom nav while the component is mounted. */
export function useHideChrome(active = true) {
  const { acquireHide } = useChrome();
  useEffect(() => {
    if (!active) return;
    return acquireHide();
  }, [active, acquireHide]);
}
