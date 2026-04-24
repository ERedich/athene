/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        headline: ["Space Grotesk", "sans-serif"],
        body: ["Manrope", "sans-serif"],
      },
      colors: {
        surface: "var(--color-surface)",
        "on-surface": "var(--color-on-surface)",
        "on-surface-variant": "var(--color-on-surface-variant)",
        primary: "var(--color-primary)",
        "primary-container": "var(--color-primary-container)",
        outline: "var(--color-outline)",
        "surface-variant": "var(--color-surface-variant)",
        "surface-container": "var(--color-surface-container)",
        "surface-container-low": "var(--color-surface-container-low)",
        "surface-container-high": "var(--color-surface-container-high)",
        "surface-container-highest": "var(--color-surface-container-highest)",
        "surface-container-lowest": "var(--color-surface-container-lowest)",
        tertiary: "var(--color-tertiary)",
      },
      borderRadius: {
        DEFAULT: "0px",
        lg: "2px",
        xl: "4px",
      },
      animation: {
        "slow-zoom": "slow-zoom 30s infinite alternate ease-in-out",
        "pulse-slow": "pulse 10s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        "slow-zoom": {
          "0%": { transform: "scale(1) translate(0, 0)" },
          "100%": { transform: "scale(1.1) translate(-1%, -1%)" },
        },
      },
    },
  },
  plugins: [],
};
