"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Navbar } from "@/components/wg/landing/navbar";
import { HeroSection } from "@/components/wg/landing/home";
import Feature from "@/components/wg/landing/Feature";
import Diseases from "@/components/wg/landing/Diseases";
import Work from "@/components/wg/landing/work";
import { AboutSection } from "@/components/wg/landing/about";
import Footer from "@/components/wg/landing/footer";
import { Reveal } from "@/components/wg/landing/reveal";

export default function Page() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Signed-in users skip the landing hero entirely.
    if (user) {
      router.replace(isAdmin ? "/admin" : "/dashboard");
    }
  }, [loading, user, isAdmin, router]);

  // Only confirmed signed-in users see the splash (then get redirected by the
  // effect above). Everyone else gets the landing instantly — no auth wait.
  if (user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas">
        <div className="mb-3 flex h-10 w-10 animate-pulse items-center justify-center rounded-lg bg-brand-800 text-brand-300">
          <span className="material-symbols-outlined">eco</span>
        </div>
        <p className="text-[14px] text-muted">Loading…</p>
      </div>
    );
  }

  // Landing renders instantly for visitors; signed-in users are redirected above.
  return (
    <div className="wg-fade-in">
      <Navbar />
      <main>
        <HeroSection />
        <Reveal>
          <Feature />
        </Reveal>
        <Reveal>
          <Diseases />
        </Reveal>
        <Reveal>
          <Work />
        </Reveal>
        <Reveal>
          <AboutSection />
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
