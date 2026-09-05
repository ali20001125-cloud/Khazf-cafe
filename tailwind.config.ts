import type { Config } from "tailwindcss";

// نظام علامة خزف — بيج دافئ ٧٠٪ · داكن دافئ ٢٠٪ · أكسنت طيني ١٠٪. لا رمادي بارد، لا أخضر.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "#F4F1EA",      // الخلفية الرئيسية
        sandalt: "#EDE9DF",   // خلفية بديلة
        cream: "#FAF7F0",     // البطاقات والنص على الداكن
        ink: "#1A1A1A",       // النص الأساسي
        muted: "#6B6B6B",     // النص الثانوي
        line: "#E0DBD0",      // الحدود الناعمة
        dark: "#1C1A18",      // الأشرطة العلوية / الهيرو
        darker: "#141311",
        accent: "#A66A4C",    // الأكسنت الطيني
        accentdeep: "#8A6B4E",
      },
      fontFamily: {
        display: ['"IBM Plex Sans Arabic"', "system-ui", "sans-serif"],
        body: ["Tajawal", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(28,26,24,0.04), 0 6px 20px rgba(28,26,24,0.06)",
        lift: "0 2px 4px rgba(28,26,24,0.06), 0 12px 32px rgba(28,26,24,0.10)",
      },
      borderRadius: {
        xl2: "1.1rem",
      },
    },
  },
  plugins: [],
};

export default config;
