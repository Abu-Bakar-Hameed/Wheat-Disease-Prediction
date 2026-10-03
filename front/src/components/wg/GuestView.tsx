"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { GoogleIcon, type AuthMode } from "@/components/wg/AuthModal";
import { Badge, Button, Icon } from "@/components/wg/ui";
import { Hero } from "@/components/wg/Hero";
import { cn } from "@/lib/utils";

const PATHOGENS = [
  {
    name: "Yellow Rust",
    sci: "Puccinia striiformis",
    badge: "Critical High",
    badgeTone: "danger" as const,
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDSzIIvmx_Uii5cGdJojDZ74Vy7OF39nweR_mVvjPScVd-w9uLT6e4COx0hfQ72qkcUvquHWuaEsyZ6lejc_k78naK0aA_SGzN42Ff4Y_Vj_ZMmb3bT8rcZkNBv0Dmc4XBmBGUy1Useh7yntpbIR_28xxcqcSkpleb5LSbvSUJZhR5hp0KiPRQoTbXOJ4G290iXDKFn94jJrDZfmUDpcWgsEqOH1Ls-t8486AAuRFf0Y7zcEh0gxlRmIw",
    desc: "Forms bright yellow-orange pustules arranged in visible stripes parallel to leaf veins.",
  },
  {
    name: "Leaf Rust / Brown Rust",
    sci: "Puccinia triticina",
    badge: "High Severity",
    badgeTone: "danger" as const,
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBABXHzfmvN7dVEkJArAkCfi1O9-tUnlNfnTr8Ek79kIJ7huMKBRWsf6brVQzelwCIr-FB7pJfVPHi5F4QbNyXPVw1q42D2ginQGsl1XaE6MxofDBfPnbmNUzvsTOwMaLtQVXCwjWnqK1CPoqQ7nTccC4OWLb38NSc8cB4YnKzr5jS91Snuz53koxOyD6rBWuksmDTGfjd2RsZi_1fI69-yVYgcPIp9ZPFHvqKxhvcbiQ10trG_H26jaQ",
    desc: "Scattered reddish-brown circular to oval pustules randomly distributed across the upper surface.",
  },
  {
    name: "Powdery Mildew",
    sci: "Blumeria graminis",
    badge: "Moderate Risk",
    badgeTone: "warning" as const,
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDMQKuAaWYQYwIKUoRK2subcZvnoHS6wU8vJ-KriWOyNExbVRGe296M2iiUIp1S1K2Agq_sMLr7wPjCexVj3cMSbWtJZcIyvLua9rCCjc5sv2VhetaMS8pyNhK5zon7LfcdePAOfdMJtf3bqNeaZW-tcsEpU8jfNezSNn-TxibTULThqrGccTXkVL6IW5KCqOqBML02lTnc1wybeaf3ze5kudegcbbqQxfdY0b1vgdPmc0iS7V32BcyHQ",
    desc: "White-to-grey cottony fungal patches that turn dull brown as micro-structures develop.",
  },
  {
    name: "Healthy Flag Leaf",
    sci: "Triticum aestivum",
    badge: "Optimal Health",
    badgeTone: "success" as const,
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBOvDxojal3ZWjI3Qp2008MjccjDe4UZM1V4GQa-rIMClaVVnzOkSL-T0LVB2hzGeJWb3yq1DdGF_VYh61piNvkL5REjvuSinTM0D0M0jp5tBBaB8Wsc8ebShw8NpDkchUb59nxtkBJyAm5OOEs-yb7WaPwjuN7g9V5wEVrDDXlxB12SVEQPmsx9UnDtp7wvqv-lT-xLnx1VQbKXGOstY8RLsBXUdDIqBKk_z0n5OFncs4RMtfAQmmIUg",
    desc: "Uniform chloroplast density, zero necrotic lesioning, and optimal stomatal conductance.",
  },
];

