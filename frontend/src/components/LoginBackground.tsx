import { useEffect, useRef, useState } from "react";

import { loginBgImagesDark, loginBgImagesLight } from "../brandAssets";

const INTERVAL_MS = 10_000;
const FADE_MS = 1800;
const VISIBLE_OPACITY = 0.6;

const imgClass =
  "absolute inset-0 h-full w-full object-cover heavy-blur animate-slow-zoom transition-opacity ease-in-out";

type LoginBackgroundProps = {
  dark: boolean;
};

export function LoginBackground({ dark }: LoginBackgroundProps) {
  const images = dark ? loginBgImagesDark : loginBgImagesLight;
  const [activeIndex, setActiveIndex] = useState(0);
  const [incomingIndex, setIncomingIndex] = useState<number | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const activeIndexRef = useRef(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    setActiveIndex(0);
    setIncomingIndex(null);
    setFadeIn(false);
    activeIndexRef.current = 0;
  }, [dark]);

  useEffect(() => {
    if (images.length < 2) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const intervalId = window.setInterval(() => {
      const next = (activeIndexRef.current + 1) % images.length;
      setIncomingIndex(next);
      setFadeIn(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFadeIn(true));
      });
    }, INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [dark, images.length]);

  useEffect(() => {
    if (incomingIndex === null || !fadeIn) return;

    const timeoutId = window.setTimeout(() => {
      setActiveIndex(incomingIndex);
      activeIndexRef.current = incomingIndex;
      setIncomingIndex(null);
      setFadeIn(false);
    }, FADE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [fadeIn, incomingIndex]);

  const activeSrc = images[activeIndex] ?? images[0];
  const incomingSrc = incomingIndex !== null ? images[incomingIndex] : null;

  return (
    <>
      <img
        key={`active-${dark}-${activeSrc}`}
        alt=""
        aria-hidden
        className={imgClass}
        src={activeSrc}
        style={{
          opacity: incomingSrc && fadeIn ? 0 : VISIBLE_OPACITY,
          transitionDuration: `${FADE_MS}ms`,
        }}
      />
      {incomingSrc ? (
        <img
          key={`incoming-${dark}-${incomingSrc}`}
          alt=""
          aria-hidden
          className={imgClass}
          src={incomingSrc}
          style={{
            opacity: fadeIn ? VISIBLE_OPACITY : 0,
            transitionDuration: `${FADE_MS}ms`,
          }}
        />
      ) : null}
    </>
  );
}
