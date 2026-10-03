"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export interface CarouselProps {
  children: ReactNode[] | ReactNode;
  className?: string;
  /** Number of items visible per page (used on mobile base). */
  itemsPerView?: number;
  /** Tailwind breakpoints override: e.g. sm=2, lg=3. */
  perView?: { base?: number; sm?: number; md?: number; lg?: number };
  showArrows?: boolean;
  showDots?: boolean;
  gap?: number;
  ariaLabel?: string;
}

function slidesOf(children: ReactNode | ReactNode[]): ReactNode[] {
  const arr = Array.isArray(children) ? children : [children];
  return arr.filter(Boolean);
}

/**
 * Dependency-free carousel: CSS scroll-snap track with synced prev/next arrows
 * and page dots. Touch swipe works natively via horizontal scrolling; arrow
 * keys move the focused carousel. Item widths are driven by perView so the
 * same component adapts 1 / 2 / N across breakpoints.
 */
export function Carousel({
  children,
  className,
  perView,
  showArrows = true,
  showDots = true,
  gap = 16,
  ariaLabel = "Carousel",
}: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slides = slidesOf(children);
  const count = slides.length;
  const [pages, setPages] = useState(1);
  const [active, setActive] = useState(0);

  const base = perView?.base ?? 1;

  // Responsive item width via inline styles on children container.
  const [columns, setColumns] = useState(base);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      let c = perView?.base ?? 1;
      if (perView?.sm && w >= 640) c = perView.sm;
      if (perView?.md && w >= 768) c = perView.md;
      if (perView?.lg && w >= 1024) c = perView.lg;
      setColumns(Math.max(1, c));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [perView]);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const total = el.scrollWidth - el.clientWidth;
    const p = total > 4 ? Math.round(el.scrollLeft / (el.clientWidth / columns)) + 1 : 1;
    setPages(Math.max(1, Math.min(count - columns + 1, p)));
    const nextActive = Math.round(el.scrollLeft / ((el.clientWidth + gap) / columns || 1));
    setActive(Math.max(0, nextActive));
  }, [columns, count, gap]);

  useEffect(() => {
    measure();
  }, [measure, columns]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = el.clientWidth / columns;
    el.scrollBy({ left: dir * step * 0.9, behavior: "smooth" });
  };

  const gotoIndex = (index: number) => {
    const el = trackRef.current;
    if (!el) return;
    const step = el.clientWidth / columns;
    el.scrollTo({ left: index * step, behavior: "smooth" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollByPage(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollByPage(-1);
    }
  };

  const flexBasis = `calc((100% - ${(columns - 1) * gap}px) / ${columns})`;

  return (
    <div
      className={cn("relative", className)}
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
    >
      <div
        ref={trackRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={measure}
        className="wg-no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-brand-600/25"
        style={{ gap: `${gap}px`, ["--wg-carousel-basis" as string]: flexBasis }}
      >
        {slides.map((child, i) => (
          <div
            key={i}
            className="shrink-0 snap-start"
            style={{ flexBasis, minWidth: flexBasis }}
          >
            {child}
          </div>
        ))}
      </div>

      {showArrows && columns < count && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => scrollByPage(-1)}
            className="absolute -left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md transition hover:bg-surface-muted sm:flex"
          >
            <Icon name="chevron_left" size={20} />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => scrollByPage(1)}
            className="absolute -right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md transition hover:bg-surface-muted sm:flex"
          >
            <Icon name="chevron_right" size={20} />
          </button>
        </>
      )}

      {showDots && pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === active}
              onClick={() => gotoIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                i === active ? "w-5 bg-brand-600" : "w-1.5 bg-line hover:bg-muted"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
