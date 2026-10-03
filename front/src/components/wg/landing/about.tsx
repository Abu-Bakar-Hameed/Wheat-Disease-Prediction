import Image from "next/image";
import {
  ShieldCheck,
  Target,
  Cpu,
  Sprout,
  Leaf,
  Users,
  Wheat,
} from "lucide-react";

/**
 * WheatGuard AI — About section (matches assets/images/About.png).
 * Left: badge + "Technology for Healthier Wheat" + three Mission/Technology/Goal
 * cards + a "Why WheatGuard AI?" panel. Right: the wheat-field photo with an
 * organic rounded-left edge and a dark-green quote card.
 * The field photo is cropped from the About.png mockup (public/images/about-field.jpg).
 * Exposed as #about so the navbar link scrolls here.
 */

const PILLARS = [
  {
    icon: Target,
    title: "Our Mission",
    text: "Make early wheat disease identification easier and more accessible through smart, reliable technology.",
  },
  {
    icon: Cpu,
    title: "Our Technology",
    text: "Use AI-powered image analysis and machine learning to identify potential disease patterns in wheat.",
  },
  {
    icon: Sprout,
    title: "Our Goal",
    text: "Provide useful, actionable insights that support better crop-health decisions and higher yields.",
  },
];

const REASONS = [
  { icon: ShieldCheck, label: "Trusted", sub: "AI Technology" },
  { icon: Leaf, label: "Focused on", sub: "Wheat Health" },
  { icon: Users, label: "Built for", sub: "Farmers & Experts" },
];

export function AboutSection() {
  return (
    <section id="about" className="relative overflow-hidden bg-white dark:bg-[#071410]">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:px-10 lg:py-20">
        {/* LEFT — copy + cards */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-800 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            About WheatGuard AI
          </span>

          <h2 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-neutral-950 dark:text-zinc-50 sm:text-5xl">
            Technology for
            <span className="block text-brand-700 dark:text-brand-400">Healthier Wheat</span>
          </h2>

          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-neutral-600 dark:text-zinc-400">
            WheatGuard AI combines agriculture and artificial intelligence to make wheat disease
            identification easier, more accessible, and more understandable.
          </p>
          <span className="mt-5 block h-1 w-12 rounded-full bg-brand-600" aria-hidden="true" />

          {/* three pillars */}
          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="flex flex-col items-center rounded-2xl border border-neutral-100 bg-white p-5 text-center shadow-[0_6px_20px_rgba(22,101,52,0.06)] dark:border-white/10 dark:bg-[#0d2018] dark:shadow-none"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-[15px] font-bold text-neutral-950 dark:text-zinc-100">{title}</h3>
                <span className="mt-2 block h-0.5 w-6 rounded-full bg-brand-500" aria-hidden="true" />
                <p className="mt-3 text-[12.5px] leading-relaxed text-neutral-500 dark:text-zinc-400">{text}</p>
              </div>
            ))}
          </div>

          {/* why panel */}
          <div className="mt-6 rounded-2xl bg-neutral-50 p-5 ring-1 ring-neutral-100 dark:bg-white/5 dark:ring-white/10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3 sm:flex-1">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white">
                  <Wheat className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-neutral-950 dark:text-zinc-100">Why WheatGuard AI?</h4>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500 dark:text-zinc-400">
                    Wheat is a vital global crop. We&apos;re here to help farmers, agronomists, and
                    agricultural enthusiasts protect it with accurate insights and simple tools.
                  </p>
                </div>
              </div>

              <ul className="grid grid-cols-3 gap-3 sm:w-[46%]">
                {REASONS.map(({ icon: Icon, label, sub }) => (
                  <li key={label} className="flex flex-col items-center text-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-700 ring-1 ring-brand-100 dark:bg-white/5 dark:text-brand-400 dark:ring-white/10">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="mt-1.5 text-[11px] font-semibold leading-tight text-neutral-900 dark:text-zinc-100">
                      {label}
                    </span>
                    <span className="text-[11px] leading-tight text-neutral-500 dark:text-zinc-400">{sub}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* RIGHT — wheat-field photo with organic edge + quote card */}
        <div className="relative mx-auto w-full max-w-xl lg:max-w-[540px] lg:self-end">
          {/* faint dotted grid decoration */}
          <div
            aria-hidden
            className="absolute -top-2 left-2 hidden h-16 w-24 lg:block"
            style={{
              backgroundImage: "radial-gradient(#bbf7d0 1.5px, transparent 1.5px)",
              backgroundSize: "12px 12px",
            }}
          />

          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-l-[8rem] rounded-r-[2rem] shadow-xl ring-1 ring-brand-100 dark:ring-white/10">
            <Image
              src="/images/about-field.jpg"
              alt="Golden wheat field under a soft sky at sunset"
              fill
              sizes="(max-width: 1024px) 100vw, 46vw"
              className="object-cover object-[52%_center]"
            />
            {/* bottom gradient to anchor the quote card */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-brand-950/75 via-brand-950/25 to-transparent"
            />

            {/* quote card */}
            <figure className="absolute bottom-5 right-5 max-w-[16rem] rounded-2xl bg-brand-800/90 p-5 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm">
              <span className="font-serif text-4xl leading-none text-brand-300" aria-hidden="true">
                &ldquo;
              </span>
              <blockquote className="-mt-2 text-sm font-medium leading-snug">
                Better insights.
                <br />
                Healthier crops.
                <br />
                A brighter future for agriculture.
              </blockquote>
              <span className="mt-3 block h-0.5 w-8 rounded-full bg-brand-400" aria-hidden="true" />
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
