
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDiseases, type DiseaseDetail } from "@/lib/api";
import { useScrollLock } from "@/lib/useScrollLock";

const FALLBACK_IMGS: Record<string, string> = {
  puccinia_striiformis:
    "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=800",

  Yellow_Rust:
    "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=800",

  Brown_Rust:
    "https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&q=80&w=800",

  Septoria_Leaf_Blotch:
    "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&q=80&w=800",

  Powdery_Mildew:
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=800",

  Healthy:
    "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&q=80&w=800",

  default:
    "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=800",
};

const CATEGORIES = [
  "All",
  "Fungal",
  "Bacterial",
  "Viral",
  "Nutritional",
  "Pest",
  "Environmental",
  "Other",
];

const IMG_WIDTH = 640;

function optimizeImg(url: string, width = IMG_WIDTH): string {
  try {
    const u = new URL(url);

    if (u.hostname.endsWith("unsplash.com")) {
      u.searchParams.set("w", String(width));
      u.searchParams.set("q", "70");
      u.searchParams.set("auto", "format");
      u.searchParams.set("fit", "crop");

      return u.toString();
    }

    if (
      u.hostname.endsWith("cloudinary.com") &&
      u.pathname.includes("/upload/") &&
      !/\/upload\/[^/]*(f_|q_|w_)/.test(u.pathname)
    ) {
      u.pathname = u.pathname.replace(
        "/upload/",
        `/upload/f_auto,q_auto,w_${width}/`
      );

      return u.toString();
    }
  } catch {
    // Return original URL for relative/invalid URLs.
  }

  return url;
}

function resolveImg(disease: DiseaseDetail): string {
  return optimizeImg(
    disease.image_url ||
      FALLBACK_IMGS[disease.name] ||
      FALLBACK_IMGS["default"]
  );
}

const DEFAULT_IMG = optimizeImg(FALLBACK_IMGS["default"]);

let diseasesCache: DiseaseDetail[] | null = null;

/* =========================================================
   MAIN VIEW
========================================================= */

