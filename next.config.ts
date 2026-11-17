import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo cache is read with fs at runtime, so ship it with the API function.
  outputFileTracingIncludes: { "/api/compare": ["./data/cache/**"] },
};

export default nextConfig;
