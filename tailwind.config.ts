import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0E14",
        panel: "#12161F",
        panel2: "#171C28",
        line: "#262C3A",
        muted: "#8A92A6",
        fg: "#E8E6E1",
        // Gold — the brand/action color. Psychology: warmth, value,
        // "go" — deliberately richer/more saturated than a muted clay so a
        // primary button reads as inviting rather than merely present.
        // Still doubles as the "due soon / needs attention" tone
        // elsewhere (badges, trial/renewal flags) — a warm gold reads as
        // "worth a look" in both roles without contradiction.
        amber: {
          DEFAULT: "#D9A441",
          soft: "#F0C169",
          dim: "#8F6A28",
        },
        // Emerald — growth, profit, "this is good news". More saturated
        // than a desaturated sage so a positive number actually feels
        // positive at a glance, not just technically green.
        good: "#2FAE74",
        // Crimson — loss, overdue, "this needs action now". Assertive
        // enough to trigger real attention without reading as alarm-red.
        bad: "#E15263",
        // Sapphire — calm, informational, trustworthy. Used sparingly —
        // this app leans on gold as its primary accent, so info stays a
        // supporting color rather than competing for attention. Doubles as
        // the "Team" section color: the same trust/collaboration read
        // applies to people you work with, not just to notices.
        info: "#5A93E0",
        // Periwinkle — calm oversight, orientation. Marks the "Overview"
        // nav section (home, assistant, notifications) so the very first
        // thing a user sees reads as composed and in-control rather than
        // urgent — a cooler, quieter cousin of the sapphire info tone.
        overview: {
          DEFAULT: "#6D7FE0",
          soft: "#9FAEF2",
        },
        // Plum — quiet and structural. Reserved for the "Admin" nav
        // section (settings, journal, exports) so back-office tooling
        // reads as settled machinery rather than competing for attention
        // with the money and sales colors it sits below.
        plum: {
          DEFAULT: "#9B7FD4",
          soft: "#C3AEEA",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
