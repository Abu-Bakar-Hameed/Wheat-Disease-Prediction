import Image from "next/image";
import Link from "next/link";
import {
  ScanLine,
  ShieldCheck,
  Sprout,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Search,
} from "lucide-react";

/**
 * WheatGuard AI — Diseases section (matches assets/images/32.png).
 * Header band (label + "Know What You're Protecting Against" + intro + three
 * mini benefits + a wheat photo), a 4-column grid of disease cards with severity
 * badges, and a bottom CTA strip. Card photos are cropped from the mockup into
 * public/images/disease-*.jpg. Exposed as #diseases for the navbar + footer links.
 */

type Level = "none" | "high" | "moderate" | "critical";

const LEVELS: Record<Level, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  none: { label: "None", color: "#16a34a", Icon: CheckCircle2 },
  high: { label: "High", color: "#dc2626", Icon: AlertCircle },
  moderate: { label: "Moderate", color: "#d97706", Icon: AlertTriangle },
  critical: { label: "Critical", color: "#b91c1c", Icon: AlertTriangle },
};

const DISEASES: { img: string; name: string; desc: string; level: Level }[] = [
  {
    img: "/images/disease-healthy.jpg",
    name: "Healthy",
    desc: "No visible disease. The plant is in good health and growing normally.",
    level: "none",
  },
  {
    img: "/images/disease-leaf-rust.jpg",
    name: "Leaf Rust",
    desc: "Orange-brown pustules on leaves, which can reduce yield if not treated early.",
    level: "high",
  },
  {
    img: "/images/disease-yellow-rust.jpg",
    name: "Yellow Rust",
    desc: "Yellow powdery pustules on leaves, usually appears in cool, humid conditions.",
    level: "high",
  },
  {
    img: "/images/disease-stem-rust.jpg",
    name: "Stem Rust",
    desc: "Rust-colored pustules on stems and leaves, can cause severe yield loss.",
    level: "critical",
  },
  {
    img: "/images/disease-powdery-mildew.jpg",
    name: "Powdery Mildew",
    desc: "White, powdery fungal growth on leaves, common in warm and dry conditions.",
    level: "moderate",
  },
  {
    img: "/images/disease-septoria.jpg",
    name: "Septoria Leaf Blotch",
    desc: "Dark brown spots with yellow halos, can lead to leaf damage and reduced yield.",
    level: "high",
  },
  {
    img: "/images/disease-fusarium.jpg",
    name: "Fusarium Head Blight",
    desc: "Whitish-pink mold on heads, affects grain quality and can produce mycotoxins.",
    level: "critical",
  },
  {
    img: "/images/disease-tan-spot.jpg",
    name: "Tan Spot",
    desc: "Small, tan-colored lesions on leaves, usually appears in warm, humid weather.",
    level: "moderate",
  },
];

const BENEFITS = [
  { icon: ScanLine, title: "Early Detection", text: "Stop diseases before they spread" },
  { icon: ShieldCheck, title: "Better Yield", text: "Keep your crops healthy & productive" },
  { icon: Sprout, title: "Healthier Future", text: "Support sustainable farming" },
];

export default function Diseases() {
  return (
    <section id="diseases" className="bg-white dark:bg-[#071410]">
      {/* ===================== HEADER BAND ===================== */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-50/70 via-white to-white dark:from-[#0b1e17] dark:via-[#071410] dark:to-[#071410]">
        <div className="relative mx-auto max-w-[1600px] px-6 py-14 lg:px-10 lg:py-16">
          {/* decorative wheat photo — inset to the same gutter as the text so its
              left/right margins line up with the content and cards below */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-6 top-0 hidden h-full w-[24%] max-w-[320px] lg:right-10 lg:block"
            style={{
              maskImage: "linear-gradient(to left, #000 45%, transparent 95%)",
              WebkitMaskImage: "linear-gradient(to left, #000 45%, transparent 95%)",
            }}
          >
            <Image
              src="/images/diseases-header.jpg"
              alt=""
              fill
              sizes="320px"
              className="object-cover object-center"
            />
          </div>

          <div className="grid max-w-4xl grid-cols-1 items-start gap-10 lg:max-w-[72%] lg:grid-cols-[1.1fr_1fr]">
            {/* left — title + intro */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">
                Wheat Diseases
              </span>
              <h2 className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-950 dark:text-zinc-50 sm:text-[2.7rem]">
                Know What You&apos;re
                <span className="block text-brand-700 dark:text-brand-400">Protecting Against</span>
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-600 dark:text-zinc-400">
                Explore the most common wheat diseases, their symptoms, severity levels, and learn
                how to keep your crops healthy with AI-powered detection and expert guidance.
              </p>
            </div>

            {/* right — three benefits */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:pt-2">
              {BENEFITS.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex flex-col items-center text-center lg:items-start lg:text-left">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-[15px] font-bold text-neutral-950 dark:text-zinc-100">{title}</h3>
                  <p className="mt-1 text-xs leading-snug text-neutral-500 dark:text-zinc-400">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== CARD GRID ===================== */}
      <div className="mx-auto max-w-[1600px] px-6 pb-4 lg:px-10">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {DISEASES.map(({ img, name, desc, level }) => {
            const { label, color, Icon } = LEVELS[level];
            return (
              <article
                key={name}
                className="flex flex-col overflow-hidden rounded-2xl border border-neutral-100 bg-white p-3 shadow-[0_6px_20px_rgba(24,59,43,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(22,101,52,0.12)] dark:border-white/10 dark:bg-[#0d2018] dark:shadow-none"
              >
                <div className="relative h-36 w-full overflow-hidden rounded-xl">
                  <Image
                    src={img}
                    alt={`${name} wheat leaf`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                  />
                  <span
                    className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
                    style={{ backgroundColor: color }}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {label}
                  </span>
                </div>

                <h3 className="mt-4 px-1 text-[15px] font-bold text-neutral-950 dark:text-zinc-100">{name}</h3>
                <p className="mt-1.5 px-1 text-[13px] leading-relaxed text-neutral-500 dark:text-zinc-400">{desc}</p>

                <a
                  href="#"
                  className="mt-3 inline-flex items-center gap-1.5 px-1 pb-1 text-[13px] font-semibold text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  Learn More
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </article>
            );
          })}
        </div>
      </div>

      {/* ===================== BOTTOM CTA ===================== */}
      <div className="mx-auto max-w-[1600px] px-6 py-10 lg:px-10">
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-gradient-to-r from-brand-50 to-brand-100/60 p-5 sm:flex-row sm:items-center sm:p-6 dark:from-[#0d2018] dark:to-[#0b1e17]">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white">
              <Sprout className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[15px] font-bold text-brand-800 dark:text-brand-200">
                Detect Diseases Early, Protect Your Harvest
              </p>
              <p className="mt-0.5 text-[13px] text-neutral-600 dark:text-zinc-400">
                Use our AI-powered detection system to identify wheat diseases and get expert
                guidance for healthier crops.
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-brand-800 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Detect Wheat Disease
          </Link>
        </div>
      </div>
    </section>
  );
}
