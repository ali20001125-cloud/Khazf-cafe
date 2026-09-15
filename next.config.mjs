/** @type {import('next').NextConfig} */
const nextConfig = {
  // معاينة محلّية فقط: يُبدَّل سوّاق Neon بآخر فوق Postgres محلّية، فيُعايَن
  // كود الإنتاج نفسه بلا تعديل. لا أثر لها بلا KHAZAF_PREVIEW=1.
  webpack: (config) => {
    if (process.env.KHAZAF_PREVIEW === "1") {
      config.resolve.alias["@neondatabase/serverless"] =
        new URL("./.preview/neon-shim.js", import.meta.url).pathname;
    }
    return config;
  },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // أداة داخلية: لا فهرسة، لا تضمين في إطار، رؤوس أمان أساسية.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
