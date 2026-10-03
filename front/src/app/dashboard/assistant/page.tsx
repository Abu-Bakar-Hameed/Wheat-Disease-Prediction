"use client";

import { Suspense } from "react";
import { AssistantView } from "@/components/wg/views/AssistantView";

export default function AssistantPage() {
  // AssistantView reads useSearchParams(); a Suspense boundary is required so
  // the static prerender doesn't bail out (missing-suspense-with-csr-bailout).
  return (
    <Suspense fallback={null}>
      <AssistantView />
    </Suspense>
  );
}
