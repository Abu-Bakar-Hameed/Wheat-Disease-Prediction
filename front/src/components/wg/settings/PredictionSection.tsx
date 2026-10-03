"use client";

/**
 * Prediction settings (Settings → Prediction).
 *
 * The `show_*` toggles are presentation-only: they hide content that was
 * already generated at the view layer (see app/dashboard/detection/result).
 * They never touch the ML pipeline, Grad-CAM generation or confidence math.
 *
 * The capture/saving controls are all REAL and enforced end-to-end:
 * * default_method pre-selects the detection page's analysis mode,
 * * save_auto / save_images map to /predict's save_history / store_image flags,
 * * open_result_auto decides whether detection jumps straight to the result
 *   page or shows the inline summary first.
 */

import { PREDICTION_PREF_DEFAULTS } from "@/lib/api";
import {
  AutoSaveRow,
  Banner,
  SectionIntro,
  SelectRow,
  SkeletonRows,
  ToggleRow,
} from "./shared";
import { useSettingsSection } from "./useSettingsSection";

export function PredictionSection() {
  const { loading, saving, settings, status, setStatus, patchGroup } =
    useSettingsSection();

  if (loading) return <SkeletonRows count={5} />;

  const pp = { ...PREDICTION_PREF_DEFAULTS, ...(settings.prediction_preferences ?? {}) };

  return (
    <div className="space-y-1">
      <SectionIntro
        title="Scan results"
        description="Choose which parts of a diagnosis you want to see. Turning something off only hides it — the analysis still runs exactly the same."
      />

      <ToggleRow
        id="pred-gradcam"
        label="Show Grad-CAM heatmap"
        description="Display the model's attention overlay that highlights the leaf region it focused on."
        checked={pp.show_gradcam}
        onChange={(v) => patchGroup("prediction_preferences", { show_gradcam: v })}
      />
      <ToggleRow
        id="pred-top"
        label="Show top predictions"
        description="List the runner-up disease classes and their confidence, not just the top match."
        checked={pp.show_top}
        onChange={(v) => patchGroup("prediction_preferences", { show_top: v })}
      />
      <ToggleRow
        id="pred-report"
        label="Show AI diagnosis report"
        description="Show the generated explanation, recommendation and solution block on the result page."
        checked={pp.show_ai_report}
        onChange={(v) => patchGroup("prediction_preferences", { show_ai_report: v })}
      />
      <ToggleRow
        id="pred-lowconf"
        label="Low-confidence warning"
        description="Prompt me to retake the photo when the model is unsure about a result."
        checked={pp.low_confidence_warning}
        onChange={(v) => patchGroup("prediction_preferences", { low_confidence_warning: v })}
      />

      <SectionIntro
        title="Capture & saving"
        description="Defaults for how new scans are handled."
      />
      <SelectRow
        id="pred-method"
        label="Default detection method"
        description="Analysis mode pre-selected when you open the scan page: Quick (fast, no heatmap), Standard (heatmap + top 3), Detailed (heatmap + top 5)."
        value={pp.default_method === "auto" ? "standard" : pp.default_method}
        options={[
          { value: "quick", label: "Quick" },
          { value: "standard", label: "Standard" },
          { value: "detailed", label: "Detailed" },
        ]}
        onChange={(v) => patchGroup("prediction_preferences", { default_method: v })}
      />
      <ToggleRow
        id="pred-save-auto"
        label="Save predictions automatically"
        description="Store every scan in your history without confirming. Turn off to analyse a scan without keeping it."
        checked={pp.save_auto}
        onChange={(v) => patchGroup("prediction_preferences", { save_auto: v })}
      />
      <ToggleRow
        id="pred-open-auto"
        label="Open result automatically"
        description="Jump straight to the full result page as soon as analysis finishes. Turn off to see a quick inline summary first."
        checked={pp.open_result_auto}
        onChange={(v) => patchGroup("prediction_preferences", { open_result_auto: v })}
      />

      {status && (
        <div className="pt-4">
          <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />
        </div>
      )}

      <AutoSaveRow saving={saving} />
    </div>
  );
}
