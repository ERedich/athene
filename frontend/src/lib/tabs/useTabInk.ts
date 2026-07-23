import { useCallback, useEffect, useLayoutEffect, type DependencyList, type RefObject } from "react";

/**
 * Positions the sliding ink underline on a PrimeReact TabView nav.
 * Host must wrap the TabView and include `app-tabview-with-ink`.
 *
 * Re-measures when the active tab grows/shrinks (e.g. count badge mounts after
 * a direct jump to a tab) so the ink spans label + badge.
 */
export function useTabInk(
  hostRef: RefObject<HTMLElement | null>,
  deps: DependencyList,
  enabled = true,
): () => void {
  const updateTabInk = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const nav = host.querySelector<HTMLElement>(".p-tabview-nav");
    const active = nav?.querySelector<HTMLElement>("li.p-highlight .p-tabview-nav-link");
    if (!nav || !active) return;
    nav.style.setProperty("--app-ink-x", `${active.offsetLeft}px`);
    nav.style.setProperty("--app-ink-w", `${active.offsetWidth}px`);
  }, [hostRef]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const raf = requestAnimationFrame(updateTabInk);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes explicit deps
  }, [enabled, updateTabInk, ...deps]);

  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    if (!host) {
      window.addEventListener("resize", updateTabInk);
      return () => window.removeEventListener("resize", updateTabInk);
    }

    const resizeObserver = new ResizeObserver(() => {
      updateTabInk();
    });
    const observedLinks = new WeakSet<Element>();
    let navMutationObserver: MutationObserver | null = null;

    const observeActiveLink = () => {
      const active = host.querySelector("li.p-highlight .p-tabview-nav-link");
      if (!(active instanceof HTMLElement) || observedLinks.has(active)) return;
      observedLinks.add(active);
      resizeObserver.observe(active);
    };

    const attachNavObservers = () => {
      const nav = host.querySelector(".p-tabview-nav");
      if (!(nav instanceof HTMLElement)) return false;

      resizeObserver.observe(nav);
      observeActiveLink();

      navMutationObserver?.disconnect();
      navMutationObserver = new MutationObserver(() => {
        observeActiveLink();
        updateTabInk();
      });
      navMutationObserver.observe(nav, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class"],
      });
      updateTabInk();
      return true;
    };

    resizeObserver.observe(host);
    if (!attachNavObservers()) {
      // TabView may mount one frame later on deep-link tab open.
      const hostMo = new MutationObserver(() => {
        if (attachNavObservers()) hostMo.disconnect();
      });
      hostMo.observe(host, { childList: true, subtree: true });
      const raf = requestAnimationFrame(() => {
        if (attachNavObservers()) hostMo.disconnect();
      });
      window.addEventListener("resize", updateTabInk);
      return () => {
        cancelAnimationFrame(raf);
        hostMo.disconnect();
        window.removeEventListener("resize", updateTabInk);
        resizeObserver.disconnect();
        navMutationObserver?.disconnect();
      };
    }

    window.addEventListener("resize", updateTabInk);
    return () => {
      window.removeEventListener("resize", updateTabInk);
      resizeObserver.disconnect();
      navMutationObserver?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes explicit deps
  }, [enabled, updateTabInk, ...deps]);

  return updateTabInk;
}