export function LibraryView() {
  const [diseases, setDiseases] = useState<DiseaseDetail[]>(
    diseasesCache ?? []
  );

  const [loading, setLoading] = useState(diseasesCache === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [selectedDisease, setSelectedDisease] =
    useState<DiseaseDetail | null>(null);

  const loadData = useCallback(async () => {
    setError("");

    if (diseasesCache) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetchDiseases();
      const list = res.diseases || [];

      diseasesCache = list;
      setDiseases(list);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load diseases. Please try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = diseases.filter((d) => {
    const isActive =
      !d.status || d.status.toLowerCase() === "active";

    const q = search.trim().toLowerCase();

    const matchSearch =
      d.display_name.toLowerCase().includes(q) ||
      d.name.toLowerCase().includes(q) ||
      (d.category && d.category.toLowerCase().includes(q));

    const matchCat =
      cat === "All" || d.category === cat;

    return isActive && matchSearch && matchCat;
  });

  const busy = loading || refreshing;

  return (
    <main className="w-full min-w-0">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-5 sm:py-6 lg:px-8 lg:py-8">

        {/* =================================================
            HEADER
        ================================================= */}
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

            {/* Title */}
            <div className="min-w-0">
              <h1 className="font-serif text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                Disease Library
              </h1>

              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink sm:text-sm">
                Explore active wheat diseases, symptoms, video guides,
                and agricultural solutions.
              </p>
            </div>

            {/* Search + Refresh */}
            <div className="flex w-full gap-2 lg:w-auto lg:min-w-[360px]">

              <div className="relative min-w-0 flex-1">
                <span
                  className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  style={{ fontSize: 18 }}
                >
                  search
                </span>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search diseases..."
                  aria-label="Search diseases"
                  className="
                    h-11 w-full rounded-xl
                    border border-line
                    bg-surface-muted
                    pl-9 pr-3
                    text-xs text-ink
                    outline-none
                    transition-all
                    placeholder:text-muted
                    focus:border-brand-600
                    focus:bg-surface
                    sm:text-sm
                  "
                />
              </div>

              <button
                onClick={() => void loadData()}
                disabled={busy}
                aria-label="Refresh diseases"
                title="Refresh"
                className="
                  flex h-11 w-11
                  shrink-0 items-center justify-center
                  rounded-xl border border-line
                  bg-surface
                  text-brand-900
                  transition-colors
                  hover:border-brand-600
                  hover:bg-brand-50
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              >
                <span
                  className={`material-symbols-outlined ${
                    busy ? "animate-spin" : ""
                  }`}
                  style={{ fontSize: 20 }}
                >
                  refresh
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* =================================================
            CATEGORY FILTER
        ================================================= */}
        <section className="w-full">
          <div
            className="
              flex
              w-full
              gap-2
              overflow-x-auto
              pb-1
              scrollbar-none
              sm:flex-wrap
              sm:overflow-visible
            "
          >
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`
                  min-h-10
                  shrink-0
                  rounded-full
                  px-4 py-2
                  text-xs
                  font-semibold
                  transition-all
                  active:scale-95
                  sm:px-3.5
                  ${
                    cat === c
                      ? "bg-brand-900 text-white shadow-sm"
                      : "border border-line bg-surface text-ink hover:border-brand-600 hover:text-brand-900"
                  }
                `}
              >
                {c}
              </button>
            ))}

            <span
              className="
                ml-auto
                hidden
                shrink-0
                items-center
                text-xs
                text-muted
                sm:flex
              "
            >
              Showing {filtered.length} of {diseases.length}
            </span>
          </div>

          {/* Mobile result count */}
          <div className="mt-2 text-right text-[11px] text-muted sm:hidden">
            Showing {filtered.length} of {diseases.length}
          </div>
        </section>

        {/* =================================================
            ERROR
        ================================================= */}
        {error && (
          <div
            className="
              flex
              flex-col
              gap-3
              rounded-xl
              border border-danger/40
              bg-danger-soft
              p-4
              sm:flex-row
              sm:items-center
              sm:justify-between
            "
          >
            <div className="flex min-w-0 items-start gap-2.5 text-xs font-medium text-danger">
              <span
                className="material-symbols-outlined shrink-0"
                style={{ fontSize: 20 }}
              >
                error
              </span>

              <span className="break-words">
                {error}
              </span>
            </div>

            <button
              onClick={() => void loadData()}
              className="
                min-h-10
                w-full
                rounded-lg
                bg-danger
                px-4
                py-2
                text-xs
                font-semibold
                text-white
                transition-colors
                hover:bg-[#991b1b]
                sm:w-auto
              "
            >
              Retry
            </button>
          </div>
        )}

        {/* =================================================
            LOADING
        ================================================= */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="
                  h-[390px]
                  animate-pulse
                  rounded-2xl
                  bg-surface-muted
                  sm:h-80
                "
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* =================================================
             EMPTY STATE
          ================================================= */
          <div className="rounded-2xl border border-line bg-surface px-4 py-14 text-center sm:py-16">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 34 }}
              >
                coronavirus
              </span>
            </div>

            <h3 className="mt-4 text-lg font-bold text-ink">
              No diseases available
            </h3>

            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
              {search || cat !== "All"
                ? "No active diseases match your search criteria. Try clearing filters."
                : "There are currently no diseases available to view."}
            </p>

            {(search || cat !== "All") && (
              <button
                onClick={() => {
                  setSearch("");
                  setCat("All");
                }}
                className="mt-4 min-h-10 px-4 text-xs font-semibold text-brand-600 hover:underline"
              >
                Reset Search & Filters
              </button>
            )}
          </div>
        ) : (
          /* =================================================
             DISEASE GRID
          ================================================= */
          <div
            className={`
              grid
              grid-cols-1
              gap-4
              transition-opacity
              sm:grid-cols-2
              sm:gap-5
              lg:grid-cols-3
              lg:gap-6
              ${
                refreshing
                  ? "opacity-70"
                  : "opacity-100"
              }
            `}
          >
            {filtered.map((d, i) => (
              <DiseaseUserCard
                key={d.id || d.name}
                disease={d}
                priority={i < 3}
                onViewDetails={() =>
                  setSelectedDisease(d)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* =================================================
          DETAIL MODAL
      ================================================= */}
      {selectedDisease && (
        <DiseaseDetailModal
          disease={selectedDisease}
          onClose={() => setSelectedDisease(null)}
        />
      )}
    </main>
  );
}

/* =========================================================
   SMART IMAGE
========================================================= */

function SmartImage({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [loaded, setLoaded] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = imgRef.current;

    if (
      el &&
      el.complete &&
      el.naturalWidth > 0
    ) {
      setLoaded(true);
    }
  }, [currentSrc]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-muted">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-line" />
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (currentSrc !== DEFAULT_IMG) {
            setCurrentSrc(DEFAULT_IMG);
          } else {
            setLoaded(true);
          }
        }}
        className={`
          h-full
          w-full
          object-cover
          transition-all
          duration-300
          ${
            loaded
              ? "opacity-100"
              : "opacity-0"
          }
          ${className}
        `}
      />
    </div>
  );
}

