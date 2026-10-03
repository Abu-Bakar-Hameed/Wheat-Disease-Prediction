"use client";

import { useState } from "react";
import {
  deleteAdminPrediction,
  fetchAdminPrediction,
  fetchAdminPredictions,
  predictImage,
  type AdminPredictionLog,
} from "@/lib/api";
import { ConfirmModal, Field, LeafThumb, ModalShell, PrimaryBtn, ResultBadge, SearchBar, useLoad, usePager, Sk } from "./ui";

export function DiagnosisPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detail, setDetail] = useState<(AdminPredictionLog & {
    description?: string;
    symptoms?: string[];
    prevention?: string[];
    management?: string[];
  }) | null>(null);
  const { data, loading, error, reload } = useLoad(() => fetchAdminPredictions(page, 12, q), [page, q], `admin:pred:${page}|${q}`);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const { pager } = usePager(total, 12, page, setPage);

  const openDetail = async (id: string) => {
    const rec = await fetchAdminPrediction(id);
    setDetail(rec);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAdminPrediction(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-brand-900 text-white text-[12px] font-semibold">
            All Items
          </span>
          <SearchBar value={search} onChange={setSearch} placeholder="Search diagnosis…" />
          <button
            className="px-3 py-2 rounded-lg border border-line text-[13px] bg-white hover:bg-surface-muted transition-colors"
            onClick={() => { setPage(1); setQ(search); }}
          >
            Search
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-surface-muted rounded-lg p-1 gap-0.5">
            <button
              onClick={() => setView("grid")}
              className={`p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-white shadow-sm text-brand-900" : "text-muted"}`}
              title="Grid"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>grid_view</span>
            </button>
            <button
              onClick={() => setView("table")}
              className={`p-1.5 rounded-md transition-colors ${view === "table" ? "bg-white shadow-sm text-brand-900" : "text-muted"}`}
              title="Table"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_rows</span>
            </button>
          </div>
          <PrimaryBtn onClick={() => setOpen(true)}>+ New Diagnosis</PrimaryBtn>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-lg bg-danger-soft text-danger text-[13px] border border-[#fca5a5]">{error}</div>}

      {/* Grid view */}
      {view === "grid" && (
        loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Sk key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-line py-20 text-center shadow-sm">
            <span className="material-symbols-outlined text-line block mb-3" style={{ fontSize: 48 }}>biotech</span>
            <p className="text-[14px] text-muted">No diagnoses yet</p>
            <button onClick={() => setOpen(true)} className="mt-3 text-[13px] text-brand-700 font-semibold hover:underline">
              Run the first diagnosis
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item) => {
              const healthy = item.predicted_class.toLowerCase() === "healthy";
              return (
                <article key={item.id} className="bg-white rounded-xl border border-line overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                  <button className="w-full relative" onClick={() => openDetail(item.id)}>
                    <LeafThumb src={item.image_url} alt={item.predicted_class} className="w-full h-44 rounded-none" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="px-3 py-1.5 rounded-lg bg-white text-[12px] font-semibold text-ink shadow">View Details</span>
                    </div>
                  </button>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-ink">Wheat</h3>
                      <ResultBadge value={healthy ? "Healthy" : item.predicted_class.replace(/_/g, " ")} />
                    </div>
                    <p className="text-[12px] text-muted">
                      {item.created_at.replace("T", " ").slice(0, 16)}
                      {" · "}
                      <span className={healthy ? "text-brand-700" : "text-danger"}>
                        {item.predicted_class.replace(/_/g, " ")}
                      </span>
                    </p>
                    <div className="flex justify-end pt-1">
                      <button
                        className="flex items-center gap-1 text-[12px] text-danger font-semibold hover:underline"
                        onClick={() => setDeleteTarget({ id: item.id, name: item.predicted_class.replace(/_/g, " ") })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}

      {/* Table view */}
      {view === "table" && (
        <div className="bg-white rounded-xl border border-line overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3, 4].map((i) => <Sk key={i} className="h-12" />)}</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="bg-surface-muted text-muted text-[11px] uppercase">
                <tr>
                  {["#", "Image", "Disease", "Date", "Result", "Actions"].map((h) => (
                    <th key={h} className="py-3 px-4 font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {items.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted">No diagnoses yet</td></tr>
                )}
                {items.map((item, i) => {
                  const healthy = item.predicted_class.toLowerCase() === "healthy";
                  return (
                    <tr key={item.id} className="hover:bg-surface-muted transition-colors">
                      <td className="py-3 px-4 text-muted">{(page - 1) * 12 + i + 1}</td>
                      <td className="py-3 px-4"><LeafThumb src={item.image_url} alt={item.predicted_class} /></td>
                      <td className="py-3 px-4 font-medium text-ink">{item.predicted_class.replace(/_/g, " ")}</td>
                      <td className="py-3 px-4 text-muted">{item.created_at.replace("T", " ").slice(0, 16)}</td>
                      <td className="py-3 px-4"><ResultBadge value={healthy ? "Healthy" : item.predicted_class.replace(/_/g, " ")} /></td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openDetail(item.id)}
                            className="p-1.5 rounded-lg text-brand-700 hover:bg-brand-100 transition-colors"
                            title="View details"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>visibility</span>
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: item.id, name: item.predicted_class.replace(/_/g, " ") })}
                            className="p-1.5 rounded-lg text-danger hover:bg-danger-soft transition-colors"
                            title="Delete"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
          <div className="px-5 pb-4">{pager}</div>
        </div>
      )}

      {view === "grid" && <div className="mt-2">{pager}</div>}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete diagnosis"
        message={`Are you sure you want to delete "${deleteTarget?.name ?? "this diagnosis"}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        centered
      />

      {open && <NewDiagnosisModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
      {detail && (
        <ModalShell title="Diagnosis Detail" onClose={() => setDetail(null)} centered>
          <div className="space-y-4">
            <LeafThumb src={detail.image_url} alt={detail.predicted_class} className="w-full h-64 mb-2 rounded-xl" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[18px] font-semibold text-ink">{detail.predicted_class.replace(/_/g, " ")}</p>
              <ResultBadge value={detail.predicted_class.toLowerCase() === "healthy" ? "Healthy" : detail.predicted_class} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px] text-ink">
              <div className="bg-surface-muted rounded-lg border border-line p-3">
                <div className="text-muted text-[11px] uppercase tracking-wide">Confidence</div>
                <div className="mt-1 font-semibold text-ink">{detail.confidence_pct.toFixed(1)}%</div>
              </div>
              <div className="bg-surface-muted rounded-lg border border-line p-3">
                <div className="text-muted text-[11px] uppercase tracking-wide">Date</div>
                <div className="mt-1 font-semibold text-ink">{detail.created_at.replace("T", " ").slice(0, 16)}</div>
              </div>
            </div>
            {detail.description && (
              <div className="rounded-lg border border-line bg-surface-muted p-3">
                <div className="text-[12px] font-semibold text-ink mb-1">Description</div>
                <p className="text-[13px] text-ink leading-relaxed">{detail.description}</p>
              </div>
            )}
            {detail.symptoms && detail.symptoms.length > 0 && (
              <div className="rounded-lg border border-line bg-white p-3">
                <div className="text-[12px] font-semibold text-ink mb-2">Symptoms</div>
                <ul className="list-disc pl-5 text-[13px] text-ink space-y-1">
                  {detail.symptoms.map((symptom) => <li key={symptom}>{symptom}</li>)}
                </ul>
              </div>
            )}
            {detail.prevention && detail.prevention.length > 0 && (
              <div className="rounded-lg border border-line bg-white p-3">
                <div className="text-[12px] font-semibold text-ink mb-2">Prevention</div>
                <ul className="list-disc pl-5 text-[13px] text-ink space-y-1">
                  {detail.prevention.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {detail.management && detail.management.length > 0 && (
              <div className="rounded-lg border border-line bg-white p-3">
                <div className="text-[12px] font-semibold text-ink mb-2">Management</div>
                <ul className="list-disc pl-5 text-[13px] text-ink space-y-1">
                  {detail.management.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function NewDiagnosisModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      await predictImage(file, { includeGradcam: false });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Diagnosis failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="New Diagnosis" onClose={onClose} centered>
      <p className="text-[13px] text-muted mb-4">Upload a leaf image to run the AI disease detection model.</p>
      <Field label="Leaf Image">
        <div className="border-2 border-dashed border-line rounded-xl p-6 text-center hover:border-brand-700 transition-colors cursor-pointer"
          onClick={() => document.getElementById("diag-file-input")?.click()}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-brand-700">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
              <span className="text-[13px] font-semibold">{file.name}</span>
            </div>
          ) : (
            <>
              <span className="material-symbols-outlined text-muted block mb-2" style={{ fontSize: 32 }}>upload_file</span>
              <p className="text-[13px] text-muted">Click to upload or drag & drop</p>
              <p className="text-[11px] text-line mt-1">PNG, JPG, WEBP up to 10MB</p>
            </>
          )}
          <input
            id="diag-file-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </Field>
      {err && <p className="text-[13px] text-danger mb-3">{err}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors">
          Cancel
        </button>
        <PrimaryBtn disabled={!file || busy} onClick={run}>
          {busy ? "Analyzing…" : "Run Diagnosis"}
        </PrimaryBtn>
      </div>
    </ModalShell>
  );
}
