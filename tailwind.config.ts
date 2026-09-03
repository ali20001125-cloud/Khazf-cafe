import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1917",
        sand: "#f7f3ee",
        clay: "#8a6a4f",
        clayDark: "#6b503b",
        line: "#e4dcd2",
      },
      fontFamily: {
        sans: ["var(--font-ar)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
