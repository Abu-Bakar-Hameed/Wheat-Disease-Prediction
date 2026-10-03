"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, Moon, Sun, Wheat, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WheatGuard AI landing navbar — built for a single-page site.
 * - Section links smooth-scroll with a controlled ease (no route navigation).
 * - Scroll-spy highlights the active section and is locked during programmatic
 *   scrolls so the underline doesn't flicker.
 * - Gains an elevation shadow once the page is scrolled.
 * - Responsive (mobile menu) + light/dark theme toggle.
 */

const LINKS = [
  { label: "Home", id: "" },
  { label: "Features", id: "features" },
  { label: "Diseases", id: "diseases" },
  { label: "How It Works", id: "how-it-works" },
  { label: "About", id: "about" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [active, setActive] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const scrollLock = useRef(false);

  // Sync the theme toggle with the current theme class on mount.
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  // Elevation on scroll + reset active back to Home near the top.
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      if (!scrollLock.current && window.scrollY < 160) setActive("");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy: mark the section crossing the viewport middle as active.
  useEffect(() => {
    const ids = LINKS.map((l) => l.id).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollLock.current) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Eased scroll with a duration scaled to distance — crisp, not floaty.
  // Uses a manual rAF tween (with CSS scroll-behavior forced to auto for the
  // duration) so it glides smoothly even when the OS has "reduce motion" on.
  const animateScrollTo = (targetY: number) => {
    const root = document.documentElement;
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (Math.abs(dist) < 2) {
      window.scrollTo(0, targetY);
      return;
    }
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto"; // avoid CSS smooth fighting each frame
    const duration = Math.min(1000, Math.max(550, Math.abs(dist) * 0.6));
    const start = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    scrollLock.current = true;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      window.scrollTo(0, startY + dist * ease(p));
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        root.style.scrollBehavior = prevBehavior;
        window.setTimeout(() => {
          scrollLock.current = false;
        }, 80);
      }
    };
    requestAnimationFrame(step);
  };

  const goTo = (e: { preventDefault: () => void }, id: string) => {
    e.preventDefault();
    const header =
      (document.querySelector("header")?.getBoundingClientRect().height ?? 64) + 12;
    const el = id ? document.getElementById(id) : null;
    const y = el ? el.getBoundingClientRect().top + window.scrollY - header : 0;
    setActive(id);
    setOpen(false);
    try {
      history.replaceState(null, "", id ? `#${id}` : window.location.pathname);
    } catch {
      /* ignore */
    }
    animateScrollTo(Math.max(0, y));
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b backdrop-blur transition-all duration-300",
        scrolled
          ? "border-neutral-200/70 bg-white/90 shadow-[0_8px_30px_rgba(22,101,52,0.08)] dark:border-white/10 dark:bg-[#071410]/90 dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          : "border-transparent bg-white/70 dark:bg-[#071410]/70"
      )}
    >
      <nav
        className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-6 lg:h-[72px] lg:px-10"
        aria-label="Main"
      >
        {/* logo */}
        <Link href="/" className="flex items-center gap-2.5" aria-label="WheatGuard AI home">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25">
            <Wheat className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-extrabold tracking-tight text-neutral-950 dark:text-zinc-50">
              WheatGuard <span className="text-brand-600">AI</span>
            </span>
            <span className="block text-[10px] text-neutral-500 dark:text-zinc-400">
              Healthier Wheat • Brighter Future
            </span>
          </span>
        </Link>

        {/* links (large screens) */}
        <ul className="hidden items-center gap-9 lg:flex">
          {LINKS.map(({ label, id }) => (
            <li key={label}>
              <a
                href={id ? `#${id}` : "#"}
                onClick={(e) => goTo(e, id)}
                aria-current={active === id ? "page" : undefined}
                className={cn(
                  "relative py-2 text-sm font-medium transition-colors",
                  active === id ? "text-brand-700 dark:text-brand-400" : "text-neutral-700 hover:text-brand-700 dark:text-zinc-300 dark:hover:text-brand-400"
                )}
              >
                {label}
                {active === id && (
                  <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-brand-600" />
                )}
              </a>
            </li>
          ))}
        </ul>

        {/* actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/15"
          >
            {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          <Link
            href="/login"
            className="hidden h-11 items-center gap-2 rounded-full bg-brand-800 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:inline-flex"
          >
            Get Started
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 lg:hidden dark:border-white/15 dark:bg-white/5 dark:text-zinc-200"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* mobile menu */}
      {open && (
        <div
          id="mobile-menu"
          className="border-t border-neutral-200/70 bg-white px-6 pb-5 pt-3 lg:hidden dark:border-white/10 dark:bg-[#071410]"
        >
          <ul className="space-y-1">
            {LINKS.map(({ label, id }) => (
              <li key={label}>
                <a
                  href={id ? `#${id}` : "#"}
                  onClick={(e) => goTo(e, id)}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm font-medium",
                    active === id
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                      : "text-neutral-700 hover:bg-neutral-50 dark:text-zinc-300 dark:hover:bg-white/5"
                  )}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="/login"
            className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-brand-800 text-sm font-semibold text-white"
          >
            Get Started
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </header>
  );
}