/* =========================================================
   DISEASE CARD
========================================================= */

function DiseaseUserCard({
  disease,
  onViewDetails,
  priority = false,
}: {
  disease: DiseaseDetail;
  onViewDetails: () => void;
  priority?: boolean;
}) {
  const imgSrc = resolveImg(disease);

  return (
    <article
      className="
        group
        flex
        h-full
        min-w-0
        flex-col
        justify-between
        overflow-hidden
        rounded-2xl
        border
        border-line
        bg-surface
        shadow-sm
        transition-all
        duration-200
        hover:shadow-md
      "
    >
      <div className="min-w-0">

        {/* Image */}
        <div
          className="
            relative
            h-44
            w-full
            overflow-hidden
            bg-surface-muted
            sm:h-48
          "
        >
          <SmartImage
            key={imgSrc}
            src={imgSrc}
            alt={disease.display_name}
            priority={priority}
            className="
              transition-transform
              duration-300
              group-hover:scale-105
            "
          />

          {disease.category && (
            <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)]">
              <span
                className="
                  inline-block
                  max-w-full
                  truncate
                  rounded-full
                  bg-white/95
                  px-2.5
                  py-1
                  text-[11px]
                  font-semibold
                  text-[#0369a1]
                  shadow-sm
                  backdrop-blur-sm
                "
              >
                {disease.category}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="space-y-2 p-4 sm:p-5">

          <h3
            className="
              break-words
              text-base
              font-bold
              leading-snug
              text-brand-900
              transition-colors
              group-hover:text-brand-600
              sm:text-lg
            "
          >
            {disease.display_name}
          </h3>

          <p className="break-all font-mono text-[10px] text-muted sm:text-xs">
            {disease.name}
          </p>

          <p
            className="
              line-clamp-3
              text-xs
              leading-relaxed
              text-ink
              sm:text-sm
            "
          >
            {disease.description ||
              "No description provided."}
          </p>
        </div>
      </div>

      {/* Button */}
      <div className="p-4 pt-1 sm:p-5 sm:pt-2">
        <button
          onClick={onViewDetails}
          className="
            flex
            min-h-11
            w-full
            items-center
            justify-center
            gap-1.5
            rounded-xl
            bg-brand-900
            px-4
            py-2.5
            text-xs
            font-semibold
            text-white
            shadow-sm
            transition-colors
            hover:bg-brand-700
            active:scale-[0.98]
            sm:text-sm
          "
        >
          <span>View Details</span>

          <span
            className="material-symbols-outlined"
            style={{ fontSize: 17 }}
          >
            arrow_forward
          </span>
        </button>
      </div>
    </article>
  );
}

/* =========================================================
   DISEASE DETAIL MODAL
========================================================= */

function DiseaseDetailModal({
  disease,
  onClose,
}: {
  disease: DiseaseDetail;
  onClose: () => void;
}) {
  const imgSrc = resolveImg(disease);
  const lockRef = useScrollLock();

  return (
    <div
      ref={lockRef}
      className="
        fixed
        inset-0
        z-50
        flex
        items-end
        justify-center
        overflow-y-auto
        bg-black/70
        p-0
        backdrop-blur-sm
        sm:items-center
        sm:p-4
      "
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* =================================================
          MODAL CARD
      ================================================= */}
      <div
        className="
          relative
          flex
          max-h-[94dvh]
          w-full
          max-w-md
          flex-col
          overflow-hidden
          rounded-t-3xl
          border
          border-brand-700/40
          bg-surface
          shadow-2xl
          sm:max-h-[88dvh]
          sm:rounded-2xl
        "
      >
        {/* =================================================
            STICKY HEADER
        ================================================= */}
        <div
          className="
            sticky
            top-0
            z-20
            flex
            shrink-0
            items-center
            justify-between
            gap-3
            border-b
            border-line
            bg-surface/95
            px-4
            py-3
            backdrop-blur
            sm:px-5
            sm:py-4
          "
        >
          <div className="min-w-0 flex-1">

            <h2
              className="
                break-words
                text-base
                font-bold
                leading-snug
                text-brand-800
                dark:text-brand-300
                sm:text-lg
              "
            >
              {disease.display_name}
            </h2>

            <p className="mt-0.5 truncate font-mono text-[10px] text-muted sm:text-xs">
              {disease.name}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close disease details"
            className="
              flex
              h-10
              w-10
              shrink-0
              items-center
              justify-center
              rounded-full
              text-muted
              transition-colors
              hover:bg-line
              hover:text-ink
              active:scale-95
            "
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22 }}
            >
              close
            </span>
          </button>
        </div>

        {/* =================================================
            MODAL BODY
        ================================================= */}
        <div
          className="
            min-h-0
            flex-1
            overflow-y-auto
            overscroll-contain
            px-4
            py-4
            sm:px-5
            sm:py-5
          "
        >
          <div className="space-y-4 sm:space-y-5">

            {/* Disease Image */}
            <div
              className="
                h-40
                w-full
                overflow-hidden
                rounded-xl
                border
                border-line
                bg-surface-muted
                sm:h-52
              "
            >
              <SmartImage
                key={imgSrc}
                src={imgSrc}
                alt={disease.display_name}
                priority
              />
            </div>

            {/* Category */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted">
                Category:
              </span>

              <span
                className="
                  rounded-full
                  bg-info-soft
                  px-3
                  py-1.5
                  text-[11px]
                  font-semibold
                  text-info
                "
              >
                {disease.category || "Fungal"}
              </span>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <h4 className="text-sm font-bold text-ink">
                Description
              </h4>

              <p className="whitespace-pre-line break-words text-xs leading-relaxed text-ink sm:text-sm">
                {disease.description ||
                  "No description provided."}
              </p>
            </div>

            {/* Symptoms */}
            {disease.symptoms && (
              <div
                className="
                  space-y-1.5
                  rounded-xl
                  border
                  border-wheat-200
                  bg-warning-soft
                  p-3.5
                  sm:p-4
                  dark:border-amber-900/40
                "
              >
                <h4 className="text-sm font-bold text-warning">
                  Symptoms
                </h4>

                <p className="whitespace-pre-line break-words text-xs leading-relaxed text-warning sm:text-sm">
                  {disease.symptoms}
                </p>
              </div>
            )}

            {/* Video */}
            {disease.video_url && (
              <div
                className="
                  space-y-2
                  rounded-xl
                  border
                  border-line
                  bg-canvas
                  p-3.5
                  sm:p-4
                "
              >
                <h4 className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  <span
                    className="material-symbols-outlined text-info"
                    style={{ fontSize: 20 }}
                  >
                    videocam
                  </span>

                  <span>Disease Video</span>
                </h4>

                <video
                  src={disease.video_url}
                  poster={imgSrc}
                  controls
                  playsInline
                  preload="none"
                  className="
                    max-h-64
                    w-full
                    rounded-lg
                    border
                    border-line
                    bg-black
                    object-contain
                    sm:max-h-72
                  "
                />
              </div>
            )}

            {/* Solution */}
            {disease.solution && (
              <div
                className="
                  space-y-1.5
                  rounded-xl
                  border
                  border-brand-200
                  bg-brand-50
                  p-3.5
                  sm:p-4
                  dark:border-brand-900/40 dark:bg-brand-950/40
                "
              >
                <h4 className="text-sm font-bold text-brand-800 dark:text-brand-300">
                  Solution
                </h4>

                <p className="whitespace-pre-line break-words text-xs leading-relaxed text-brand-900 dark:text-brand-100 sm:text-sm">
                  {disease.solution}
                </p>
              </div>
            )}

            {/* Recommendation */}
            {disease.recommendation && (
              <div
                className="
                  space-y-1.5
                  rounded-xl
                  border
                  border-info/30
                  bg-info-soft
                  p-3.5
                  sm:p-4
                "
              >
                <h4 className="text-sm font-bold text-info">
                  Recommendation
                </h4>

                <p className="whitespace-pre-line break-words text-xs leading-relaxed text-info sm:text-sm">
                  {disease.recommendation}
                </p>
              </div>
            )}

            {/* Prevention */}
            {disease.prevention && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-bold text-ink">
                  Prevention
                </h4>

                <p className="whitespace-pre-line break-words text-xs leading-relaxed text-ink sm:text-sm">
                  {disease.prevention}
                </p>
              </div>
            )}

            {/* Management */}
            {disease.management && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-bold text-ink">
                  Management
                </h4>

                <p className="whitespace-pre-line break-words text-xs leading-relaxed text-ink sm:text-sm">
                  {disease.management}
                </p>
              </div>
            )}

            {/* Bottom spacing for mobile */}
            <div className="h-2 sm:h-0" />
          </div>
        </div>
      </div>
    </div>
  );
}