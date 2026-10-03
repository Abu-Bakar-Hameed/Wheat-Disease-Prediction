"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, Icon } from "@/components/wg/ui";

/**
 * A stylized "scan → diagnosis" product mock built entirely from design tokens
 * (no screenshot asset). Shows the leaf viewport with a detection box, an
 * animated scanning laser, and a result panel with confidence + weather risk.
 */
function ScanMock() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* main app card */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
        {/* top bar */}
        <div className="flex items-center justify-between border-b border-line bg-surface-muted px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-800 text-brand-100">
              <Icon name="eco" size={16} />
            </span>
            <span className="text-[13px] font-semibold text-ink">Leaf scan</span>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Analyzing…
          </span>
        </div>

        {/* viewport */}
        <div className="relative h-56 w-full overflow-hidden bg-gradient-to-br from-brand-200 via-brand-100 to-wheat-100">
          {/* leaf silhouette */}
          <div className="absolute left-1/2 top-1/2 h-40 w-20 -translate-x-1/2 -translate-y-1/2 rotate-[20deg] rounded-[100%_0%_100%_0%] bg-brand-500/70 shadow-inner" />
          {/* detection box */}
          <div className="absolute left-[40%] top-[36%] h-16 w-16 rounded-md border-2 border-wheat-400">
            <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-wheat-400 px-1.5 py-0.5 text-[10px] font-bold text-ink">
              Yellow Rust · 96%
            </span>
          </div>
          {/* scanning laser */}
          <div className="scanning-line absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-brand-400 to-transparent" />
        </div>

        {/* result panel */}
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-ink">Septoria leaf blotch</div>
              <div className="text-[11px] text-muted">Model confidence</div>
            </div>
            <Badge tone="warning" variant="soft">
              Moderate
            </Badge>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full w-[88%] rounded-full bg-gradient-to-r from-brand-500 to-brand-600" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Icon name="water_drop" size={14} className="text-brand-600" />
              18°C · humid
            </span>
            <span className="flex items-center gap-1">
              <Icon name="bolt" size={14} className="text-brand-600" />
              142ms inference
            </span>
            <span className="flex items-center gap-1">
              <Icon name="cloud" size={14} className="text-wheat-600" />
              Weather risk high
            </span>
          </div>
        </div>
      </div>

      {/* floating chips */}
      <div className="absolute -left-6 top-16 hidden rounded-xl border border-line bg-surface px-3 py-2 shadow-card sm:block">
        <div className="text-[15px] font-bold text-brand-800">96.8%</div>
        <div className="text-[10px] text-muted">Precision</div>
      </div>
      <div className="absolute -right-4 bottom-10 hidden items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink shadow-card sm:flex">
        <Icon name="verified_user" size={16} className="text-brand-600" />
        Lab-grade
      </div>
    </div>
  );
}

/**
 * Secondary landing hero — a clean, light "product in action" section that
 * complements the primary value/auth hero in GuestView.
 */
export function Hero() {
  const router = useRouter();

  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-canvas via-brand-50/40 to-canvas px-6 py-16 sm:py-20">
      {/* soft brand accents */}
      <div
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-wheat-200/40 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
        {/* copy */}
        <div className="animate-slide-up space-y-6">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[13px] font-medium text-brand-800">
            <Icon name="document_scanner" size={16} className="text-brand-600" />
            See WheatGuard in action
          </span>
          <h2 className="font-serif text-[34px] font-bold leading-[1.15] tracking-tight text-brand-900 sm:text-[42px]">
            From leaf photo to diagnosis in seconds.
          </h2>
          <p className="max-w-xl text-[16px] leading-[26px] text-muted">
            Snap or upload a leaf and WheatGuard&apos;s vision models outline the infection,
            score their confidence, and weigh local weather risk — all in your browser.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              leftIcon="document_scanner"
              onClick={() => router.push("/login?mode=user-login")}
            >
              Scan a leaf
            </Button>
            <Button size="lg" variant="outline" leftIcon="play_circle" onClick={() => router.push("/signup")}>
              Create free account
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-[12px] text-muted">
            {["No install needed", "Works from your phone camera", "Weather-aware alerts"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Icon name="check_circle" size={16} className="text-brand-600" />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* product mock */}
        <div className="animate-scale-in">
          <ScanMock />
        </div>
      </div>
    </section>
  );
}
