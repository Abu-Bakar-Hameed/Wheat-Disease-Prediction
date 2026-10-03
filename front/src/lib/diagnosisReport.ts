/**
 * WheatGuard AI – EntryRank diagnosis report helpers
 */

import type { AiDiagnosisReport } from "@/lib/api";

export function buildFallbackReport(
  disease: string,
  confidencePct: number,
  recommendation = "",
): AiDiagnosisReport {
  const display = disease.replace(/_/g, " ");
  const isHealthy = disease.toLowerCase().includes("healthy");

  if (isHealthy) {
    return {
      title: "EntryRank Detection",
      disease: display,
      confidence_pct: Math.round(confidencePct),
      problem: "The wheat leaves appear healthy with no significant disease symptoms detected.",
      recommendation: "Continue regular field monitoring and maintain good agronomic practices.",
      solution: "No treatment required. Follow standard crop management and scouting protocols.",
      generated_by: "fallback",
    };
  }

  return {
    title: "EntryRank Detection",
    disease: display,
    confidence_pct: Math.round(confidencePct),
    problem: `The wheat leaves show symptoms consistent with ${display.toLowerCase()}.`,
    recommendation:
      recommendation ||
      "Inspect nearby plants and monitor whether the symptoms are spreading.",
    solution:
      "Follow an appropriate disease-management plan based on locally approved agricultural guidance.",
    generated_by: "fallback",
  };
}

export function resolveAiReport(
  aiReport: AiDiagnosisReport | null | undefined,
  disease: string,
  confidencePct: number,
  recommendation = "",
): AiDiagnosisReport {
  if (aiReport?.problem && aiReport.recommendation && aiReport.solution) {
    return aiReport;
  }
  return buildFallbackReport(disease, confidencePct, recommendation);
}
