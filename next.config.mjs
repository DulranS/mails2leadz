/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  // Linting is a local dev-time concern here, not a build gate — avoids
  // forcing an eslint devDependency just to get `next build` to finish.
  // Run `npx eslint .` yourself if you want lint output.
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**'],
    };
    return config;
  },
};

export default nextConfig;
