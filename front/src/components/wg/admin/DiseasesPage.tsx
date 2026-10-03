"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteAdminDisease,
  fetchAdminDiseases,
  saveAdminDisease,
  type AdminDisease,
} from "@/lib/api";
import {
  Field,
  IconBtn,
  LeafThumb,
  ModalShell,
  PrimaryBtn,
  SearchBar,
  StatusBadge,
  Toggle,
  inputCls,
  useLoad,
  Sk,
} from "./ui";

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

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

const IMG_YELLOW = "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=800";
const IMG_BROWN = "https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&q=80&w=800";
const IMG_LEAF = "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&q=80&w=800";
const IMG_MILDEW = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=800";
const IMG_HEALTHY = "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&q=80&w=800";

const FALLBACK_IMGS: Record<string, string> = {
  puccinia_striiformis: IMG_YELLOW,
  "puccinia_striiformis_f._sp._tritici": IMG_YELLOW,
  Yellow_Rust: IMG_YELLOW,
  "Yellow Rust": IMG_YELLOW,
  Leaf_Rust: IMG_BROWN,
  Brown_Rust: IMG_BROWN,
  "Brown Rust": IMG_BROWN,
  Septoria_Leaf_Blotch: IMG_LEAF,
  "Septoria Leaf Blotch": IMG_LEAF,
  Powdery_Mildew: IMG_MILDEW,
  "Powdery Mildew": IMG_MILDEW,
  Stem_Rust: IMG_BROWN,
  "Stem Rust": IMG_BROWN,
  Fusarium_Head_Blight: IMG_LEAF,
  Healthy: IMG_HEALTHY,
  default: IMG_YELLOW,
};

function getDiseaseImg(disease: { image_url?: string | null; name: string; display_name: string }): string {
  return (
    disease.image_url ||
    FALLBACK_IMGS[disease.name] ||
    FALLBACK_IMGS[disease.display_name] ||
    FALLBACK_IMGS["default"]
  );
}

/** One consistent id for every view (grid, table, delete, toggle). */
const idOf = (d: Pick<AdminDisease, "id" | "name">): string => d.id || d.name;

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const TOAST_MS = 4000;

type ToastState = { id: number; msg: string; type: "success" | "error" } | null;

/* ------------------------------------------------------------------ */
/* Small "fun" building blocks                                         */
/* ------------------------------------------------------------------ */

/** Motion only answers what the user just did. Everything is disabled for reduced-motion users. */
function FunStyles() {
  return (
    <style>{`
      @keyframes fun-toast-in { from { opacity: 0; transform: translateY(-12px) scale(.96); } to { opacity: 1; transform: none; } }
      @keyframes fun-toast-bar { from { width: 100%; } to { width: 0; } }
      @keyframes fun-shake { 10%,90% { transform: translateX(-1px); } 20%,80% { transform: translateX(3px); } 30%,50%,70% { transform: translateX(-5px); } 40%,60% { transform: translateX(5px); } }
      @keyframes fun-spin { to { transform: rotate(360deg); } }
      @keyframes fun-confetti {
        0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
        100% { transform: translate3d(var(--dx), 105vh, 0) rotate(var(--rot)); opacity: 0; }
      }
      .fun-press { transition: transform .12s ease; }
      .fun-press:active:not(:disabled) { transform: scale(.94); }
      @media (prefers-reduced-motion: reduce) {
        .fun-anim, .fun-press, .fun-confetti-piece { animation: none !important; transition: none !important; }
      }
    `}</style>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ animation: "fun-spin .7s linear infinite" }}
    />
  );
}

const CONFETTI_COLORS = ["#15803d", "#facc15", "#38bdf8", "#f97316", "#a78bfa", "#f472b6"];

