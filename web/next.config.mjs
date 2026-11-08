/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '22mb' } }, // two 10 MB uploads (young student documents)
};
export default nextConfig;
