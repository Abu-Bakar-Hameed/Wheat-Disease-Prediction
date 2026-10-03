"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, Leaf } from "lucide-react";
import Link from "next/link";
import { Sidebar, NAV_LINKS } from "@/components/Sidebar";
import { cn } from "@/lib/utils";

function getPageTitle(pathname: string): string {
  const match = NAV_LINKS.find((l) => l.href === pathname);
  return match ? match.label : "WheatGuard AI";
}

export function TopHeader() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Top bar — visible on all screen sizes, but on desktop it's narrow since sidebar exists */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
        {/* Mobile: logo + hamburger */}
        <Link href="/" className="flex items-center gap-2 font-bold" onClick={() => setDrawerOpen(false)}>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-600 text-white">
            <Leaf className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm text-gray-900 dark:text-zinc-100">
            WheatGuard<span className="text-green-600"> AI</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500 dark:text-zinc-400">
            {getPageTitle(pathname)}
          </span>
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Drawer panel */}
          <div
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute left-0 top-0 h-full w-56"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