function Confetti({ burst }: { burst: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: 5 + Math.random() * 90,
        delay: Math.random() * 0.3,
        dur: 1.2 + Math.random() * 0.8,
        dx: (Math.random() - 0.5) * 260,
        rot: 360 + Math.random() * 720,
        size: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: i % 3 === 0,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst]
  );

  if (!burst) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={`${burst}-${i}`}
          className="fun-confetti-piece absolute top-0 block"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.6,
              background: p.color,
              borderRadius: p.round ? "50%" : 2,
              animation: `fun-confetti ${p.dur}s ${p.delay}s ease-out forwards`,
              "--dx": `${p.dx}px`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function DetailBlock({ title, text, tinted = false }: { title: string; text?: string | null; tinted?: boolean }) {
  if (!text) return null;
  return (
    <div className={`rounded-lg border border-line p-3.5 space-y-1 ${tinted ? "bg-surface-muted" : "bg-white"}`}>
      <div className="text-[12px] font-bold text-ink">{title}</div>
      <p className="text-[13px] text-ink leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

/** Delete confirmation with a round spinner on the Delete button. */
function DeleteDialog({
  name,
  deleting,
  onConfirm,
  onCancel,
}: {
  name: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell title="Delete disease" onClose={() => { if (!deleting) onCancel(); }}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-danger-soft flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-danger" style={{ fontSize: 20 }}>delete</span>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-ink">Delete &ldquo;{name}&rdquo;?</p>
            <p className="text-[13px] text-muted mt-1">This can&apos;t be undone.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="fun-press px-4 py-2 rounded-lg border border-line text-[13px] font-medium hover:bg-surface-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            aria-busy={deleting}
            className="fun-press inline-flex items-center justify-center gap-2 min-w-[112px] px-4 py-2 rounded-lg bg-danger text-white text-[13px] font-semibold hover:bg-danger transition-colors disabled:opacity-80 disabled:cursor-not-allowed"
          >
            {deleting ? (
              <>
                <Spinner className="!w-4 !h-4" /> Deleting…
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function DiseasesPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const [editing, setEditing] = useState<AdminDisease | null | "new">(null);
  const [detail, setDetail] = useState<AdminDisease | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [confettiBurst, setConfettiBurst] = useState(0);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (confettiTimer.current) clearTimeout(confettiTimer.current);
    };
  }, []);

  const { data, loading, error, reload, setData } = useLoad(() => fetchAdminDiseases(q), [q], `admin:dis:${q}`);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg, type });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const celebrate = useCallback(() => {
    if (confettiTimer.current) clearTimeout(confettiTimer.current);
    setConfettiBurst(Date.now());
    confettiTimer.current = setTimeout(() => setConfettiBurst(0), 2400);
  }, []);

  /** Update one disease's status inside the loaded list (no reload, no flicker). */
  const patchStatus = (d: AdminDisease, status: AdminDisease["status"]) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        diseases: prev.diseases.map((item) =>
          (item.id && item.id === d.id) || item.name === d.name ? { ...item, status } : item
        ),
      };
    });
  };

  const handleToggleStatus = async (d: AdminDisease, on: boolean) => {
    const key = idOf(d);
    if (togglingId === key) return; // ignore double clicks while saving

    const nextStatus = on ? "active" : "inactive";
    setTogglingId(key);
    patchStatus(d, nextStatus); // instant feedback

    try {
      // Send the full record. Many backends validate required fields on update,
      // so a "status only" request can be rejected.
      const form = new FormData();
      form.append("name", d.name);
      form.append("display_name", d.display_name);
      form.append("category", d.category ?? "Other");
      form.append("status", nextStatus);
      form.append("description", d.description ?? "");
      form.append("symptoms", d.symptoms ?? "");
      form.append("solution", d.solution ?? "");
      form.append("recommendation", d.recommendation ?? "");
      form.append("prevention", d.prevention ?? "");
      form.append("management", d.management ?? "");

      await saveAdminDisease(form, key);
      showToast(
        on ? `${d.display_name} is active 🌱` : `${d.display_name} is inactive 💤`,
        "success"
      );
    } catch (err: unknown) {
      patchStatus(d, d.status); // roll back
      showToast(`Couldn't update ${d.display_name}: ${errMsg(err, "the server rejected the change")}`, "error");
      // NOTE: we do NOT re-throw. An unhandled rejection is what froze the screen before.
    } finally {
      setTogglingId(null);
    }
  };

  const allDiseases = data?.diseases ?? [];
  const diseases = category === "All" ? allDiseases : allDiseases.filter((d) => d.category === category);

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteAdminDisease(deleteTarget.id);
      showToast(`${deleteTarget.name} deleted 🗑️`);
      setDeleteTarget(null);
      reload();
    } catch (err: unknown) {
      showToast(`Couldn't delete ${deleteTarget.name}: ${errMsg(err, "please try again")}`, "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <FunStyles />
      <Confetti burst={confettiBurst} />

      {/* Toast (floating, so the page never jumps) */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`fun-anim fixed top-4 right-4 z-[90] w-[min(92vw,380px)] overflow-hidden rounded-xl border shadow-lg ${
            toast.type === "success"
              ? "bg-brand-100 border-brand-300 text-brand-700"
              : "bg-danger-soft border-[#fca5a5] text-danger"
          }`}
          style={{ animation: "fun-toast-in .28s ease both" }}
        >
          <div className="flex items-start justify-between gap-3 px-3.5 py-3 text-[13px] font-semibold">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px]">
                {toast.type === "success" ? "check_circle" : "error"}
              </span>
              <span>{toast.msg}</span>
            </div>
            <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100" aria-label="Dismiss">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          <div
            className="fun-anim h-1 bg-current opacity-30"
            style={{ animation: `fun-toast-bar ${TOAST_MS}ms linear forwards` }}
          />
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div
          className="flex items-center gap-2"
          onKeyDown={(e) => {
            if (e.key === "Enter") setQ(search); // press Enter to search
          }}
        >
          <SearchBar value={search} onChange={setSearch} placeholder="Search diseases…" />
          <button
            className="fun-press px-3.5 py-2 rounded-lg border border-line text-[13px] font-medium bg-white hover:bg-surface-muted transition-colors"
            onClick={() => setQ(search)}
          >
            Search
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface-muted rounded-lg p-1 gap-0.5">
            <button
              onClick={() => setView("grid")}
              className={`fun-press p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-white shadow-sm text-brand-900" : "text-muted hover:text-ink"}`}
              title="Grid view"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>grid_view</span>
            </button>
            <button
              onClick={() => setView("table")}
              className={`fun-press p-1.5 rounded-md transition-colors ${view === "table" ? "bg-white shadow-sm text-brand-900" : "text-muted hover:text-ink"}`}
              title="Table view"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_rows</span>
            </button>
          </div>
          <PrimaryBtn onClick={() => setEditing("new")}>+ Add disease</PrimaryBtn>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`fun-press px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors border ${
              category === cat
                ? "bg-brand-900 text-white border-brand-900"
                : "bg-white text-muted border-line hover:border-brand-900 hover:text-brand-900"
            }`}
          >
            {cat}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-muted">
          {diseases.length} {diseases.length === 1 ? "disease" : "diseases"}
        </span>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {/* Grid view */}
      {view === "grid" && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Sk key={i} className="h-72 rounded-xl" />
              ))}
            </div>
          ) : diseases.length === 0 ? (
            <div className="bg-white rounded-xl border border-line py-20 text-center">
              <span className="text-5xl block mb-3" aria-hidden>🌾</span>
              <p className="text-[14px] text-muted">
                {q || category !== "All" ? "No diseases match these filters" : "No diseases yet"}
              </p>
              <button
                onClick={() => setEditing("new")}
                className="fun-press mt-4 text-[13px] text-brand-700 font-semibold hover:underline"
              >
                Add a disease
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {diseases.map((d) => (
                <DiseaseCard
                  key={idOf(d)}
                  disease={d}
                  toggling={togglingId === idOf(d)}
                  deleting={deleting && deleteTarget?.id === idOf(d)}
                  onView={() => setDetail(d)}
                  onEdit={() => setEditing(d)}
                  onDelete={() => setDeleteTarget({ id: idOf(d), name: d.display_name })}
                  onToggle={(on) => handleToggleStatus(d, on)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Table view */}
      {view === "table" && (
        <div className="bg-white rounded-xl border border-line overflow-x-auto">
          {loading ? (
            <div className="p-5"><Sk className="h-40" /></div>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-muted text-muted text-[11px] uppercase">
                <tr>
                  {["#", "Image", "Name", "Display Name", "Category", "Status", "Created", "Actions"].map((h) => (
                    <th key={h} className="py-3 px-4 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {diseases.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-muted">No diseases found</td></tr>
                )}
                {diseases.map((d, i) => (
                  <tr key={idOf(d)} className="hover:bg-surface-muted">
                    <td className="py-3 px-4">{i + 1}</td>
                    <td className="py-3 px-4"><LeafThumb src={getDiseaseImg(d)} alt={d.name} /></td>
                    <td className="py-3 px-4 font-mono text-[12px] text-ink">{d.name}</td>
                    <td className="py-3 px-4 font-semibold text-ink">{d.display_name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-info-soft text-[#0369a1] dark:text-sky-300">{d.category}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Toggle
                        checked={d.status === "active"}
                        loading={togglingId === idOf(d)}
                        onChange={(on) => handleToggleStatus(d, on)}
                      />
                    </td>
                    <td className="py-3 px-4 text-muted text-[12px]">
                      {d.created_at ? d.created_at.slice(0, 10) : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <IconBtn icon="visibility" title="View" onClick={() => setDetail(d)} />
                        <IconBtn icon="edit" title="Edit" onClick={() => setEditing(d)} />
                        {deleting && deleteTarget?.id === idOf(d) ? (
                          <span className="p-1.5 rounded-lg text-danger inline-flex items-center justify-center" title="Deleting…">
                            <Spinner />
                          </span>
                        ) : (
                          <IconBtn
                          icon="delete"
                          title="Delete"
                          danger
                          onClick={() => setDeleteTarget({ id: idOf(d), name: d.display_name })}
                        />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {deleteTarget && (
        <DeleteDialog
          name={deleteTarget.name}
          deleting={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {detail && (
        <ModalShell title={detail.display_name} onClose={() => setDetail(null)}>
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getDiseaseImg(detail)} alt={detail.display_name} className="w-full h-64 object-cover rounded-xl border border-line" />

            <div className="grid grid-cols-3 gap-3 text-[13px] text-ink">
              <div className="bg-surface-muted border border-line rounded-lg p-3">
                <div className="text-muted text-[10px] uppercase font-semibold tracking-wide">Scientific Name</div>
                <div className="mt-1 font-mono text-[12px] font-semibold text-ink">{detail.name}</div>
              </div>
              <div className="bg-surface-muted border border-line rounded-lg p-3">
                <div className="text-muted text-[10px] uppercase font-semibold tracking-wide">Category</div>
                <div className="mt-1 font-semibold text-ink">{detail.category}</div>
              </div>
              <div className="bg-surface-muted border border-line rounded-lg p-3">
                <div className="text-muted text-[10px] uppercase font-semibold tracking-wide">Status</div>
                <div className="mt-1"><StatusBadge value={detail.status} /></div>
              </div>
            </div>

            <DetailBlock title="Description" text={detail.description || "No description available."} tinted />
            <DetailBlock title="Symptoms" text={detail.symptoms} />

            {detail.video_url && (
              <div className="rounded-lg border border-line bg-surface-muted p-3.5 space-y-2">
                <div className="text-[12px] font-bold text-ink">Disease Video</div>
                <video src={detail.video_url} controls preload="metadata" className="w-full rounded-lg border border-line max-h-60" />
              </div>
            )}

            <DetailBlock title="Solution" text={detail.solution} />
            <DetailBlock title="Recommendation" text={detail.recommendation} />
            <DetailBlock title="Prevention" text={detail.prevention} />
            <DetailBlock title="Management" text={detail.management} />
          </div>
        </ModalShell>
      )}

      {editing && (
        <DiseaseModal
          disease={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg, created) => {
            setEditing(null);
            showToast(msg);
            if (created) celebrate(); // one small celebration when a disease is added
            reload();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function DiseaseCard({
  disease,
  toggling,
  deleting,
  onView,
  onEdit,
  onDelete,
  onToggle,
}: {
  disease: AdminDisease;
  toggling: boolean;
  deleting: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (on: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = disease.status === "active";

  return (
    <article className="bg-white rounded-xl border border-line overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative">
      <div>
        <div className="relative h-44 bg-brand-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getDiseaseImg(disease)}
            alt={disease.display_name}
            className={`w-full h-full object-cover transition-[filter] duration-300 ${isActive ? "" : "grayscale opacity-80"}`}
          />

          {disease.category && (
            <div className="absolute top-2.5 left-2.5">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/90 text-[#0369a1] shadow-sm">
                {disease.category}
              </span>
            </div>
          )}

          <div className="absolute top-2.5 right-2.5 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="fun-press w-8 h-8 rounded-full bg-white/95 text-ink hover:bg-white flex items-center justify-center shadow-md backdrop-blur-sm transition-all border border-line"
              title="More options"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_vert</span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                />
                <div className="absolute right-0 top-9 z-40 w-36 bg-white rounded-xl shadow-xl border border-line py-1 text-[13px] font-medium">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onView(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-ink hover:bg-brand-50 hover:text-brand-700 transition-colors"
                  >
                    <span className="material-symbols-outlined text-brand-700" style={{ fontSize: 16 }}>visibility</span>
                    <span>View</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-ink hover:bg-brand-50 hover:text-brand-700 transition-colors"
                  >
                    <span className="material-symbols-outlined text-brand-700" style={{ fontSize: 16 }}>edit</span>
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-danger hover:bg-danger-soft transition-colors"
                  >
                    <span className="material-symbols-outlined text-danger" style={{ fontSize: 16 }}>delete</span>
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-bold text-ink text-[14px] leading-tight">{disease.display_name}</h3>
            <StatusBadge value={disease.status} />
          </div>
          <p className="text-[12px] text-muted font-mono mb-2">{disease.name}</p>
          <p className="text-[12px] text-muted line-clamp-2 leading-relaxed">
            {disease.description || "No description provided."}
          </p>
        </div>
      </div>

      {/* Footer: status toggle & quick actions */}
      <div className="px-4 py-2.5 border-t border-surface-muted flex items-center justify-between bg-surface-muted/60">
        <div className="flex items-center gap-3 shrink-0">
          <Toggle checked={isActive} loading={toggling} onChange={onToggle} />
          <span
            className={`text-[12px] font-semibold select-none flex items-center gap-1.5 ${
              toggling ? "text-muted" : isActive ? "text-brand-700" : "text-muted"
            }`}
          >
            {toggling ? (
              <>
                <Spinner /> Saving…
              </>
            ) : isActive ? (
              "Active"
            ) : (
              "Inactive"
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onView}
            className="fun-press p-1.5 rounded-lg text-brand-700 hover:bg-brand-100 transition-colors"
            title="View details"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="fun-press p-1.5 rounded-lg text-brand-700 hover:bg-brand-100 transition-colors"
            title="Edit disease"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="fun-press p-1.5 rounded-lg text-danger hover:bg-danger-soft transition-colors disabled:opacity-80"
            title={deleting ? "Deleting…" : "Delete disease"}
          >
            {deleting ? (
              <span className="inline-flex w-4 h-4 items-center justify-center"><Spinner /></span>
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Add / Edit modal                                                    */
/* ------------------------------------------------------------------ */

const REQUIRED_ORDER = ["name", "displayName", "category", "description", "symptoms", "solution", "recommendation"] as const;
type RequiredKey = (typeof REQUIRED_ORDER)[number];

function DiseaseModal({
  disease,
  onClose,
  onSaved,
}: {
  disease: AdminDisease | null;
  onClose: () => void;
  onSaved: (msg: string, created: boolean) => void;
}) {
  const [name, setName] = useState(disease?.name ?? "");
  const [displayName, setDisplayName] = useState(disease?.display_name ?? "");
  const [category, setCategory] = useState(disease?.category ?? "Fungal");
  const [status, setStatus] = useState(disease?.status ?? "active");
  const [description, setDescription] = useState(disease?.description ?? "");
  const [symptoms, setSymptoms] = useState(disease?.symptoms ?? "");
  const [solution, setSolution] = useState(disease?.solution ?? "");
  const [recommendation, setRecommendation] = useState(disease?.recommendation ?? "");
  const [prevention, setPrevention] = useState(disease?.prevention ?? "");
  const [management, setManagement] = useState(disease?.management ?? "");

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(disease?.image_url ?? null);
  const [removeImage, setRemoveImage] = useState(false);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(disease?.video_url ?? null);
  const [removeVideo, setRemoveVideo] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RequiredKey, string>>>({});
  const [shakeKey, setShakeKey] = useState(0);

  const errRef = useRef<HTMLDivElement | null>(null);

  // A file/server error appears at the top of a long form. Scroll to it so the user always sees it.
  useEffect(() => {
    if (err) errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [err]);

  const clearFieldError = (k: RequiredKey) =>
    setFieldErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });

  const fieldStyle = (k: RequiredKey): React.CSSProperties | undefined =>
    fieldErrors[k] ? { borderColor: "#dc2626", boxShadow: "0 0 0 3px rgba(220,38,38,.15)" } : undefined;

  const FieldError = ({ k }: { k: RequiredKey }) =>
    fieldErrors[k] ? <p className="mt-1 text-[12px] font-medium text-danger">{fieldErrors[k]}</p> : null;

  const revokeIfBlob = (url: string | null) => {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  };

  const handleImageChange = (file: File | null) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErr("Image is larger than 10 MB. Choose a smaller file.");
      return;
    }

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExts = ["jpg", "jpeg", "png", "webp"];

    if (!validTypes.includes(file.type) && (!ext || !validExts.includes(ext))) {
      setErr("Image must be a JPG, PNG or WEBP file.");
      return;
    }

    setErr("");
    revokeIfBlob(imagePreview);
    setImageFile(file);
    setRemoveImage(false);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleVideoChange = (file: File | null) => {
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      setErr("Video is larger than 100 MB. Choose a smaller file.");
      return;
    }

    const validTypes = ["video/mp4", "video/webm", "video/quicktime"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExts = ["mp4", "webm", "mov"];

    if (!validTypes.includes(file.type) && (!ext || !validExts.includes(ext))) {
      setErr("Video must be an MP4, WEBM or MOV file.");
      return;
    }

    setErr("");
    revokeIfBlob(videoPreview);
    setVideoFile(file);
    setRemoveVideo(false);
    setVideoPreview(URL.createObjectURL(file));
  };

  const validate = (): Partial<Record<RequiredKey, string>> => {
    const e: Partial<Record<RequiredKey, string>> = {};
    if (!name.trim()) e.name = "Enter the scientific name.";
    if (!displayName.trim()) e.displayName = "Enter the display name.";
    if (!category.trim()) e.category = "Choose a category.";
    if (!description.trim()) e.description = "Add a description.";
    if (!symptoms.trim()) e.symptoms = "Add at least one symptom.";
    if (!solution.trim()) e.solution = "Add a solution.";
    if (!recommendation.trim()) e.recommendation = "Add a recommendation.";
    return e;
  };

  const save = async () => {
    if (busy) return;
    setErr("");

    const errors = validate();
    const firstBad = REQUIRED_ORDER.find((k) => errors[k]);
    if (firstBad) {
      setFieldErrors(errors);
      setShakeKey((n) => n + 1); // the Save button shakes so it never feels "dead"
      requestAnimationFrame(() => {
        const el = document.getElementById(`disease-${firstBad}`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus({ preventScroll: true });
      });
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("display_name", displayName.trim());
      form.append("category", category);
      form.append("status", status);
      form.append("description", description.trim());
      form.append("symptoms", symptoms.trim());
      form.append("solution", solution.trim());
      form.append("recommendation", recommendation.trim());
      form.append("prevention", prevention.trim());
      form.append("management", management.trim());

      if (imageFile) form.append("image", imageFile);
      else if (removeImage) form.append("remove_image", "true");

      if (videoFile) form.append("video", videoFile);
      else if (removeVideo) form.append("remove_video", "true");

      await saveAdminDisease(form, disease?.id);
      onSaved(disease ? "Disease saved ✨" : "Disease added 🎉", !disease);
    } catch (e) {
      setErr(errMsg(e, "Couldn't save the disease. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <ModalShell title={disease ? "Edit disease" : "Add disease"} onClose={onClose}>
      <div className="space-y-4">
        {err && (
          <div
            ref={errRef}
            className="p-3 rounded-lg bg-danger-soft border border-[#fca5a5] text-[13px] text-danger font-medium"
          >
            {err}
          </div>
        )}

        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Scientific Disease Name *">
            <input
              id="disease-name"
              className={inputCls}
              style={fieldStyle("name")}
              value={name}
              onChange={(e) => { setName(e.target.value); clearFieldError("name"); }}
              placeholder="e.g. puccinia_striiformis"
            />
            <FieldError k="name" />
          </Field>
          <Field label="Display Name *">
            <input
              id="disease-displayName"
              className={inputCls}
              style={fieldStyle("displayName")}
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); clearFieldError("displayName"); }}
              placeholder="e.g. Yellow Rust"
            />
            <FieldError k="displayName" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Category *">
            <select
              id="disease-category"
              className={inputCls}
              style={fieldStyle("category")}
              value={category}
              onChange={(e) => { setCategory(e.target.value); clearFieldError("category"); }}
            >
              {CATEGORIES.filter((c) => c !== "All").map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <FieldError k="category" />
          </Field>
          <Field label="Status *">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as "active" | "inactive")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>

        <Field label="Description *">
          <textarea
            id="disease-description"
            className={inputCls}
            style={fieldStyle("description")}
            rows={3}
            value={description}
            onChange={(e) => { setDescription(e.target.value); clearFieldError("description"); }}
            placeholder="Detailed description of the disease..."
          />
          <FieldError k="description" />
        </Field>

        <Field label="Symptoms *">
          <textarea
            id="disease-symptoms"
            className={inputCls}
            style={fieldStyle("symptoms")}
            rows={3}
            value={symptoms}
            onChange={(e) => { setSymptoms(e.target.value); clearFieldError("symptoms"); }}
            placeholder="Describe key symptoms (e.g. Yellow-orange pustules, long yellow stripes...)"
          />
          <FieldError k="symptoms" />
        </Field>

        <Field label="Solution *">
          <textarea
            id="disease-solution"
            className={inputCls}
            style={fieldStyle("solution")}
            rows={3}
            value={solution}
            onChange={(e) => { setSolution(e.target.value); clearFieldError("solution"); }}
            placeholder="Recommended chemical or cultural solution..."
          />
          <FieldError k="solution" />
        </Field>

        <Field label="Recommendation *">
          <textarea
            id="disease-recommendation"
            className={inputCls}
            style={fieldStyle("recommendation")}
            rows={3}
            value={recommendation}
            onChange={(e) => { setRecommendation(e.target.value); clearFieldError("recommendation"); }}
            placeholder="Agronomic advice and timing..."
          />
          <FieldError k="recommendation" />
        </Field>

        <Field label="Prevention (optional)">
          <textarea
            className={inputCls}
            rows={2}
            value={prevention}
            onChange={(e) => setPrevention(e.target.value)}
            placeholder="Preventive measures..."
          />
        </Field>

        <Field label="Management (optional)">
          <textarea
            className={inputCls}
            rows={2}
            value={management}
            onChange={(e) => setManagement(e.target.value)}
            placeholder="Long term field management..."
          />
        </Field>

        {/* Disease Picture Upload */}
        <div className="p-4 rounded-xl border border-line bg-surface-muted space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Disease picture (JPG, PNG, WEBP · up to 10 MB)</span>
            {imagePreview && (
              <button
                type="button"
                onClick={() => {
                  revokeIfBlob(imagePreview);
                  setImageFile(null);
                  setImagePreview(null);
                  setRemoveImage(true);
                }}
                className="fun-press text-[12px] font-semibold text-danger hover:underline"
              >
                Remove picture
              </button>
            )}
          </div>

          {imagePreview ? (
            <div className="relative rounded-lg overflow-hidden border border-line bg-white h-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Selected preview" className="w-full h-full object-cover" />
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] px-2 py-1 rounded font-mono truncate max-w-[80%]">
                {imageFile ? imageFile.name : "Current picture"}
              </div>
            </div>
          ) : (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
              className="text-[13px] text-ink file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[12px] file:font-semibold file:bg-info-soft file:text-[#0369a1] file:dark:text-sky-300 hover:file:bg-[#bae6fd] cursor-pointer"
            />
          )}
        </div>

        {/* Disease Video Upload */}
        <div className="p-4 rounded-xl border border-line bg-surface-muted space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Disease video (MP4, WEBM, MOV · up to 100 MB)</span>
            {videoPreview && (
              <button
                type="button"
                onClick={() => {
                  revokeIfBlob(videoPreview);
                  setVideoFile(null);
                  setVideoPreview(null);
                  setRemoveVideo(true);
                }}
                className="fun-press text-[12px] font-semibold text-danger hover:underline"
              >
                Remove video
              </button>
            )}
          </div>

          {videoPreview ? (
            <div className="space-y-2">
              <video controls src={videoPreview} className="w-full rounded-lg border border-line max-h-52 bg-black" />
              <p className="text-[11px] text-muted font-mono truncate">
                {videoFile ? videoFile.name : "Current video"}
              </p>
            </div>
          ) : (
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => handleVideoChange(e.target.files?.[0] ?? null)}
              className="text-[13px] text-ink file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[12px] file:font-semibold file:bg-warning-soft file:text-[#b45309] file:dark:text-amber-300 hover:file:bg-wheat-200 cursor-pointer"
            />
          )}
        </div>

        {/* Action buttons (sticky so Save is always in reach on a long form) */}
        <div className="sticky bottom-0 -mx-1 px-1 py-3 flex items-center justify-end gap-2 border-t border-line bg-white">
          {hasFieldErrors && (
            <span
              key={`msg-${shakeKey}`}
              className="fun-anim mr-auto text-[12px] font-semibold text-danger"
              style={{ animation: "fun-shake .45s ease both" }}
            >
              Fill in the highlighted fields
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="fun-press px-4 py-2 rounded-lg border border-line text-[13px] font-medium hover:bg-surface-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <div
            key={`btn-${shakeKey}`}
            className="fun-anim"
            style={shakeKey ? { animation: "fun-shake .45s ease both" } : undefined}
          >
            <PrimaryBtn disabled={busy} onClick={save}>
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Saving…
                </span>
              ) : (
                "Save disease"
              )}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}