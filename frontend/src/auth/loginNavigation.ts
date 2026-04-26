import { flushSync } from "react-dom";
import type { NavigateFunction } from "react-router-dom";

/** Session flag: shell should play blur-in after login (browsers without View Transitions). */
export const POST_LOGIN_ENTER_FALLBACK_KEY = "athene-post-login-enter";

type DocWithVt = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

const LOGIN_TO_APP_HTML_CLASS = "login-to-app-vt";

/**
 * Navigates to `/dashboard` after login with a crossfade + Gaussian blur.
 * Uses View Transitions when available; otherwise relies on CSS exit (login) + enter (shell).
 */
export async function navigateFromLoginToApp(
  navigate: NavigateFunction,
  prepareCssFallbackExit: () => Promise<void>,
): Promise<void> {
  const doc = document as DocWithVt;

  if (typeof doc.startViewTransition === "function") {
    document.documentElement.classList.add(LOGIN_TO_APP_HTML_CLASS);
    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        navigate("/dashboard", { replace: true });
      });
    });
    try {
      await transition.finished;
    } catch {
      /* transition cancelled */
    } finally {
      document.documentElement.classList.remove(LOGIN_TO_APP_HTML_CLASS);
    }
    return;
  }

  await prepareCssFallbackExit();
  try {
    sessionStorage.setItem(POST_LOGIN_ENTER_FALLBACK_KEY, "1");
  } catch {
    /* ignore storage */
  }
  navigate("/dashboard", { replace: true });
}
