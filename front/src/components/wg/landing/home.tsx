import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play, ShieldCheck, Sprout, Zap } from "lucide-react";

/**
 * WheatGuard AI landing hero — a clean two-column grid.
 * Left: coded copy + CTAs + trust points. Right: the cropped hero visual.
 * The image lives in its own column (no absolute background), so it can never
 * slide under the text. Stacks to one column on mobile.
 * Visual: public/images/hero-visual.png
 */

const FEATURES = [
  { icon: ShieldCheck, title: "Accurate results", text: "Powered by advanced AI" },
  { icon: Zap, title: "Faster diagnosis", text: "Save time and resources" },
  { icon: Sprout, title: "Healthier crops", text: "Better yield, higher profits" },
];

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-white dark:bg-[#071410]">
      {/* soft green wash + a quiet corner glow behind everything */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white via-brand-50/60 to-white dark:from-[#071410] dark:via-[#0b1e17] dark:to-[#071410]" />
      <div
        aria-hidden
        className="absolute -right-24 top-1/4 -z-10 h-80 w-80 rounded-full bg-brand-200/40 blur-3xl dark:bg-brand-500/10"
      />

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-10 px-6 py-14 lg:grid-cols-2 lg:gap-12 lg:px-10 lg:py-20">
        {/* LEFT — copy */}
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25">
            <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
            AI-powered wheat health
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-950 dark:text-zinc-50 sm:text-5xl lg:text-[3.4rem]">
            Protect Your Wheat
            <br />
            with AI-Powered
            <span className="block text-brand-700 dark:text-brand-400">Disease Detection</span>
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-neutral-600 dark:text-zinc-400">
            Upload a photo of a wheat leaf and let WheatGuard AI analyze it to identify potential diseases and
            provide actionable insights for healthier crops.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-800 px-7 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              Detect Wheat Disease
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-neutral-200 bg-white px-7 text-sm font-semibold text-neutral-900 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-white/15 dark:bg-transparent dark:text-zinc-100 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              How It Works
            </Link>
          </div>

          <ul className="mt-10 grid max-w-lg gap-5 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm ring-1 ring-brand-100 dark:bg-white/5 dark:text-brand-400 dark:ring-white/10">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold leading-tight text-neutral-950 dark:text-zinc-100">{title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-neutral-500 dark:text-zinc-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* RIGHT — the hero visual, contained in its own column */}
        <div className="relative mx-auto w-full max-w-xl lg:max-w-[560px]">
          <div className="relative aspect-[9/8] w-full overflow-hidden rounded-3xl shadow-lg ring-1 ring-brand-100 dark:ring-white/10">
            <Image
              src="/images/hero-visual.png"
              alt="WheatGuard AI scanning a wheat leaf and detecting leaf rust with 94% confidence"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
