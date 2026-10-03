"use client";

export function Footer() {
  return (
    <footer className="flex w-full shrink-0 flex-col items-center justify-between gap-4 border-t border-line bg-surface px-4 py-5 text-[12px] text-muted sm:px-6 md:flex-row">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-brand-900">WheatGuard AI</span>
        <span className="text-line">•</span>
        <span>© 2025 WheatGuard AI Precision Technologies Inc. All rights reserved.</span>
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px]">
        {[
          "Model Card & Ethics",
          "USDA Standards",
          "API Documentation",
          "Telemetry Privacy",
          "Security Audit",
        ].map((label) => (
          <span key={label} className="cursor-pointer transition-colors hover:text-brand-700">
            {label}
          </span>
        ))}
      </nav>
    </footer>
  );
}
