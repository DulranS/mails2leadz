/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**'],
    };
    return config;
  },
};

export default nextConfig;
