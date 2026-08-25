import type { Metadata } from "next";

import { UiEngineShowcase } from "./ui-engine-showcase";

export const metadata: Metadata = {
  title: "UI Engine | StudioFlow Rebuild",
  description: "Internal showcase for the shared StudioFlow UI Engine.",
};

export default function UiEnginePage() {
  return <UiEngineShowcase />;
}
