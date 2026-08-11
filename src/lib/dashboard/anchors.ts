// src/lib/dashboard/anchors.ts
import { useEffect } from "react";

/** "F1.1" -> "f1-1", "DF4.1.1" -> "df4-1-1", "M3" -> "m3". */
export function featureAnchorId(code: string): string {
  return code.toLowerCase().replace(/\./g, "-");
}

/** Scrolls the element matching the current URL hash into view on mount
 *  and whenever the hash changes — the goal's "linkable and scroll-to on
 *  load" requirement for feature anchors (#f1-1 etc). */
export function useScrollToHash(): void {
  useEffect(() => {
    function scrollToCurrentHash() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      document.getElementById(hash)?.scrollIntoView({ block: "start" });
    }

    scrollToCurrentHash();
    window.addEventListener("hashchange", scrollToCurrentHash);
    return () => window.removeEventListener("hashchange", scrollToCurrentHash);
  }, []);
}
