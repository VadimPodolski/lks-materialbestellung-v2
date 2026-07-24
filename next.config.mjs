/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
    outputFileTracingIncludes: {
      '/api/send-order-mail': ['./node_modules/pdfkit/js/data/*.afm']
    }
  }
};
export default nextConfig;
