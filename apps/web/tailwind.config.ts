import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0A0B0D",
        slate: "#16181C",
        graphite: "#4A4F58",
        bone: "#E8E4D8",
        "bone-pure": "#F5F1E6", // for small text where warm ivory turns muddy on ClearType
        moss: "#7BAA8E",
        ember: "#E89A3C",
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "monospace"],
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
      },
      fontSize: {
        // non-linear scale — big jump before hero
        micro: ["12px", { lineHeight: "16px" }],
        xs: ["14px", { lineHeight: "20px" }],
        base: ["16px", { lineHeight: "24px" }],
        lg: ["20px", { lineHeight: "28px" }],
        xl: ["28px", { lineHeight: "34px" }],
        "2xl": ["48px", { lineHeight: "52px", letterSpacing: "-0.02em" }],
        "3xl": ["72px", { lineHeight: "72px", letterSpacing: "-0.03em" }],
        hero: [
          "clamp(64px, 13vw, 128px)",
          { lineHeight: "0.95", letterSpacing: "-0.04em" },
        ],
      },
      letterSpacing: {
        wider: "0.06em",
        widest: "0.14em",
      },
      borderRadius: {
        none: "0",
        sm: "2px",
      },
      maxWidth: {
        page: "1280px",
      },
    },
  },
  plugins: [],
} satisfies Config;
