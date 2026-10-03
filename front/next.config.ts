import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        // Reminder emails/notifications link to the Calendar. Older sends used
        // the bare "/calendar" path before the route moved under /dashboard —
        // redirect it so those links (and bookmarks) keep working.
        source: "/calendar",
        destination: "/dashboard/calendar",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        // Supabase Storage — avatar uploads
        protocol: "https",
        hostname: "foudommhzaoxaacokzht.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