function HeroCTA() {
  const router = useRouter();
  const { user, isAdmin, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  // Authentication lives on the dedicated /login page (not a popup/modal).
  // We carry the intended mode via a query param so /login opens on the right tab.
  const openAuth = (m: AuthMode) => {
    router.push(`/login?mode=${m}`);
  };

  return (
    <>
      <div className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-lg sm:p-8">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-800 text-brand-100 shadow-sm">
              <Icon name="shield_person" size={22} />
            </div>
            <div>
              <h2 className="text-[17px] font-extrabold leading-tight text-ink">WheatGuard AI Workspace</h2>
              <p className="text-[12px] text-muted">Authentication &amp; Role Authorization</p>
            </div>
          </div>
          {user && (
            <Badge tone="success" variant="soft">
              {isAdmin ? "Admin Active" : "User Active"}
            </Badge>
          )}
        </div>

        {user ? (
          <div className="space-y-3">
            <p className="text-[13px] text-muted">
              You are signed in as <strong className="text-ink">{user.email}</strong>.
            </p>
            <Button
              fullWidth
              size="lg"
              leftIcon="dashboard"
              onClick={() => router.push(isAdmin ? "/admin" : "/dashboard")}
            >
              Open My Panel ({isAdmin ? "Admin" : "Farmer"})
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Google Sign In */}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                signInWithGoogle().catch(() => setBusy(false));
              }}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[15px] font-semibold text-ink shadow-xs transition-all hover:bg-surface-muted active:scale-[0.99] disabled:opacity-60"
            >
              <GoogleIcon className="h-5 w-5" />
              <span>Continue with Google</span>
            </button>

            <div className="relative my-2 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line" />
              </div>
              <span className="relative bg-surface px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Or Sign In with Email
              </span>
            </div>

            {/* Email Sign In & Register */}
            <div className="grid grid-cols-2 gap-2">
              <Button leftIcon="login" onClick={() => openAuth("user-login")}>
                Sign In
              </Button>
              <Button variant="outline" leftIcon="person_add" onClick={() => openAuth("register")}>
                Register
              </Button>
            </div>

            <button
              type="button"
              onClick={() => openAuth("admin-login")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[12px] font-bold text-brand-800 transition-colors hover:bg-brand-100"
            >
              <Icon name="verified_user" size={16} />
              <span>Enterprise Admin Authorization</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function GuestView() {
  return (
    <main className="flex-1 overflow-y-auto">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-50 via-canvas to-canvas px-6 py-16">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
          {/* Left copy */}
          <div className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[13px] text-brand-800">
              <Icon name="verified" size={16} className="text-brand-600" />
              USDA Tested Diagnostic Benchmark (ResNet-50 + ViT)
            </div>
            <h1 className="text-[34px] font-bold leading-[44px] tracking-tight text-brand-900 sm:text-[40px] sm:leading-[50px]">
              Smart Wheat Disease Detection with Vision AI
            </h1>
            <p className="max-w-2xl text-[16px] leading-[26px] text-muted">
              Empowering agronomists, seed researchers, and field operators with instant,
              laboratory-grade fungal detection. Detect Yellow Rust, Septoria, and Powdery Mildew
              in sub-second inference.
            </p>
            <div className="grid grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                { val: "96.8%", label: "Diagnostic Precision", col: "text-brand-900" },
                { val: "142ms", label: "Inference Latency", col: "text-brand-600" },
                { val: "120k+", label: "Verified Leaves Analyzed", col: "text-brand-900" },
              ].map((s) => (
                <div key={s.label}>
                  <div className={cn("text-[30px] font-bold leading-[38px] sm:text-[36px] sm:leading-[44px]", s.col)}>
                    {s.val}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5">
            <HeroCTA />
          </div>
        </div>
      </div>

      {/* Secondary hero — product in action (clean light + mock) */}
      <Hero />

      {/* Pathogen showcase */}
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-[28px] font-bold text-brand-900 sm:text-[32px]">Classified Wheat Fungal Pathogens</h2>
          <p className="mt-2 text-[16px] text-muted">
            WheatGuard Neural Core recognizes subtle foliar lesions at early-stage manifestation
            before significant crop loss occurs.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PATHOGENS.map((p) => (
            <div
              key={p.name}
              className="group overflow-hidden rounded-xl border border-line bg-surface p-0 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="relative mb-4 h-40 w-full overflow-hidden bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.img}
                  alt={p.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute right-2 top-2">
                  <Badge tone={p.badgeTone} variant="solid">
                    {p.badge}
                  </Badge>
                </span>
              </div>
              <div className="px-5 pb-5">
                <h3 className="text-[16px] font-semibold text-ink">{p.name}</h3>
                <p className="text-[11px] italic text-muted">{p.sci}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="flex w-full flex-col items-center justify-between gap-4 border-t border-line bg-surface px-6 py-4 text-[12px] text-muted md:flex-row">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-brand-900">WheatGuard AI</span>
          <span className="text-line">•</span>
          <span>© 2025 WheatGuard AI Precision Technologies Inc. All rights reserved.</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-[11px]">
          {["Model Card & Ethics", "USDA Standards", "API Documentation", "Telemetry Privacy", "Security Audit"].map((l) => (
            <a key={l} href="#" className="transition-colors hover:text-brand-700" onClick={(e) => e.preventDefault()}>
              {l}
            </a>
          ))}
        </div>
      </footer>
    </main>
  );
}
