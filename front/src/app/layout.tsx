import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WheatGuard AI – Precision Wheat Disease Prediction System",
  description:
    "AI-powered wheat disease detection with ResNet-50 + ViT. Detect Yellow Rust, Septoria, and Powdery Mildew in sub-second inference.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full ${inter.variable} ${fraunces.variable}`}
      data-scroll-behavior="smooth"
      // The no-flash theme script below adds the `dark` class to <html> before
      // React hydrates, so the client className intentionally differs from the
      // server HTML. Opt this element out of attribute diffing to silence the
      // (expected, harmless) hydration warning.
      suppressHydrationWarning
    >
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />

        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />

        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />

        {/* Apply the stored / system theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
      </head>

      <body className="h-full bg-canvas text-ink antialiased overflow-x-hidden">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}