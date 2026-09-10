"use client";

import { Button, ErrorState } from "@/platform/ui_engine";

export default function CatalogueError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState title="Product Catalogue unavailable" description="The catalogue could not be loaded." action={<Button onClick={retry}>Try again</Button>} />;
}
