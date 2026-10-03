import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // WheatGuard AI Brand Colors
        "on-tertiary": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "on-secondary": "#ffffff",
        "error-container": "#ffdad6",
        "on-primary": "#ffffff",
        "secondary-container": "#6cf8bb",
        "tertiary": "#4b2500",
        "on-secondary-fixed-variant": "#005236",
        "secondary-fixed": "#6ffbbe",
        "tertiary-fixed-dim": "#ffb77d",
        "primary": "#00362a",
        "inverse-primary": "#99d2be",
        "error": "#ba1a1a",
        "background": "#faf8ff",
        "on-primary-fixed-variant": "#155041",
        "surface-dim": "#d2d9f4",
        "on-background": "#131b2e",
        "on-primary-fixed": "#002018",
        "on-secondary-container": "#00714d",
        "secondary": "#006c49",
        "on-surface": "#131b2e",
        "secondary-fixed-dim": "#4edea3",
        "outline": "#707975",
        "surface-tint": "#316858",
        "on-secondary-fixed": "#002113",
        "outline-variant": "#bfc9c3",
        "primary-fixed-dim": "#99d2be",
        "on-primary-container": "#86beab",
        "on-tertiary-fixed": "#2f1500",
        "on-tertiary-fixed-variant": "#6e3900",
        "on-error-container": "#93000a",
        "primary-fixed": "#b5efda",
        "surface-container-high": "#e2e7ff",
        "surface-container-highest": "#dae2fd",
        "primary-container": "#134e3f",
        "surface-variant": "#dae2fd",
        "tertiary-fixed": "#ffdcc3",
        "on-tertiary-container": "#ff9b3e",
        "surface-container": "#eaedff",
        "on-error": "#ffffff",
        "surface-bright": "#faf8ff",
        "surface": "#faf8ff",
        "surface-container-low": "#f2f3ff",
        "inverse-surface": "#283044",
        "on-surface-variant": "#404945",
        "inverse-on-surface": "#eef0ff",
        "tertiary-container": "#6c3800"
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      },
      spacing: {
        "gutter-desktop": "1.5rem",
        "spacing-2xs": "0.25rem",
        "margin-desktop": "2rem",
        "spacing-3xl": "3rem",
        "margin-mobile": "1rem",
        "spacing-xl": "2rem",
        "spacing-3xs": "0.125rem",
        "gutter-mobile": "1rem",
        "spacing-md": "1rem",
        "spacing-lg": "1.5rem",
        "spacing-sm": "0.75rem",
        "spacing-2xl": "2.5rem",
        "margin-tablet": "1.5rem",
        "spacing-xs": "0.5rem"
      },
      fontFamily: {
        "code-tabular": ["Inter", "monospace"],
        "label-sm": ["Inter", "sans-serif"],
        "body-sm": ["Inter", "sans-serif"],
        "display-lg-mobile": ["Inter", "sans-serif"],
        "display-lg": ["Inter", "sans-serif"],
        "headline-lg": ["Inter", "sans-serif"],
        "body-lg": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "headline-xl-mobile": ["Inter", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "headline-xl": ["Inter", "sans-serif"],
        "headline-sm": ["Inter", "sans-serif"],
        "headline-md": ["Inter", "sans-serif"],
        "metric-display": ["Inter", "sans-serif"]
      },
      fontSize: {
        "code-tabular": ["13px", { lineHeight: "18px", letterSpacing: "-0.01em", fontWeight: "500" }],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.04em", fontWeight: "600" }],
        "body-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.01em", fontWeight: "400" }],
        "display-lg-mobile": ["30px", { lineHeight: "38px", letterSpacing: "-0.015em", fontWeight: "700" }],
        "display-lg": ["40px", { lineHeight: "48px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", letterSpacing: "0", fontWeight: "400" }],
        "label-md": ["13px", { lineHeight: "18px", letterSpacing: "0.01em", fontWeight: "500" }],
        "headline-xl-mobile": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-md": ["14px", { lineHeight: "20px", letterSpacing: "0", fontWeight: "400" }],
        "headline-xl": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-sm": ["16px", { lineHeight: "24px", letterSpacing: "0", fontWeight: "600" }],
        "headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "metric-display": ["36px", { lineHeight: "44px", letterSpacing: "-0.025em", fontWeight: "700" }]
      },
      animation: {
        "scan": "scanAnimation 2.2s ease-in-out infinite alternate",
      },
      keyframes: {
        scanAnimation: {
          "0%": { top: "4%", opacity: "0.8" },
          "50%": { opacity: "1" },
          "100%": { top: "92%", opacity: "0.8" }
        }
      }
    },
  },
  plugins: [require("@tailwindcss/forms")],
};

export default config;
